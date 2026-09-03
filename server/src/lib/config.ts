/**
 * Configuration and secret validation.
 *
 * Everything the process needs from the environment is resolved here, once, at
 * startup — and in production a missing or weak secret stops the boot rather
 * than degrading quietly. A server that starts with a self-generated secret
 * looks healthy in every dashboard while silently invalidating sessions on
 * each restart; failing loudly is the kinder outcome.
 *
 * Nothing in this module is ever sent to a client. `describe()` exists so the
 * startup banner can report configuration without printing the values.
 */

import crypto from 'node:crypto';

export type Mode = 'development' | 'production' | 'test';

export const MODE: Mode = (process.env.NODE_ENV as Mode) || 'development';
export const isProduction = MODE === 'production';

/** Minimum entropy we accept for a session secret, in hex characters. */
const MIN_SECRET_LENGTH = 32;

/** Values that appear in tutorials and .env.example files everywhere. */
const REJECTED_SECRETS = new Set([
  'changeme', 'secret', 'password', 'development', 'dev', 'test',
  'your-secret-here', 'replace_me', 'REPLACE_ME', 'todo', 'xxx',
  'keyboard cat', 'supersecret', 'my-secret-key',
]);

export interface ConfigProblem {
  key: string;
  message: string;
  fatal: boolean;
}

const problems: ConfigProblem[] = [];

function require_(key: string, message: string): string | undefined {
  const value = process.env[key]?.trim();
  if (!value) {
    problems.push({ key, message, fatal: isProduction });
    return undefined;
  }
  return value;
}

/**
 * A secret must be long and unguessable. Length alone is not enough —
 * "aaaaaaaa…" is 64 characters and worthless — so distinct-character count is
 * checked too, which catches the repeated-filler case cheaply.
 */
function validateSecret(key: string, value: string | undefined): void {
  if (!value) return;

  if (REJECTED_SECRETS.has(value.toLowerCase())) {
    problems.push({ key, message: `${key} is a well-known placeholder value.`, fatal: true });
    return;
  }
  if (value.length < MIN_SECRET_LENGTH) {
    problems.push({
      key,
      message: `${key} is ${value.length} characters; at least ${MIN_SECRET_LENGTH} are required.`,
      fatal: isProduction,
    });
    return;
  }
  if (new Set(value).size < 8) {
    problems.push({
      key,
      message: `${key} has too little variety to be random.`,
      fatal: isProduction,
    });
  }
}

/* ------------------------------------------------------------- resolution */

const rawSessionSecret = isProduction
  ? require_('SESSION_SECRET', 'SESSION_SECRET is required in production.')
  : process.env.SESSION_SECRET?.trim();

validateSecret('SESSION_SECRET', rawSessionSecret);

/**
 * Development gets a generated secret so `npm run dev` works with no setup.
 * It is regenerated per boot, which means restarting signs everyone out — the
 * correct behaviour for a secret nobody chose, and a visible nudge to set one.
 */
export const SESSION_SECRET: string =
  rawSessionSecret || crypto.randomBytes(32).toString('hex');

export const APP_URL: string =
  require_('APP_URL', 'APP_URL is required in production (used for CORS and email links).') ||
  'http://localhost:5173';

export const PORT = Number(process.env.PORT) || 5174;

/**
 * Bind address. Defaults to loopback in production so the API is unreachable
 * from the network except through the reverse proxy that terminates TLS.
 * Binding 0.0.0.0 by default would expose the app directly, which is how
 * "internal" services end up on the public internet.
 */
export const BIND_HOST: string =
process.env.BIND_HOST || (isProduction ? '127.0.0.1' : '0.0.0.0');


/**
 * How many proxies sit in front of us, normalised for Express.
 *
 * Express accepts a hop count, `false`, or a list of proxy addresses — and it
 * treats *any* string it is given as an address list. So `TRUST_PROXY=1`, the
 * value every hosting dashboard invites you to type, used to compile to the
 * address 0.0.0.1: it matches no proxy, so the header is never trusted, and
 * nothing says so. The symptoms show up far from the cause — every client
 * shares one rate-limit bucket, the audit log records the proxy's IP, and
 * `req.secure` is false, which makes HTTPS enforcement redirect in a loop.
 */
const rawTrustProxy = process.env.TRUST_PROXY?.trim() ?? '';

export const TRUST_PROXY: number | boolean | string = (() => {
  if (!rawTrustProxy || rawTrustProxy === 'false' || rawTrustProxy === 'off') return false;
  if (rawTrustProxy === 'true' || rawTrustProxy === 'on') return 1;
  // "1", "2" — hop counts, the common case behind a single load balancer.
  if (/^\d+$/.test(rawTrustProxy)) return Number(rawTrustProxy);
  // Anything else is taken at face value as an address or subnet list.
  return rawTrustProxy;
})();

