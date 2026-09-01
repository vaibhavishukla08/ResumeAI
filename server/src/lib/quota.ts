/**
 * Budgets for the expensive path.
 *
 * Analysis is the only operation here that costs real money: each resume can
 * trigger a structured-extraction call and a recommendation call, and a scanned
 * document adds an OCR pass on top. A caller who stays under a "requests per
 * minute" limit can still burn a month of model quota in an afternoon by
 * uploading sixty files at a time, which is why this counts *resumes*, not
 * requests.
 *
 * Three independent controls, because they fail differently:
 *
 *   daily budget  — bounds total spend for one account
 *   burst budget  — bounds how fast that budget can be spent
 *   concurrency   — bounds simultaneous work, so one account cannot occupy
 *                   every worker and starve everyone else
 *
 * State is in-process, matching the rate limiter. On more than one node these
 * become per-instance budgets; move the counters to Redis at that point.
 */

import { log } from './logger.js';

export interface QuotaConfig {
  /** Resumes per rolling 24 hours, per account. */
  dailyResumes: number;
  /** Resumes per rolling hour, per account. */
  hourlyResumes: number;
  /** Analysis requests running at once, per account. */
  concurrentBatches: number;
  /** Hard ceiling on one upload, independent of budget. */
  maxBatchSize: number;
}

/**
 * Defaults sized for real recruiting work: a role with a few hundred applicants
 * screened over a day is normal, and must not trip. Anything well past that is
 * either a mistake or an attack, and both are worth stopping.
 */
export const DEFAULT_QUOTA: QuotaConfig = {
  dailyResumes: Number(process.env.QUOTA_DAILY_RESUMES) || 500,
  hourlyResumes: Number(process.env.QUOTA_HOURLY_RESUMES) || 150,
  concurrentBatches: Number(process.env.QUOTA_CONCURRENT_BATCHES) || 2,
  maxBatchSize: Number(process.env.QUOTA_MAX_BATCH) || 60,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

interface Usage {
  /** Timestamps of individual resumes analysed, for rolling windows. */
  events: number[];
  running: number;
}

const usage = new Map<string, Usage>();

function profileFor(userId: string): Usage {
  let entry = usage.get(userId);
  if (!entry) {
    entry = { events: [], running: 0 };
    usage.set(userId, entry);
  }
  // Trim to the widest window we care about; the hourly count is derived.
  const cutoff = Date.now() - DAY_MS;
  entry.events = entry.events.filter((t) => t > cutoff);
  return entry;
}

export interface QuotaVerdict {
  allowed: boolean;
  reason?: string;
  /** Seconds until the caller could retry, when that is knowable. */
  retryAfter?: number;
  remainingToday: number;
  remainingThisHour: number;
}

/**
 * Check a batch *before* any work starts. Deliberately all-or-nothing: a
 * partially accepted batch would leave the user guessing which resumes were
 * analysed, which is worse than a clear refusal.
 */
export function checkAnalysisQuota(
  userId: string,
  batchSize: number,
  config: QuotaConfig = DEFAULT_QUOTA,
): QuotaVerdict {
  const entry = profileFor(userId);
  const now = Date.now();

  const usedToday = entry.events.length;
  const usedThisHour = entry.events.filter((t) => t > now - HOUR_MS).length;
  const remainingToday = Math.max(0, config.dailyResumes - usedToday);
  const remainingThisHour = Math.max(0, config.hourlyResumes - usedThisHour);

  const base = { remainingToday, remainingThisHour };

  if (batchSize > config.maxBatchSize) {
    return { allowed: false, reason: `A single upload is limited to ${config.maxBatchSize} files.`, ...base };
  }

  if (entry.running >= config.concurrentBatches) {
    return {
      allowed: false,
      reason: `You already have ${entry.running} analysis run(s) in progress. Wait for those to finish.`,
      retryAfter: 30,
      ...base,
    };
  }

  if (batchSize > remainingThisHour) {
    // Retry-after points at the moment the oldest event in the hour rolls out,
    // so the client is told something true rather than a guessed constant.
    const oldestInHour = entry.events.find((t) => t > now - HOUR_MS);
    return {
      allowed: false,
      reason: `Hourly analysis limit reached (${config.hourlyResumes} resumes/hour). ${remainingThisHour} remaining.`,
      retryAfter: oldestInHour ? Math.ceil((oldestInHour + HOUR_MS - now) / 1000) : HOUR_MS / 1000,
      ...base,
    };
  }

  if (batchSize > remainingToday) {
    const oldest = entry.events[0];
    return {
      allowed: false,
      reason: `Daily analysis limit reached (${config.dailyResumes} resumes/day). ${remainingToday} remaining.`,
      retryAfter: oldest ? Math.ceil((oldest + DAY_MS - now) / 1000) : DAY_MS / 1000,
      ...base,
    };
  }

  return { allowed: true, ...base };
}

/** Claim a slot. Must be paired with `finishAnalysis` in a finally block. */
export function beginAnalysis(userId: string): void {
  profileFor(userId).running += 1;
}

export function finishAnalysis(userId: string): void {
  const entry = profileFor(userId);
  // Never below zero: a double-release would otherwise create free slots.
  entry.running = Math.max(0, entry.running - 1);
}

/**
 * Charge for work actually performed. Called after analysis so that files
 * rejected during extraction do not consume budget the user never spent.
 */
export function recordAnalysed(userId: string, count: number, config: QuotaConfig = DEFAULT_QUOTA): void {
  if (count <= 0) return;
  const entry = profileFor(userId);
  const now = Date.now();
  for (let i = 0; i < count; i++) entry.events.push(now);

  const usedToday = entry.events.length;
  if (usedToday > config.dailyResumes * 0.8) {
    log.warn('quota.approaching_daily_limit', {
      userId,
      usedToday,
      limit: config.dailyResumes,
    });
  }
}

export function quotaStatus(userId: string, config: QuotaConfig = DEFAULT_QUOTA) {
  const entry = profileFor(userId);
  const now = Date.now();
  const usedThisHour = entry.events.filter((t) => t > now - HOUR_MS).length;
  return {
    usedToday: entry.events.length,
    dailyLimit: config.dailyResumes,
    usedThisHour,
    hourlyLimit: config.hourlyResumes,
    running: entry.running,
    concurrentLimit: config.concurrentBatches,
    maxBatchSize: config.maxBatchSize,
  };
}

const sweeper = setInterval(() => {
  const cutoff = Date.now() - DAY_MS;
  for (const [userId, entry] of usage) {
    entry.events = entry.events.filter((t) => t > cutoff);
    if (!entry.events.length && entry.running === 0) usage.delete(userId);
  }
}, 60 * 60 * 1000);
sweeper.unref?.();

export function __resetQuota(): void {
  usage.clear();
}
