import type { BandTone, Candidate, CandidateSummary } from '@shared/types';

export const pct = (n: number): string => `${Math.round((n || 0) * 100)}%`;

export function initials(name: string | undefined): string {
  if (!name) return '??';
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '??'
  );
}

export function toneFor(score: number): BandTone {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export interface ToneClasses {
  text: string;
  bg: string;
  border: string;
  stroke: string;
}

export const TONE_CLASSES: Record<BandTone, ToneClasses> = {
  excellent: {
    text: 'text-success',
    bg: 'bg-success/12',
    border: 'border-success/35',
    stroke: 'rgb(var(--success))',
  },
  high: {
    text: 'text-primary',
    bg: 'bg-primary/12',
    border: 'border-primary/35',
    stroke: 'rgb(var(--primary))',
  },
  medium: {
    text: 'text-warning',
    bg: 'bg-warning/12',
    border: 'border-warning/35',
    stroke: 'rgb(var(--warning))',
  },
  low: {
    text: 'text-error',
    bg: 'bg-error/12',
    border: 'border-error/35',
    stroke: 'rgb(var(--error))',
  },
};

export const toneClass = (score: number): ToneClasses => TONE_CLASSES[toneFor(score)];

export function bandLabel(score: number): string {
  if (score >= 85) return 'Excellent Match';
  if (score >= 70) return 'High Match';
  if (score >= 50) return 'Medium Match';
  return 'Low Match';
}

export function fileSize(bytes: number | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function relativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* --------------------------------------------------------------- export */

/**
 * Escape a CSV field, defending against formula injection.
 *
 * A resume is attacker-supplied data. If a candidate's name is
 * `=cmd|'/c calc'!A1` and a recruiter opens the export in Excel or Sheets, the
 * spreadsheet treats it as a formula and executes it — the export becomes a
 * delivery mechanism for whatever the uploader wrote.
 *
 * Prefixing a single quote makes the cell literal text in every spreadsheet
 * application, and is invisible once opened. Escaping quotes alone, which is
 * all the previous version did, does not help: the danger is the leading
 * character, not the quoting.
 */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

function csvCell(value: unknown): string {
  let str = value == null ? '' : String(value);

  // Strip control characters that would break row alignment on import.
  // eslint-disable-next-line no-control-regex
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  if (FORMULA_TRIGGERS.test(str)) str = `'${str}`;

  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export interface CsvColumn<T> {
  label: string;
  value: (row: T) => unknown;
}

export function toCsv<T>(rows: T[], headers: CsvColumn<T>[]): string {
  const head = headers.map((h) => csvCell(h.label)).join(',');
  const body = rows.map((row) => headers.map((h) => csvCell(h.value(row))).join(',')).join('\n');
  return `${head}\n${body}`;
}

export function downloadFile(content: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Columns shared by the candidate CSV export. */
export const CANDIDATE_COLUMNS: CsvColumn<CandidateSummary | Candidate>[] = [
  { label: 'Name', value: (c) => c.parsed.name },
  { label: 'File', value: (c) => c.file?.originalName ?? '' },
  { label: 'Overall', value: (c) => c.analysis.overall },
  { label: 'ATS', value: (c) => c.analysis.atsScore },
  { label: 'Similarity', value: (c) => c.analysis.similarity },
  { label: 'Confidence', value: (c) => c.analysis.confidence },
  { label: 'Skill coverage', value: (c) => c.analysis.skills.coverage },
  {
    label: 'Skills matched',
    value: (c) => `${c.analysis.skills.matchedCount}/${c.analysis.skills.requiredCount}`,
  },
  { label: 'Matched skills', value: (c) => c.analysis.skills.matched.map((s) => s.label).join('; ') },
  { label: 'Missing skills', value: (c) => c.analysis.skills.missing.map((s) => s.label).join('; ') },
  { label: 'Experience (y)', value: (c) => c.parsed.experienceYears ?? '' },
  { label: 'Education', value: (c) => c.parsed.education?.highestLevel ?? '' },
  { label: 'Email', value: (c) => c.parsed.contact?.email ?? '' },
  { label: 'Phone', value: (c) => c.parsed.contact?.phone ?? '' },
  { label: 'Status', value: (c) => c.status },
];
