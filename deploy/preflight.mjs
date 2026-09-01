#!/usr/bin/env node
/**
 * Production readiness check.
 *
 *   node deploy/preflight.mjs
 *
 * Reads the environment the way the server does and reports what would stop or
 * weaken a real deployment — without starting anything or printing a secret.
 * Exit code is non-zero if any FAIL is present, so CI can gate on it.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Load server/.env without a dependency, so this runs on a bare host.
const envPath = path.join(ROOT, 'server', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const results = [];
const check = (level, name, ok, detail) => results.push({ level, name, ok, detail });

const env = process.env;
const prod = env.NODE_ENV === 'production';

/* ---------------------------------------------------------------- secrets */

const secret = env.SESSION_SECRET?.trim() ?? '';
check('FAIL', 'SESSION_SECRET set', Boolean(secret),
  'Required in production; without it every restart signs all users out.');
check('FAIL', 'SESSION_SECRET strong', !secret || (secret.length >= 32 && new Set(secret).size >= 8),
  `Needs >=32 chars and real entropy (currently ${secret.length} chars).`);

check('FAIL', 'APP_URL is https', !prod || (env.APP_URL ?? '').startsWith('https://'),
  'Session cookies are Secure in production and will not travel over http.');

check('WARN', 'GEMINI_API_KEY set', Boolean(env.GEMINI_API_KEY),
  'Optional — without it the local analysis engine is used.');
check('WARN', 'MAIL_WEBHOOK_URL set', Boolean(env.MAIL_WEBHOOK_URL),
  'Without it, verification and reset links only reach the server log — real users cannot sign up.');

/* ------------------------------------------------------------- transport */

check('FAIL', 'HTTPS not disabled', env.ENFORCE_HTTPS !== 'false' || !prod,
  'ENFORCE_HTTPS=false in production serves the app over plaintext.');
check('WARN', 'TRUST_PROXY set', !prod || Boolean(env.TRUST_PROXY),
  'Behind a proxy without this, every client shares one rate-limit bucket and the audit log records the proxy IP.');
check('FAIL', 'Not bound publicly', !prod || env.BIND_HOST !== '0.0.0.0' || Boolean(env.ALLOW_PUBLIC_BIND),
  'Bind 127.0.0.1 and front the app with a reverse proxy.');

/* ------------------------------------------------------------ data at rest */

function mode(p) {
  try { return fs.statSync(p).mode & 0o777; } catch { return null; }
}

const envMode = mode(envPath);
check('FAIL', '.env is owner-only', envMode === null || !(envMode & 0o077),
  `server/.env is ${envMode?.toString(8)}; run chmod 600 on it.`);

for (const dir of ['server/data', 'server/uploads']) {
  const m = mode(path.join(ROOT, dir));
  check('FAIL', `${dir} is owner-only`, m === null || !(m & 0o077),
    `${dir} is ${m?.toString(8)}; it holds password hashes, PII and resumes.`);
}

const dbMode = mode(path.join(ROOT, 'server', 'data', 'db.json'));
check('FAIL', 'db.json is owner-only', dbMode === null || !(dbMode & 0o077),
  `db.json is ${dbMode?.toString(8)}.`);

/* ----------------------------------------------------------- repo hygiene */

const gitignore = fs.existsSync(path.join(ROOT, '.gitignore'))
  ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
  : '';
check('FAIL', '.env is gitignored', gitignore.includes('.env'), 'Secrets must never be committed.');
check('FAIL', 'db.json is gitignored', gitignore.includes('db.json'), 'The datastore holds candidate PII.');

const exampleEnv = path.join(ROOT, 'server', '.env.example');
if (fs.existsSync(exampleEnv)) {
  // Only secret-bearing keys matter here. A non-secret default like
  // APP_URL=http://localhost:5173 is documentation, not a leak, and flagging
  // it trains people to ignore this check.
  const SECRET_KEYS = /SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL|WEBHOOK/;
  const leaked = fs
    .readFileSync(exampleEnv, 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=.+/.test(l.trim()))
    .map((l) => l.split('=')[0].trim())
    .filter((k) => SECRET_KEYS.test(k));
  check('FAIL', '.env.example has no secrets', leaked.length === 0,
    `Secret-bearing keys carry values in the committed template: ${leaked.join(', ')}`);
}

// Delegate to the dedicated scanner rather than duplicating its rules here.
let scanClean = true;
try {
  execSync(`node ${path.join(ROOT, 'deploy', 'scan-secrets.mjs')}`, { cwd: ROOT, stdio: 'pipe' });
} catch {
  scanClean = false;
}
check('FAIL', 'No secrets in tracked files', scanClean,
  'Run: node deploy/scan-secrets.mjs — a committed key must be rotated, not just deleted.');

check('WARN', 'Server build present', fs.existsSync(path.join(ROOT, 'server', 'dist')),
  'Run npm run build before starting in production.');

/* ------------------------------------------------------------------ report */

const width = Math.max(...results.map((r) => r.name.length)) + 2;
let failures = 0;

console.log(`\n  Preflight — NODE_ENV=${env.NODE_ENV ?? 'development'}\n`);
for (const r of results) {
  if (r.ok) {
    console.log(`  \x1b[32mPASS\x1b[0m  ${r.name}`);
  } else if (r.level === 'WARN') {
    console.log(`  \x1b[33mWARN\x1b[0m  ${r.name.padEnd(width)} ${r.detail}`);
  } else {
    failures += 1;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${r.name.padEnd(width)} ${r.detail}`);
  }
}

const warns = results.filter((r) => !r.ok && r.level === 'WARN').length;
console.log(
  `\n  ${results.length - failures - warns} passed, ${warns} warning(s), ${failures} failure(s)\n`,
);
process.exit(failures ? 1 : 0);
