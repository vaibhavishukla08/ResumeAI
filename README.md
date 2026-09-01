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

## Authentication and account security

**Sessions are server-side and opaque.** The credential is a 256-bit random
value in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production); only its
SHA-256 digest is stored. Page scripts cannot read it, and no auth secret ever
appears in a response body. Two clocks bound every session: a **2-hour idle
timeout** that activity slides forward, and a **7-day absolute cap** that
nothing extends. Because the server holds the record, revocation is immediate —
logout, password change and reset all kill sessions on the spot.

**Passwords** are bcrypt at cost 12, with transparent rehashing when an older,
cheaper hash is seen at login. Minimum length 10; common passwords and any
password containing the account's own name or email are rejected. Length is
enforced rather than character classes, which mostly produce `Passw0rd!`.

**Email verification** is required. Registration creates the account but grants
no session; data routes stay closed behind `requireVerified` until the emailed
link is followed. Tokens are 256-bit, stored hashed, single-use, and expire in
**24 hours**.

**Password reset** tokens are 256-bit, stored hashed, single-use, and expire in
**1 hour**. A successful reset revokes every existing session, clears any
lockout, and emails a notification.

**Rate limiting** runs in two independent layers: per-IP (10 logins / 15 min,
5 registrations or resets / hour) and per-account (5 consecutive failures →
15-minute lockout). The second stops a distributed attack that rotates IPs
against one inbox — the first alone would not.

**No user enumeration.** Registering an address that already exists returns the
same body and status as a fresh signup, and mails the real owner instead.
`forgot-password` always answers identically. Login runs a dummy bcrypt compare
when no account matches, so a miss costs the same as a wrong password —
measured at 457 ms vs 463 ms, against roughly 1 ms vs 460 ms before.

**CSRF** uses a double-submit token. `SameSite=Lax` already blocks cross-site
POSTs, but `/api/analyze` is `multipart/form-data` — a "simple" content type a
cross-origin form can submit without a preflight — so the header check is what
actually closes that path. Anonymous callers are issued a token so login itself
is protected, and it rotates on sign-in to defeat session fixation.

**Google Sign-In** verifies the ID token against Google's signing keys
(`google-auth-library`) — signature, issuer, audience, expiry — never a bare
decode. `email_verified` must be true. If the address already has a password
account the identity is linked rather than duplicated.

**Production refuses to start** without `SESSION_SECRET` and `APP_URL`. A server
that quietly generates its own secret looks healthy while every restart
invalidates sessions.

**Every account is its own workspace, and ownership is enforced in the data
layer.** Every query function that touches tenant data takes `userId` as its
first argument and filters on it, so a handler cannot ask for a record by id
alone — the unsafe query is not expressible. No route derives `userId` from
request input; it always comes from the resolved session.

Two patterns matter for IDOR specifically:

- Where a client supplies ids in bulk (`POST /api/compare`), the handler loads
  the caller's own set first and **intersects** it with the supplied ids, rather
  than fetching by id and checking afterwards. A foreign id matches nothing.
- A miss returns **404, never 403**. Distinguishing "does not exist" from
  "exists but is not yours" is itself an information leak.

`GET /api/candidates/:id/file` additionally asserts that the resolved path stays
inside the upload directory. `storedName` is server-generated and never user
input, so it cannot traverse today — the check is there so it still cannot if a
future import path or a tampered datastore ever puts a relative segment in that
field. Verified: planting `../../../../etc/passwd` yields 400 and a logged
`[security] blocked path escape`, not the file.

### Known limits

- Rate-limit counters are in-process. Correct for one node; behind several
  instances they no longer add up — move the bucket map to Redis at that point.
- Mail has no bundled provider. Without `MAIL_WEBHOOK_URL` links are printed to
  the server log, which is right for development and must be configured before
  real users exist.
