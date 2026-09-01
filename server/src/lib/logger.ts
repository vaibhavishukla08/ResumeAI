/**
 * Structured logging.
 *
 * Output is one JSON object per line in production, so a log shipper can parse
 * it without regexes, and human-readable in development where a person is
 * reading it directly.
 *
 * The important part is `redact()`. Logs get copied into ticketing systems,
 * pasted into chat, and shipped to third-party aggregators — a password that
 * reaches a log line has escaped every other control in the application. So
 * redaction happens here, at the boundary, rather than relying on every call
 * site to remember.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { LOG_LEVEL, MODE, SECURITY_LOG_FILE, isProduction } from './config.js';

export type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVEL_ORDER[LOG_LEVEL] ?? LEVEL_ORDER.info;

/** Keys whose values must never appear in a log, at any depth. */
const SECRET_KEYS = new Set([
  'password', 'currentpassword', 'newpassword', 'confirm', 'passwordhash',
  'token', 'credential', 'rawtoken', 'tokenhash', 'secret', 'sessionsecret',
  'apikey', 'api_key', 'authorization', 'cookie', 'set-cookie',
  'gemini_api_key', 'geminiapikey', 'jwt', 'refreshtoken', 'csrf',
  'verifytokenhash', 'resettokenhash', 'client_secret', 'clientsecret',
]);

/** Values that look like credentials regardless of the key they arrived under. */
const SECRET_SHAPES: RegExp[] = [
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,          // Google API key
  /\bAQ\.[A-Za-z0-9_-]{20,}\b/g,          // Google short-lived credential
  /\b[A-Za-z0-9_-]{20,}\.apps\.googleusercontent\.com\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, // JWT
  /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g,  // bcrypt hash
];

const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[depth limit]';

  if (typeof value === 'string') {
    let out = value;
    for (const re of SECRET_SHAPES) out = out.replace(re, '[redacted]');
    return out;
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

/**
 * Partially mask an address so a log is still useful for correlation without
 * being a mailing list if it leaks. `alex@acme.com` -> `al***@acme.com`.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return 'unknown';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(1, Math.min(local.length - 2, 6)))}@${domain}`;
}

/**
 * Stable pseudonym for an address, so repeated attempts against one account can
 * be correlated across log lines without storing the address itself.
 */
export function emailFingerprint(email: string | null | undefined): string {
  if (!email) return 'none';
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12);
}

let securityStream: fs.WriteStream | null = null;
if (SECURITY_LOG_FILE) {
  try {
    securityStream = fs.createWriteStream(SECURITY_LOG_FILE, { flags: 'a', mode: 0o600 });
  } catch (err) {
    console.error(`[logger] cannot open ${SECURITY_LOG_FILE}:`, (err as Error).message);
  }
}

function emit(level: Level, message: string, meta?: object, security = false): void {
  if (LEVEL_ORDER[level] < threshold && !security) return;

  const record = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(security ? { security: true } : {}),
    ...(meta ? (redact(meta) as object) : {}),
  };

  if (isProduction) {
    const line = JSON.stringify(record);
    (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
  } else {
    const tint = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' }[level];
    const tag = security ? '\x1b[35m[security]\x1b[0m ' : '';
    const extra = meta ? ` ${JSON.stringify(redact(meta))}` : '';
    process.stdout.write(`${tint}${level.padEnd(5)}\x1b[0m ${tag}${message}${extra}\n`);
  }

  // Security events are also appended to their own file when configured, so
  // they survive log rotation of the general stream and can be shipped to a
  // SIEM independently.
  if (security && securityStream) {
    securityStream.write(`${JSON.stringify(record)}\n`);
  }
}

export const log = {
  debug: (msg: string, meta?: object) => emit('debug', msg, meta),
  info: (msg: string, meta?: object) => emit('info', msg, meta),
  warn: (msg: string, meta?: object) => emit('warn', msg, meta),
  error: (msg: string, meta?: object) => emit('error', msg, meta),
  /** Always emitted regardless of level — these are the lines you audit. */
  security: (msg: string, meta?: object) => emit('warn', msg, meta, true),
};

export function closeLogger(): void {
  securityStream?.end();
}

log.debug(`logger ready (mode=${MODE}, level=${LOG_LEVEL})`);
