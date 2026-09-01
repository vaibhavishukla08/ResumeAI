/**
 * Persistence.
 *
 * A JSON-file store keeps the app runnable with zero external services. The
 * surface below is the same shape a Supabase/Postgres adapter would expose, so
 * swapping in pgvector later is a change to this file only.
 *
 * Everything is scoped by `userId`: each account is its own workspace, and no
 * query can return another account's roles or candidates. That scoping is
 * enforced here rather than in the routes, so a forgotten filter in a handler
 * cannot leak data.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseRequiredSkills } from './skills.js';
import type { Candidate, Role, RoleInput, StoredUser } from '../../../shared/types.js';
import type { SessionRecord } from './sessions.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const DB_PATH = path.join(DIR, 'db.json');

interface RoleRecord {
  id: string;
  userId: string;
  title: string;
  department: string;
  description: string;
  required: string;
  minYears: number;
  maxYears: number | null;
  mustHave: string[];
}

interface Db {
  users: StoredUser[];
  roles: RoleRecord[];
  candidates: Candidate[];
  sessions: SessionRecord[];
}

/** Seeded into every new account so the app is usable immediately. */
const STARTER_ROLES: Omit<RoleRecord, 'userId'>[] = [
  {
    id: 'senior-frontend-engineer',
    title: 'Senior Frontend Engineer',
    department: 'Engineering',
    minYears: 5,
    maxYears: null,
    description:
      'Build and own complex, accessible web interfaces at scale. Lead architecture for a React and TypeScript codebase, drive design-system adoption, mentor mid-level engineers, and partner with design on interaction quality. Strong CSS fundamentals, performance profiling and testing discipline expected.',
    required:
      'React, TypeScript, JavaScript, CSS, Node.js, GraphQL, Testing, Accessibility, System Design, Git',
    mustHave: ['react', 'typescript', 'javascript'],
  },
  {
    id: 'ai-ml-engineer',
    title: 'AI/ML Engineer',
    department: 'Data & AI',
    minYears: 3,
    maxYears: null,
    description:
      'Design and ship production machine-learning systems. Own the pipeline end to end: data preparation, model training and evaluation, embedding-based retrieval, and deployment behind low-latency services. Recent work with large language models, RAG architectures and vector search is central to this role.',
    required:
      'Python, Machine Learning, Deep Learning, PyTorch, NLP, LLMs, RAG, PostgreSQL, Docker, AWS',
    mustHave: ['python', 'ml', 'llm'],
  },
  {
    id: 'registered-nurse',
    title: 'Registered Nurse — Acute Care',
    department: 'Clinical',
    minYears: 2,
    maxYears: null,
    description:
      'Deliver direct patient care on a busy acute ward. Assess and triage on admission, administer medication and IV therapy, maintain accurate records in the EHR, and coordinate discharge planning with the wider team. Current ACLS and BLS certification required; strong infection-control discipline expected.',
    required:
      'Patient Care, Clinical Assessment, Medication Administration, EHR / EMR, ACLS, BLS / CPR, Infection Control, HIPAA Compliance, Care Planning, Communication',
    mustHave: ['patient-care', 'clinical-assessment', 'bls-cpr'],
  },
  {
    id: 'financial-analyst',
    title: 'Financial Analyst',
    department: 'Finance',
    minYears: 3,
    maxYears: null,
    description:
      'Own the monthly reporting cycle and the rolling forecast. Build and maintain financial models, run variance analysis against budget, and present findings to non-finance stakeholders. Comfortable in Excel to an advanced standard and with an ERP as the system of record.',
    required:
      'Financial Reporting, Financial Modelling, Budgeting & Forecasting, GAAP, Microsoft Office, SAP / ERP, Attention to Detail, Communication, Statistics',
    mustHave: ['financial-reporting', 'financial-modeling', 'budgeting'],
  },
  {
    id: 'marketing-manager',
    title: 'Marketing Manager',
    department: 'Marketing',
    minYears: 4,
    maxYears: null,
    description:
      'Own demand generation end to end: campaign strategy, channel mix, and the reporting that proves what worked. Manage paid search and social budgets, shape the content calendar, and use analytics to decide where the next pound goes rather than defending where the last one went.',
    required:
      'Campaign Management, SEO, SEM / Paid Search, Content Marketing, Social Media Marketing, Email Marketing, Google Analytics, Brand Management, CRM, Communication',
    mustHave: ['campaign-management', 'google-analytics', 'content-marketing'],
  },
  {
    id: 'backend-engineer',
    title: 'Backend Engineer',
    department: 'Engineering',
    minYears: 3,
    maxYears: 10,
    description:
      'Design resilient, well-observed services. Model data carefully, write clear REST and gRPC interfaces, and keep latency budgets honest under real production load. Comfortable owning a service from schema design through on-call.',
    required:
      'Node.js, Python, PostgreSQL, Redis, Docker, Kubernetes, REST APIs, Microservices, CI/CD, Testing',
    mustHave: ['postgres', 'docker'],
  },
];

