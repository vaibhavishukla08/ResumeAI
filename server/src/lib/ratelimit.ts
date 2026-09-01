/**
 * Rate limiting for authentication endpoints.
 *
 * Two independent layers, because they stop different attacks:
 *
 *   - **Per-IP** caps how fast one source can try anything. Stops a single
 *     host brute-forcing many accounts.
 *   - **Per-account** caps failures against one identity regardless of source.
 *     Stops a distributed attack that rotates IPs against one inbox.
 *
 * Storage is in-process, which is correct for a single-node deployment and is
 * what this app is. Behind more than one instance the counters no longer add
 * up — move `hits` to Redis at that point. The interface here is deliberately
 * narrow so that swap is contained.
 */

import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  /** Epoch ms when this window resets. */
  resetAt: number;
  /** Epoch ms until which the key is locked out, if it tripped the limit. */
  blockedUntil?: number;
}

const buckets = new Map<string, Bucket>();

// Without eviction this map is an unbounded memory sink under attack — which
// would turn a rate limiter into a denial-of-service vector.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt && (!bucket.blockedUntil || now > bucket.blockedUntil)) {
      buckets.delete(key);
    }
  }
}, SWEEP_INTERVAL_MS);
// Do not hold the event loop open for a housekeeping timer.
sweeper.unref?.();

export interface LimitOptions {
  /** Budget per window, in units. Most requests cost 1. */
  max: number;
  windowMs: number;
  /** How long to lock out after the limit trips. Defaults to `windowMs`. */
  blockMs?: number;
}

export interface LimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry. */
  retryAfter: number;
  remaining: number;
  /** Budget the caller asked for, echoed so handlers can explain a refusal. */
  cost: number;
}

/**
 * Spend `cost` units against a bucket.
 *
 * Weighting matters because requests are not equally expensive. A 60-file
 * upload costs 60 units, not 1 — otherwise a caller stays under a
 * "10 requests per minute" limit while making the server do 600 resumes of
 * work and 1,200 model calls.
 */
export function consume(key: string, opts: LimitOptions, cost = 1): LimitResult {
  const now = Date.now();
  const blockMs = opts.blockMs ?? opts.windowMs;
  const bucket = buckets.get(key);

  if (bucket?.blockedUntil && now < bucket.blockedUntil) {
    return {
      allowed: false,
      retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000),
      remaining: 0,
      cost,
    };
  }

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: cost, resetAt: now + opts.windowMs });
    return { allowed: true, retryAfter: 0, remaining: Math.max(0, opts.max - cost), cost };
  }

  // Refuse without charging. Charging a rejected request would let a caller
  // hold their own bucket open indefinitely by retrying.
  if (bucket.count + cost > opts.max) {
    bucket.blockedUntil = now + blockMs;
    return { allowed: false, retryAfter: Math.ceil(blockMs / 1000), remaining: 0, cost };
  }

  bucket.count += cost;
  return { allowed: true, retryAfter: 0, remaining: opts.max - bucket.count, cost };
}

/** Read a bucket without spending from it. */
export function peek(key: string, opts: LimitOptions): { used: number; remaining: number; resetAt: number } {
  const bucket = buckets.get(key);
  const now = Date.now();
  if (!bucket || now > bucket.resetAt) {
    return { used: 0, remaining: opts.max, resetAt: now + opts.windowMs };
  }
  return {
    used: bucket.count,
    remaining: Math.max(0, opts.max - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/** Forget a key — called after a success so honest users are not punished. */
export function reset(key: string): void {
  buckets.delete(key);
}

/**
 * Client IP. `req.ip` honours the trust-proxy setting; without it Express
 * reports the proxy's address and every user shares one bucket.
 */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** Express middleware form, keyed by IP and a route label. */
export function ipRateLimit(label: string, opts: LimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = consume(`ip:${label}:${clientIp(req)}`, opts);
    if (result.allowed) {
      next();
      return;
    }
    res.setHeader('Retry-After', String(result.retryAfter));
    res.status(429).json({
      error: `Too many attempts. Try again in ${describe(result.retryAfter)}.`,
    });
  };
}

/**
 * The identity a limit is charged against.
 *
 * An authenticated user is the better key: it survives IP changes, and it does
 * not punish everyone behind one office NAT for a single colleague's runaway
 * script. Anonymous traffic falls back to the address, which is all there is.
 */
export function principal(req: Request): string {
  const userId = (req as { user?: { id?: string } }).user?.id;
  return userId ? `user:${userId}` : `ip:${clientIp(req)}`;
}

export interface PrincipalLimitOptions extends LimitOptions {
  /** Units this request should spend. Defaults to 1. */
  cost?: (req: Request) => number;
  /** Human-readable noun for the refusal message. */
  noun?: string;
  /** Called when a request is refused, for audit. */
  onRefusal?: (req: Request, result: LimitResult) => void;
}

/** Middleware keyed on the principal rather than the raw address. */
export function principalRateLimit(label: string, opts: PrincipalLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const cost = opts.cost ? Math.max(1, opts.cost(req)) : 1;
    const key = `${label}:${principal(req)}`;
    const result = consume(key, opts, cost);

    // Always advertise the budget: a well-behaved client can back off on its
    // own, and there is no reason to make good citizens guess.
    const state = peek(key, opts);
    res.setHeader('RateLimit-Limit', String(opts.max));
    res.setHeader('RateLimit-Remaining', String(state.remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((state.resetAt - Date.now()) / 1000)));

    if (result.allowed) {
      next();
      return;
    }

    opts.onRefusal?.(req, result);
    res.setHeader('Retry-After', String(result.retryAfter));
    res.status(429).json({
      error: `Rate limit reached for ${opts.noun ?? 'this endpoint'}. Try again in ${describe(result.retryAfter)}.`,
      retryAfter: result.retryAfter,
    });
  };
}

export function describe(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const mins = Math.ceil(seconds / 60);
  return mins === 1 ? 'a minute' : `${mins} minutes`;
}

/** Test seam: drop all state. */
export function __clearAll(): void {
  buckets.clear();
}
