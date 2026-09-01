/**
 * Optional Gemini layer.
 *
 * Everything here is additive. With no GEMINI_API_KEY the app runs entirely on
 * the deterministic engine in parse.js / score.js; with a key, the LLM refines
 * structured extraction and writes the plain-English recommendation.
 *
 * Two rules hold throughout, both straight from the briefing:
 *   1. Every LLM response is schema-constrained and validated before use. A
 *      malformed response falls back to the local result instead of failing.
 *   2. Vision handles the scanned-PDF / photo case that has no text layer.
 *
 * Model ids are env-configurable because model names move faster than code.
 */

import type { Analysis, ParsedResume, Recommendation, Role } from '../../../shared/types.js';

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

export interface LlmExtraction {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  experienceYears?: number;
  summary?: string;
  skills: string[];
  roles?: { title: string; company?: string; start?: string; end?: string }[];
  education?: string[];
  achievements?: string[];
}

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

const MODEL_EXTRACT = process.env.GEMINI_EXTRACT_MODEL || 'gemini-flash-lite-latest';
const MODEL_REASON = process.env.GEMINI_REASON_MODEL || 'gemini-flash-latest';
const MODEL_EMBED = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';

export function geminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function geminiStatus() {
  return {
    enabled: geminiEnabled(),
    extractModel: MODEL_EXTRACT,
    reasonModel: MODEL_REASON,
    embedModel: MODEL_EMBED,
  };
}

/** Statuses that mean "try again shortly", not "your request was wrong". */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(
  model: string,
  body: unknown,
  { timeoutMs = 45000, attempts = 3 }: { timeoutMs?: number; attempts?: number } = {},
): Promise<GeminiResponse> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_ROOT}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) return (await res.json()) as GeminiResponse;

      const detail = await res.text().catch(() => '');
      lastError = new Error(`Gemini ${res.status}: ${detail.slice(0, 200)}`);

      // 503 "high demand" and 429 rate limits clear on their own; a 400 never
      // will, so retrying it just wastes the caller's time.
      if (!RETRYABLE.has(res.status) || attempt === attempts) throw lastError;

      // Exponential backoff with jitter, so a whole batch does not retry in lockstep.
      const backoff = 400 * 2 ** (attempt - 1) + Math.random() * 300;
      console.warn(`[gemini] ${model} ${res.status}, retrying in ${Math.round(backoff)}ms (${attempt}/${attempts - 1})`);
      await sleep(backoff);
    } catch (err) {
      lastError = err as Error;
      // An abort is our own timeout firing; treat it as retryable too.
      const retryable = lastError.name === 'AbortError';
      if (!retryable || attempt === attempts) throw lastError;
      await sleep(400 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error('Gemini request failed');
}

function firstText(response: GeminiResponse): string {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('').trim();
}

/** Parse JSON defensively — models occasionally wrap output in a code fence. */
function safeJson(raw: string): unknown {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    title: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    location: { type: 'string' },
    experienceYears: { type: 'number' },
    summary: { type: 'string' },
    skills: { type: 'array', items: { type: 'string' } },
    roles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          company: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' },
        },
        required: ['title'],
      },
    },
    education: { type: 'array', items: { type: 'string' } },
    achievements: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'skills'],
};

const EXTRACT_PROMPT = `You are a resume parser for an applicant tracking system.
Extract structured fields from the resume below. Rules:
- Use only what the document states. Never invent an employer, date or skill.
- "experienceYears" is total professional experience in years as a number; if
  concurrent roles overlap, count the elapsed calendar time once. Use 0 if unclear.
- "skills" are concrete technologies, tools and methodologies. Normalise to the
  common name ("JS" -> "JavaScript"). Exclude generic filler like "hard working".
- "achievements" are bullets that state a measurable outcome, quoted verbatim.
- Return an empty string or empty array for anything not present.`;

/** LLM structured extraction from plain text. Returns null on any failure. */
export async function extractStructured(text: string): Promise<LlmExtraction | null> {
  if (!geminiEnabled()) return null;
  try {
    const res = await call(MODEL_EXTRACT, {
      contents: [{ role: 'user', parts: [{ text: `${EXTRACT_PROMPT}\n\n--- RESUME ---\n${text.slice(0, 24000)}` }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA,
      },
    });
    const parsed = safeJson(firstText(res)) as LlmExtraction | null;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.skills)) return null;
    return parsed;
  } catch (err) {
    console.warn('[gemini] extraction failed, using local parser:', (err as Error).message);
    return null;
  }
}

/**
 * Vision path for scans and photos: send the file bytes directly and ask for
 * the raw text back. This is what rescues a resume with no text layer.
 */
