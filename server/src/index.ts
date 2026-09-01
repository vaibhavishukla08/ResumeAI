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
import { analyze, cosineSimilarity } from './lib/score.js';
import { ALL_SKILLS, CATEGORIES, canonical } from './lib/skills.js';
import * as store from './lib/store.js';
import * as gemini from './lib/gemini.js';
import {
  googleStatus,
  hashPassword,
  publicUser,
  requireAuth,
  signToken,
  validateEmail,
  validateName,
  validatePassword,
  verifyGoogleToken,
  verifyPassword,
  type AuthedRequest,
} from './lib/auth.js';

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
const PORT = Number(process.env.PORT) || 5174;
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 12;

await fs.mkdir(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${store.newId()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 60 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (SUPPORTED_EXTENSIONS.includes(ext)) return cb(null, true);
    cb(new Error(`Unsupported file type "${ext}". Allowed: ${SUPPORTED_EXTENSIONS.join(', ')}`));
  },
});

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
const route = (fn: Handler): Handler => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Narrow to the guarded request shape inside handlers behind `requireAuth`. */
const authed = (req: Request): AuthedRequest => req as AuthedRequest;

/* ------------------------------------------------------------------ meta */

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    gemini: gemini.geminiStatus(),
    google: googleStatus(),
    maxFileMb: MAX_FILE_MB,
    supported: SUPPORTED_EXTENSIONS,
  });
});

app.get('/api/skills', (_req, res) => {
  res.json({ skills: ALL_SKILLS, categories: CATEGORIES });
});

/* ------------------------------------------------------------------ auth */

app.post('/api/auth/register', route(async (req, res) => {
  const { email, password, name, company } = req.body ?? {};

  for (const check of [validateName(name), validateEmail(email), validatePassword(password)]) {
    if (!check.ok) return res.status(400).json({ error: check.error });
  }

  if (await store.findUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const user: StoredUser = {
    id: store.newId(),
    email: String(email).trim().toLowerCase(),
    name: String(name).trim(),
    company: company ? String(company).trim() : null,
    // The first account to register owns the deployment.
    role: (await store.countUsers()) === 0 ? 'admin' : 'recruiter',
    provider: 'password',
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(password),
  };

  await store.createUser(user);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

app.post('/api/auth/login', route(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = await store.findUserByEmail(email);
  // Same message either way, so this cannot be used to enumerate accounts.
  const invalid = { error: 'Email or password is incorrect.' };
  if (!user) return res.status(401).json(invalid);

  // A Google account has no local password; say so rather than failing opaquely.
  if (!user.passwordHash) {
    return res.status(409).json({
      error: 'This account was created with Google. Use "Continue with Google" to sign in.',
    });
  }
  if (!(await verifyPassword(password, user.passwordHash))) return res.status(401).json(invalid);

  res.json({ token: signToken(user), user: publicUser(user) });
}));

/**
 * Google Sign-In. The browser obtains an ID token from Google Identity
 * Services and posts it here; we verify it against Google's keys, then either
 * link it to the existing account with that email or create a new workspace.
 */
app.post('/api/auth/google', route(async (req, res) => {
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
    // Someone who registered with a password can also sign in with Google on
    // the same verified email — link the identity rather than blocking them.
    const linked = await store.linkGoogle(existing.id, profile.googleId, profile.picture);
    const user = linked ?? existing;
    return res.json({ token: signToken(user), user: publicUser(user) });
  }

  const user: StoredUser = {
    id: store.newId(),
    email: profile.email,
    name: profile.name,
    company: null,
    role: (await store.countUsers()) === 0 ? 'admin' : 'recruiter',
    provider: 'google',
    picture: profile.picture,
    createdAt: new Date().toISOString(),
    googleId: profile.googleId,
  };

  await store.createUser(user);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(authed(req).user) });
});

/* ----------------------------------------------------------------- roles */

app.get('/api/roles', requireAuth, route(async (req, res) => {
  res.json({ roles: await store.listRoles(authed(req).user.id) });
}));

app.post('/api/roles', requireAuth, route(async (req, res) => {
  const { title, required } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'A role title is required.' });
  }
  if (typeof required !== 'string' || !required.trim()) {
    return res.status(400).json({ error: 'At least one required skill is needed.' });
  }

  const mustHave = Array.isArray(req.body.mustHave)
    ? (req.body.mustHave as string[]).map((m) => canonical(m)?.id ?? m).filter(Boolean)
    : [];

  const role = await store.saveRole(authed(req).user.id, { ...req.body, title, required, mustHave });
  res.json({ role });
}));