- There is no second factor. That is the next thing I would add.
- Ownership is enforced by the store's signatures rather than by the type
  system. A `UserScopedId` branded type would make a missing check a compile
  error instead of a convention; worth doing if this grows more endpoints.

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
  src/lib/auth.ts     hashing, guards, lockout, validation, Google verify
  src/lib/sessions.ts Opaque server-side sessions and cookie handling
  src/lib/tokens.ts   Single-use hashed tokens for verification and reset
  src/lib/ratelimit.ts Per-IP and per-account limiting
  src/lib/mailer.ts   Verification and reset mail, logs when unconfigured
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
| `POST` | `/api/auth/register` | Create an account; sends a confirmation email |
| `POST` | `/api/auth/login` | Sign in; sets the session cookie |
| `POST` | `/api/auth/google` | Exchange a Google ID token for a session |
| `POST` | `/api/auth/logout` | Revoke this session |
| `POST` | `/api/auth/logout-all` | Revoke every session for the account |
| `GET` | `/api/auth/sessions` | List active sessions |
| `POST` | `/api/auth/verify-email` | Confirm an address with an emailed token |
| `POST` | `/api/auth/resend-verification` | Reissue a confirmation link |
| `POST` | `/api/auth/forgot-password` | Request a reset link |
| `POST` | `/api/auth/reset-password` | Set a new password from a reset token |
| `POST` | `/api/auth/change-password` | Change password while signed in |
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

## Input validation

Every value from a client passes through `server/src/lib/validate.ts` before it
reaches storage or the filesystem. Each validator states the exact shape it
accepts and rejects everything else — a denylist is only ever as good as the
last attack somebody thought of.

**Three of the four classic injection classes do not apply here, and saying so
is more useful than pretending otherwise:**

- **SQL injection** — there is no SQL engine. The store is a JSON file queried
  with JavaScript array filters; nothing is concatenated into a query language.
- **Command injection** — the server never spawns a shell. No `child_process`,
  no `exec`.
- **Script injection** — React escapes every interpolation and the app uses no
  `dangerouslySetInnerHTML`.

What *did* apply was less exotic and entirely real. Each of these was confirmed
by exploiting it before the fix:

| Flaw | Before | After |
|---|---|---|
| `status` cast straight to the enum type | `<img src=x onerror=alert(1)>` stored | 400, `field: "status"` |
| `note` unbounded | 200 KB accepted | 400 over 5,000 chars |
| `{ ...req.body }` spread into role storage | client-chosen keys rode along | explicit field list |
| `candidateIds` elements unchecked | `[{"$ne":null}]` accepted | 400 |
| `roleId` unvalidated | `../../etc/passwd` reached the store | 400 |
| `minYears: "abc"` | `NaN` stored | 400 |
| Uploads checked by extension only | a script named `.pdf` reached the parser | magic-byte check, 400 |
| CSV export | `=cmd\|'/c calc'!A1` executed on open in Excel | prefixed, inert |

**Uploads** are verified by leading bytes, not by the extension the uploader
claims. A shell script named `.pdf`, HTML named `.png`, and random bytes named
`.jpg` are all refused before any parser sees them, and each refusal is logged
as `upload.signature_mismatch`. Filenames are reduced to a basename with
control characters stripped, so `../../../etc/passwd.txt` becomes `passwd.txt`.
Batch size is capped in total bytes, not only per file — sixty files at the
per-file limit was still 720 MB from one request.

**CSV formula injection** deserves its own note because it is easy to miss: a
resume is attacker-supplied data, and a candidate named `=cmd|'/c calc'!A1`
turns the export into a delivery mechanism the moment a recruiter opens it in
Excel. Cells beginning `=`, `+`, `-` or `@` are now prefixed so spreadsheets
treat them as literal text.

Rejections return **400 with the offending field name**, never a 500 — an
invalid input is the client's mistake, not a server fault.

---

## Abuse protection

Limits are keyed on the **account** when a request is authenticated and the
address otherwise, so one runaway script does not punish everyone behind a
shared office NAT. Every response carries `RateLimit-Limit`, `-Remaining` and
`-Reset`, so a well-behaved client can back off without guessing.