/** Whether any proxy is trusted at all, for code that only needs the boolean. */
export const TRUST_PROXY_ENABLED = TRUST_PROXY !== false;

/** HTTPS is mandatory in production unless explicitly, knowingly disabled. */
export const ENFORCE_HTTPS =
  process.env.ENFORCE_HTTPS === 'false' ? false : isProduction;

export const HSTS_MAX_AGE = Number(process.env.HSTS_MAX_AGE) || 15_552_000; // 180 days

export const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 12;

export const LOG_LEVEL = (process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')) as
  | 'debug' | 'info' | 'warn' | 'error';

/** Where security events are appended, in addition to stdout. */
export const SECURITY_LOG_FILE = process.env.SECURITY_LOG_FILE || '';

/* ----------------------------------------------------------- sign-in modes */

/**
 * Google SSO is off unless an operator asks for it twice: a client id *and*
 * this flag. The verification path in auth.ts is unchanged and still correct,
 * but a stale GOOGLE_CLIENT_ID left behind in an .env can no longer put the
 * button back on the sign-in page on its own.
 */
export const GOOGLE_LOGIN_ENABLED =
  process.env.GOOGLE_LOGIN?.trim() === 'on' && Boolean(process.env.GOOGLE_CLIENT_ID?.trim());

/**
 * One shared, already-verified workspace that anyone can open with a single
 * click, so the app can be shown without an inbox round trip. Set
 * DEMO_LOGIN=false to remove the button and the route together.
 */
export const DEMO_LOGIN_ENABLED = process.env.DEMO_LOGIN?.trim() !== 'false';

/** Identity of that workspace. Never receives mail — nothing is sent to it. */
export const DEMO_EMAIL = (process.env.DEMO_EMAIL?.trim() || 'demo@resumeai.local').toLowerCase();

/* ------------------------------------------------------ consistency rules */

if (isProduction) {
  if (ENFORCE_HTTPS && APP_URL.startsWith('http://')) {
    problems.push({
      key: 'APP_URL',
      message: 'APP_URL must be https:// when HTTPS is enforced — cookies are Secure and will not be sent over http.',
      fatal: true,
    });
  }
  if (!TRUST_PROXY_ENABLED && APP_URL.startsWith('https://')) {
    problems.push({
      key: 'TRUST_PROXY',
      message:
        'APP_URL is https but TRUST_PROXY is unset. Behind a TLS-terminating proxy this makes every client share one rate-limit bucket and hides the real IP from the audit log.',
      fatal: false,
    });
  }
  if (BIND_HOST === '0.0.0.0' && !process.env.ALLOW_PUBLIC_BIND) {
    problems.push({
      key: 'BIND_HOST',
      message:
        'Binding 0.0.0.0 in production exposes the API directly. Bind 127.0.0.1 and front it with a reverse proxy, or set ALLOW_PUBLIC_BIND=1 to accept the risk.',
      fatal: true,
    });
  }
}

/* ---------------------------------------------------------------- report */

export function reportConfig(log: {
  warn: (msg: string, meta?: object) => void;
  error: (msg: string, meta?: object) => void;
}): void {
  const fatal = problems.filter((p) => p.fatal);
  const warnings = problems.filter((p) => !p.fatal);

  for (const p of warnings) log.warn(`config: ${p.message}`, { key: p.key });
  for (const p of fatal) log.error(`config: ${p.message}`, { key: p.key });

  if (fatal.length) {
    log.error(`Refusing to start with ${fatal.length} fatal configuration problem(s).`);
    process.exit(1);
  }
}

/** Safe-to-print summary. Reports whether a secret is set, never its value. */
export function describe(): Record<string, string | number | boolean> {
  return {
    mode: MODE,
    bind: `${BIND_HOST}:${PORT}`,
    appUrl: APP_URL,
    httpsEnforced: ENFORCE_HTTPS,
    trustProxy: TRUST_PROXY_ENABLED ? `trusting ${TRUST_PROXY}` : 'off',
    sessionSecretConfigured: rawSessionSecret ? 'yes' : 'no — generated per boot (development only)',
    geminiKey: process.env.GEMINI_API_KEY ? 'set' : 'not set',
    googleLogin: GOOGLE_LOGIN_ENABLED
      ? 'enabled'
      : process.env.GOOGLE_CLIENT_ID
        ? 'disabled (client id present; set GOOGLE_LOGIN=on to enable)'
        : 'disabled (no client id)',
    demoLogin: DEMO_LOGIN_ENABLED ? `enabled as ${DEMO_EMAIL}` : 'disabled',
    mailWebhook: process.env.MAIL_WEBHOOK_URL ? 'set' : 'not set (links go to the log)',
    logLevel: LOG_LEVEL,
  };
}
