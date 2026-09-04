import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractText, SUPPORTED_EXTENSIONS, shutdownOcr } from './lib/extract.js';
import { parseResume } from './lib/parse.js';
import { analyze, cosineSimilarity, jobDescriptionText } from './lib/score.js';
import { ALL_SKILLS, CATEGORIES } from './lib/skills.js';
import { findTemplate, templatesBySector, ROLE_TEMPLATES } from './lib/role-templates.js';
import * as store from './lib/store.js';
import * as gemini from './lib/gemini.js';
import cookieParser from 'cookie-parser';
import {
  clearFailedLogins,
  DemoAddressTaken,
  endSession,
  ensureDemoUser,
  fakeVerify,
  googleEnabled,
  googleStatus,
  hashPassword,
  isLocked,
  lockRemainingSeconds,
  needsRehash,
  normaliseEmail,
  publicUser,
  recordFailedLogin,
  requireAuth,
  requireCsrf,
  requireVerified,
  optionalAuth,
  startSession,
  validateEmail,
  validateName,
  validatePassword,
  verifyGoogleToken,
  verifyPassword,
  type AuthedRequest,
} from './lib/auth.js';
import {
  ipRateLimit, principalRateLimit, consume, reset as resetLimit,
  clientIp, describe, principal,
} from './lib/ratelimit.js';
import * as abuse from './lib/abuse.js';
import * as quota from './lib/quota.js';
import { hashToken, isExpired, issueToken } from './lib/tokens.js';
import * as mailer from './lib/mailer.js';
import { clearSessionCookies, ensureCsrfCookie, isSessionExpired } from './lib/sessions.js';
import * as v from './lib/validate.js';
import {
  APP_URL, BIND_HOST, DEMO_EMAIL, DEMO_LOGIN_ENABLED, MAX_FILE_MB, PORT,
  TRUST_PROXY, TRUST_PROXY_ENABLED,
  describe as describeConfig, reportConfig,
} from './lib/config.js';
import { closeLogger, log } from './lib/logger.js';
import { recordAuthEvent, auditSnapshot } from './lib/audit.js';
import { requestId, requireHttps, securityHeaders, secureDataDirectories } from './lib/hardening.js';

import type {
  AnalyzeFailure,
  Candidate,
  CandidateSummary,
  Extraction,
  MatrixRow,
  Role,
  StoredFile,
  StoredUser,
} from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const DATA_DIR = path.join(__dirname, '..', 'data');

// Fail fast on bad configuration before anything binds a port.
reportConfig(log);
// Owner-only permissions on everything holding hashes, PII or resumes.
secureDataDirectories({ data: DATA_DIR, uploads: UPLOAD_DIR });

const app = express();

// Rate limiting keys on req.ip; behind a proxy that is the proxy's address
// unless we trust the forwarding header, which would put every user in one
// bucket. Only trust it when explicitly told to — trusting it blindly lets a
// client spoof X-Forwarded-For and evade the limiter entirely.
if (TRUST_PROXY_ENABLED) {
  // Already normalised to something Express understands — see config.ts.
  app.set('trust proxy', TRUST_PROXY);
}
// Never advertise the framework; it only helps someone pick an exploit.
app.disable('x-powered-by');

app.use(requestId);
app.use(requireHttps);
app.use(securityHeaders);

const CLIENT_DIST = path.resolve(__dirname, '../../../../client/dist');

app.use(express.static(CLIENT_DIST));

// Credentials must be allowed for cookie auth, and that forbids a wildcard
// origin — so the allowed origin is explicit.
app.use(cors({ origin: APP_URL, credentials: true }));

app.use(cookieParser());
app.use(express.json({ limit: '4mb' }));

/**
 * Access log. Emitted on response finish so it carries the real status and
 * duration, and raised to a security line for the status codes that indicate
 * someone probing rather than someone using the app.
 */
app.use((req, res, next) => {
  res.on('finish', () => {
    const ms = Date.now() - (req.startedAt ?? Date.now());
    const meta = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms,
      ip: req.ip,
    };

    if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) {
      log.security('http.refused', meta);
    } else if (res.statusCode >= 500) {
      log.error('http.error', meta);
    } else if (ms > 5000) {
      // Slow requests are worth seeing: they are how resource-exhaustion shows up.
      log.warn('http.slow', meta);
    } else {
      log.debug('http', meta);
    }
  });
  next();
});

// Anonymous callers get a CSRF token so that login itself is protected, then
// every mutating request must echo it. Registered before the routes so a new
// endpoint is covered by default rather than by remembering.
app.use('/api', ensureCsrfCookie, requireCsrf);

/**
 * Behavioural gate. Runs on every API request and refuses only on patterns no
 * legitimate client produces — crawlers, id enumeration, bulk record
 * collection, or a scripted client at machine cadence. Single oddities are
 * scored and logged, not blocked, because honest integrations look unusual too.
 */
app.use('/api', (req, res, next) => {
  const verdict = abuse.inspect(req);

  // Feed response codes back so 404 streaks on id routes become visible. The
  // key comes from `inspect` because the principal changes once auth has run.
  res.on('finish', () => abuse.noteResponse(verdict.key, req, res.statusCode));

  if (verdict.refuse) {
    res.setHeader('Retry-After', '300');
    res.status(429).json({ error: verdict.reason });
    return;
  }
  next();
});

/**
 * Overall API budget, charged to the account when there is one and the address
 * otherwise. Generous enough that the dashboard's own burst of calls never
 * approaches it; low enough that a runaway script is stopped in a minute.
 */