function hydrateRole(role: RoleRecord): Role {
  const requiredSkills = parseRequiredSkills(role.required);
  const weights: Record<string, number> = {};
  for (const skill of requiredSkills) {
    weights[skill.id] = role.mustHave.includes(skill.id) ? 3 : 1;
  }
  return { ...role, requiredSkills, weights };
}

let cache: Db | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<Db> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Db>;
    cache = {
      users: parsed.users ?? [],
      roles: parsed.roles ?? [],
      candidates: parsed.candidates ?? [],
      sessions: parsed.sessions ?? [],
    };
  } catch {
    cache = { users: [], roles: [], candidates: [], sessions: [] };
  }
  return cache;
}

/** Serialise writes so concurrent uploads cannot interleave and lose records. */
function persist(): Promise<void> {
  writeQueue = writeQueue
    .then(async () => {
      await fs.mkdir(DIR, { recursive: true });
      await fs.writeFile(DB_PATH, JSON.stringify(cache, null, 2), 'utf8');
    })
    .catch((err: Error) => console.error('[store] write failed:', err.message));
  return writeQueue;
}

export function slug(str: string): string {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/* ------------------------------------------------------------------ users */

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const db = await load();
  const needle = email.trim().toLowerCase();
  return db.users.find((u) => u.email.toLowerCase() === needle) ?? null;
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  const db = await load();
  return db.users.find((u) => u.id === id) ?? null;
}

export async function createUser(user: StoredUser): Promise<StoredUser> {
  const db = await load();
  db.users.push(user);

  // Give the new workspace the starter roles so it is not an empty shell.
  for (const role of STARTER_ROLES) {
    db.roles.push({ ...role, userId: user.id });
  }

  await persist();
  return user;
}

export async function countUsers(): Promise<number> {
  const db = await load();
  return db.users.length;
}

/** Attach a Google identity to an account that already exists by email. */
export async function linkGoogle(
  userId: string,
  googleId: string,
  picture: string | null,
): Promise<StoredUser | null> {
  const db = await load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;

  user.googleId = googleId;
  // Keep any existing avatar rather than blanking it on a later sign-in.
  if (picture) user.picture = picture;
  await persist();
  return user;
}

/* ------------------------------------------------------------------ roles */

export async function listRoles(userId: string): Promise<Role[]> {
  const db = await load();
  return db.roles.filter((r) => r.userId === userId).map(hydrateRole);
}

export async function findRole(userId: string, id: string): Promise<Role | null> {
  const db = await load();
  const role = db.roles.find((r) => r.userId === userId && r.id === id);
  return role ? hydrateRole(role) : null;
}

export async function saveRole(userId: string, input: RoleInput): Promise<Role> {
  const db = await load();
  const id = input.id || slug(input.title);
  const record: RoleRecord = {
    id,
    userId,
    title: input.title.trim(),
    department: input.department || 'General',
    description: input.description || '',
    required: input.required || '',
    minYears: input.minYears == null || input.minYears === '' ? 0 : Number(input.minYears),
    maxYears: input.maxYears == null || input.maxYears === '' ? null : Number(input.maxYears),
    mustHave: input.mustHave ?? [],
  };

  const index = db.roles.findIndex((r) => r.userId === userId && r.id === id);
  if (index >= 0) db.roles[index] = record;
  else db.roles.push(record);

  await persist();
  return hydrateRole(record);
}

/**
 * Delete a role and everything screened against it.
 *
 * Returns the removed candidates so the caller can unlink their uploads. An
 * earlier version dropped the records and left the files behind, which both
 * leaked storage and kept resume PII on disk after the owner believed they had
 * deleted it.
 */
export async function deleteRole(
  userId: string,
  id: string,
): Promise<{ deleted: boolean; removedCandidates: Candidate[] }> {
  const db = await load();
  const before = db.roles.length;

  db.roles = db.roles.filter((r) => !(r.userId === userId && r.id === id));
  const removedCandidates = db.candidates.filter((c) => c.userId === userId && c.roleId === id);
  db.candidates = db.candidates.filter((c) => !(c.userId === userId && c.roleId === id));

  await persist();
  return { deleted: db.roles.length < before, removedCandidates };
}

/** Every stored filename still referenced by a candidate record. */
export async function referencedFiles(): Promise<Set<string>> {
  const db = await load();
  return new Set(
    db.candidates.map((c) => c.file?.storedName).filter((n): n is string => Boolean(n)),
  );
}

/* ------------------------------------------------------------- candidates */

export async function listCandidates(userId: string, roleId?: string): Promise<Candidate[]> {
  const db = await load();
  return db.candidates.filter(
    (c) => c.userId === userId && (!roleId || c.roleId === roleId),
  );
}

