/**
 * Scoring engine.
 *
 * The briefing's central design point is that two different numbers are shown
 * separately because they mean different things:
 *
 *   similarity  — objective. Cosine distance between the resume vector and the
 *                 job-description vector. No judgement, just geometry.
 *   confidence  — subjective. How much we trust the match given evidence
 *                 quality: how the skills were mentioned, seniority fit,
 *                 whether the document parsed cleanly.
 *
 * `atsScore` is the third, recruiter-facing number: how well this resume would
 * survive a conventional keyword-and-format ATS pass. It is deliberately NOT
 * the same as similarity — a beautifully formatted resume for the wrong job
 * scores high on ATS hygiene and low on similarity, and the UI shows both.
 */

import { extractSkills } from './skills.js';
import type {
  Analysis,
  Band,
  BreakdownItem,
  ConfidenceSignal,
  DetectedSkill,
  ExperienceFit,
  Insight,
  MatchedSkill,
  MissingSkill,
  ParsedResume,
  RequiredSkill,
  Role,
} from '../../../shared/types.js';

interface SkillMatchResult {
  matched: MatchedSkill[];
  missing: MissingSkill[];
  additional: DetectedSkill[];
  coverage: number;
  matchedCount: number;
  requiredCount: number;
}

const STOPWORDS = new Set(
  `a an the and or but if then than that this these those of in on at to for with without from by as is are was
   were be been being have has had do does did will would shall should can could may might must not no nor so
   such own same too very s t just don now i me my we our you your he him his she her it its they them their what
   which who whom when where why how all any both each few more most other some only over under again further
   here there once about against between into through during before after above below up down out off`
    .split(/\s+/)
    .filter(Boolean),
);

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[-.]+|[-.]+$/g, ''))
    .filter((t) => t.length > 1 && t.length < 30 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/** Term-frequency map with sublinear scaling, which damps keyword stuffing. */
function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  for (const [k, v] of tf) tf.set(k, 1 + Math.log(v));
  return tf;
}

/**
 * Cosine similarity over TF-IDF vectors.
 *
 * `corpus` is the set of all documents in the batch, used for the IDF term so
 * that words common to every resume (e.g. "experience") carry little weight.
 * This is the local stand-in for gemini-embedding-001 + pgvector `<=>`; the
 * shape of the API is identical so swapping in real embeddings is a drop-in.
 */
