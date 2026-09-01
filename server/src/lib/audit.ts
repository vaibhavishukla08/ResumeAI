/**
 * Security audit trail and anomaly detection.
 *
 * Two jobs:
 *
 *  1. **Record** every authentication-relevant event in a consistent shape, so
 *     "what happened to this account" is one grep rather than an archaeology
 *     project.
 *  2. **Notice** patterns that a single event cannot show. One failed login is
 *     noise. Forty failed logins against forty different accounts from one
 *     address is credential stuffing, and only something holding state across
 *     requests can see the difference.
 *
 * Addresses are recorded as a masked form plus a stable fingerprint: enough to
 * correlate attempts against one account, not enough to turn a leaked log into
 * a mailing list.
 *
 * Detection state is in-process, matching the rate limiter. On more than one
 * node each instance sees only its own slice — ship these events to a central
 * collector at that point and correlate there.
 */

import { emailFingerprint, log, maskEmail } from './logger.js';

export type AuthEvent =
  | 'login.success' | 'login.failure' | 'login.locked' | 'login.unverified'
  | 'login.google' | 'register.new' | 'register.duplicate'
  | 'verify.success' | 'verify.failure'
  | 'reset.requested' | 'reset.completed' | 'reset.failure'
  | 'password.changed'
  | 'logout' | 'logout.all' | 'session.revoked'
  | 'session.rejected' | 'csrf.rejected' | 'ratelimit.tripped';

export interface AuthContext {
  ip: string;
  userAgent?: string | null;
  email?: string | null;
  userId?: string | null;
  requestId?: string;
  detail?: string;
}

/** Events that indicate a failed or refused attempt, for burst detection. */
const FAILURE_EVENTS = new Set<AuthEvent>([
  'login.failure', 'login.locked', 'login.unverified',
  'verify.failure', 'reset.failure', 'session.rejected',
  'csrf.rejected', 'ratelimit.tripped',
]);

export function recordAuthEvent(event: AuthEvent, ctx: AuthContext): void {
  const entry = {
    event,
    ip: ctx.ip,
    ua: ctx.userAgent?.slice(0, 120) ?? null,
    account: maskEmail(ctx.email),
    accountId: emailFingerprint(ctx.email),
    userId: ctx.userId ?? null,
    requestId: ctx.requestId ?? null,
    detail: ctx.detail ?? null,
  };

  log.security(`auth.${event}`, entry);

  if (FAILURE_EVENTS.has(event)) noteFailure(event, ctx);
  if (event === 'login.success') noteSuccess(ctx);
}

/* ------------------------------------------------------ anomaly detection */

interface IpProfile {
  failures: number[];               // timestamps
  accountsTried: Set<string>;       // fingerprints
  windowStart: number;
  alertedStuffing: number;          // last alert time, for cooldown
  alertedBurst: number;
}

interface AccountProfile {
  sourceIps: Set<string>;
  failures: number[];
  alertedSpray: number;
}

const WINDOW_MS = 10 * 60 * 1000;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

/** One IP failing against this many distinct accounts looks like stuffing. */
const STUFFING_ACCOUNT_THRESHOLD = 5;
/** Raw failure volume from one IP inside the window. */
const BURST_FAILURE_THRESHOLD = 20;
/** One account attacked from this many addresses looks distributed. */
const SPRAY_IP_THRESHOLD = 5;

const ipProfiles = new Map<string, IpProfile>();
const accountProfiles = new Map<string, AccountProfile>();

/** Known good pairings, so a sign-in from a brand-new address is visible. */
const seenAccountIps = new Map<string, Set<string>>();

function prune(times: number[], now: number): number[] {
  return times.filter((t) => now - t < WINDOW_MS);
}