| Surface | Budget |
|---|---|
| Login | 10 / 15 min per IP **and** per account; 5 consecutive failures locks the account for 15 min |
| Registration | 5 / hour per IP; max 3 accounts per canonical mailbox per day |
| Password reset, resend | 5 / hour per IP |
| API overall | 600 / min per principal |
| Candidate listing | 120 / min · Comparison 60 / min · Document downloads 100 / min |
| Re-scoring | 6 / hour |
| **Analysis** | **200 resumes / hour**, plus a hard quota below |

**The AI path is budgeted per resume, not per request.** A request-based limit
is meaningless here — one call with sixty files is sixty extractions and up to a
hundred and twenty model calls. So `/api/analyze` charges its cost in resumes
against three independent controls: **500/day**, **150/hour**, and **2
concurrent batches** per account. The check runs *before* any work starts and is
all-or-nothing; a partially analysed batch would leave the user guessing which
resumes were processed. Verified: a 3-file batch against a 2/hour budget
returned 429 with **zero Gemini calls made** and the uploaded bytes deleted.

Re-scoring draws on the same budget, because it re-runs the model over every
candidate on the role.

### Stopping bots and scraping

The governing constraint is false positives. This is a B2B tool — people script
against it legitimately, sit behind corporate proxies, and use `curl` to debug.
Blocking every non-browser User-Agent would break honest integrations while
stopping no serious attacker, who will just send a Chrome string. So requests
are **scored, not classified**: a single oddity is logged and allowed, and only
combinations refuse.

| Control | Trigger | Verified |
|---|---|---|
| Crawler block | `googlebot`, `gptbot`, `ahrefsbot`, … | 429 on a Googlebot UA |
| ID enumeration | 12 misses on identifier routes in 5 min | probes 1–12 pass, 13 blocked |
| Bulk collection | 200 distinct records in 5 min | — |
| Machine cadence | median gap < 120 ms **and** scripted client shape | — |
| Honeypot | hidden `website_url` field is non-empty | 202 returned, **no account created** |
| Disposable email | ~20 known throwaway domains | 400 |
| Alias flooding | `a.l.e.x+tag@gmail.com` collapses to one mailbox | 4 signups → **3 accounts**, all 202 |

The honeypot and alias limiter both answer *exactly as a successful signup
does*. A script that learns which of its attempts were rejected adapts; one that
gets a uniform 202 does not.

---

## Deploying

```bash
node deploy/preflight.mjs     # refuses to pass on a weak or exposed config
npm run build
NODE_ENV=production npm start
```

`deploy/` holds a Caddyfile (automatic TLS), an nginx config, and a systemd unit
with the sandboxing directives that matter — read-only root, `ReadWritePaths`
limited to the two directories the app writes, no capabilities, `UMask=0077`.

**HTTPS.** Enforced whenever `NODE_ENV=production`. GET and HEAD are redirected
with a 308; other methods get a 403 rather than a redirect, because redirecting
a POST invites the client to replay the body over the insecure hop it just used.
Behind a proxy the original scheme is only known from `X-Forwarded-Proto`, which
is attacker-controlled unless `TRUST_PROXY` is set — so without it the check
falls back to the raw socket and fails closed. HSTS, a tight CSP,
`frame-ancestors 'none'` and `Permissions-Policy` ship on every response.

**Secret handling.** Every credential lives in `server/.env` — gitignored,
mode 600, never tracked. Nothing secret reaches the browser: verified by
building the bundle and grepping it for the Gemini key, the session secret and
the Google client ID (0 occurrences each). The Google **client ID** is fetched
at runtime from `/api/health` rather than inlined, so rotating it needs no
rebuild; it is public by design, and the client *secret* is never used by this
flow and exists nowhere in the tree.

