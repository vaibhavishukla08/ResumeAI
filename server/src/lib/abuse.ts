/**
 * Bot and scraping detection.
 *
 * The governing constraint is false positives. This is a B2B tool: people
 * script against it legitimately, run it behind corporate proxies, and use
 * `curl` to debug. A rule that blocks every non-browser User-Agent would break
 * honest integrations while stopping no serious attacker, who will simply send
 * a Chrome string.
 *
 * So nothing here blocks on one signal. Requests are *scored*; a single oddity
 * is logged and allowed, and only a combination of independent signals — a
 * scripted client, at machine cadence, enumerating identifiers — is refused.
 * Everything is recorded either way, because the log is what lets you tell an
 * integration apart from an attack after the fact.
 */

import type { NextFunction, Request, Response } from 'express';
import { log } from './logger.js';
import { clientIp, principal } from './ratelimit.js';
import { recordAuthEvent } from './audit.js';

/* ------------------------------------------------------------- signatures */

/** Clients that announce themselves. Honest tooling, not disguised attackers. */
const DECLARED_AUTOMATION =
  /\b(curl|wget|python-requests|httpie|go-http-client|java|okhttp|axios|node-fetch|postman|insomnia|scrapy|libwww|httpclient)\b/i;

/** Headless and crawler markers. */
const HEADLESS_MARKERS = /\b(headlesschrome|phantomjs|puppeteer|playwright|selenium|electron\/)\b/i;

const CRAWLERS =
  /\b(googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|gptbot|ccbot|claudebot)\b/i;

export interface BotSignals {
  score: number;
  reasons: string[];
  declaredAutomation: boolean;
  crawler: boolean;
}

/**
 * Score a request's shape. Browsers send a fairly consistent set of headers;
 * hand-rolled clients usually send far fewer. None of this is proof — it is a
 * prior, weighted accordingly.
 */
export function scoreRequest(req: Request): BotSignals {
  const ua = String(req.headers['user-agent'] ?? '');
  const reasons: string[] = [];
  let score = 0;

  if (!ua) {
    score += 3;
    reasons.push('no user-agent');
  }
  const crawler = CRAWLERS.test(ua);
  if (crawler) {
    score += 4;
    reasons.push('known crawler');
  }
  if (HEADLESS_MARKERS.test(ua)) {
    score += 3;
    reasons.push('headless browser');
  }

  const declaredAutomation = DECLARED_AUTOMATION.test(ua);
  if (declaredAutomation) {
    // Low weight on purpose: this is the honest case.
    score += 1;
    reasons.push('scripted client');
  }

  // A browser always sends Accept and Accept-Language on a document request,
  // and virtually always Accept-Encoding on any request.
  if (!req.headers['accept']) {
    score += 2;
    reasons.push('no accept header');
  }
  if (!req.headers['accept-encoding']) {
    score += 1;
    reasons.push('no accept-encoding');
  }

  // Fetch metadata is set by the browser itself and cannot be forged from
  // page script, so its absence on a same-origin XHR is meaningful.
  if (!req.headers['sec-fetch-site'] && !declaredAutomation) {
    score += 1;
    reasons.push('no fetch metadata');
  }

  return { score, reasons, declaredAutomation, crawler };
}

/* ------------------------------------------------- behavioural detection */

interface Behaviour {
  /** Request timestamps, for cadence analysis. */
  times: number[];
  /** 404s on identifier-bearing routes — the shape of enumeration. */
  notFound: number;
  /** Distinct resource ids requested, for scraping breadth. */
  idsSeen: Set<string>;
  windowStart: number;
  alerted: number;
}

const WINDOW_MS = 5 * 60 * 1000;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

/** Consecutive misses that stop looking like typos. */
const ENUMERATION_THRESHOLD = 12;
/** Distinct ids fetched inside the window before it reads as bulk collection. */
const SCRAPE_ID_THRESHOLD = 200;
/** Median gap below which traffic is not being produced by a person. */
const MACHINE_CADENCE_MS = 120;

const behaviour = new Map<string, Behaviour>();

/**
 * Pull a resource identifier out of the path.
 *
 * `req.params` is only populated once a route matches, and this runs as
 * app-level middleware before routing — so the id has to come from the URL
 * itself. Matches UUIDs and the slug form used by role ids.
 */
const ID_SEGMENT = /\/(?:candidates|roles|sessions)\/([A-Za-z0-9][A-Za-z0-9_-]{7,})(?:\/|$)/;

function resourceId(path: string): string | null {
  return path.match(ID_SEGMENT)?.[1] ?? null;
}

function profile(key: string): Behaviour {
  let entry = behaviour.get(key);
  const now = Date.now();
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { times: [], notFound: 0, idsSeen: new Set(), windowStart: now, alerted: entry?.alerted ?? 0 };
    behaviour.set(key, entry);
  }
  return entry;
}

