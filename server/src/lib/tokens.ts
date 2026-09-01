/**
 * Single-use, expiring secrets: email verification and password reset.
 *
 * Two rules govern everything here.
 *
 * 1. The raw token is generated once, handed to the user (via email), and then
 *    forgotten. Only a SHA-256 digest is persisted. A database dump therefore
 *    yields nothing usable — the same reason passwords are hashed.
 *
 * 2. Lookup is by digest, and comparison uses `timingSafeEqual`. Comparing
 *    with `===` would leak the token byte-by-byte to an attacker who can
 *    measure response time.
 *
 * SHA-256 (not bcrypt) is correct here: these tokens are 256 bits of CSPRNG
 * output, so they have no guessable structure for a slow hash to protect. Slow
 * hashing is for low-entropy human passwords.
 */

import crypto from 'node:crypto';

export type TokenPurpose = 'email_verification' | 'password_reset';

export interface IssuedToken {
  /** Sent to the user. Never stored. */
  raw: string;
  /** Stored. Never sent. */
  hash: string;
  expiresAt: string;
}

/** How long each kind of token stays valid. */
export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  // Long enough to survive a mail queue and a lunch break.
  email_verification: 24 * 60 * 60 * 1000,
  // Deliberately short: a reset link is a full account takeover if intercepted.
  password_reset: 60 * 60 * 1000,
};

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function issueToken(purpose: TokenPurpose): IssuedToken {
  // 32 bytes = 256 bits. base64url keeps it URL-safe without escaping.
  const raw = crypto.randomBytes(32).toString('base64url');
  return {
    raw,
    hash: hashToken(raw),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]).toISOString(),
  };
}

/** Constant-time comparison of two hex digests of equal length. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on length mismatch, which would itself be a leak;
  // compare lengths first and still run the comparison to keep timing flat.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isExpired(expiresAt: string): boolean {
  return Date.now() > new Date(expiresAt).getTime();
}
