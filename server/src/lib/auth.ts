/**
 * Authentication: bcrypt password hashing + JWT bearer sessions.
 *
 * Passwords are never stored or logged in plaintext, and the hash never leaves
 * the server — `publicUser()` is the only thing routes are allowed to return.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import type { NextFunction, Request, Response } from 'express';
import type { StoredUser, User, UserRole } from '../../../shared/types.js';
import * as store from './store.js';

const TOKEN_TTL = '7d';
const BCRYPT_ROUNDS = 10;

/**
 * A dev-only fallback secret keeps `npm run dev` working with no setup, but a
 * random one per boot means restarting invalidates old tokens — which is the
 * correct behaviour for a secret nobody configured. Production must set it.
 */
const SECRET: string = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.JWT_SECRET) {
  console.warn(
    '[auth] JWT_SECRET is not set — using a random per-boot secret.\n' +
      '       Sessions will not survive a server restart. Set JWT_SECRET in server/.env before deploying.',
  );
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

/* ------------------------------------------------------------ Google SSO */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';

export function googleEnabled(): boolean {
  return Boolean(GOOGLE_CLIENT_ID);
}

export function googleStatus(): { enabled: boolean; clientId: string | null } {
  // The client id is public by design — the browser needs it to render the
  // button. The client *secret* is never involved in this flow.
  return { enabled: googleEnabled(), clientId: GOOGLE_CLIENT_ID || null };
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
}

/**
 * Verify a Google ID token locally against Google's signing keys.
 *
 * `verifyIdToken` checks the signature, issuer, audience and expiry. Decoding
 * the JWT without verifying — which is easy to do by accident — would let
 * anyone sign in as anyone, so this must never be replaced with a plain decode.
 */
export async function verifyGoogleToken(credential: string): Promise<GoogleProfile | null> {
  if (!googleEnabled()) return null;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) return null;

    // An unverified Google email could belong to someone else entirely.
    if (payload.email_verified === false) return null;

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture ?? null,
    };
  } catch (err) {
    console.warn('[auth] Google token verification failed:', (err as Error).message);
    return null;
  }
}

/* ------------------------------------------------------------- password */

/** Strip the password hash. The only user shape routes may send to a client. */
export function publicUser(user: StoredUser): User {
  const { passwordHash, googleId, ...rest } = user;
  void passwordHash;
  void googleId;
  return rest;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(user: StoredUser): string {
  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Requests that reach a guarded handler always carry a resolved user. */
export interface AuthedRequest extends Request {
  user: StoredUser;
}

/**
 * Bearer-token guard. Rejects before the handler runs, so no route has to
 * remember to check, and every downstream query gets a real `userId`.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }

  const payload = verifyToken(header.slice(7).trim());
  if (!payload) {
    res.status(401).json({ error: 'Your session has expired. Sign in again.' });
    return;
  }

  const user = await store.findUserById(payload.sub);
  if (!user) {
    res.status(401).json({ error: 'Account no longer exists.' });
    return;
  }

  (req as AuthedRequest).user = user;
  next();
}

/* ----------------------------------------------------------- validation */

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: unknown): ValidationResult {
  if (typeof email !== 'string' || !email.trim()) {
    return { ok: false, error: 'Email is required.' };
  }
  if (!EMAIL_RE.test(email.trim())) {
    return { ok: false, error: 'That does not look like a valid email address.' };
  }
  return { ok: true };
}

/**
 * Deliberately modest rules: length carries far more real strength than
 * character-class gymnastics, and fussy rules push people toward "Passw0rd!".
 */
export function validatePassword(password: unknown): ValidationResult {
  if (typeof password !== 'string' || !password) {
    return { ok: false, error: 'Password is required.' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (password.length > 200) {
    return { ok: false, error: 'Password must be under 200 characters.' };
  }
  if (/^\d+$/.test(password)) {
    return { ok: false, error: 'Password cannot be only numbers.' };
  }
  return { ok: true };
}

export function validateName(name: unknown): ValidationResult {
  if (typeof name !== 'string' || name.trim().length < 2) {
    return { ok: false, error: 'Please enter your name.' };
  }
  if (name.trim().length > 80) {
    return { ok: false, error: 'Name must be under 80 characters.' };
  }
  return { ok: true };
}