app.use('/api', principalRateLimit('api', {
  max: 600,
  windowMs: 60_000,
  blockMs: 60_000,
  noun: 'the API',
  onRefusal: (req) => log.security('abuse.api_budget_exhausted', {
    principal: principal(req), ip: req.ip, path: req.path, requestId: req.id,
  }),
}));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${store.newId()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 60 },
  fileFilter: (_req, file, cb) => {
    // Sanitise first: the original name is attacker-controlled and is used to
    // derive the extension. "resume.pdf\u0000.sh" and "../../x.pdf" both need
    // to resolve to something harmless before anything is decided from it.
    const clean = v.safeFilename(file.originalname);
    const ext = path.extname(clean).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      // A ValidationError so the handler answers 400. A plain Error here falls
      // through to the generic branch and reports a 500, which blames the
      // server for the client sending an unsupported file.
      return cb(new v.ValidationError(
        'resumes',
        `Unsupported file type "${ext || 'none'}". Allowed: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      ));
    }
    // Carry the cleaned name forward so nothing downstream sees the raw one.
    file.originalname = clean;
    cb(null, true);
  },
});

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
const route = (fn: Handler): Handler => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** The only values `status` may take. Referenced by the validator. */
const CANDIDATE_STATUSES = ['new', 'shortlisted', 'rejected'] as const;

/** Narrow to the guarded request shape inside handlers behind `requireAuth`. */
const authed = (req: Request): AuthedRequest => req as AuthedRequest;

/** Common fields for every audit line raised from a route. */
const ctx = (req: Request, extra: Record<string, unknown> = {}) => ({
  ip: req.ip ?? 'unknown',
  userAgent: req.headers['user-agent'] ?? null,
  requestId: req.id,
  ...extra,
});

/* ------------------------------------------------------------------ meta */

/**
 * Health and capability discovery.
 *
 * Which sign-in methods this deployment offers has to be readable before
 * sign-in — the page cannot decide what to render otherwise, and the Google
 * client ID is public by design when that method is on. Everything else is
 * infrastructure detail: which models are configured, and whether an AI key is
 * present at all. That is free reconnaissance for an attacker and of no use to
 * an anonymous visitor, so it is only included once a session is resolved.
 */
app.get('/api/health', optionalAuth, (req, res) => {
  const signedIn = Boolean((req as Partial<AuthedRequest>).user);

  res.json({
    ok: true,
    google: googleStatus(),
    demo: { enabled: DEMO_LOGIN_ENABLED },
    maxFileMb: MAX_FILE_MB,
    supported: SUPPORTED_EXTENSIONS,
    gemini: signedIn
      ? gemini.geminiStatus()
      // Anonymous callers learn nothing about the AI configuration.
      : { enabled: false, extractModel: '', reasonModel: '', embedModel: '' },
  });
});

/**
 * Operational health. Behind auth and admin-only: uptime and detector counts
 * are useful to an operator and useful to an attacker, so they are not public.
 */
app.get('/api/ops/health', requireAuth, requireVerified, (req, res) => {
  if (authed(req).user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only.' });
  }
  res.json({
    ok: true,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    detectors: { ...auditSnapshot(), ...abuse.abuseSnapshot() },
  });
});

/** Current analysis budget, so the UI can show it before a large upload. */
app.get('/api/quota', requireAuth, requireVerified, (req, res) => {
  res.json({ quota: quota.quotaStatus(authed(req).user.id) });
});

/**
 * The skill library. Behind auth because nothing pre-login needs it: the sign-in
 * page never reads it, and only the role editor and filter panel do. Left public
 * it was a 26 KB unauthenticated payload — free bandwidth for anyone, and a
 * needless disclosure of the full taxonomy and every alias the matcher uses.
 */
app.get('/api/skills', requireAuth, requireVerified, (_req, res) => {
  // Static for the process lifetime, so let the browser keep it.
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.json({ skills: ALL_SKILLS, categories: CATEGORIES });
});

/* ------------------------------------------------------------------ auth */

/**
 * Limits are deliberately tighter on the endpoints that reveal or grant
 * access. `blockMs` is longer than the window so tripping a limit costs real
 * time rather than resetting immediately.
 */
const LOGIN_IP_LIMIT   = { max: 10, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };
const REGISTER_LIMIT   = { max: 5,  windowMs: 60 * 60_000, blockMs: 60 * 60_000 };
const RESET_LIMIT      = { max: 5,  windowMs: 60 * 60_000, blockMs: 60 * 60_000 };
const VERIFY_LIMIT     = { max: 20, windowMs: 60 * 60_000 };

/** Identical response whether or not the address is already taken. */
const REGISTER_ACCEPTED = {
  ok: true,
  message: 'Check your email for a link to confirm your address.',
};

app.post('/api/auth/register', ipRateLimit('register', REGISTER_LIMIT), route(async (req, res) => {
  const { email, password, name, company } = req.body ?? {};

  // Hidden field no human can see, let alone fill. Answer exactly as a real
  // signup does, so the bot cannot tell it failed and retry differently.
  if (abuse.trippedHoneypot(req.body)) {
    log.security('abuse.honeypot_tripped', {
      ip: req.ip, ua: req.headers['user-agent'], requestId: req.id,
    });
    return res.status(202).json(REGISTER_ACCEPTED);
  }

  for (const check of [validateName(name), validateEmail(email)]) {
    if (!check.ok) return res.status(400).json({ error: check.error });
  }
  // Feed the identity into the strength check so "alex@acme.com" cannot use
  // "alexacme123" as a password.
  const strength = validatePassword(password, [String(name ?? ''), String(email ?? '').split('@')[0]]);
  if (!strength.ok) return res.status(400).json({ error: strength.error });

  const address = normaliseEmail(String(email));

  // The demo workspace is signed into by button, not by password. Letting a
  // signup claim its address would put a visitor into a stranger's account.
  if (DEMO_LOGIN_ENABLED && address === DEMO_EMAIL) {
    return res.status(202).json(REGISTER_ACCEPTED);
  }

  if (abuse.isDisposableEmail(address)) {
    return res.status(400).json({
      error: 'Please use a work email address. Disposable addresses are not accepted.',
    });
  }

  // "a.b+tag@gmail.com" and "ab@gmail.com" are one mailbox. Collapsing aliases
  // stops one inbox minting unlimited accounts to farm free analysis quota.
  const canonical = abuse.canonicalEmail(address);
  const aliasLimit = consume(`signup:alias:${canonical}`, {
    max: 3, windowMs: 24 * 60 * 60_000, blockMs: 24 * 60 * 60_000,
  });
  if (!aliasLimit.allowed) {
    log.security('abuse.signup_alias_flood', {
      canonical: abuse.canonicalEmail(address).split('@')[1],
      ip: req.ip, requestId: req.id,
    });
    // Same shape as success: do not teach the script what tripped.
    return res.status(202).json(REGISTER_ACCEPTED);
  }

  const existing = await store.findUserByEmail(address);

  if (existing) {
    // Do not confirm the address is taken. Tell the real owner by email and
    // return the same body as a successful signup, so probing yields nothing.
    mailer.sendDuplicateRegistrationEmail(existing.email, existing.name);
    recordAuthEvent('register.duplicate', ctx(req, { email: address, userId: existing.id }));
    return res.status(202).json(REGISTER_ACCEPTED);
  }

  const verification = issueToken('email_verification');
  const user: StoredUser = {
    id: store.newId(),
    email: address,
    name: String(name).trim(),
    company: company ? String(company).trim().slice(0, 120) : null,
    // The first account to register owns the deployment.
    role: (await store.countUsers()) === 0 ? 'admin' : 'recruiter',
    provider: 'password',
    emailVerified: false,
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(password),
    verifyTokenHash: verification.hash,
    verifyTokenExpiresAt: verification.expiresAt,
    failedLoginCount: 0,
    lockedUntil: null,
  };

  await store.createUser(user);
  mailer.sendVerificationEmail(user.email, user.name, verification.raw);
  recordAuthEvent('register.new', ctx(req, { email: user.email, userId: user.id }));

  // No session yet: signing in is gated on confirming the address.
  res.status(202).json(REGISTER_ACCEPTED);
}));

app.post('/api/auth/login', ipRateLimit('login', LOGIN_IP_LIMIT), route(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const address = normaliseEmail(email);
  const user = await store.findUserByEmail(address);
  const invalid = { error: 'Email or password is incorrect.' };

  // Per-account limit, so rotating IPs against one inbox still gets throttled.
  const accountKey = `account:login:${address}`;
  const accountLimit = consume(accountKey, { max: 10, windowMs: 15 * 60_000, blockMs: 15 * 60_000 });
  if (!accountLimit.allowed) {
    recordAuthEvent('ratelimit.tripped', ctx(req, { email: address, detail: 'per-account login limit' }));
    return res.status(429).json({
      error: `Too many attempts. Try again in ${describe(accountLimit.retryAfter)}.`,
    });
  }

  if (!user) {
    // Spend the same time bcrypt would, so a missing account is indistinguishable.
    await fakeVerify(password);
    recordAuthEvent('login.failure', ctx(req, { email: address, detail: 'no such account' }));
    return res.status(401).json(invalid);
  }

  if (isLocked(user)) {
    recordAuthEvent('login.locked', ctx(req, { email: address, userId: user.id }));
    return res.status(429).json({
      error: `Account temporarily locked after repeated failures. Try again in ${describe(lockRemainingSeconds(user))}.`,
    });
  }

  if (!user.passwordHash) {
    await fakeVerify(password);
    recordAuthEvent('login.failure', ctx(req, { email: address, userId: user.id, detail: 'google-only account' }));
    // Same status and shape as a bad password; the hint is safe because it is
    // only reachable once the correct address is already known to the caller.
    return res.status(401).json({
      error: 'Email or password is incorrect.',
      hint: 'GOOGLE_ACCOUNT',
    });
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordFailedLogin(user);
    recordAuthEvent('login.failure', ctx(req, { email: address, userId: user.id, detail: 'wrong password' }));
    return res.status(401).json(invalid);
  }

  if (!user.emailVerified) {
    recordAuthEvent('login.unverified', ctx(req, { email: address, userId: user.id }));
    return res.status(403).json({
      error: 'Confirm your email address before signing in. Check your inbox for the link.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }

  // Upgrade a hash made with fewer rounds, now that we hold the plaintext.
  if (needsRehash(user.passwordHash)) {
    await store.updateUser(user.id, { passwordHash: await hashPassword(password) });
  }

  await clearFailedLogins(user);
  resetLimit(accountKey);
  resetLimit(`ip:login:${clientIp(req)}`);

  await startSession(res, user, req);
  recordAuthEvent('login.success', ctx(req, { email: user.email, userId: user.id }));
  res.json({ user: publicUser(user) });
}));

/**
 * Google Sign-In. The browser obtains an ID token from Google Identity
 * Services and posts it here; we verify it against Google's keys, then either
 * link it to the existing account with that email or create a new workspace.
 */
app.post('/api/auth/google', ipRateLimit('google', LOGIN_IP_LIMIT), route(async (req, res) => {
  // Off by default in this build. Answering 404 rather than failing the token
  // check keeps the disabled case honest instead of looking like an outage.
  if (!googleEnabled()) {
    return res.status(404).json({ error: 'Google sign-in is not available on this deployment.' });
  }

  const credential = req.body?.credential;
  if (typeof credential !== 'string' || !credential) {
    return res.status(400).json({ error: 'Missing Google credential.' });
  }

  const profile = await verifyGoogleToken(credential);
  if (!profile) {
    return res.status(401).json({
      error: 'Google sign-in could not be verified. Try again, or use email and password.',
    });
  }

  const existing = await store.findUserByEmail(profile.email);

  if (existing) {
    await store.linkGoogle(existing.id, profile.googleId, profile.picture);
    // Google has already proved ownership of this address, so an account that
    // signed up by password and never confirmed is verified by this.
    if (!existing.emailVerified) {
      await store.updateUser(existing.id, {
        emailVerified: true,
        verifyTokenHash: null,
        verifyTokenExpiresAt: null,
      });
    }
    const fresh = (await store.findUserById(existing.id)) ?? existing;
    await startSession(res, fresh, req);
    recordAuthEvent('login.google', ctx(req, { email: fresh.email, userId: fresh.id, detail: 'linked existing account' }));
    return res.json({ user: publicUser(fresh) });
  }

  const user: StoredUser = {
    id: store.newId(),
    email: profile.email,
    name: profile.name,
    company: null,
    role: (await store.countUsers()) === 0 ? 'admin' : 'recruiter',
    provider: 'google',
    picture: profile.picture,
    // Google asserted email_verified, checked in verifyGoogleToken.
    emailVerified: true,
    createdAt: new Date().toISOString(),
    googleId: profile.googleId,
  };

  await store.createUser(user);
  await startSession(res, user, req);
  recordAuthEvent('login.google', ctx(req, { email: user.email, userId: user.id, detail: 'new account' }));
  res.status(201).json({ user: publicUser(user) });
}));

/**
 * Demo sign-in. One click, no address to confirm, straight into a shared
 * workspace that already has the starter roles.
 *
 * It is a real session on a real account — the same cookie, the same CSRF
 * pairing, the same rate limit as a password login — so nothing downstream
 * needs a special case for it. What it is not is a back door: the account it
 * opens is a recruiter with no password, holding only whatever visitors have
 * put there.
 */
app.post('/api/auth/demo', ipRateLimit('demo', LOGIN_IP_LIMIT), route(async (req, res) => {
  if (!DEMO_LOGIN_ENABLED) {
    return res.status(404).json({ error: 'Demo sign-in is not available on this deployment.' });
  }

  let user: StoredUser;
  try {
    user = await ensureDemoUser();
  } catch (err) {
    if (!(err instanceof DemoAddressTaken)) throw err;
    log.error('demo sign-in is configured against a real account', { requestId: req.id });
    return res.status(503).json({ error: 'Demo sign-in is misconfigured on this deployment.' });
  }

  await startSession(res, user, req);
  recordAuthEvent('login.demo', ctx(req, { email: user.email, userId: user.id }));
  res.json({ user: publicUser(user) });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(authed(req).user) });
});

app.post('/api/auth/logout', requireAuth, route(async (req, res) => {
  const { user, sessionId } = authed(req);
  await endSession(res, { userId: user.id, sessionId });
  recordAuthEvent('logout', ctx(req, { email: user.email, userId: user.id }));
  res.json({ ok: true });
}));

/** Sign out everywhere — the control you want after losing a laptop. */
app.post('/api/auth/logout-all', requireAuth, route(async (req, res) => {
  const user = authed(req).user;
  const revoked = await store.deleteSessionsForUser(user.id);
  await endSession(res);
  recordAuthEvent('logout.all', ctx(req, { email: user.email, userId: user.id, detail: `${revoked} revoked` }));
  res.json({ ok: true, revoked });
}));

/** Active sessions, so a user can see whether anyone else is signed in. */
app.get('/api/auth/sessions', requireAuth, route(async (req, res) => {
  const { user, sessionId } = authed(req);
  const list = await store.listSessionsForUser(user.id);
  res.json({
    sessions: list
      .filter((s) => !isSessionExpired(s))
      .map((s) => ({
        id: s.id,
        current: s.id === sessionId,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        userAgent: s.userAgent,
        // Never echo the token hash; it is a credential verifier.
        ip: s.ip,
      })),
  });
}));

/**
 * Revoke one session by id — "sign out that other device".
 *
 * The id comes from the client, which is exactly the shape an IDOR takes, so
 * the store call is scoped to the owner and a foreign id simply matches
 * nothing. The 404 is deliberate: confirming that a session id exists but
 * belongs to somebody else would itself be a small leak.
 */
app.delete('/api/auth/sessions/:id', requireAuth, route(async (req, res) => {
  const { user, sessionId } = authed(req);
  const removed = await store.deleteSession(user.id, v.id(req.params.id, 'sessionId'));
  if (!removed) return res.status(404).json({ error: 'Session not found.' });
  recordAuthEvent('session.revoked', ctx(req, { email: user.email, userId: user.id }));

  // Revoking the session you are holding is just a logout.
  if (req.params.id === sessionId) clearSessionCookies(res);
  res.json({ ok: true, wasCurrent: req.params.id === sessionId });
}));

/* ------------------------------------------------------ email verification */

app.post('/api/auth/verify-email', ipRateLimit('verify', VERIFY_LIMIT), route(async (req, res) => {
  const token = req.body?.token;
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'Missing verification token.' });
  }

  // Look up by digest — the raw token is never stored, so it cannot leak.
  const user = await store.findUserByVerifyHash(hashToken(token));
  const invalid = { error: 'That verification link is invalid or has already been used.' };
  if (!user || !user.verifyTokenExpiresAt) {
    recordAuthEvent('verify.failure', ctx(req, { detail: 'unknown token' }));
    return res.status(400).json(invalid);
  }

  if (isExpired(user.verifyTokenExpiresAt)) {
    return res.status(410).json({
      error: 'That verification link has expired. Sign in to request a new one.',
      code: 'VERIFICATION_EXPIRED',
    });
  }

  // Single use: clear the token as it is consumed.
  await store.updateUser(user.id, {
    emailVerified: true,
    verifyTokenHash: null,
    verifyTokenExpiresAt: null,
  });

  recordAuthEvent('verify.success', ctx(req, { email: user.email, userId: user.id }));
  res.json({ ok: true, message: 'Email confirmed. You can sign in now.' });
}));

/**
 * Resend takes the address rather than a session, because an unverified user
 * cannot sign in to ask. Response is identical regardless of whether the
 * address exists or is already confirmed.
 */
app.post('/api/auth/resend-verification', ipRateLimit('resend', RESET_LIMIT), route(async (req, res) => {
  const accepted = {
    ok: true,
    message: 'If that address needs confirming, a new link is on its way.',
  };

  const email = req.body?.email;
  if (typeof email !== 'string' || !validateEmail(email).ok) return res.json(accepted);

  const user = await store.findUserByEmail(normaliseEmail(email));
  if (user && !user.emailVerified) {
    const verification = issueToken('email_verification');
    await store.updateUser(user.id, {
      verifyTokenHash: verification.hash,
      verifyTokenExpiresAt: verification.expiresAt,
    });
    mailer.sendVerificationEmail(user.email, user.name, verification.raw);
  }

  res.json(accepted);
}));

/* -------------------------------------------------------- password reset */

app.post('/api/auth/forgot-password', ipRateLimit('forgot', RESET_LIMIT), route(async (req, res) => {
  // Always the same answer: revealing which addresses have accounts turns this
  // endpoint into a membership oracle.
  const accepted = {
    ok: true,
    message: 'If an account exists for that address, a reset link is on its way.',
  };

  const email = req.body?.email;
  if (typeof email !== 'string' || !validateEmail(email).ok) return res.json(accepted);

  const user = await store.findUserByEmail(normaliseEmail(email));
  if (user?.passwordHash) {
    const reset = issueToken('password_reset');
    await store.updateUser(user.id, {
      resetTokenHash: reset.hash,
      resetTokenExpiresAt: reset.expiresAt,
    });
    mailer.sendPasswordResetEmail(user.email, user.name, reset.raw);
    recordAuthEvent('reset.requested', ctx(req, { email: user.email, userId: user.id }));
  }

  res.json(accepted);
}));

app.post('/api/auth/reset-password', ipRateLimit('reset', RESET_LIMIT), route(async (req, res) => {
  const { token, password } = req.body ?? {};
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'Missing reset token.' });
  }

  const user = await store.findUserByResetHash(hashToken(token));
  const invalid = { error: 'That reset link is invalid or has already been used.' };
  if (!user || !user.resetTokenExpiresAt) {
    recordAuthEvent('reset.failure', ctx(req, { detail: 'unknown token' }));
    return res.status(400).json(invalid);
  }

  if (isExpired(user.resetTokenExpiresAt)) {
    return res.status(410).json({
      error: 'That reset link has expired. Request a new one.',
      code: 'RESET_EXPIRED',
    });
  }

  const strength = validatePassword(password, [user.name, user.email.split('@')[0]]);
  if (!strength.ok) return res.status(400).json({ error: strength.error });

  await store.updateUser(user.id, {
    passwordHash: await hashPassword(password),
    // Consume the token, clear any lockout, and confirm the address: holding
    // the emailed link already proves control of the inbox.
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    emailVerified: true,
    verifyTokenHash: null,
    verifyTokenExpiresAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    passwordChangedAt: new Date().toISOString(),
  });

  // Whoever forced the reset must not keep an old session alive.
  await store.deleteSessionsForUser(user.id);
  mailer.sendPasswordChangedEmail(user.email, user.name);
  recordAuthEvent('reset.completed', ctx(req, { email: user.email, userId: user.id }));

  res.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
}));

app.post('/api/auth/change-password', requireAuth,
  principalRateLimit('changepw', { max: 5, windowMs: 15 * 60_000, noun: 'password changes' }), route(async (req, res) => {
  const { user, sessionId } = authed(req);
  const { currentPassword, newPassword } = req.body ?? {};

  if (!user.passwordHash) {
    return res.status(409).json({
      error: user.provider === 'demo'
        ? 'The demo account has no password to change.'
        : 'This account signs in with Google and has no password to change.',
    });
  }
  if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: 'Your current password is incorrect.' });
  }

  const strength = validatePassword(newPassword, [user.name, user.email.split('@')[0]]);
  if (!strength.ok) return res.status(400).json({ error: strength.error });

  await store.updateUser(user.id, {
    passwordHash: await hashPassword(newPassword),
    passwordChangedAt: new Date().toISOString(),
  });

  // Keep this session, drop the rest: changing a password should evict anyone
  // else without logging the user out of the device they are holding.
  const revoked = await store.deleteSessionsForUser(user.id, sessionId);
  mailer.sendPasswordChangedEmail(user.email, user.name);
  recordAuthEvent('password.changed', ctx(req, { email: user.email, userId: user.id, detail: `${revoked} other session(s) revoked` }));

  res.json({ ok: true, revoked });
}));

/* ----------------------------------------------------------------- roles */

/**
 * The template catalogue. Read-only reference data, behind auth for the same
 * reason as the skill library: no signed-out page needs it, and publishing the
 * full set of role definitions serves nobody but a scraper.
 */
app.get('/api/role-templates', requireAuth, requireVerified, (_req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.json({ sectors: templatesBySector(), count: ROLE_TEMPLATES.length });
});

/**
 * Instantiate a template into the caller's workspace.
 *
 * The template id is validated against the fixed catalogue rather than trusted
 * — it becomes part of a stored record, and an unchecked value here would let a
 * client invent role content the catalogue never defined.
 */
app.post('/api/roles/from-template', requireAuth, requireVerified,
  principalRateLimit('template', { max: 40, windowMs: 60_000, noun: 'adding roles' }),
  route(async (req, res) => {
  const userId = authed(req).user.id;
  const templateId = v.id(req.body?.templateId, 'templateId');

  const template = findTemplate(templateId);
  if (!template) return res.status(404).json({ error: 'Unknown role template.' });

  // Never overwrite a role the user already has under this id — saveRole is an
  // upsert, so reusing the id would silently replace their edited copy along
  // with the weights they had tuned. Suffix instead.
  const existing = await store.listRoles(userId);
  const taken = new Set(existing.map((r) => r.id));
  let id = template.id;
  for (let n = 2; taken.has(id) && n < 100; n++) id = `${template.id}-${n}`;

  const role = await store.saveRole(userId, {
    id,
    title: taken.has(template.id) ? `${template.title} (copy)` : template.title,
    department: template.department,
    description: template.description,
    required: template.required,
    minYears: template.minYears,
    maxYears: template.maxYears,
    mustHave: template.mustHave,
  });

  log.info('role added from template', { userId, templateId, roleId: role.id, requestId: req.id });
  res.status(201).json({ role });
}));

app.get('/api/roles', requireAuth, requireVerified, route(async (req, res) => {
  res.json({ roles: await store.listRoles(authed(req).user.id) });
}));

app.post('/api/roles', requireAuth, requireVerified, route(async (req, res) => {
  const body = req.body ?? {};

  // Build the input explicitly rather than spreading the body. Spreading lets
  // any key the client invents ride along into storage; naming each field is
  // what keeps the record shape a decision rather than an accident.
  const input = {
    id: v.optionalId(body.id, 'id'),
    title: v.str(body.title, 'title', { min: 2, max: 120 }),
    department: v.str(body.department, 'department', { max: 80, optional: true }),
    description: v.text(body.description, 'description', 20_000),
    required: v.text(body.required, 'required', 4_000, false),
    minYears: v.int(body.minYears, 'minYears', { min: 0, max: 60, optional: true }) ?? 0,
    maxYears: v.int(body.maxYears, 'maxYears', { min: 0, max: 60, optional: true }),
    // Stored as the terms the user actually typed. hydrateRole resolves them
    // against the current taxonomy on read, so a later alias addition repairs
    // old roles rather than stranding their flags.
    mustHave: v.stringArray(body.mustHave, 'mustHave', 60, 60).filter(Boolean),
  };

  if (!input.required.trim()) {
    return res.status(400).json({ error: 'At least one required skill is needed.' });
  }
  if (input.maxYears !== null && input.maxYears < input.minYears) {
    return res.status(400).json({ error: 'Maximum years cannot be below the minimum.' });
  }

  const role = await store.saveRole(authed(req).user.id, input);
  res.json({ role });
}));

app.delete('/api/roles/:id', requireAuth, requireVerified, route(async (req, res) => {
  const { deleted, removedCandidates } = await store.deleteRole(authed(req).user.id, v.id(req.params.id, 'roleId'));

  // Delete the resumes too. Leaving them would keep candidate PII on disk after
  // the owner believes it is gone, and grow storage without bound.
  for (const candidate of removedCandidates) {
    if (candidate.file?.storedName) {
      await fs.unlink(path.join(UPLOAD_DIR, candidate.file.storedName)).catch(() => {});
    }
  }
  if (removedCandidates.length) {
    log.info('role deleted with candidates', {
      roleId: req.params.id, candidates: removedCandidates.length, requestId: req.id,
    });
  }

  res.status(deleted ? 200 : 404).json({ ok: deleted, removedCandidates: removedCandidates.length });
}));

/* ------------------------------------------------------------ candidates */

/** Strip the bulky raw text from list payloads. */
function slim(candidate: Candidate): CandidateSummary {
  const { text, ...rest } = candidate;
  return { ...rest, textLength: text?.length ?? 0 };
}

/**
 * Analyse one already-extracted resume against a role. Shared by upload and
 * re-score so the two paths cannot drift apart.
 */
async function buildCandidate(opts: {
  id: string;
  userId: string;
  role: Role;
  text: string;
  extraction: Extraction;
  file: StoredFile | null;
  corpus: string[];
  createdAt?: string;
  status?: Candidate['status'];
}): Promise<Candidate> {
  const { id, userId, role, text, extraction, file, corpus } = opts;
  const fallbackName = file?.originalName.replace(/\.[^.]+$/, '') ?? 'Unknown Candidate';
  const parsed = parseResume(text, fallbackName);

  // Merge LLM extraction over the deterministic parse when available. Local
  // values stay as the floor so a partial LLM answer cannot erase them.
  let usedLlm = false;
  let llmSkills: string[] = [];

  if (gemini.geminiEnabled() && text.length > 80) {
    const llm = await gemini.extractStructured(text);
    if (llm) {
      usedLlm = true;
      llmSkills = llm.skills ?? [];
      if (llm.name && llm.name.length > 2) parsed.name = llm.name;
      if (typeof llm.experienceYears === 'number' && llm.experienceYears > 0) {
        parsed.experienceYears = llm.experienceYears;
      }
      if (llm.email) parsed.contact.email = llm.email;
      if (llm.phone) parsed.contact.phone = llm.phone;
      if (llm.roles?.length) {
        parsed.roles = llm.roles.map((r) => ({
          title: r.title,
          company: r.company ?? null,
          start: r.start ?? null,
          end: r.end ?? null,
          current: /present|current/i.test(r.end ?? ''),
        }));
      }
      if (llm.achievements?.length) parsed.achievements = llm.achievements;
      parsed.title = llm.title ?? null;
      parsed.location = llm.location ?? null;
      parsed.summary = llm.summary ?? null;
    }
  }

  // Skills the LLM found that the taxonomy scan missed get folded into the
  // text used for detection, so both paths feed one canonical skill list.
  const augmentedText = llmSkills.length ? `${text}\n\nSKILLS: ${llmSkills.join(', ')}` : text;

  /*
   * Semantic ranking. The resume and the job description are embedded and
   * compared in vector space, which catches the match that shared vocabulary
   * misses - "led a squad of six" against "team leadership". Awaited here, at
   * the one boundary that is already async and already shared by upload and
   * re-score, so `analyze()` stays synchronous and deterministic.
   *
   * Null is the normal answer, not an error: no API key, or a call that
   * failed. `analyze()` falls back to the local TF-IDF cosine, which is why
   * this whole path stays optional.
   */
  const semanticCosine = await gemini.semanticSimilarity(
    augmentedText,
    jobDescriptionText(role),
  );

  const analysis = analyze({ text: augmentedText, parsed, role, corpus, semanticCosine });

  const recommendation = gemini.geminiEnabled()
    ? await gemini.recommend({ role, parsed, analysis })
    : null;

  return {
    id,
    userId,
    roleId: role.id,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    status: opts.status ?? 'new',
    file,
    text,
    extraction,
    parsed,
    analysis,
    recommendation,
    engine: gemini.geminiEnabled() ? (usedLlm ? 'gemini' : 'local-fallback') : 'local',
  };
}

/**
 * Analysis budget, charged per resume rather than per request. A request-based
 * limit is meaningless here: one call with sixty files is sixty extractions and
 * up to a hundred and twenty model calls.
 */
const analysisRateLimit = principalRateLimit('analyze', {
  max: 200,
  windowMs: 60 * 60_000,
  blockMs: 10 * 60_000,
  noun: 'resume analysis',
  cost: (req) => ((req.files as Express.Multer.File[] | undefined)?.length ?? 1),
  onRefusal: (req, result) => log.security('abuse.analysis_budget_exhausted', {
    principal: principal(req), ip: req.ip, requestedCost: result.cost, requestId: req.id,
  }),
});

app.post('/api/analyze', requireAuth, requireVerified, upload.array('resumes', 60),
  analysisRateLimit,
  route(async (req, res) => {
  const userId = authed(req).user.id;
  const roleId = v.id(req.body.roleId, 'roleId');
  const role = await store.findRole(userId, roleId);
  if (!role) return res.status(400).json({ error: `Unknown role "${roleId}".` });

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) return res.status(400).json({ error: 'No files were uploaded.' });

  // Per-file size is capped by multer, but sixty files at the limit is still
  // 720 MB of disk and parsing work from one request.
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const MAX_BATCH_BYTES = MAX_FILE_MB * 1024 * 1024 * 8;
  if (totalBytes > MAX_BATCH_BYTES) {
    for (const file of files) await fs.unlink(file.path).catch(() => {});
    return res.status(413).json({
      error: `Batch is ${Math.round(totalBytes / 1024 / 1024)} MB; the limit is ${Math.round(MAX_BATCH_BYTES / 1024 / 1024)} MB per upload.`,
    });
  }

  // Quota is checked before any work starts, and all-or-nothing: a partially
  // analysed batch leaves the user guessing which resumes were processed.
  const verdict = quota.checkAnalysisQuota(userId, files.length);
  if (!verdict.allowed) {
    // Uploaded bytes are already on disk; drop them rather than accumulating
    // files for work that will never happen.
    for (const file of files) await fs.unlink(file.path).catch(() => {});

    log.security('abuse.quota_refused', {
      userId, batchSize: files.length, reason: verdict.reason, requestId: req.id,
    });
    if (verdict.retryAfter) res.setHeader('Retry-After', String(verdict.retryAfter));
    return res.status(429).json({
      error: verdict.reason,
      remainingToday: verdict.remainingToday,
      remainingThisHour: verdict.remainingThisHour,
      retryAfter: verdict.retryAfter,
    });
  }

  quota.beginAnalysis(userId);
  try {
  const corpus = await store.corpusFor(userId, role.id);
  const candidates: CandidateSummary[] = [];
  const failures: AnalyzeFailure[] = [];

  for (const file of files) {
    try {
      // The extension is a claim by the uploader; the leading bytes are a fact
      // about the file. Checking them is what stops a script named .pdf from
      // reaching the PDF parser, or HTML named .png from reaching OCR.
      const handle = await fs.open(file.path, 'r');
      const head = Buffer.alloc(16);
      await handle.read(head, 0, 16, 0).finally(() => handle.close());

      const ext = path.extname(file.originalname).toLowerCase();
      const signature = v.checkFileSignature(ext, head);
      if (!signature.ok) {
        log.security('upload.signature_mismatch', {
          userId, file: file.originalname, ext, reason: signature.reason, requestId: req.id,
        });
        failures.push({ name: file.originalname, reason: signature.reason ?? 'Unrecognised file contents.' });
        await fs.unlink(file.path).catch(() => {});
        continue;
      }

      let extraction = await extractText(file.path, file.originalname);
      let text = extraction.text;

      // No text layer: hand the raw bytes to Gemini vision if we can.
      if (extraction.needsOcr && gemini.geminiEnabled()) {
        const bytes = await fs.readFile(file.path);
        const visionText = await gemini.extractFromFile(bytes.toString('base64'), file.mimetype);
        if (visionText) {
          text = visionText;
          extraction = { ...extraction, needsOcr: false, warning: null, kind: `${extraction.kind}+vision` };
        }
      }

      if (!text || text.trim().length < 40) {
        failures.push({
          name: file.originalname,
          reason: extraction.warning ?? 'No readable text could be extracted from this file.',
        });
        await fs.unlink(file.path).catch(() => {});
        continue;
      }

      const candidate = await buildCandidate({
        id: store.newId(),
        userId,
        role,
        text,
        extraction,
        file: {
          originalName: file.originalname,
          storedName: file.filename,
          mimeType: file.mimetype,
          size: file.size,
        },
        corpus,
      });

      await store.addCandidate(candidate);
      corpus.push(text);
      candidates.push(slim(candidate));
    } catch (err) {
      console.error(`[analyze] ${file.originalname}:`, err);
      failures.push({ name: file.originalname, reason: (err as Error).message });
      await fs.unlink(file.path).catch(() => {});
    }
  }

  // Charge only for resumes actually analysed: a file rejected during
  // extraction cost no model calls and should not consume budget.
  quota.recordAnalysed(userId, candidates.length);

  const remaining = quota.quotaStatus(userId);
  res.json({
    analyzed: candidates.length,
    failed: failures.length,
    candidates,
    failures,
    quota: {
      usedToday: remaining.usedToday,
      dailyLimit: remaining.dailyLimit,
      remainingToday: Math.max(0, remaining.dailyLimit - remaining.usedToday),
    },
  });
  } finally {
    // Must run even on an exception, or a crashed batch permanently consumes
    // one of the account's concurrency slots.
    quota.finishAnalysis(userId);
  }
}));

app.get('/api/candidates', requireAuth, requireVerified,
  principalRateLimit('list', { max: 120, windowMs: 60_000, noun: 'candidate listing' }), route(async (req, res) => {
  const roleId = v.optionalId(req.query.roleId, 'roleId');
  const list = await store.listCandidates(authed(req).user.id, roleId);
  res.json({ candidates: list.map(slim) });
}));

app.get('/api/candidates/:id', requireAuth, requireVerified, route(async (req, res) => {
  const candidate = await store.findCandidate(authed(req).user.id, v.id(req.params.id, 'id'));
  if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });
  res.json({ candidate });
}));

app.patch('/api/candidates/:id', requireAuth, requireVerified, route(async (req, res) => {
  const patch: Partial<Candidate> = {};

  // The previous version cast an arbitrary string to the status type, so any
  // value at all — including markup — landed in the data model.
  if (req.body?.status !== undefined) {
    patch.status = v.oneOf(req.body.status, 'status', CANDIDATE_STATUSES);
  }
  if (req.body?.note !== undefined) {
    patch.note = v.text(req.body.note, 'note', 5_000);
  }
  if (!Object.keys(patch).length) {
    return res.status(400).json({ error: 'Nothing to update. Provide a status or a note.' });
  }

  const updated = await store.updateCandidate(authed(req).user.id, v.id(req.params.id, 'id'), patch);
  if (!updated) return res.status(404).json({ error: 'Candidate not found.' });
  res.json({ candidate: slim(updated) });
}));

app.delete('/api/candidates/:id', requireAuth, requireVerified, route(async (req, res) => {
  const userId = authed(req).user.id;
  const candidate = await store.findCandidate(userId, req.params.id);
  if (candidate?.file?.storedName) {
    await fs.unlink(path.join(UPLOAD_DIR, candidate.file.storedName)).catch(() => {});
  }
  const ok = await store.deleteCandidate(userId, req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
}));

app.post('/api/candidates/clear', requireAuth, requireVerified, route(async (req, res) => {
  const roleId = v.optionalId(req.body?.roleId, 'roleId');
  const removed = await store.clearCandidates(authed(req).user.id, roleId);

  // Delete the stored files too, or the uploads directory grows forever.
  for (const candidate of removed) {
    if (candidate.file?.storedName) {
      await fs.unlink(path.join(UPLOAD_DIR, candidate.file.storedName)).catch(() => {});
    }
  }
  res.json({ ok: true, removed: removed.length });
}));

/** Serve the original file back for the document preview pane. */
app.get('/api/candidates/:id/file', requireAuth, requireVerified,
  principalRateLimit('file', { max: 100, windowMs: 60_000, noun: 'document downloads' }), route(async (req, res) => {
  const candidate = await store.findCandidate(authed(req).user.id, req.params.id);
  if (!candidate?.file?.storedName) return res.status(404).json({ error: 'No file on record.' });

  // `storedName` is server-generated (uuid + extension) and never user input,
  // so this cannot traverse today. The check is here so it still cannot if a
  // future import path, migration or tampered datastore ever puts a relative
  // segment in that field — the ownership check above would pass, and this is
  // the only thing standing between that and serving an arbitrary file.
  const filePath = path.resolve(UPLOAD_DIR, candidate.file.storedName);
  if (filePath !== path.normalize(filePath) || !filePath.startsWith(UPLOAD_DIR + path.sep)) {
    console.error(`[security] blocked path escape for candidate ${candidate.id}: ${candidate.file.storedName}`);
    return res.status(400).json({ error: 'Stored file path is not valid.' });
  }

  try {
    await fs.access(filePath);
  } catch {
    return res.status(404).json({ error: 'The stored file is no longer available.' });
  }

  res.setHeader('Content-Type', candidate.file.mimeType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(candidate.file.originalName)}"`,
  );
  res.sendFile(filePath);
}));

