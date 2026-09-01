# ResumeAI — Resume Screening & Candidate Ranking

**Full-stack TypeScript.** Upload resumes as **PDF, photo/scan, DOCX or TXT**, score
each one against a job role, and compare an entire candidate pool by skills and ATS
score. Accounts are real: bcrypt password hashing, JWT sessions, and per-account
workspace isolation.

The design is rooted in the Stitch project *Resume Insight Analyzer* — its indigo/navy
Material 3 palette, Plus Jakarta Sans / Inter type ramp and 4/8/16/24/40px spacing
scale — evolved with gradient accents, more breathing room and a motion system.
Light and dark both ship.

---

## Quick start

```bash
npm run install:all && npm run dev
```

Then open **http://localhost:5173** and create an account. The API runs on 5174; Vite
proxies `/api` to it, so there is no CORS step.

No API key is required. The app ships with a deterministic analysis engine and works
fully offline. The **first account you register becomes the admin**.

---

## The three scores

The central design decision is that **three different numbers mean three different
things**, and collapsing them into one would hide the disagreement that makes the
tool useful.

| Score | Nature | What it measures |
|---|---|---|
| **Similarity** | Objective | Cosine distance between the resume and the job description. Pure geometry — language overlap and nothing else. |
| **Confidence** | Subjective | How much to *trust* the match: were skills shown in context or only listed, does seniority fit, did the document parse cleanly. |
| **ATS score** | Hygiene | How well the document survives a conventional keyword-and-format ATS pass — contact details, structure, length, machine readability, quantified impact. |

The disagreements are the signal:

- **High similarity + low confidence** → a keyword-stuffed resume.
- **High ATS + low similarity** → a well-built resume for the wrong role.

A verified example from the bundled fixtures: an ML engineer scored against a
*Senior Frontend Engineer* role earns **ATS 58** (a clean, well-structured document)
but **overall 20** with 0/10 required skills. Against the *AI/ML Engineer* role the
same resume scores **81**. Nothing about the resume changed — only what it was
measured against.

---

## Accounts and data isolation

Registration and sign-in are real, not a demo gate:

- **Email + password**, or **Continue with Google** when configured.

- Passwords hashed with **bcrypt** (10 rounds); the hash never leaves the server.
- **JWT** bearer sessions, 7-day expiry. Set `JWT_SECRET` in `server/.env` before
  deploying — without it the server generates a random secret per boot, so every
  restart signs everyone out.
- Login failures return an identical message for "wrong password" and "no such
  account", so the endpoint cannot be used to enumerate registered emails.
- **Google Sign-In** verifies the ID token locally against Google's signing keys
  (`google-auth-library`), checking signature, issuer, audience and expiry — never a
  bare JWT decode. Unverified Google emails are rejected. If the email already has a
  password account, the Google identity is linked to it rather than creating a
  duplicate; that account can then use either route.
- **Every account is its own workspace.** Roles, candidates and uploaded files are
  scoped by `userId` inside `store.ts` rather than in the route handlers, so a
  forgotten filter in a handler cannot leak another account's data. Verified: a
  second account sees zero candidates, and gets a 404 fetching another user's
  candidate or resume file by direct id.

---

## Features

**Ingestion**
- Batch upload up to 60 files at once, drag-and-drop
- PDF text-layer extraction (`pdf-parse`)
- OCR for photos and scans (`tesseract.js`) — verified at 94% confidence on a
  rendered resume image, producing a score within 1 point of the text original
- DOCX (`mammoth`) and plain text
- Scanned PDFs with no text layer are detected and reported as a warning card,
  never a 500

**Analysis**
- ~90-skill taxonomy with alias folding (`JS` → `JavaScript`, `k8s` → `Kubernetes`)
  and longest-match-first scanning so `React Native` never collapses into `React`
- Required-vs-detected skill comparison, with must-have skills weighted 3×
- Evidence snippets: hover a matched skill to see the sentence it came from
- Experience derived from merged date ranges, so concurrent roles are not
  double-counted
- Six-dimension ATS breakdown, each dimension individually explained

**Screening**
- Filter by overall / ATS / confidence / coverage thresholds, experience band,
  required and excluded skills, education level, status, and extraction health
- Sort by any metric
- Bulk shortlist / reject, CSV export

**Comparison**
- Skill matrix: candidates as columns, required skills as rows, mention counts per cell
- Metric charts across the pool
- Pool gaps: which required skills the shortlist is scarcest on
- Profile overlap heatmap — high overlap means interchangeable candidates