export async function extractFromFile(base64: string, mimeType: string): Promise<string | null> {
  if (!geminiEnabled()) return null;
  try {
    const res = await call(MODEL_EXTRACT, {
      contents: [{
        role: 'user',
        parts: [
          { text: 'Transcribe every word of this resume as plain text. Preserve the reading order, section headings and bullet structure. Output only the transcription, no commentary.' },
          { inlineData: { mimeType, data: base64 } },
        ],
      }],
      generationConfig: { temperature: 0 },
    }, { timeoutMs: 90000 });
    const text = firstText(res);
    return text && text.length > 40 ? text : null;
  } catch (err) {
    console.warn('[gemini] vision extraction failed:', (err as Error).message);
    return null;
  }
}

const RECOMMENDATION_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['strong_match', 'possible_match', 'weak_match'] },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
    interviewQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'confidence', 'summary', 'strengths', 'concerns'],
};

/**
 * The explainability layer: why this candidate, in plain English, alongside the
 * model's own confidence — deliberately separate from the vector similarity.
 */
export async function recommend({ role, parsed, analysis }: {
  role: Role;
  parsed: ParsedResume;
  analysis: Analysis;
}): Promise<Recommendation | null> {
  if (!geminiEnabled()) return null;

  const brief = {
    role: {
      title: role.title,
      minYears: role.minYears,
      required: role.requiredSkills.map((s) => s.label),
      mustHave: role.requiredSkills.filter((s) => (role.weights[s.id] ?? 1) >= 3).map((s) => s.label),
      description: role.description?.slice(0, 1200),
    },
    candidate: {
      name: parsed.name,
      experienceYears: parsed.experienceYears,
      roles: parsed.roles?.slice(0, 6),
      education: parsed.education?.entries?.map((e: { text: string }) => e.text).slice(0, 3),
      achievements: parsed.achievements?.slice(0, 6),
    },
    computed: {
      matchedSkills: analysis.skills.matched.map((s) => s.label),
      missingSkills: analysis.skills.missing.map((s) => s.label),
      additionalSkills: analysis.skills.additional.slice(0, 12).map((s) => s.label),
      atsScore: analysis.atsScore,
      similarity: analysis.similarity,
      experienceFit: analysis.experienceFit.note,
    },
  };

  // The reasoning model carries the most demand and is the first to shed load.
  // Flash-Lite produces a slightly plainer write-up but is far more available,
  // so it stands in rather than dropping the recommendation entirely.
  const chain = [MODEL_REASON, MODEL_EXTRACT].filter(
    (m, i, all) => all.indexOf(m) === i,
  );

  for (const model of chain) {
  try {
    const res = await call(model, {
      contents: [{
        role: 'user',
        parts: [{
          text: `You are advising a recruiter screening candidates. Using ONLY the evidence below, write a hiring recommendation.

Rules:
- Ground every claim in the supplied evidence. Never assert a skill that is not in matchedSkills or additionalSkills.
- "confidence" is 0..1: how much you trust this assessment given the evidence quality. Say low when the resume is thin or the evidence is only a keyword list.
- "summary" is 2-3 sentences a recruiter can paste into a hiring channel.
- "concerns" must be specific and actionable, not generic hedging.
- "interviewQuestions" are 3 questions that probe the riskiest gaps.

EVIDENCE:
${JSON.stringify(brief, null, 2)}`,
        }],
      }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: RECOMMENDATION_SCHEMA,
      },
    });

    const out = safeJson(firstText(res)) as Recommendation | null;
    if (!out || typeof out.summary !== 'string' || !Array.isArray(out.strengths)) continue;
    return {
      ...out,
      confidence: Math.max(0, Math.min(1, Number(out.confidence) || 0)),
      source: model,
    };
  } catch (err) {
    console.warn(`[gemini] recommendation via ${model} failed:`, (err as Error).message);
    // Fall through to the next model in the chain.
  }
  }

  return null;
}

/** Real embeddings; the local TF-IDF cosine is the fallback when unavailable. */
export async function embed(text: string): Promise<number[] | null> {
  if (!geminiEnabled()) return null;
  try {
    // Non-null is safe: geminiEnabled() above already proved the key is set.
    const key = process.env.GEMINI_API_KEY!;
    const res = await fetch(`${API_ROOT}/models/${MODEL_EMBED}:embedContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        model: `models/${MODEL_EMBED}`,
        content: { parts: [{ text: text.slice(0, 20000) }] },
        taskType: 'SEMANTIC_SIMILARITY',
      }),
    });
    if (!res.ok) throw new Error(`embed ${res.status}`);
    const json = (await res.json()) as { embedding?: { values?: number[] } };
    const values = json?.embedding?.values;
    return Array.isArray(values) ? values : null;
  } catch (err) {
    console.warn('[gemini] embedding failed:', (err as Error).message);
    return null;
  }
}

export function cosine(a: number[] | null, b: number[] | null): number | null {
  if (!a || !b || a.length !== b.length) return null;
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma += a[i] * a[i];
    mb += b[i] * b[i];
  }
  return ma && mb ? dot / (Math.sqrt(ma) * Math.sqrt(mb)) : null;
}
