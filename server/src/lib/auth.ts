/**
 * Authentication core.
 *
 * Design decisions worth stating, because each replaced something weaker:
 *
 *  - **Sessions are server-side and opaque.** The old build issued a 7-day JWT
 *    that could not be withdrawn; logout only deleted the client's copy. Now
 *    every request resolves a session record, so revocation is immediate.
 *  - **The credential lives in an httpOnly cookie**, not localStorage, so page
 *    scripts cannot read it. No auth secret is ever placed in a response body.
 *  - **Password hashing is bcrypt cost 12**, with transparent rehashing when an
 *    older, cheaper hash is seen at login.
 *  - **Failure paths are constant-time and constant-message.** An attacker
 *    cannot learn from timing or wording whether an address is registered.
 */

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import type { NextFunction, Request, Response } from 'express';
import type { StoredUser, User } from '../../../shared/types.js';
import * as store from './store.js';
import * as sessions from './sessions.js';
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from './sessions.js';
import { safeEqual } from './tokens.js';
import { recordAuthEvent } from './audit.js';
import { DEMO_EMAIL, GOOGLE_LOGIN_ENABLED } from './config.js';

const BCRYPT_ROUNDS = 12;
const isProduction = process.env.NODE_ENV === 'production';

/**
 * A bcrypt hash of a random string, compared against when no account exists so
 * that a miss costs the same as a hit. Without this, "unknown email" returns in
 * ~1ms and "wrong password" in ~250ms, which enumerates the user table.
 */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

/* --------------------------------------------------------- configuration */

/**
 * Refusing to boot is the right call in production: a server that silently
 * generates its own secret looks healthy while every restart invalidates
 * sessions, and any operator assumption about key management is wrong.
 */
if (isProduction) {
  const missing = ['SESSION_SECRET', 'APP_URL'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(
      `[auth] refusing to start: ${missing.join(', ')} must be set in production.`,
    );
    process.exit(1);
  }
}