function noteFailure(event: AuthEvent, ctx: AuthContext): void {
  const now = Date.now();
  const fingerprint = emailFingerprint(ctx.email);

  const ip = ipProfiles.get(ctx.ip) ?? {
    failures: [], accountsTried: new Set<string>(), windowStart: now,
    alertedStuffing: 0, alertedBurst: 0,
  };
  ip.failures = prune(ip.failures, now);
  ip.failures.push(now);
  if (ctx.email) ip.accountsTried.add(fingerprint);
  // Reset the account set once the window has fully rolled over, or it grows
  // forever and every long-lived IP eventually looks like an attacker.
  if (now - ip.windowStart > WINDOW_MS) {
    ip.accountsTried = ctx.email ? new Set([fingerprint]) : new Set();
    ip.windowStart = now;
  }
  ipProfiles.set(ctx.ip, ip);

  if (
    ip.accountsTried.size >= STUFFING_ACCOUNT_THRESHOLD &&
    now - ip.alertedStuffing > ALERT_COOLDOWN_MS
  ) {
    ip.alertedStuffing = now;
    log.security('anomaly.credential_stuffing', {
      ip: ctx.ip,
      distinctAccounts: ip.accountsTried.size,
      failures: ip.failures.length,
      windowMinutes: WINDOW_MS / 60000,
      detail: 'One source failing against many distinct accounts.',
    });
  }

  if (ip.failures.length >= BURST_FAILURE_THRESHOLD && now - ip.alertedBurst > ALERT_COOLDOWN_MS) {
    ip.alertedBurst = now;
    log.security('anomaly.failure_burst', {
      ip: ctx.ip,
      failures: ip.failures.length,
      lastEvent: event,
      windowMinutes: WINDOW_MS / 60000,
    });
  }

  if (ctx.email) {
    const acct = accountProfiles.get(fingerprint) ?? {
      sourceIps: new Set<string>(), failures: [], alertedSpray: 0,
    };
    acct.failures = prune(acct.failures, now);
    acct.failures.push(now);
    acct.sourceIps.add(ctx.ip);
    accountProfiles.set(fingerprint, acct);

    if (acct.sourceIps.size >= SPRAY_IP_THRESHOLD && now - acct.alertedSpray > ALERT_COOLDOWN_MS) {
      acct.alertedSpray = now;
      log.security('anomaly.distributed_attack', {
        account: maskEmail(ctx.email),
        accountId: fingerprint,
        distinctSourceIps: acct.sourceIps.size,
        failures: acct.failures.length,
        detail: 'One account attacked from many addresses — per-IP limits will not stop this.',
      });
    }
  }
}

function noteSuccess(ctx: AuthContext): void {
  if (!ctx.email) return;
  const fingerprint = emailFingerprint(ctx.email);

  const known = seenAccountIps.get(fingerprint);
  if (!known) {
    seenAccountIps.set(fingerprint, new Set([ctx.ip]));
    return;
  }
  if (!known.has(ctx.ip)) {
    known.add(ctx.ip);
    // Not proof of anything — people travel — but it is the signal that makes
    // an account takeover visible after the fact.
    log.security('anomaly.new_source_for_account', {
      account: maskEmail(ctx.email),
      accountId: fingerprint,
      ip: ctx.ip,
      knownSources: known.size,
      userId: ctx.userId ?? null,
    });
  }
  // A success clears the failure history: the legitimate owner got in.
  accountProfiles.delete(fingerprint);
}

/* ------------------------------------------------------------ housekeeping */

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, profile] of ipProfiles) {
    profile.failures = prune(profile.failures, now);
    if (!profile.failures.length && now - profile.windowStart > WINDOW_MS) ipProfiles.delete(key);
  }
  for (const [key, profile] of accountProfiles) {
    profile.failures = prune(profile.failures, now);
    if (!profile.failures.length) accountProfiles.delete(key);
  }
  // Cap the known-IP map so it cannot grow without bound on a busy deployment.
  if (seenAccountIps.size > 10_000) seenAccountIps.clear();
}, 5 * 60 * 1000);
sweeper.unref?.();

/** Current detector state, for the operational health endpoint. */
export function auditSnapshot(): Record<string, number> {
  return {
    trackedIps: ipProfiles.size,
    trackedAccounts: accountProfiles.size,
    knownAccountSourcePairs: seenAccountIps.size,
  };
}

export function __resetAudit(): void {
  ipProfiles.clear();
  accountProfiles.clear();
  seenAccountIps.clear();
}
