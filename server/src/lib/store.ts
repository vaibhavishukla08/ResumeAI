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
    };
  } catch {
    cache = { users: [], roles: [], candidates: [] };
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

export async function deleteRole(userId: string, id: string): Promise<boolean> {
  const db = await load();
  const before = db.roles.length;
  db.roles = db.roles.filter((r) => !(r.userId === userId && r.id === id));
  db.candidates = db.candidates.filter((c) => !(c.userId === userId && c.roleId === id));
  await persist();
  return db.roles.length < before;
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

export function newId(): string {
  return crypto.randomUUID();
}
