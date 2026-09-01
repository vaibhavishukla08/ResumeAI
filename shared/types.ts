/**
 * The API contract, imported by both the Express server and the React client.
 * Changing a shape here surfaces as a type error on both sides at once, which
 * is the whole point of sharing it.
 */

/* ------------------------------------------------------------------ auth */

export type UserRole = 'admin' | 'recruiter';

/** How the account authenticates. Google accounts have no local password. */
export type AuthProvider = 'password' | 'google';

export interface User {
  id: string;
  email: string;
  name: string;
  company: string | null;
  role: UserRole;
  provider: AuthProvider;
  /** Google profile picture, when signed in through Google. */
  picture?: string | null;
  /** Data routes are closed until this is true. */
  emailVerified: boolean;
  createdAt: string;
}

/**
 * What the server stores. Never leaves the server — `publicUser()` is the only
 * sanctioned way to turn one of these into something a client may see.
 */
export interface StoredUser extends User {
  /** Absent for Google accounts — there is no password to hash. */
  passwordHash?: string;
  googleId?: string;
  /** SHA-256 of the pending email-verification token. */
  verifyTokenHash?: string | null;
  verifyTokenExpiresAt?: string | null;
  /** SHA-256 of the pending password-reset token. Single use. */
  resetTokenHash?: string | null;
  resetTokenExpiresAt?: string | null;
  /** Consecutive failed password attempts, for per-account lockout. */
  failedLoginCount?: number;
  lockedUntil?: string | null;
  passwordChangedAt?: string | null;
}

/**
 * The session credential is delivered as an httpOnly cookie and never appears
 * in a response body, so there is no token field here by design.
 */
export interface AuthResponse {
  user: User;
}

/* ----------------------------------------------------------------- skills */

export interface Skill {
  id: string;
  label: string;
  category: string;
  /**
   * Alternate spellings the server recognises. Sent to the client so the role
   * editor can show whether a typed term was understood, using exactly the
   * same matching rule rather than an approximation of it.
   */
  aliases?: string[];
}

export interface RequiredSkill extends Skill {
  custom: boolean;
}

export interface DetectedSkill extends Skill {
  mentions: number;
  evidence: string;
  index?: number;
}

export interface MatchedSkill extends RequiredSkill {
  weight: number;
  mentions: number;
  evidence: string;
  depth: number;
}

export interface MissingSkill extends RequiredSkill {
  weight: number;
}

/* ------------------------------------------------------------------ roles */

export interface RoleInput {
  id?: string;
  title: string;
  department?: string;
  description?: string;
  required: string;
  minYears?: number | string | null;
  maxYears?: number | string | null;
  mustHave?: string[];
}

export interface Role {
  id: string;
  userId: string;
  title: string;
  department: string;
  description: string;
  required: string;
  minYears: number;
  maxYears: number | null;
  mustHave: string[];
  /** Derived on read from `required` + `mustHave`. */
  requiredSkills: RequiredSkill[];
  weights: Record<string, number>;
}

/* --------------------------------------------------------------- analysis */

export type BandTone = 'excellent' | 'high' | 'medium' | 'low';

export interface Band {
  label: string;
  tone: BandTone;
}

export interface BreakdownItem {
  key: string;
  weight: number;
  score: number;
  detail: string;
}

export interface ConfidenceSignal {
  label: string;
  value: number;
  weight: number;
}

export interface ExperienceFit {
  score: number;
  note: string;
}

export type InsightType = 'strength' | 'gap' | 'suggestion';

export interface Insight {
  type: InsightType;
  title: string;
  body: string;
}

export interface SkillSummary {
  detected: DetectedSkill[];
  matched: MatchedSkill[];
  missing: MissingSkill[];
  additional: DetectedSkill[];
  coverage: number;
  matchedCount: number;
  requiredCount: number;
}

export interface Analysis {
  atsScore: number;
  similarity: number;
  rawSimilarity: number;
  confidence: number;
  confidenceSignals: ConfidenceSignal[];
  overall: number;
  band: Band;
  breakdown: BreakdownItem[];
  skills: SkillSummary;
  experienceFit: ExperienceFit;
  insights: Insight[];
}

/* --------------------------------------------------------------- resumes */

export interface Contact {
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  github: string | null;
  website: string | null;
}

export interface ParsedRole {
  title: string;
  company: string | null;
  start: string | null;
  end: string | null;
  current: boolean;
}

export interface EducationEntry {
  text: string;
  year: string | null;
}

export interface Education {
  entries: EducationEntry[];
  highestLevel: 'None' | 'Associate' | 'Bachelor' | 'Master' | 'Doctorate';
  highestRank: number;
}

export interface ParsedResume {
  name: string;
  title?: string | null;
  location?: string | null;
  summary?: string | null;
  contact: Contact;
  experienceYears: number | null;
  roles: ParsedRole[];
  education: Education;
  achievements: string[];
  sections: {
    hasSummary: boolean;
    hasExperience: boolean;
    hasEducation: boolean;
    hasSkills: boolean;
    hasProjects: boolean;
  };
  wordCount: number;
}

export type ExtractionKind = 'pdf' | 'image' | 'docx' | 'text' | 'unknown' | string;

export interface Extraction {
  kind: ExtractionKind;
  pages: number | null;
  needsOcr: boolean;
  warning: string | null;
  ocrConfidence?: number | null;
}

export interface StoredFile {
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
}

export type CandidateStatus = 'new' | 'shortlisted' | 'rejected';

export type Verdict = 'strong_match' | 'possible_match' | 'weak_match';

export interface Recommendation {
  verdict: Verdict;
  confidence: number;
  summary: string;
  strengths: string[];
  concerns: string[];
  interviewQuestions?: string[];
  source: string;
}

export interface Candidate {
  id: string;
  userId: string;
  roleId: string;
  createdAt: string;
  status: CandidateStatus;
  file: StoredFile | null;
  text: string;
  extraction: Extraction;
  parsed: ParsedResume;
  analysis: Analysis;
  recommendation: Recommendation | null;
  engine: 'gemini' | 'local-fallback' | 'local';
  note?: string;
}

/** List payloads drop the raw text, which is large and rarely needed. */
export type CandidateSummary = Omit<Candidate, 'text'> & { textLength: number };

/* ------------------------------------------------------------- responses */

export interface HealthResponse {
  ok: true;
  gemini: {
    enabled: boolean;
    extractModel: string;
    reasonModel: string;
    embedModel: string;
  };
  /** The client hides the Google button entirely when this is not configured. */
  google: {
    enabled: boolean;
    clientId: string | null;
  };
  maxFileMb: number;
  supported: string[];
}

export interface AnalyzeFailure {
  name: string;
  reason: string;
}

export interface AnalyzeResponse {
  analyzed: number;
  failed: number;
  candidates: CandidateSummary[];
  failures: AnalyzeFailure[];
}

export interface MatrixCell {
  candidateId: string;
  has: boolean;
  mentions: number;
}

export interface MatrixRow {
  skill: RequiredSkill;
  weight: number;
  cells: MatrixCell[];
}

export interface ScarcityRow {
  skill: RequiredSkill;
  weight: number;
  have: number;
  total: number;
  rate: number;
}

export interface OverlapRow {
  candidateId: string;
  scores: { candidateId: string; value: number }[];
}

export interface CompareResponse {
  role: Role;
  candidates: CandidateSummary[];
  matrix: MatrixRow[];
  scarcity: ScarcityRow[];
  overlap: OverlapRow[];
}

export interface ApiError {
  error: string;
}
