import { useMemo, useState } from 'react';
import type { CandidateStatus, CandidateSummary, Role, Skill } from '@shared/types';

export interface Filters {
  minOverall: number;
  minAts: number;
  minConfidence: number;
  minCoverage: number;
  minYears: number;
  maxYears: number;
  requireSkills: string[];
  excludeSkills: string[];
  statuses: CandidateStatus[];
  mustHaveOnly: boolean;
  hideWarnings: boolean;
  education: 'any' | 'Bachelor' | 'Master' | 'Doctorate';
  sort: SortKey;
  order: 'asc' | 'desc';
}

type SortKey =
  | 'overall' | 'ats' | 'similarity' | 'confidence'
  | 'coverage' | 'experience' | 'name' | 'recent';

export const DEFAULT_FILTERS: Filters = {
  minOverall: 0,
  minAts: 0,
  minConfidence: 0,
  minCoverage: 0,
  minYears: 0,
  maxYears: 40,
  requireSkills: [],
  excludeSkills: [],
  statuses: ['new', 'shortlisted', 'rejected'],
  mustHaveOnly: false,
  hideWarnings: false,
  education: 'any',
  sort: 'overall',
  order: 'desc',
};

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'overall', label: 'Overall score' },
  { value: 'ats', label: 'ATS score' },
  { value: 'similarity', label: 'JD similarity' },
  { value: 'confidence', label: 'Confidence' },
  { value: 'coverage', label: 'Skill coverage' },
  { value: 'experience', label: 'Years of experience' },
  { value: 'name', label: 'Name' },
  { value: 'recent', label: 'Recently added' },
];

const EDUCATION = [
  { value: 'any', label: 'Any education' },
  { value: 'Bachelor', label: 'Bachelor’s or higher' },
  { value: 'Master', label: 'Master’s or higher' },
  { value: 'Doctorate', label: 'Doctorate' },
] as const;

function Slider({
  label, value, onChange, min = 0, max = 100, suffix = '',
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; suffix?: string;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-xs">
        <span className="label-eyebrow">{label}</span>
        <span className="font-body text-body-sm font-semibold text-primary tabular-nums">
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary cursor-pointer"
      />
    </label>
  );
}