---

## Optional: enable Google Sign-In

Leave it unset and the button is hidden entirely — email and password still work.

1. <https://console.cloud.google.com/apis/credentials>
2. **Create Credentials → OAuth client ID → Web application**
3. Authorised JavaScript origins: `http://localhost:5173` (plus your production origin)
4. Put the **Client ID** in `server/.env` as `GOOGLE_CLIENT_ID` and restart

The client *secret* is not used by this flow and should not be added.

---

## Optional: enable Gemini

Everything above works without a key. Adding one upgrades three things:
LLM structured extraction, written recommendations with interview questions, and
vision-based OCR for scans.

```bash
cp server/.env.example server/.env
# add GEMINI_API_KEY=... (free key at https://aistudio.google.com/apikey)
```

Restart the server. The dashboard badge flips from **Local engine** to
**Gemini engine**.

Every LLM response is schema-constrained and validated before use; a malformed or
missing response falls back to the local result rather than failing the batch.
Model ids are env-overridable (`GEMINI_EXTRACT_MODEL`, `GEMINI_REASON_MODEL`,
`GEMINI_EMBED_MODEL`) because model names move faster than code.

---

## Project layout

```
shared/
  types.ts            The API contract, imported by BOTH sides — change a shape
                      here and it type-errors on the server and client at once.

server/                          (Express + TypeScript, run with tsx)
  src/index.ts        Routes, auth guards, upload pipeline
  src/lib/auth.ts     bcrypt hashing, JWT signing, requireAuth middleware
  src/lib/skills.ts   Taxonomy, alias folding, text scanning
  src/lib/parse.ts    Structured extraction (name, dates, roles, education)
  src/lib/score.ts    Similarity, confidence, ATS breakdown, insights
  src/lib/extract.ts  PDF / OCR / DOCX text extraction
  src/lib/gemini.ts   Optional LLM layer — additive, never required
  src/lib/store.ts    JSON persistence, user-scoped

client/                          (React 18 + Vite + TypeScript)
  tailwind.config.ts  Design tokens + motion system
  src/index.css       Both palettes as CSS variables, component layer
  src/context/        Auth and toast providers
  src/components/     Gauge, skill match, filters, preview, rows
  src/pages/          Auth, Dashboard, Candidates, Analysis, Compare, Roles, Settings
```

Typecheck both sides with `npm run typecheck`.

### Swapping in Postgres + pgvector

`lib/store.js` is the only file that touches persistence, and its exported surface
(`findRole`, `listCandidates`, `corpusFor`, …) is the shape a Supabase adapter
would expose. `cosineSimilarity` in `lib/score.js` takes the same arguments a
pgvector `<=>` query would, and `gemini.embed()` already returns real embedding
vectors when a key is set. Moving to pgvector is a change to those two files.

---

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account, returns a JWT |
| `POST` | `/api/auth/login` | Sign in, returns a JWT |
| `POST` | `/api/auth/google` | Exchange a Google ID token for a JWT |
| `GET` | `/api/auth/me` | Current user from the bearer token |
| `GET` | `/api/health` | Engine status, limits, accepted formats |
| `GET` | `/api/roles` | List roles with hydrated skill requirements |
| `POST` | `/api/roles` | Create or update a role |
| `POST` | `/api/roles/:id/rescore` | Re-score every candidate after requirements change |
| `POST` | `/api/analyze` | Multipart batch upload and analysis |
| `GET` | `/api/candidates?roleId=` | Ranked candidates (without raw text) |
| `GET` | `/api/candidates/:id` | One candidate, including extracted text |
| `GET` | `/api/candidates/:id/file` | Original file, for the preview pane |
| `PATCH` | `/api/candidates/:id` | Update status |
| `POST` | `/api/compare` | Skill matrix, scarcity, pairwise overlap |

---

## Sample data

`samples/` holds six fictional resumes covering the interesting cases — a strong
match, a partial match, a thin resume, and a well-formatted resume for the wrong
role — plus a real PDF and a bitmap image for testing extraction and OCR. See
`samples/README.md`.

---

## Notes

- Uploaded resumes and `server/data/db.json` hold real candidate data and are
  gitignored.
- `/api/candidates/:id/file` now requires a valid bearer token and only serves files
  belonging to the requesting account.
- Set `JWT_SECRET` before deploying. Everything else runs unconfigured.
