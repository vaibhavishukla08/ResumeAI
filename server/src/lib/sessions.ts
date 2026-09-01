/**
 * Server-side sessions, replacing the previous stateless JWT.
 *
 * Why the change: a signed JWT cannot be withdrawn. Logging out, changing a
 * password, or discovering a compromise did nothing until the token expired on
 * its own — a week later. With a session record the server decides, on every
 * request, whether a credential is still good, so revocation is immediate.
 *
 * The cookie holds a 256-bit opaque random string. Only its SHA-256 digest is
 * stored, so a leaked database does not yield usable sessions. The cookie is
 * httpOnly, which is what keeps the credential out of reach of page scripts —
 * the old localStorage token was readable by any injected script.
 *
 * Two clocks bound every session:
 *   idle     — inactivity ends it, and activity slides it forward
 *   absolute — a hard ceiling that no amount of activity extends
 */

import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { hashToken } from './tokens.js';
import * as store from './store.js';

export const SESSION_COOKIE = 'ra_session';
export const CSRF_COOKIE = 'ra_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;      // 2 hours
export const ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const isProduction = process.env.NODE_ENV === 'production';

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string;
  /** Hard ceiling; never extended. */
  absoluteExpiresAt: string;
  userAgent: string | null;
  ip: string | null;
}

export interface NewSession {
  record: SessionRecord;
  rawToken: string;
  csrfToken: string;
}

export function createSessionRecord(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): NewSession {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();

  return {
    rawToken,
    // The CSRF token is not a secret from the page — it is deliberately
    // readable so the client can echo it back in a header. Its job is to prove
    // the request came from our own origin, which a cross-site form cannot do.
    csrfToken: crypto.randomBytes(24).toString('base64url'),
    record: {
      id: crypto.randomUUID(),
      userId,
      tokenHash: hashToken(rawToken),
      createdAt: new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
      absoluteExpiresAt: new Date(now + ABSOLUTE_TIMEOUT_MS).toISOString(),
      userAgent: meta.userAgent?.slice(0, 200) ?? null,
      ip: meta.ip ?? null,
    },
  };
}

export function isSessionExpired(record: SessionRecord): boolean {
  const now = Date.now();
  if (now > new Date(record.absoluteExpiresAt).getTime()) return true;
  if (now - new Date(record.lastSeenAt).getTime() > IDLE_TIMEOUT_MS) return true;
  return false;
}

/**
 * Resolve a raw cookie value to a live session, sliding the idle window.
 * Returns null for unknown, expired or revoked sessions — and deletes the
 * record when it has expired, so the store does not accumulate dead rows.
 */
export async function resolveSession(rawToken: string): Promise<SessionRecord | null> {
  if (!rawToken) return null;

  const record = await store.findSessionByHash(hashToken(rawToken));
  if (!record) return null;

  if (isSessionExpired(record)) {
    await store.deleteResolvedSession(record.id);
    return null;
  }

  // Slide the idle window, but only every minute or so: rewriting the store on
  // every request would make the JSON file the bottleneck.
  const lastSeen = new Date(record.lastSeenAt).getTime();
  if (Date.now() - lastSeen > 60_000) {
    await store.touchSession(record.id);
  }

  return record;
}

function cookieBase() {
  return {
    httpOnly: true,
    // Lax still sends the cookie on top-level navigation (so an emailed
    // verification link works) while blocking cross-site POSTs.
    sameSite: 'lax' as const,
    // Secure would make the cookie undeliverable over plain-HTTP localhost.
    secure: isProduction,
    path: '/',
  };
}

export function setSessionCookies(res: Response, session: NewSession): void {
  res.cookie(SESSION_COOKIE, session.rawToken, {
    ...cookieBase(),
    maxAge: ABSOLUTE_TIMEOUT_MS,
  });
  res.cookie(CSRF_COOKIE, session.csrfToken, {
    ...cookieBase(),
    // Readable by the client, which must echo it in a header.
    httpOnly: false,
    maxAge: ABSOLUTE_TIMEOUT_MS,
  });
}

export function clearSessionCookies(res: Response): void {
  // Options must match those used to set the cookie or the browser keeps it.
  res.clearCookie(SESSION_COOKIE, cookieBase());
  res.clearCookie(CSRF_COOKIE, { ...cookieBase(), httpOnly: false });
}

/**
 * Give anonymous callers a CSRF token too.
 *
 * Login and password-reset are state-changing and must be CSRF-protected — a
 * forged login logs the victim into the attacker's account, and they then work
 * inside it unaware. But those endpoints run before any session exists, so
 * without this the very first POST would have no token to present.
 *
 * The value is rotated when a session starts, so a token fixed by an attacker
 * before sign-in is worthless afterwards.
 */
export function ensureCsrfCookie(req: Request, res: Response, next: NextFunction): void {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = crypto.randomBytes(24).toString('base64url');
    res.cookie(CSRF_COOKIE, token, {
      ...cookieBase(),
      httpOnly: false,
      maxAge: ABSOLUTE_TIMEOUT_MS,
    });
    // Make it visible to this same request, so a handler further down the
    // chain sees the token we just minted rather than nothing.
    req.cookies = { ...(req.cookies ?? {}), [CSRF_COOKIE]: token };
  }
  next();
}