/**
 * Re-score every candidate on a role. Needed after requirements change, since
 * ranking is relative to the requirement set.
 */
app.post('/api/roles/:id/rescore', requireAuth, requireVerified,
  principalRateLimit('rescore', {
    max: 6, windowMs: 60 * 60_000, blockMs: 15 * 60_000, noun: 're-scoring',
  }),
  route(async (req, res) => {
  const userId = authed(req).user.id;
  const role = await store.findRole(userId, req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found.' });

  const candidates = await store.listCandidates(userId, role.id);

  // Re-scoring re-runs the model over every candidate on the role, so it draws
  // on the same budget an upload of that size would.
  const rescoreQuota = quota.checkAnalysisQuota(userId, candidates.length);
  if (!rescoreQuota.allowed) {
    if (rescoreQuota.retryAfter) res.setHeader('Retry-After', String(rescoreQuota.retryAfter));
    return res.status(429).json({ error: rescoreQuota.reason, retryAfter: rescoreQuota.retryAfter });
  }
  quota.beginAnalysis(userId);
  try {
  let updated = 0;

  for (const existing of candidates) {
    if (!existing.text) continue;
    const rebuilt = await buildCandidate({
      id: existing.id,
      userId,
      role,
      text: existing.text,
      extraction: existing.extraction,
      file: existing.file,
      corpus: candidates.filter((c) => c.id !== existing.id).map((c) => c.text),
      createdAt: existing.createdAt,
      status: existing.status,
    });
    await store.updateCandidate(userId, existing.id, {
      parsed: rebuilt.parsed,
      analysis: rebuilt.analysis,
      recommendation: rebuilt.recommendation,
      engine: rebuilt.engine,
    });
    updated += 1;
  }

  quota.recordAnalysed(userId, updated);
  res.json({ ok: true, updated });
  } finally {
    quota.finishAnalysis(userId);
  }
}));

/** Head-to-head comparison across a candidate set. */
app.post('/api/compare', requireAuth, requireVerified,
  principalRateLimit('compare', { max: 60, windowMs: 60_000, noun: 'comparison' }), route(async (req, res) => {
  const userId = authed(req).user.id;
  const roleId = v.id(req.body?.roleId, 'roleId');
  const role = await store.findRole(userId, roleId);
  if (!role) return res.status(400).json({ error: 'Unknown role.' });

  const all = await store.listCandidates(userId, roleId);
  const ids = v.idArray(req.body?.candidateIds, 'candidateIds', 200);
  const selected = ids.length ? all.filter((c) => ids.includes(c.id)) : all;
  if (!selected.length) return res.json({ role, candidates: [], matrix: [], scarcity: [], overlap: [] });

  const matrix: MatrixRow[] = role.requiredSkills.map((skill) => ({
    skill,
    weight: role.weights[skill.id] ?? 1,
    cells: selected.map((c) => {
      const hit = c.analysis.skills.matched.find((m) => m.id === skill.id);
      return { candidateId: c.id, has: Boolean(hit), mentions: hit?.mentions ?? 0 };
    }),
  }));

  const scarcity = matrix
    .map((row) => {
      const have = row.cells.filter((c) => c.has).length;
      return { skill: row.skill, weight: row.weight, have, total: selected.length, rate: have / selected.length };
    })
    .sort((a, b) => a.rate - b.rate);

  const overlap = selected.map((a) => ({
    candidateId: a.id,
    scores: selected.map((b) => ({
      candidateId: b.id,
      value: a.id === b.id ? 1 : Math.round(cosineSimilarity(a.text, b.text) * 1000) / 1000,
    })),
  }));

  res.json({ role, candidates: selected.map(slim), matrix, scarcity, overlap });
}));

/* ---------------------------------------------------------------- errors */

app.use((err: NodeJS.ErrnoException, req: Request, res: Response, _next: NextFunction) => {
  // A rejected input is the client's mistake, not a server fault: answer 400
  // with the offending field rather than a 500 with a stack trace.
  if (v.isValidationError(err)) {
    return res.status(400).json({ error: err.message, field: err.field });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File exceeds the ${MAX_FILE_MB} MB limit.` });
  }
  if (err?.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({ error: 'Too many files in one batch (max 60).' });
  }

  log.error('unhandled route error', {
    requestId: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: (req as Partial<AuthedRequest>).user?.id ?? null,
    message: err?.message,
    stack: err?.stack,
  });

  // The stack and driver messages stay in the log. Echoing them to the client
  // hands an attacker file paths, dependency versions and query shapes; the
  // request id is what lets support tie a report back to the real error.
  res.status(500).json({
    error: 'Unexpected server error.',
    requestId: req.id,
  });
});

// Anything that escapes to the process is worth a loud, structured line before
// the crash, or the restart looks spontaneous in the logs.
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', { reason: reason instanceof Error ? reason.stack : String(reason) });
});
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', { message: err.message, stack: err.stack });
  process.exit(1);
});

/**
 * Remove upload files no candidate references any more. Cleanup at the call
 * site is the primary mechanism; this catches whatever a crash, a past bug or
 * an interrupted batch left behind, so disk use stays bounded.
 */
async function sweepOrphanedUploads(): Promise<number> {
  try {
    const referenced = await store.referencedFiles();
    const entries = await fs.readdir(UPLOAD_DIR);
    let removed = 0;

    for (const name of entries) {
      if (name === '.gitkeep' || referenced.has(name)) continue;

      // Grace period: a file being written by an in-flight upload is not an
      // orphan yet, and deleting it would break a request in progress.
      const filePath = path.join(UPLOAD_DIR, name);
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat || Date.now() - stat.mtimeMs < 15 * 60 * 1000) continue;

      await fs.unlink(filePath).catch(() => {});
      removed += 1;
    }

    if (removed) log.warn('swept orphaned uploads', { removed });
    return removed;
  } catch (err) {
    log.warn('orphan sweep failed', { error: (err as Error).message });
    return 0;
  }
}

void sweepOrphanedUploads();
const orphanSweeper = setInterval(() => void sweepOrphanedUploads(), 6 * 60 * 60 * 1000);
orphanSweeper.unref();

// Expired sessions linger in the store until something removes them; sweep
// hourly so the file does not accumulate dead credentials indefinitely.
const sessionSweeper = setInterval(() => {
  void store.pruneSessions(isSessionExpired).then((n) => {
    if (n) console.log(`[sessions] pruned ${n} expired session(s)`);
  });
}, 60 * 60 * 1000);
sessionSweeper.unref();

app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

const server = app.listen(PORT, BIND_HOST, () => {
  const g = gemini.geminiStatus();
  log.info('Resume Scanner API listening', {
    ...describeConfig(),
    aiEngine: g.enabled ? `${g.extractModel} / ${g.reasonModel}` : 'local deterministic',
    uploads: `${SUPPORTED_EXTENSIONS.join(' ')} · max ${MAX_FILE_MB} MB`,
  });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info('shutting down', { signal });
    void shutdownOcr().finally(() =>
      server.close(() => {
        closeLogger();
        process.exit(0);
      }),
    );
  });
}
