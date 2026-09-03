/**
 * Transport hardening and data-at-rest guards.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  APP_URL, ENFORCE_HTTPS, GOOGLE_LOGIN_ENABLED, HSTS_MAX_AGE, TRUST_PROXY_ENABLED,
} from './config.js';
import { log } from './logger.js';

/* ------------------------------------------------------------- request id */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
      startedAt?: number;
    }
  }
}

/**
 * Correlation id for every request. Without one, an error line and the auth
 * event that preceded it cannot be tied together in a busy log.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = crypto.randomUUID();
  req.startedAt = Date.now();
  res.setHeader('X-Request-Id', req.id);
  next();
}

/* ------------------------------------------------------------------ HTTPS */

/**
 * Refuse plaintext HTTP in production.
 *
 * Behind a TLS-terminating proxy the socket really is plain HTTP, and the only
 * evidence of the original scheme is `X-Forwarded-Proto`. Express exposes that
 * through `req.secure` — but *only* when `trust proxy` is configured. If it is
 * not, this header is attacker-controlled and must not be believed, so the
 * check falls back to the raw socket and fails closed.
 */
export function requireHttps(req: Request, res: Response, next: NextFunction): void {
  if (!ENFORCE_HTTPS) {
    next();
    return;
  }

  const secure = TRUST_PROXY_ENABLED
    ? req.secure
    : (req.socket as { encrypted?: boolean }).encrypted === true;
  if (secure) {
    next();
    return;
  }

  // A redirect is only safe for idempotent requests. Redirecting a POST would
  // invite the client to replay the body over the insecure hop it just used.
  if (req.method === 'GET' || req.method === 'HEAD') {
    res.redirect(308, new URL(req.originalUrl, APP_URL).toString());
    return;
  }

  log.security('transport.insecure_request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    requestId: req.id,
  });
  res.status(403).json({ error: 'HTTPS is required.' });
}

/**
 * Response headers.
 *
 * The CSP is deliberately tight: this origin serves a JSON API and a built SPA,
 * so nothing here needs `unsafe-eval`. `connect-src` allows the Google Identity
 * endpoint because the sign-in button talks to it directly.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()',
  );

  if (ENFORCE_HTTPS) {
    // Only meaningful over HTTPS, and actively harmful to send otherwise —
    // a browser that caches it against an http origin can lock users out.
    res.setHeader(
      'Strict-Transport-Security',
      `max-age=${HSTS_MAX_AGE}; includeSubDomains`,
    );
  }

  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // The SPA ships hashed assets. Google Identity Services is loaded on
      // demand — and only while Google sign-in is switched on, so a deployment
      // that does not use it does not carry a standing allowance to run
      // third-party script, frame a third-party origin, or talk to one.
      ...(GOOGLE_LOGIN_ENABLED
        ? [
            "script-src 'self' https://accounts.google.com/gsi/client",
            "frame-src https://accounts.google.com",
            "connect-src 'self' https://accounts.google.com",
            // Avatars come back from Google's CDN on those accounts.
            "img-src 'self' data: blob: https://lh3.googleusercontent.com",
          ]
        : [
            "script-src 'self'",
            "frame-src 'none'",
            "connect-src 'self'",
            "img-src 'self' data: blob:",
          ]),
      // Tailwind emits an inline style attribute surface; fonts come from Google.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(ENFORCE_HTTPS ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
  );

  next();
}

/* ------------------------------------------------------------ data at rest */

/**
 * The datastore is a file on local disk, not a networked database, so
 * "restrict access" means filesystem permissions rather than firewall rules.
 *
 * Tightens the data and upload directories to owner-only and reports anything
 * left group- or world-readable. On a shared host, a 0644 `db.json` containing
 * password hashes and candidate PII is readable by every other account on the
 * box — no network exposure required.
 */
export function secureDataDirectories(paths: { data: string; uploads: string }): void {
  const targets: { path: string; mode: number; label: string }[] = [
    { path: paths.data, mode: 0o700, label: 'data directory' },
    { path: paths.uploads, mode: 0o700, label: 'uploads directory' },
  ];

  for (const target of targets) {
    try {
      fs.mkdirSync(target.path, { recursive: true, mode: 0o700 });
      fs.chmodSync(target.path, target.mode);
    } catch (err) {
      log.warn(`could not secure ${target.label}`, { path: target.path, error: (err as Error).message });
      continue;
    }

    // Tighten files already inside, which may predate this code.
    try {
      for (const entry of fs.readdirSync(target.path, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const file = `${target.path}/${entry.name}`;
        const mode = fs.statSync(file).mode & 0o777;
        if (mode & 0o077) {
          fs.chmodSync(file, 0o600);
          log.info('tightened file permissions', { file: entry.name, was: mode.toString(8) });
        }
      }
    } catch (err) {
      log.warn(`could not audit ${target.label}`, { error: (err as Error).message });
    }
  }

  {
    // A world-readable .env is the most common way a secret leaks, and it is
    // no less true in development where the file holds real API keys.
    for (const candidate of ['.env', 'server/.env', `${process.cwd()}/.env`]) {
      try {
        const mode = fs.statSync(candidate).mode & 0o777;
        if (mode & 0o077) {
          log.security('config.env_permissions_loose', {
            file: candidate,
            mode: mode.toString(8),
            detail: `Readable beyond the owner. Run: chmod 600 ${candidate}`,
          });
        }
      } catch {
        /* not present at this path — nothing to check */
      }
    }
  }
}
