/**
 * Structured extraction from raw resume text.
 *
 * This is the deterministic fallback that always runs. When a Gemini key is
 * configured the LLM result is merged on top of this (see gemini.js), but the
 * app never depends on the model being reachable — a malformed or missing LLM
 * response degrades to these values rather than failing the batch.
 */

import type {
  Contact,
  Education,
  EducationEntry,
  ParsedResume,
  ParsedRole,
} from '../../../shared/types.js';

const SECTION_HEADINGS: Record<string, RegExp> = {
  experience: /^\s*(work\s+)?(experience|employment|professional\s+experience|career\s+history)\s*:?\s*$/i,
  education: /^\s*(education|academic|qualifications)\s*:?\s*$/i,
  skills: /^\s*(technical\s+)?(skills|competencies|technologies|tech\s+stack)\s*:?\s*$/i,
  projects: /^\s*(projects|portfolio|selected\s+work)\s*:?\s*$/i,
  summary: /^\s*(summary|profile|objective|about)\s*:?\s*$/i,
};

const DEGREE_RE = /\b(ph\.?d|doctorate|m\.?tech|b\.?tech|m\.?sc|b\.?sc|m\.?s\.?|b\.?s\.?|b\.?e\.?|m\.?e\.?|mba|bca|mca|bachelor(?:'?s)?|master(?:'?s)?|associate(?:'?s)?)\b/i;

const DEGREE_RANK: { re: RegExp; level: Education['highestLevel']; rank: number }[] = [
  { re: /ph\.?d|doctorate/i, level: 'Doctorate', rank: 5 },
  { re: /m\.?tech|m\.?sc|m\.?s\.?\b|m\.?e\.?\b|mba|mca|master/i, level: 'Master', rank: 4 },
  { re: /b\.?tech|b\.?sc|b\.?s\.?\b|b\.?e\.?\b|bca|bachelor/i, level: 'Bachelor', rank: 3 },
  { re: /associate|diploma/i, level: 'Associate', rank: 2 },
];

// Non-capturing: this fragment is interpolated inside larger patterns whose
// group numbering the callers depend on.
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';

export function extractContact(text: string): Contact {
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/)?.[0] || null;
  const phone =
    text.match(/(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/)?.[0]?.trim() || null;
  const linkedin = text.match(/(?:linkedin\.com\/in\/)[\w-]+/i)?.[0] || null;
  const github = text.match(/(?:github\.com\/)[\w-]+/i)?.[0] || null;
  const website = text.match(/https?:\/\/(?!.*(?:linkedin|github))[\w.-]+\.[a-z]{2,}[^\s]*/i)?.[0] || null;
  return { email, phone, linkedin, github, website };
}

/**
 * Best-effort candidate name: the first short line that is not a heading, has
 * no digits or '@', and reads like 2-4 capitalised words.
 */
export function extractName(text: string, fallback = 'Unknown Candidate'): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 12);
  for (const line of lines) {
    if (line.length > 46 || line.length < 3) continue;
    if (/[@\d]|resume|curriculum|vitae|https?:/i.test(line)) continue;
    const words = line.replace(/[^A-Za-z\s.'-]/g, '').trim().split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    const capitalised = words.filter((w) => /^[A-Z]/.test(w)).length;
    if (capitalised >= Math.min(2, words.length)) {
      return words.join(' ');
    }
  }
  return fallback;
}

/** Split the document into known sections keyed by name. */
export function splitSections(text: string): Record<string, string> {
  const lines = text.split(/\r?\n/);
  const sections: Record<string, string[]> = {};
  let current = 'header';
  sections[current] = [];

  for (const line of lines) {
    let matched = null;
    for (const [name, re] of Object.entries(SECTION_HEADINGS)) {
      if (re.test(line)) { matched = name; break; }
    }
    if (matched) {
      current = matched;
      if (!sections[current]) sections[current] = [];
      continue;
    }
    (sections[current] ||= []).push(line);
  }

  return Object.fromEntries(
    Object.entries(sections).map(([k, v]) => [k, v.join('\n').trim()]),
  );
}

/**
 * Total years of professional experience.
 *
 * Strategy 1: an explicit claim ("6+ years of experience") wins outright.
 * Strategy 2: otherwise union the date ranges found in the experience section
 * so overlapping/concurrent roles are not double counted.
 */
export function extractExperienceYears(text: string): number | null {
  const explicit = text.match(/(\d{1,2})\s*\+?\s*years?\s+(?:of\s+)?(?:professional\s+|relevant\s+|industry\s+)?experience/i);
  if (explicit) {
    const n = parseInt(explicit[1], 10);
    if (n > 0 && n < 60) return n;
  }

  const ranges = extractDateRanges(text);
  if (!ranges.length) return null;

  // Merge overlapping intervals, then sum their spans.
  ranges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  const months = merged.reduce((sum, r) => sum + (r.end - r.start), 0);
  const years = months / 12;
  return years > 0 ? Math.round(years * 10) / 10 : null;
}

/** Date ranges expressed in absolute months since year 0, for easy arithmetic. */
function extractDateRanges(text: string): { start: number; end: number }[] {
  const now = new Date();
  const nowMonths = now.getFullYear() * 12 + now.getMonth();
  const out: { start: number; end: number }[] = [];

  const re = new RegExp(
    `(?:(${MONTH})\\.?\\s+)?(\\d{4})\\s*(?:-|–|—|to|through|until)\\s*(?:(${MONTH})\\.?\\s+)?(\\d{4}|present|current|now|ongoing)`,
    'gi',
  );

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Groups: 1 start month, 2 start year, 3 end month, 4 end year-or-"present".
    const startMonth = monthIndex(m[1]);
    const startYear = parseInt(m[2], 10);
    const endMonth = monthIndex(m[3]);
    const endToken = m[4].toLowerCase();

    if (startYear < 1960 || startYear > now.getFullYear() + 1) continue;

    const start = startYear * 12 + startMonth;
    let end;
    if (/present|current|now|ongoing/.test(endToken)) {
      end = nowMonths;
    } else {
      const endYear = parseInt(endToken, 10);
      if (endYear < startYear || endYear > now.getFullYear() + 1) continue;
      // Default an unspecified end month to December so a "2019 - 2021" range
      // reads as a full two years rather than zero.
      end = endYear * 12 + (m[3] ? endMonth : 11);
    }
    if (end > start) out.push({ start, end });
  }
  return out;
}

function monthIndex(token: string | undefined): number {
  if (!token) return 0;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const idx = months.indexOf(token.slice(0, 3).toLowerCase());
  return idx === -1 ? 0 : idx;
}

/** Individual roles, used to render the experience timeline. */
export function extractRoles(text: string): ParsedRole[] {
  const sections = splitSections(text);
  const body = sections.experience || text;
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const roles: ParsedRole[] = [];

  const dateRe = new RegExp(
    `(?:(${MONTH})\\.?\\s+)?(\\d{4})\\s*(?:-|–|—|to)\\s*(?:(${MONTH})\\.?\\s+)?(\\d{4}|present|current|now)`,
    'i',
  );

  for (let i = 0; i < lines.length && roles.length < 12; i++) {
    const line = lines[i];
    const dm = line.match(dateRe);
    if (!dm) continue;
    if (DEGREE_RE.test(line)) continue; // that's an education entry

    // The role title is whatever precedes the date on this line, or the line above.
    let title = line.slice(0, dm.index).replace(/[|•\-–—,]+\s*$/, '').trim();
    let company = '';
    if (!title && i > 0) title = lines[i - 1].replace(/[|•\-–—,]+\s*$/, '').trim();

    // "Senior Engineer at TechCorp" / "Senior Engineer | TechCorp" /
    // "Senior Engineer, TechCorp" — the comma and pipe forms carry no leading
    // space, so they cannot share the word-separator branch.
    const split = title.split(/\s*(?:,|\||•)\s+|\s+(?:at|@|–|—)\s+/);
    if (split.length > 1) {
      title = split[0].trim();
      company = split.slice(1).join(' ').trim();
    } else if (i + 1 < lines.length && !dateRe.test(lines[i + 1]) && lines[i + 1].length < 60) {
      company = lines[i + 1].replace(/^[•\-–—]\s*/, '').trim();
    }

    if (!title || title.length > 80) continue;

    const end = dm[4].toLowerCase();
    roles.push({
      title,
      company: company || null,
      start: dm[2],
      end: /present|current|now/.test(end) ? 'Present' : end,
      current: /present|current|now/.test(end),
    });
  }
  return roles;
}

export function extractEducation(text: string): Education {
  const sections = splitSections(text);
  const body = sections.education || text;
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries: EducationEntry[] = [];
  let highest: { level: Education['highestLevel']; rank: number } = { level: 'None', rank: 0 };

  for (const line of lines) {
    if (!DEGREE_RE.test(line)) continue;
    const year = line.match(/\b(19|20)\d{2}\b/)?.[0] || null;
    for (const d of DEGREE_RANK) {
      if (d.re.test(line) && d.rank > highest.rank) highest = { level: d.level, rank: d.rank };
    }
    if (entries.length < 6) {
      entries.push({ text: line.replace(/\s{2,}/g, ' ').slice(0, 140), year });
    }
  }
  return { entries, highestLevel: highest.level, highestRank: highest.rank };
}

/** Bullet lines containing a hard number — the "quantified impact" signal. */
export function extractAchievements(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: string[] = [];
  for (const line of lines) {
    if (!/^[•\-–—*·]|\s{2,}/.test(line) && !/^[A-Z]/.test(line)) continue;
    const clean = line.replace(/^[•\-–—*·]\s*/, '').trim();
    if (clean.length < 25 || clean.length > 260) continue;
    if (!/\d+\s*(%|percent|x\b|k\b|m\b|million|billion|users|customers|requests|hours|days|ms\b|seconds)/i.test(clean)) continue;
    out.push(clean);
    if (out.length >= 8) break;
  }
  return out;
}

/** Everything the scorer needs, in one pass. */
export function parseResume(text: string, fallbackName?: string): ParsedResume {
  const sections = splitSections(text);
  return {
    name: extractName(text, fallbackName),
    contact: extractContact(text),
    experienceYears: extractExperienceYears(text),
    roles: extractRoles(text),
    education: extractEducation(text),
    achievements: extractAchievements(text),
    sections: {
      hasSummary: Boolean(sections.summary),
      hasExperience: Boolean(sections.experience),
      hasEducation: Boolean(sections.education),
      hasSkills: Boolean(sections.skills),
      hasProjects: Boolean(sections.projects),
    },
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}