function SkillPicker({
  label, options, selected, onChange, tone = 'primary',
}: {
  label: string; options: Skill[]; selected: string[];
  onChange: (next: string[]) => void; tone?: 'primary' | 'error';
}) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return options
      .filter((o) => o.label.toLowerCase().includes(q) && !selected.includes(o.id))
      .slice(0, 6);
  }, [query, options, selected]);

  const toneCls =
    tone === 'error'
      ? 'bg-error/10 border-error/30 text-error'
      : 'bg-primary/12 border-primary/35 text-primary';

  return (
    <div>
      <span className="label-eyebrow block mb-xs">{label}</span>
      <div className="relative">
        <input
          className="field"
          placeholder="Type a skill…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) {
              e.preventDefault();
              onChange([...selected, matches[0].id]);
              setQuery('');
            }
          }}
        />
        {matches.length > 0 && (
          <ul className="absolute z-20 mt-xs w-full panel overflow-hidden shadow-lift animate-slide-down">
            {matches.map((o) => (
              <li key={o.id}>
                <button
                  className="w-full text-left px-md py-sm font-body text-body-sm text-on-surface
                             hover:bg-primary/10 hover:text-primary transition-colors"
                  onClick={() => {
                    onChange([...selected, o.id]);
                    setQuery('');
                  }}
                >
                  {o.label}
                  <span className="text-on-surface-variant ml-xs">· {o.category}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-xs mt-sm">
          {selected.map((id) => (
            <button
              key={id}
              className={`chip ${toneCls} hover:scale-105`}
              onClick={() => onChange(selected.filter((s) => s !== id))}
            >
              {options.find((o) => o.id === id)?.label ?? id}
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface FilterBarProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  skills: Skill[];
  resultCount: number;
  totalCount: number;
}

export default function FilterBar({
  filters, onChange, skills, resultCount, totalCount,
}: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const activeCount = [
    filters.minOverall > 0,
    filters.minAts > 0,
    filters.minConfidence > 0,
    filters.minCoverage > 0,
    filters.minYears > 0,
    filters.maxYears < 40,
    filters.requireSkills.length > 0,
    filters.excludeSkills.length > 0,
    filters.statuses.length !== 3,
    filters.mustHaveOnly,
    filters.hideWarnings,
    filters.education !== 'any',
  ].filter(Boolean).length;

  return (
    <section className="panel p-md" aria-label="Filters">
      <div className="flex flex-wrap items-end gap-md">
        <div className="flex-1 min-w-[170px]">
          <Slider label="Min overall" value={filters.minOverall} onChange={(v) => set({ minOverall: v })} />
        </div>
        <div className="flex-1 min-w-[170px]">
          <Slider label="Min ATS" value={filters.minAts} onChange={(v) => set({ minAts: v })} />
        </div>

        <label className="min-w-[150px]">
          <span className="label-eyebrow block mb-xs">Sort by</span>
          <select
            className="field cursor-pointer py-xs"
            value={filters.sort}
            onChange={(e) => set({ sort: e.target.value as SortKey })}
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>

        <button
          className="btn-ghost"
          onClick={() => set({ order: filters.order === 'desc' ? 'asc' : 'desc' })}
          title={filters.order === 'desc' ? 'Descending' : 'Ascending'}
          aria-label="Toggle sort direction"
        >
          <span
            className="material-symbols-outlined transition-transform duration-300"
            style={{ fontSize: 18, transform: filters.order === 'desc' ? 'none' : 'rotate(180deg)' }}
          >
            arrow_downward
          </span>
        </button>

        <button
          className={`btn-ghost ${activeCount ? 'border-primary/60 text-primary' : ''}`}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>tune</span>
          Filters
          {activeCount > 0 && (
            <span className="ml-xs px-1.5 rounded-full gradient-surface text-white font-body text-label-md">
              {activeCount}
            </span>
          )}
          <span
            className="material-symbols-outlined transition-transform duration-300"
            style={{ fontSize: 16, transform: expanded ? 'rotate(180deg)' : 'none' }}
          >
            expand_more
          </span>
        </button>

        {activeCount > 0 && (
          <button className="btn-quiet" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
            Reset
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-lg pt-lg border-t border-outline-variant grid md:grid-cols-2 lg:grid-cols-3 gap-lg animate-expand-down">
          <Slider label="Min confidence" value={filters.minConfidence} onChange={(v) => set({ minConfidence: v })} suffix="%" />
          <Slider label="Min skill coverage" value={filters.minCoverage} onChange={(v) => set({ minCoverage: v })} suffix="%" />

          <div className="grid grid-cols-2 gap-sm">
            <Slider
              label="Min years" max={40} suffix="y"
              value={filters.minYears}
              onChange={(v) => set({ minYears: Math.min(v, filters.maxYears) })}
            />
            <Slider
              label="Max years" max={40} suffix="y"
              value={filters.maxYears}
              onChange={(v) => set({ maxYears: Math.max(v, filters.minYears) })}
            />
          </div>

          <SkillPicker
            label="Must include these skills"
            options={skills}
            selected={filters.requireSkills}
            onChange={(v) => set({ requireSkills: v })}
          />
          <SkillPicker
            label="Exclude candidates with"
            options={skills}
            selected={filters.excludeSkills}
            onChange={(v) => set({ excludeSkills: v })}
            tone="error"
          />

          <label>
            <span className="label-eyebrow block mb-xs">Education</span>
            <select
              className="field cursor-pointer"
              value={filters.education}
              onChange={(e) => set({ education: e.target.value as Filters['education'] })}
            >
              {EDUCATION.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </label>

          <div>
            <span className="label-eyebrow block mb-xs">Status</span>
            <div className="flex flex-wrap gap-xs">
              {(['new', 'shortlisted', 'rejected'] as const).map((s) => {
                const on = filters.statuses.includes(s);
                return (
                  <button
                    key={s}
                    className={`chip capitalize ${
                      on
                        ? 'bg-primary/12 border-primary/35 text-primary'
                        : 'bg-surface-container-high border-outline-variant text-on-surface-variant'
                    }`}
                    onClick={() =>
                      set({
                        statuses: on
                          ? filters.statuses.filter((x) => x !== s)
                          : [...filters.statuses, s],
                      })
                    }
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-sm justify-end">
            <label className="flex items-center gap-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filters.mustHaveOnly}
                onChange={(e) => set({ mustHaveOnly: e.target.checked })}
                className="w-4 h-4 rounded accent-primary"
              />
              <span className="font-body text-body-sm text-on-surface">
                Only candidates with every must-have skill
              </span>
            </label>
            <label className="flex items-center gap-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hideWarnings}
                onChange={(e) => set({ hideWarnings: e.target.checked })}
                className="w-4 h-4 rounded accent-primary"
              />
              <span className="font-body text-body-sm text-on-surface">
                Hide files with extraction warnings
              </span>
            </label>
          </div>
        </div>
      )}

      <p className="mt-md font-body text-body-sm text-on-surface-variant">
        Showing <span className="text-primary font-semibold">{resultCount}</span> of {totalCount} candidates
      </p>
    </section>
  );
}

const EDU_RANK: Record<string, number> = {
  None: 0, Associate: 2, Bachelor: 3, Master: 4, Doctorate: 5,
};

/** Apply the filter set. Kept beside the UI so the two cannot drift. */
export function applyFilters(
  candidates: CandidateSummary[],
  filters: Filters,
  search: string,
  role: Role | null,
): CandidateSummary[] {
  const q = search.trim().toLowerCase();
  const mustHaveIds = role
    ? role.requiredSkills.filter((s) => (role.weights?.[s.id] ?? 1) >= 3).map((s) => s.id)
    : [];

  const filtered = candidates.filter((c) => {
    const a = c.analysis;
    if (a.overall < filters.minOverall) return false;
    if (a.atsScore < filters.minAts) return false;
    if (a.confidence * 100 < filters.minConfidence) return false;
    if (a.skills.coverage * 100 < filters.minCoverage) return false;

    const years = c.parsed.experienceYears;
    if (years != null) {
      if (years < filters.minYears || years > filters.maxYears) return false;
    } else if (filters.minYears > 0) {
      return false;
    }

    if (!filters.statuses.includes(c.status)) return false;
    if (filters.hideWarnings && c.extraction?.warning) return false;

    if (filters.education !== 'any') {
      const rank = EDU_RANK[c.parsed.education?.highestLevel] ?? 0;
      if (rank < (EDU_RANK[filters.education] ?? 0)) return false;
    }

    const have = new Set([
      ...a.skills.matched.map((s) => s.id),
      ...a.skills.additional.map((s) => s.id),
    ]);
    if (filters.requireSkills.some((id) => !have.has(id))) return false;
    if (filters.excludeSkills.some((id) => have.has(id))) return false;
    if (filters.mustHaveOnly && mustHaveIds.some((id) => !have.has(id))) return false;

    if (q) {
      const haystack = [
        c.parsed.name,
        c.parsed.title ?? '',
        c.file?.originalName ?? '',
        ...a.skills.matched.map((s) => s.label),
        ...a.skills.additional.map((s) => s.label),
        ...(c.parsed.roles ?? []).map((r) => `${r.title} ${r.company ?? ''}`),
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  const keyOf: Record<SortKey, (c: CandidateSummary) => number | string> = {
    overall: (c) => c.analysis.overall,
    ats: (c) => c.analysis.atsScore,
    similarity: (c) => c.analysis.similarity,
    confidence: (c) => c.analysis.confidence,
    coverage: (c) => c.analysis.skills.coverage,
    experience: (c) => c.parsed.experienceYears ?? -1,
    name: (c) => c.parsed.name.toLowerCase(),
    recent: (c) => new Date(c.createdAt).getTime(),
  };

  const key = keyOf[filters.sort] ?? keyOf.overall;
  const dir = filters.order === 'asc' ? 1 : -1;

  return filtered.sort((a, b) => {
    const va = key(a);
    const vb = key(b);
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
    return ((va as number) - (vb as number)) * dir;
  });
}