export function cosineSimilarity(textA: string, textB: string, corpus: string[] = []): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (!tokensA.length || !tokensB.length) return 0;

  const docs = [tokensA, tokensB, ...corpus.map(tokenize)];
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) df.set(term, (df.get(term) || 0) + 1);
  }
  const N = docs.length;
  const idf = (term: string): number => Math.log((N + 1) / ((df.get(term) || 0) + 1)) + 1;

  const tfA = termFreq(tokensA);
  const tfB = termFreq(tokensB);

  let dot = 0;
  let magA = 0;
  let magB = 0;
  const vocab = new Set([...tfA.keys(), ...tfB.keys()]);
  for (const term of vocab) {
    const w = idf(term);
    const a = (tfA.get(term) || 0) * w;
    const b = (tfB.get(term) || 0) * w;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Match the role's required skills against the skills detected in the resume.
 * Weights let a recruiter mark a skill as must-have (weight 3) vs nice-to-have.
 */
export function matchSkills(
  requiredSkills: RequiredSkill[],
  detectedSkills: DetectedSkill[],
  weights: Record<string, number> = {},
): SkillMatchResult {
  const detectedById = new Map(detectedSkills.map((s) => [s.id, s]));

  const matched: MatchedSkill[] = [];
  const missing: MissingSkill[] = [];
  let earned = 0;
  let possible = 0;

  for (const req of requiredSkills) {
    const weight = weights[req.id] ?? 1;
    possible += weight;
    const hit = detectedById.get(req.id);
    if (hit) {
      // Repeated mentions across the document are weak evidence of depth.
      const depth = Math.min(1, 0.6 + 0.2 * Math.min(hit.mentions - 1, 2));
      earned += weight * depth;
      matched.push({ ...req, weight, mentions: hit.mentions, evidence: hit.evidence, depth });
    } else {
      missing.push({ ...req, weight });
    }
  }

  // Skills the candidate has that the role never asked for.
  const requiredIds = new Set(requiredSkills.map((r) => r.id));
  const additional = detectedSkills
    .filter((s) => !requiredIds.has(s.id))
    .slice(0, 24);

  return {
    matched,
    missing,
    additional,
    coverage: possible ? earned / possible : 0,
    matchedCount: matched.length,
    requiredCount: requiredSkills.length,
  };
}

/**
 * ATS hygiene sub-scores. Each returns 0..1 and carries a weight; the UI
 * renders the breakdown so a low score is always explainable.
 */
function atsBreakdown(parsed: ParsedResume, skillMatch: SkillMatchResult, text: string): BreakdownItem[] {
  const c = parsed.contact;
  const contactPoints =
    (c.email ? 0.5 : 0) + (c.phone ? 0.25 : 0) + (c.linkedin || c.github || c.website ? 0.25 : 0);

  const s = parsed.sections;
  const sectionPoints =
    (s.hasExperience ? 0.4 : 0) +
    (s.hasSkills ? 0.25 : 0) +
    (s.hasEducation ? 0.2 : 0) +
    (s.hasSummary || s.hasProjects ? 0.15 : 0);

  // ATS parsers choke on very short and very long documents alike.
  const wc = parsed.wordCount;
  let lengthScore: number;
  if (wc < 150) lengthScore = wc / 150 * 0.5;
  else if (wc <= 850) lengthScore = 1;
  else if (wc <= 1200) lengthScore = 0.85;
  else lengthScore = 0.6;

  // Tables, columns and glyph soup show up as long runs without whitespace or
  // as an unusual ratio of non-alphanumeric characters.
  const nonAlpha = (text.match(/[^\w\s]/g) || []).length / Math.max(text.length, 1);
  const oddRuns = (text.match(/\S{45,}/g) || []).length;
  const parseability = Math.max(0, Math.min(1, 1 - Math.max(0, nonAlpha - 0.12) * 3 - oddRuns * 0.05));

  const achievementScore = Math.min(1, parsed.achievements.length / 4);

  return [
    { key: 'Skill coverage', weight: 0.34, score: skillMatch.coverage, detail: `${skillMatch.matchedCount}/${skillMatch.requiredCount} required skills found` },
    { key: 'Contact details', weight: 0.10, score: contactPoints, detail: c.email ? 'Email present' : 'No email detected' },
    { key: 'Section structure', weight: 0.16, score: sectionPoints, detail: sectionSummary(s) },
    { key: 'Length & density', weight: 0.10, score: lengthScore, detail: `${wc} words` },
    { key: 'Machine readability', weight: 0.16, score: parseability, detail: oddRuns ? `${oddRuns} unparseable run(s)` : 'Clean text layer' },
    { key: 'Quantified impact', weight: 0.14, score: achievementScore, detail: `${parsed.achievements.length} measurable result(s)` },
  ];
}

function sectionSummary(s: ParsedResume['sections']): string {
  const present = Object.entries({
    Experience: s.hasExperience, Skills: s.hasSkills, Education: s.hasEducation,
    Summary: s.hasSummary, Projects: s.hasProjects,
  }).filter(([, v]) => v).map(([k]) => k);
  return present.length ? present.join(', ') : 'No standard headings found';
}

/** Seniority fit: how the candidate's years line up with the role's window. */
function experienceFit(years: number | null, role: Role): ExperienceFit {
  const min = role.minYears ?? 0;
  const max = role.maxYears ?? null;
  if (years == null) return { score: 0.5, note: 'Experience length could not be determined' };
  if (years < min) {
    const gap = min - years;
    return { score: Math.max(0, 1 - gap / Math.max(min, 1)), note: `${gap.toFixed(1)}y below the ${min}y minimum` };
  }
  if (max != null && years > max) {
    const over = years - max;
    // Being over-qualified is a much smaller penalty than being under.
    return { score: Math.max(0.7, 1 - over / 20), note: `${over.toFixed(1)}y above the ${max}y band` };
  }
  return { score: 1, note: `${years}y fits the ${min}${max != null ? `–${max}` : '+'}y band` };
}

/**
 * Confidence — how much the similarity number should be trusted.
 * Low confidence with high similarity is the classic keyword-stuffed resume.
 */
function computeConfidence({ parsed, skillMatch, expFit, parseability, similarity }: {
  parsed: ParsedResume;
  skillMatch: SkillMatchResult;
  expFit: ExperienceFit;
  parseability: number;
  similarity: number;
}): { value: number; signals: ConfidenceSignal[] } {
  const signals: ConfidenceSignal[] = [];

  const mustHaves = skillMatch.matched.filter((m) => m.weight >= 3).length;
  const mustTotal = [...skillMatch.matched, ...skillMatch.missing].filter((m) => m.weight >= 3).length;
  if (mustTotal) {
    signals.push({ label: 'Must-have skills present', value: mustHaves / mustTotal, weight: 0.3 });
  }

  // Evidence quality: skills mentioned in context beat a bare comma list.
  const contextual = skillMatch.matched.filter((m) => m.mentions > 1).length;
  signals.push({
    label: 'Skills corroborated in context',
    value: skillMatch.matchedCount ? contextual / skillMatch.matchedCount : 0,
    weight: 0.2,
  });

  signals.push({ label: 'Seniority fit', value: expFit.score, weight: 0.2 });
  signals.push({ label: 'Document parsed cleanly', value: parseability, weight: 0.15 });
  signals.push({
    label: 'Quantified achievements',
    value: Math.min(1, parsed.achievements.length / 3),
    weight: 0.15,
  });

  const total = signals.reduce((sum, s) => sum + s.weight, 0);
  const raw = signals.reduce((sum, s) => sum + s.value * s.weight, 0) / total;

  // A very low similarity caps confidence: we cannot be confident about a
  // candidate the vector math says is unrelated to the role.
  const capped = Math.min(raw, 0.45 + similarity * 0.9);
  return { value: Math.max(0, Math.min(1, capped)), signals };
}

function band(score: number): Band {
  if (score >= 85) return { label: 'Excellent Match', tone: 'excellent' };
  if (score >= 70) return { label: 'High Match', tone: 'high' };
  if (score >= 50) return { label: 'Medium Match', tone: 'medium' };
  return { label: 'Low Match', tone: 'low' };
}

/** Deterministic, explainable recommendations. Replaced by Gemini when keyed. */
function buildInsights(
  parsed: ParsedResume,
  skillMatch: SkillMatchResult,
  expFit: ExperienceFit,
  breakdown: BreakdownItem[],
): Insight[] {
  const out: Insight[] = [];

  const criticalMissing = skillMatch.missing.filter((m) => m.weight >= 3);
  if (criticalMissing.length) {
    out.push({
      type: 'gap',
      title: 'Missing must-have skills',
      body: `No evidence of ${criticalMissing.map((m) => m.label).join(', ')}. These are weighted as must-have for this role — confirm in a screening call before rejecting, since they may be present under a different name.`,
    });
  }

  const otherMissing = skillMatch.missing.filter((m) => m.weight < 3).slice(0, 5);
  if (otherMissing.length) {
    out.push({
      type: 'gap',
      title: 'Nice-to-have gaps',
      body: `Not detected: ${otherMissing.map((m) => m.label).join(', ')}.`,
    });
  }

  if (parsed.achievements.length < 2) {
    out.push({
      type: 'suggestion',
      title: 'Impact is not quantified',
      body: 'Few measurable results found. Bullets read as responsibilities rather than outcomes, which weakens ranking against candidates who state numbers.',
    });
  } else {
    out.push({
      type: 'strength',
      title: 'Quantified impact present',
      body: `${parsed.achievements.length} measurable results, e.g. "${parsed.achievements[0].slice(0, 120)}"`,
    });
  }

  const weakest = [...breakdown].sort((a, b) => a.score - b.score)[0];
  if (weakest && weakest.score < 0.6) {
    out.push({
      type: 'suggestion',
      title: `Weakest ATS dimension: ${weakest.key}`,
      body: `${weakest.detail}. This is the single largest drag on the ATS score.`,
    });
  }

  if (expFit.score < 0.8) {
    out.push({ type: 'gap', title: 'Seniority mismatch', body: expFit.note });
  }

  const strong = skillMatch.matched.filter((m) => m.mentions >= 2).slice(0, 5);
  if (strong.length) {
    out.push({
      type: 'strength',
      title: 'Well-evidenced skills',
      body: `${strong.map((m) => `${m.label} (${m.mentions} mentions)`).join(', ')} appear repeatedly in context rather than only in a skills list.`,
    });
  }

  if (skillMatch.additional.length) {
    out.push({
      type: 'strength',
      title: 'Skills beyond the requirement',
      body: skillMatch.additional.slice(0, 8).map((s) => s.label).join(', '),
    });
  }

  return out;
}

/**
 * Full analysis for one resume against one role.
 * `corpus` is the other resumes in the batch, for IDF weighting.
 */
export function analyze({ text, parsed, role, corpus = [] }: {
  text: string;
  parsed: ParsedResume;
  role: Role;
  corpus?: string[];
}): Analysis {
  const detected = extractSkills(text);
  const skillMatch = matchSkills(role.requiredSkills, detected, role.weights);

  const jdText = [role.title, role.description, role.requiredSkills.map((s) => s.label).join(' ')]
    .filter(Boolean)
    .join('\n');
  const similarity = cosineSimilarity(text, jdText, corpus);

  const breakdown = atsBreakdown(parsed, skillMatch, text);
  const parseability = breakdown.find((b) => b.key === 'Machine readability')!.score;
  const atsScore = Math.round(
    breakdown.reduce((sum, b) => sum + b.score * b.weight, 0) * 100,
  );

  const expFit = experienceFit(parsed.experienceYears, role);
  const confidence = computeConfidence({ parsed, skillMatch, expFit, parseability, similarity });

  // The headline ranking number blends objective coverage with ATS hygiene,
  // leaning on skills because that is what the recruiter actually filters on.
  const overall = Math.round(
    Math.min(100,
      skillMatch.coverage * 55 +
      Math.min(similarity * 2.2, 1) * 20 +
      expFit.score * 12 +
      (atsScore / 100) * 13,
    ),
  );

  return {
    atsScore,
    similarity: Math.round(Math.min(1, similarity * 2.2) * 1000) / 1000,
    rawSimilarity: Math.round(similarity * 1000) / 1000,
    confidence: Math.round(confidence.value * 1000) / 1000,
    confidenceSignals: confidence.signals,
    overall,
    band: band(overall),
    breakdown,
    skills: {
      detected,
      matched: skillMatch.matched,
      missing: skillMatch.missing,
      additional: skillMatch.additional,
      coverage: Math.round(skillMatch.coverage * 1000) / 1000,
      matchedCount: skillMatch.matchedCount,
      requiredCount: skillMatch.requiredCount,
    },
    experienceFit: expFit,
    insights: buildInsights(parsed, skillMatch, expFit, breakdown),
  };
}