`/api/health` reports engine detail — which models are configured, whether AI is
on — **only to authenticated callers**. Anonymous visitors get the Google client
ID and upload limits and nothing else, because model configuration is free
reconnaissance and of no use to someone who has not signed in.

Two repeatable checks guard against regression:

```bash
npm run scan:secrets              # working tree
node deploy/scan-secrets.mjs --history   # every commit ever made
```

The scanner matches on **provider credential shapes**, not variable names, so it
catches a key pasted into a comment or a fixture. It is wired into
`deploy/preflight.mjs` and into a pre-commit hook (`git config core.hooksPath
.githooks`) that blocks a commit before the key can reach history — verified by
attempting to commit a real-shaped Google key and having it refused.

If a key ever *is* committed, rotating it is the fix. Deleting the file does not
help: the blob stays in history and in every clone.

**Configuration.** Resolved once at startup by `config.ts`, which **refuses to boot**
in production if `SESSION_SECRET` or `APP_URL` is missing, if the secret is a
known placeholder, shorter than 32 characters, or has too few distinct
characters. Verified: a config with `SESSION_SECRET=changeme` and an `http://`
APP_URL exits 1 with three named problems. Nothing secret is ever logged —
`logger.ts` redacts by key name *and* by value shape (Google keys, JWTs, bcrypt
hashes), so a secret that reaches a log line through an unexpected path is still
masked.

**Network exposure.** In production the API binds `127.0.0.1` by default and
`0.0.0.0` is refused unless `ALLOW_PUBLIC_BIND=1`. Verified: a production boot
listens on `127.0.0.1:5199` with nothing on the public interface. The reverse
proxy is the only way in.

**Data at rest.** There is no database server to firewall — the datastore is a
JSON file on local disk. The equivalent control is filesystem permissions, so
the app forces `server/data` and `server/uploads` to `0700` and any file inside
them to `0600` at startup, and warns if `.env` is readable beyond its owner. The
nginx config additionally denies `/data`, `/uploads` and `/.env` as defence in
depth. *When you move to Postgres + pgvector*, that is the point at which
network isolation becomes the real control: bind the database to a private
subnet or unix socket, never a public interface, and reach it over TLS with a
least-privilege role that owns only this schema.

**Logging and detection.** One JSON object per line in production. Every request
carries an `X-Request-Id` that appears in the access log, any error line, and
every auth event, so a user report ties back to the exact failure. Errors are
logged with the stack and returned to the client as `{error, requestId}` only —
stacks and dependency versions stay server-side.

Authentication events are recorded on a dedicated `security` channel:
`login.success/failure/locked/unverified`, registration, verification, reset,
password change, logout, session and CSRF rejections. Addresses are masked
(`vi****@idor.test`) and carry a stable fingerprint so attempts against one
account correlate without the log becoming a mailing list.

Three detectors watch for what a single event cannot show:

| Detector | Fires when | Catches |
|---|---|---|
| `anomaly.credential_stuffing` | one IP fails against 5+ distinct accounts in 10 min | one host working a breach list |
| `anomaly.failure_burst` | 20+ failures from one IP in 10 min | brute force |
| `anomaly.distributed_attack` | one account attacked from 5+ IPs | password spraying that per-IP limits miss |
| `anomaly.new_source_for_account` | successful login from an unseen IP | account takeover, after the fact |

Verified end to end: seven logins against seven accounts from one source
produced `anomaly.credential_stuffing {"distinctAccounts":5,...}`, and a scan of
the whole log found **zero** occurrences of any test password or unmasked address.

### Known limits

- Detector and rate-limit state is in-process. Correct for one node; on several,
  each instance sees only its slice — ship these events to a central collector
  and correlate there.
- `SECURITY_LOG_FILE` appends without rotation. Point it at a path logrotate
  manages, or rely on the journal.
- Rate-limit, quota and detector state are all in-process. On more than one node
  each instance enforces its own slice of every budget — move the counters to
  Redis before scaling out, or the effective limits multiply by the node count.

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