export async function findCandidate(userId: string, id: string): Promise<Candidate | null> {
  const db = await load();
  return db.candidates.find((c) => c.userId === userId && c.id === id) ?? null;
}

export async function addCandidate(candidate: Candidate): Promise<Candidate> {
  const db = await load();
  db.candidates.push(candidate);
  await persist();
  return candidate;
}

export async function updateCandidate(
  userId: string,
  id: string,
  patch: Partial<Candidate>,
): Promise<Candidate | null> {
  const db = await load();
  const index = db.candidates.findIndex((c) => c.userId === userId && c.id === id);
  if (index === -1) return null;
  db.candidates[index] = { ...db.candidates[index], ...patch };
  await persist();
  return db.candidates[index];
}

export async function deleteCandidate(userId: string, id: string): Promise<boolean> {
  const db = await load();
  const before = db.candidates.length;
  db.candidates = db.candidates.filter((c) => !(c.userId === userId && c.id === id));
  await persist();
  return db.candidates.length < before;
}

export async function clearCandidates(userId: string, roleId?: string): Promise<Candidate[]> {
  const db = await load();
  const removed = db.candidates.filter(
    (c) => c.userId === userId && (!roleId || c.roleId === roleId),
  );
  db.candidates = db.candidates.filter(
    (c) => !(c.userId === userId && (!roleId || c.roleId === roleId)),
  );
  await persist();
  return removed;
}

/** Raw resume text for every other candidate on this role — the IDF corpus. */
export async function corpusFor(
  userId: string,
  roleId: string,
  excludeId?: string,
): Promise<string[]> {
  const db = await load();
  return db.candidates
    .filter((c) => c.userId === userId && c.roleId === roleId && c.id !== excludeId && c.text)
    .map((c) => c.text);
}

/* --------------------------------------------------------------- sessions */

export async function createSession(record: SessionRecord): Promise<SessionRecord> {
  const db = await load();
  db.sessions.push(record);
  await persist();
  return record;
}

export async function findSessionByHash(tokenHash: string): Promise<SessionRecord | null> {
  const db = await load();
  return db.sessions.find((s) => s.tokenHash === tokenHash) ?? null;
}

export async function touchSession(sessionId: string): Promise<void> {
  const db = await load();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  session.lastSeenAt = new Date().toISOString();
  await persist();
}

/**
 * Delete a session the caller owns.
 *
 * `userId` is not optional on purpose. An earlier version keyed only on
 * `sessionId`, which was safe only because no route happened to accept one
 * from a client — the obvious next feature ("revoke this device" from the
 * session list) would have introduced an IDOR the moment someone wrote it.
 * Requiring the owner makes that mistake impossible to express.
 */
export async function deleteSession(userId: string, sessionId: string): Promise<boolean> {
  const db = await load();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => !(s.id === sessionId && s.userId === userId));
  const removed = db.sessions.length < before;
  if (removed) await persist();
  return removed;
}

/**
 * Delete by id alone. Reserved for the session layer, which only ever calls it
 * with a record it has already resolved from the presented cookie — there is
 * no user context to check against at that point, and no caller-supplied id.
 */
export async function deleteResolvedSession(sessionId: string): Promise<void> {
  const db = await load();
  db.sessions = db.sessions.filter((s) => s.id !== sessionId);
  await persist();
}

/**
 * Revoke every session for a user. Called on password change and reset, so a
 * stolen session dies the moment the owner regains control of the account.
 */
export async function deleteSessionsForUser(userId: string, exceptId?: string): Promise<number> {
  const db = await load();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.userId !== userId || s.id === exceptId);
  await persist();
  return before - db.sessions.length;
}

export async function listSessionsForUser(userId: string): Promise<SessionRecord[]> {
  const db = await load();
  return db.sessions.filter((s) => s.userId === userId);
}

/** Drop expired rows so the store does not grow without bound. */
export async function pruneSessions(isExpired: (s: SessionRecord) => boolean): Promise<number> {
  const db = await load();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => !isExpired(s));
  const removed = before - db.sessions.length;
  if (removed) await persist();
  return removed;
}

/* ---------------------------------------------------------- user security */

export async function updateUser(
  userId: string,
  patch: Partial<StoredUser>,
): Promise<StoredUser | null> {
  const db = await load();
  const index = db.users.findIndex((u) => u.id === userId);
  if (index === -1) return null;
  db.users[index] = { ...db.users[index], ...patch };
  await persist();
  return db.users[index];
}

/** Look a user up by a token digest — never by the raw token. */
export async function findUserByVerifyHash(hash: string): Promise<StoredUser | null> {
  const db = await load();
  return db.users.find((u) => u.verifyTokenHash === hash) ?? null;
}

export async function findUserByResetHash(hash: string): Promise<StoredUser | null> {
  const db = await load();
  return db.users.find((u) => u.resetTokenHash === hash) ?? null;
}

export function newId(): string {
  return crypto.randomUUID();
}