app.delete('/api/roles/:id', requireAuth, route(async (req, res) => {
  const ok = await store.deleteRole(authed(req).user.id, req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
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
  const analysis = analyze({ text: augmentedText, parsed, role, corpus });

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

app.post('/api/analyze', requireAuth, upload.array('resumes', 60), route(async (req, res) => {
  const userId = authed(req).user.id;
  const roleId = String(req.body.roleId ?? '');
  const role = await store.findRole(userId, roleId);
  if (!role) return res.status(400).json({ error: `Unknown role "${roleId}".` });

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) return res.status(400).json({ error: 'No files were uploaded.' });

  const corpus = await store.corpusFor(userId, role.id);
  const candidates: CandidateSummary[] = [];
  const failures: AnalyzeFailure[] = [];

  for (const file of files) {
    try {
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

  res.json({ analyzed: candidates.length, failed: failures.length, candidates, failures });
}));

app.get('/api/candidates', requireAuth, route(async (req, res) => {
  const roleId = typeof req.query.roleId === 'string' ? req.query.roleId : undefined;
  const list = await store.listCandidates(authed(req).user.id, roleId);
  res.json({ candidates: list.map(slim) });
}));

app.get('/api/candidates/:id', requireAuth, route(async (req, res) => {
  const candidate = await store.findCandidate(authed(req).user.id, req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });
  res.json({ candidate });
}));

app.patch('/api/candidates/:id', requireAuth, route(async (req, res) => {
  const patch: Partial<Candidate> = {};
  if (typeof req.body?.status === 'string') patch.status = req.body.status as Candidate['status'];
  if (typeof req.body?.note === 'string') patch.note = req.body.note;

  const updated = await store.updateCandidate(authed(req).user.id, req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Candidate not found.' });
  res.json({ candidate: slim(updated) });
}));

app.delete('/api/candidates/:id', requireAuth, route(async (req, res) => {
  const userId = authed(req).user.id;
  const candidate = await store.findCandidate(userId, req.params.id);
  if (candidate?.file?.storedName) {
    await fs.unlink(path.join(UPLOAD_DIR, candidate.file.storedName)).catch(() => {});
  }
  const ok = await store.deleteCandidate(userId, req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
}));

app.post('/api/candidates/clear', requireAuth, route(async (req, res) => {
  const roleId = typeof req.body?.roleId === 'string' ? req.body.roleId : undefined;
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
app.get('/api/candidates/:id/file', requireAuth, route(async (req, res) => {
  const candidate = await store.findCandidate(authed(req).user.id, req.params.id);
  if (!candidate?.file?.storedName) return res.status(404).json({ error: 'No file on record.' });

  const filePath = path.join(UPLOAD_DIR, candidate.file.storedName);
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
app.post('/api/roles/:id/rescore', requireAuth, route(async (req, res) => {
  const userId = authed(req).user.id;
  const role = await store.findRole(userId, req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found.' });

  const candidates = await store.listCandidates(userId, role.id);
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

  res.json({ ok: true, updated });
}));

/** Head-to-head comparison across a candidate set. */
app.post('/api/compare', requireAuth, route(async (req, res) => {
  const userId = authed(req).user.id;
  const roleId = String(req.body?.roleId ?? '');
  const role = await store.findRole(userId, roleId);
  if (!role) return res.status(400).json({ error: 'Unknown role.' });

  const all = await store.listCandidates(userId, roleId);
  const ids = req.body?.candidateIds as string[] | undefined;
  const selected = ids?.length ? all.filter((c) => ids.includes(c.id)) : all;
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

app.use((err: NodeJS.ErrnoException, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File exceeds the ${MAX_FILE_MB} MB limit.` });
  }
  if (err?.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({ error: 'Too many files in one batch (max 60).' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: err?.message || 'Unexpected server error.' });
});

const server = app.listen(PORT, () => {
  const g = gemini.geminiStatus();
  console.log(`\n  Resume Scanner API  →  http://localhost:${PORT}`);
  console.log(
    `  AI engine           →  ${g.enabled ? `Gemini (${g.extractModel} / ${g.reasonModel})` : 'local deterministic (no GEMINI_API_KEY set)'}`,
  );
  console.log(`  Uploads             →  ${SUPPORTED_EXTENSIONS.join(' ')}  ·  max ${MAX_FILE_MB} MB\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdownOcr().finally(() => server.close(() => process.exit(0)));
  });
}