/* ------------------------------------------------------------ Google SSO */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.replace(/^["']|["']$/g, '') ?? '';

/**
 * Google sign-in is switched off in this build — the sign-in page offers
 * email + password and the demo workspace instead. The flow below is intact
 * and stays correct; GOOGLE_LOGIN=on with a client id configured brings it
 * back, and everything downstream (the button, the route, the account
 * linking) follows from this one predicate.
 */
export function googleEnabled(): boolean {
  return GOOGLE_LOGIN_ENABLED && Boolean(GOOGLE_CLIENT_ID);
}

export function googleStatus(): { enabled: boolean; clientId: string | null } {
  // The client ID is public by design — the browser needs it to render the
  // button, and Google treats it as public. The client *secret* is not used by
  // this flow and must never be sent here. While the feature is off we withhold
  // even the ID, so the browser never loads Google's script at all.
  return googleEnabled()
    ? { enabled: true, clientId: GOOGLE_CLIENT_ID }
    : { enabled: false, clientId: null };
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
}

/**
 * Verify a Google ID token against Google's published signing keys.
 * `verifyIdToken` checks signature, issuer, audience and expiry. Replacing this
 * with a plain JWT decode would let anyone sign in as anyone.
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

    // Google only asserts ownership when the address is verified; without this
    // check an attacker could claim any address on an unverified account.
    if (payload.email_verified !== true) return null;

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

/* ------------------------------------------------------------ demo access */

/** Raised when DEMO_EMAIL names an account that is not the demo workspace. */
export class DemoAddressTaken extends Error {
  constructor() {
    super('The configured demo address belongs to a real account.');
    this.name = 'DemoAddressTaken';
  }
}

/**
 * Resolve the shared demo workspace, creating it the first time someone asks.
 *
 * Every visitor who takes the demo lands in the *same* account, so the roles
 * and resumes one of them uploads are visible to the next. That is the point
 * — the demo is meant to look lived-in — but it is also the reason the UI
 * says plainly that nothing private belongs here.
 *
 * Two properties keep the blast radius small. The account is always a
 * recruiter, never the admin that the first registration on a fresh
 * deployment would become. And it carries no password hash, so the well-known
 * address cannot be driven through the password form, the reset flow, or a
 * lockout attack against a real user's session — the only way in is the demo
 * route, which is rate limited like any other sign-in.
 */
async function resolveDemoUser(): Promise<StoredUser> {
  const existing = await store.findUserByEmail(DEMO_EMAIL);
  if (existing) {
    // A real account sitting on the demo address would turn this button into a
    // way into someone's workspace. Registration refuses the address, so this
    // only fires for a deployment whose DEMO_EMAIL was pointed at an existing
    // account — refuse rather than hand out a session for it.
    if (existing.provider !== 'demo') throw new DemoAddressTaken();
    return existing;
  }

  const user: StoredUser = {
    id: store.newId(),
    email: DEMO_EMAIL,
    name: 'Demo User',
    company: 'ResumeAI Demo',
    role: 'recruiter',
    provider: 'demo',
    // There is no inbox to confirm; the address is ours and the data routes
    // are gated on this being true.
    emailVerified: true,
    createdAt: new Date().toISOString(),
  };

  await store.createUser(user);
  return user;
}

/** In-flight creation, so two simultaneous first clicks mint one workspace. */
let demoPending: Promise<StoredUser> | null = null;

export function ensureDemoUser(): Promise<StoredUser> {
  if (!demoPending) {
    demoPending = resolveDemoUser();
    // Clear the latch either way: a failed attempt must not poison the next.
    void demoPending.catch(() => {}).then(() => { demoPending = null; });
  }
  return demoPending;
}

/* --------------------------------------------------------------- secrets */

/** The only sanctioned way to turn a stored user into something a client sees. */
export function publicUser(user: StoredUser): User {
  const {
    passwordHash, googleId,
    verifyTokenHash, verifyTokenExpiresAt,
    resetTokenHash, resetTokenExpiresAt,
    failedLoginCount, lockedUntil, passwordChangedAt,
    ...safe
  } = user;

  // Referenced so the compiler treats the omissions as deliberate rather than
  // as unused-variable mistakes that a later edit might "fix" by inlining.
  void passwordHash; void googleId;
  void verifyTokenHash; void verifyTokenExpiresAt;
  void resetTokenHash; void resetTokenExpiresAt;
  void failedLoginCount; void lockedUntil; void passwordChangedAt;

  return safe;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Burn the same time as a real check when there is no account to check. */
export async function fakeVerify(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH);
}

/** True when a stored hash was made with fewer rounds than we now require. */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) < BCRYPT_ROUNDS;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------- account lockout */

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export function isLocked(user: StoredUser): boolean {
  return Boolean(user.lockedUntil && Date.now() < new Date(user.lockedUntil).getTime());
}

export function lockRemainingSeconds(user: StoredUser): number {
  if (!user.lockedUntil) return 0;
  return Math.max(0, Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 1000));
}

export async function recordFailedLogin(user: StoredUser): Promise<void> {
  const count = (user.failedLoginCount ?? 0) + 1;
  await store.updateUser(user.id, {
    failedLoginCount: count,
    lockedUntil:
      count >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null,
  });
}

export async function clearFailedLogins(user: StoredUser): Promise<void> {
  if (!user.failedLoginCount && !user.lockedUntil) return;
  await store.updateUser(user.id, { failedLoginCount: 0, lockedUntil: null });
}

/* -------------------------------------------------------------- sessions */

export async function startSession(res: Response, user: StoredUser, req: Request): Promise<void> {
  const session = sessions.createSessionRecord(user.id, {
    userAgent: req.headers['user-agent'] ?? null,
    ip: req.ip ?? null,
  });
  await store.createSession(session.record);
  sessions.setSessionCookies(res, session);
}

export async function endSession(
  res: Response,
  owner?: { userId: string; sessionId: string },
): Promise<void> {
  if (owner) await store.deleteSession(owner.userId, owner.sessionId);
  sessions.clearSessionCookies(res);
}

/* ------------------------------------------------------------ middleware */

export interface AuthedRequest extends Request {
  user: StoredUser;
  sessionId: string;
}

const authed = (req: Request): AuthedRequest => req as AuthedRequest;