/** Median inter-arrival gap. Median, not mean, so one pause cannot hide a flood. */
function medianGap(times: number[]): number | null {
  if (times.length < 8) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

export interface AbuseVerdict {
  refuse: boolean;
  reason?: string;
}

/**
 * Record a request and decide whether the pattern warrants refusal.
 * Called on every API request; the response-side signals arrive via
 * `noteResponse`.
 */
export function inspect(req: Request): AbuseVerdict & { key: string } {
  // Computed once and handed back to the caller. `inspect` runs before the
  // auth middleware, so `principal()` resolves to the address here; by the
  // time the response finishes it would resolve to the user id instead, and
  // the two halves of the detector would increment different buckets.
  const key = principal(req);
  const entry = profile(key);
  const now = Date.now();

  entry.times.push(now);
  if (entry.times.length > 400) entry.times.shift();

  const id = resourceId(req.path);
  if (id) entry.idsSeen.add(id);

  const signals = scoreRequest(req);
  const cadence = medianGap(entry.times);

  // Crawlers get turned away politely and immediately: they should not be
  // walking an authenticated application at all, and none of this data is
  // meant to be indexed.
  if (signals.crawler) {
    return { key, refuse: true, reason: 'Automated crawlers are not permitted on this application.' };
  }

  // Enumeration: many misses on identifier routes means someone is guessing
  // ids rather than following links. This is the signature of IDOR probing,
  // and it is the one pattern worth refusing on its own.
  if (entry.notFound >= ENUMERATION_THRESHOLD) {
    alert(key, req, 'abuse.enumeration', {
      notFound: entry.notFound,
      distinctIds: entry.idsSeen.size,
      score: signals.score,
    });
    return {
      key,
      refuse: true,
      reason: 'Too many requests for resources that do not exist.',
    };
  }

  // Bulk collection: a person reviewing candidates does not open two hundred
  // distinct records in five minutes.
  if (entry.idsSeen.size >= SCRAPE_ID_THRESHOLD) {
    alert(key, req, 'abuse.bulk_collection', {
      distinctIds: entry.idsSeen.size,
      windowMinutes: WINDOW_MS / 60000,
    });
    return { key, refuse: true, reason: 'Unusual volume of record access. Slow down or use the export instead.' };
  }

  // The combination case: scripted shape *and* inhuman cadence. Either alone
  // is fine — a fast browser burst is normal, and a slow script is harmless.
  if (cadence !== null && cadence < MACHINE_CADENCE_MS && signals.score >= 3) {
    alert(key, req, 'abuse.machine_cadence', {
      medianGapMs: cadence,
      samples: entry.times.length,
      score: signals.score,
      reasons: signals.reasons,
    });
    return { key, refuse: true, reason: 'Requests are arriving faster than a person can make them.' };
  }

  return { key, refuse: false };
}

/**
 * Feed response status back in, so 404 streaks are visible to `inspect`.
 * Takes the key `inspect` returned rather than recomputing it — see the note
 * there about the principal changing once auth has run.
 */
export function noteResponse(key: string, req: Request, status: number): void {
  const entry = profile(key);
  // Only identifier routes count: a 404 on a typo'd path is not enumeration.
  if (status === 404 && resourceId(req.path)) entry.notFound += 1;
  if (status < 400) entry.notFound = Math.max(0, entry.notFound - 1);
}

function alert(key: string, req: Request, event: string, meta: object): void {
  const entry = profile(key);
  const now = Date.now();
  if (now - entry.alerted < ALERT_COOLDOWN_MS) return;
  entry.alerted = now;

  log.security(event, {
    principal: key,
    ip: clientIp(req),
    ua: String(req.headers['user-agent'] ?? '').slice(0, 120),
    path: req.path,
    requestId: req.id,
    ...meta,
  });
}

/* --------------------------------------------------------------- honeypot */

/**
 * A field no human ever fills, because it is not rendered. Simple form bots
 * populate every input they find, so a non-empty value is a strong signal —
 * far more reliable than any header heuristic, and invisible to real users.
 */
export const HONEYPOT_FIELD = 'website_url';

export function trippedHoneypot(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const value = (body as Record<string, unknown>)[HONEYPOT_FIELD];
  return typeof value === 'string' && value.trim().length > 0;
}

/* ----------------------------------------------------- signup abuse checks */

/**
 * Disposable-address domains. Not exhaustive and not meant to be — the list
 * exists to raise the cost of scripted signup floods, not to be a wall. The
 * email-verification step is what actually proves control of an address.
 */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com',
  'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com',
  'maildrop.cc', 'fakeinbox.com', 'mailnesia.com', 'mintemail.com',
  'spam4.me', 'grr.la', 'inboxbear.com', 'tempr.email', 'emailondeck.com',
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // Common subdomain form, e.g. inbox.mailinator.com
  return [...DISPOSABLE_DOMAINS].some((d) => domain.endsWith(`.${d}`));
}

/**
 * Gmail treats dots and +tags as noise, so one mailbox yields unlimited
 * distinct-looking addresses. Canonicalising defeats that for signup counting
 * without rejecting anyone.
 */
export function canonicalEmail(email: string): string {
  const [local, domain] = email.toLowerCase().trim().split('@');
  if (!domain) return email.toLowerCase().trim();

  let user = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    user = user.replace(/\./g, '');
    return `${user}@gmail.com`;
  }
  return `${user}@${domain}`;
}

/* ------------------------------------------------------------ housekeeping */

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of behaviour) {
    if (now - entry.windowStart > WINDOW_MS * 2) behaviour.delete(key);
  }
}, 5 * 60 * 1000);
sweeper.unref?.();

export function abuseSnapshot(): Record<string, number> {
  return { trackedPrincipals: behaviour.size };
}

export function __resetAbuse(): void {
  behaviour.clear();
}