/**
 * Session guard. Resolves the cookie to a live session and a current user
 * record — the user is re-read every request, so a role change or deletion
 * takes effect immediately rather than living on inside a stale token.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const raw = (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? '';
  if (!raw) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }

  const session = await sessions.resolveSession(raw);
  if (!session) {
    sessions.clearSessionCookies(res);
    // A presented-but-unknown cookie is either an expiry or someone replaying
    // a revoked credential. Worth a line either way.
    recordAuthEvent('session.rejected', {
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? null,
      requestId: req.id,
      detail: 'unknown, expired or revoked session cookie',
    });
    res.status(401).json({ error: 'Your session has expired. Sign in again.' });
    return;
  }

  const user = await store.findUserById(session.userId);
  if (!user) {
    // The account is gone; the session row is orphaned, so drop it directly.
    await store.deleteResolvedSession(session.id);
    sessions.clearSessionCookies(res);
    res.status(401).json({ error: 'Account no longer exists.' });
    return;
  }

  authed(req).user = user;
  authed(req).sessionId = session.id;
  next();
}

/**
 * Resolve a session if one is present, but never reject.
 *
 * Lets a single endpoint answer differently for anonymous and signed-in
 * callers — used by /api/health, which must expose the Google client ID to the
 * sign-in page while keeping engine details from unauthenticated eyes.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const raw = (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? '';
  if (raw) {
    const session = await sessions.resolveSession(raw);
    if (session) {
      const user = await store.findUserById(session.userId);
      if (user) {
        authed(req).user = user;
        authed(req).sessionId = session.id;
      }
    }
  }
  next();
}

/**
 * Gate on a confirmed address. Kept separate from `requireAuth` so an
 * unverified user can still reach /auth/me and the resend endpoint — otherwise
 * they would be locked out with no way to finish signing up.
 */
export function requireVerified(req: Request, res: Response, next: NextFunction): void {
  const { user } = authed(req);
  if (!user.emailVerified) {
    res.status(403).json({
      error: 'Confirm your email address to continue.',
      code: 'EMAIL_NOT_VERIFIED',
    });
    return;
  }
  next();
}

/**
 * Double-submit CSRF check on state-changing requests.
 *
 * SameSite=Lax already blocks cross-site POSTs in current browsers, but this
 * does not rely on that alone: `/api/analyze` is multipart/form-data, a
 * "simple" content type that a cross-origin form can submit without a
 * preflight. An attacker cannot read our cookie, so they cannot produce a
 * matching header.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const cookie = (req.cookies?.[CSRF_COOKIE] as string | undefined) ?? '';
  const header = (req.headers[CSRF_HEADER] as string | undefined) ?? '';

  if (!cookie || !header || !safeEqual(cookie, header)) {
    recordAuthEvent('csrf.rejected', {
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? null,
      requestId: req.id,
      detail: `${req.method} ${req.path} — ${!header ? 'no header' : 'mismatch'}`,
    });
    res.status(403).json({ error: 'Request blocked: invalid or missing CSRF token.' });
    return;
  }
  next();
}

/* ----------------------------------------------------------- validation */

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

// Intentionally permissive. Strict RFC 5322 matching rejects valid addresses;
// the real proof of ownership is the verification email, not this regex.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: unknown): ValidationResult {
  if (typeof email !== 'string' || !email.trim()) {
    return { ok: false, error: 'Email is required.' };
  }
  if (email.length > 254) {
    return { ok: false, error: 'That email address is too long.' };
  }
  if (!EMAIL_RE.test(email.trim())) {
    return { ok: false, error: 'That does not look like a valid email address.' };
  }
  return { ok: true };
}

/**
 * Length over character classes. Composition rules push people toward
 * "Passw0rd!" — predictable to a cracker, annoying to a human. The 200-char
 * ceiling matters for a different reason: bcrypt silently truncates at 72
 * bytes, and unbounded input is a CPU denial-of-service.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', 'qwerty123',
  'letmein1', 'welcome1', 'admin123', 'iloveyou', 'sunshine', 'princess',
  'football', 'baseball', 'trustno1', 'passw0rd', 'monkey123', 'changeme',
]);

export function validatePassword(password: unknown, context: string[] = []): ValidationResult {
  if (typeof password !== 'string' || !password) {
    return { ok: false, error: 'Password is required.' };
  }
  if (password.length < 10) {
    return { ok: false, error: 'Password must be at least 10 characters.' };
  }
  if (password.length > 200) {
    return { ok: false, error: 'Password must be under 200 characters.' };
  }
  if (/^\d+$/.test(password)) {
    return { ok: false, error: 'Password cannot be only numbers.' };
  }

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return { ok: false, error: 'That password is too common. Choose something less predictable.' };
  }
  // A password containing your own email or name is trivially guessable.
  for (const item of context) {
    const needle = item?.trim().toLowerCase();
    if (needle && needle.length >= 4 && lower.includes(needle)) {
      return { ok: false, error: 'Password must not contain your name or email address.' };
    }
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
