import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { CandidateSummary, CompareResponse } from '@shared/types';
import { api } from '@/lib/api';
import { initials, pct, toneClass, toCsv, downloadFile } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import type { Workspace } from '@/App';

type View = 'matrix' | 'metrics' | 'gaps';

interface Metric {
  key: string;
  label: string;
  get: (c: CandidateSummary) => number;
  fmt: (v: number) => string;
  neutral?: boolean;
}

const METRICS: Metric[] = [
  { key: 'overall', label: 'Overall', get: (c) => c.analysis.overall, fmt: (v) => String(v) },
  { key: 'ats', label: 'ATS', get: (c) => c.analysis.atsScore, fmt: (v) => String(v) },
  { key: 'similarity', label: 'Similarity', get: (c) => c.analysis.similarity * 100, fmt: (v) => `${v}%` },
  { key: 'confidence', label: 'Confidence', get: (c) => c.analysis.confidence * 100, fmt: (v) => `${v}%` },
  { key: 'coverage', label: 'Skill coverage', get: (c) => c.analysis.skills.coverage * 100, fmt: (v) => `${v}%` },
  { key: 'experience', label: 'Experience', get: (c) => c.parsed.experienceYears ?? 0, fmt: (v) => `${v}y`, neutral: true },
];

function MetricChart({ metric, candidates }: { metric: Metric; candidates: CandidateSummary[] }) {
  const max = Math.max(...candidates.map(metric.get), 1);
  return (
    <div className="panel p-md">
      <p className="label-eyebrow mb-md">{metric.label}</p>
      <ul className="space-y-sm">
        {[...candidates]
          .sort((a, b) => metric.get(b) - metric.get(a))
          .map((c, i) => {
            const value = metric.get(c);
            // Years of experience has no good/bad band, so it gets a neutral tone.
            const tone = metric.neutral ? toneClass(70) : toneClass(value);
            return (
              <li key={c.id} className="flex items-center gap-sm" style={{ '--i': i } as React.CSSProperties}>
                <span className="font-body text-body-sm text-on-surface-variant w-24 truncate flex-shrink-0">
                  {c.parsed.name}
                </span>
                <div className="flex-1 h-5 rounded-lg bg-surface-container-highest overflow-hidden">
                  <div
                    className="h-full rounded-lg transition-[width] duration-1000 ease-smooth"
                    style={{ width: `${(value / max) * 100}%`, background: tone.stroke }}
                  />
                </div>
                <span className={`font-body text-body-sm font-semibold w-12 text-right flex-shrink-0 tabular-nums ${tone.text}`}>
                  {metric.fmt(Math.round(value))}
                </span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

export default function Compare({ role, roleId, candidates }: Workspace) {
  const location = useLocation();
  const preselected = (location.state as { candidateIds?: string[] } | null)?.candidateIds;

  const [selected, setSelected] = useState<string[]>(() => preselected ?? []);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>('matrix');
  const { push } = useToast();

  // Default to the top 8 by score when arriving without an explicit selection.
  useEffect(() => {
    if (!selected.length && candidates.length) {
      setSelected(
        [...candidates]
          .sort((a, b) => b.analysis.overall - a.analysis.overall)
          .slice(0, 8)
          .map((c) => c.id),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  useEffect(() => {
    if (!roleId || !selected.length) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .compare(roleId, selected)
      .then((res) => !cancelled && setData(res))
      .catch((err: Error) => push(err.message, 'error'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [roleId, selected, push]);

  const chosen = useMemo(
    () => candidates.filter((c) => selected.includes(c.id)),
    [candidates, selected],
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  function exportMatrix() {
    if (!data) return;
    const csv = toCsv(data.matrix, [
      { label: 'Skill', value: (r) => r.skill.label },
      { label: 'Weight', value: (r) => r.weight },
      ...data.candidates.map((c) => ({
        label: c.parsed.name,
        value: (r: typeof data.matrix[number]) =>
          r.cells.find((x) => x.candidateId === c.id)?.mentions ?? 0,
      })),
    ]);
    downloadFile(csv, `skill-matrix-${Date.now()}.csv`, 'text/csv');
    push('Skill matrix exported.', 'success');
  }

  if (!candidates.length) {
    return (
      <div className="panel p-2xl text-center max-w-lg mx-auto animate-scale-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-container-high grid place-items-center">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 30 }}>
            balance
          </span>
        </div>
        <h2 className="font-heading text-headline-md mt-md">Nothing to compare yet</h2>
        <p className="font-body text-body-sm text-on-surface-variant mt-xs">
          Analyse a batch of resumes first, then compare them side by side.
        </p>
        <Link to="/" className="btn-primary mt-lg inline-flex">Upload resumes</Link>
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      <header className="flex items-end justify-between gap-md flex-wrap">
        <div>
          <h1 className="font-heading text-headline-lg">Compare candidates</h1>
          <p className="font-body text-body-sm text-on-surface-variant mt-xs">
            {selected.length} of {candidates.length} selected · {role?.title}
          </p>
        </div>

        <div className="flex items-center gap-sm flex-wrap">
          <div className="relative flex rounded-xl bg-surface-container-high p-xs">
            <span
              className="absolute top-xs bottom-xs rounded-lg gradient-surface transition-transform duration-300 ease-smooth"
              style={{
                width: 'calc(33.333% - 3px)',
                transform: `translateX(${['matrix', 'metrics', 'gaps'].indexOf(view) * 100}%)`,
              }}
              aria-hidden="true"
            />
            {([
              { id: 'matrix', label: 'Skill matrix', icon: 'grid_on' },
              { id: 'metrics', label: 'Metrics', icon: 'bar_chart' },
              { id: 'gaps', label: 'Pool gaps', icon: 'insights' },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={`relative z-10 px-sm py-xs rounded-lg font-body text-body-sm transition-colors
                            flex items-center gap-xs ${
                              view === t.id ? 'text-white' : 'text-on-surface-variant hover:text-primary'
                            }`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
          <button className="btn-ghost" onClick={exportMatrix} disabled={!data}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
            Export
          </button>
        </div>
      </header>

      <section className="panel p-md">
        <div className="flex items-center justify-between gap-sm mb-sm flex-wrap">
          <span className="label-eyebrow">Select candidates to compare</span>
          <div className="flex gap-sm">
            <button className="btn-quiet" onClick={() => setSelected(candidates.map((c) => c.id))}>
              Select all
            </button>
            <button className="btn-quiet" onClick={() => setSelected([])}>Clear</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-xs">
          {[...candidates]
            .sort((a, b) => b.analysis.overall - a.analysis.overall)
            .map((c) => {
              const on = selected.includes(c.id);
              const tone = toneClass(c.analysis.overall);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={`chip hover:scale-105 ${
                    on
                      ? `${tone.bg} ${tone.border} ${tone.text} font-semibold`
                      : 'bg-surface-container-high border-outline-variant text-on-surface-variant'
                  }`}
                >
                  {on && <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check</span>}
                  {c.parsed.name}
                  <span className="font-body text-label-md opacity-70 tabular-nums">
                    {c.analysis.overall}
                  </span>
                </button>
              );
            })}
        </div>
      </section>

      {loading && <div className="skeleton h-64" />}

      {!selected.length && !loading && (
        <div className="panel p-2xl text-center">
          <p className="font-body text-body-md text-on-surface-variant">
            Select at least one candidate above.
          </p>
        </div>
      )}

      {data && !loading && view === 'matrix' && (
        <section className="panel overflow-hidden animate-slide-up">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="text-left p-md label-eyebrow sticky left-0 bg-surface-container z-10 min-w-[180px]">
                    Required skill
                  </th>
                  {data.candidates.map((c) => (
                    <th key={c.id} className="p-md min-w-[104px]">
                      <div className="flex flex-col items-center gap-xs">
                        <div className="w-8 h-8 rounded-full gradient-surface grid place-items-center">
                          <span className="font-body text-label-md font-bold text-white">
                            {initials(c.parsed.name)}
                          </span>
                        </div>
                        <span className="font-body text-body-sm text-on-surface truncate max-w-[96px]">
                          {c.parsed.name.split(' ')[0]}
                        </span>
                        <span className={`font-body text-label-md font-bold tabular-nums ${toneClass(c.analysis.overall).text}`}>
                          {c.analysis.overall}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.matrix.map((row) => (
                  <tr
                    key={row.skill.id}
                    className="border-b border-outline-variant last:border-0 hover:bg-surface-container-high/50 transition-colors"
                  >
                    <td className="p-md sticky left-0 bg-surface-container z-10">
                      <div className="flex items-center gap-xs">
                        {row.weight >= 3 && (
                          <span
                            className="material-symbols-outlined filled text-warning flex-shrink-0"
                            style={{ fontSize: 13 }}
                            title="Must-have"
                          >
                            priority_high
                          </span>
                        )}
                        <span className="font-body text-body-sm text-on-surface">{row.skill.label}</span>
                      </div>
                      <span className="font-body text-label-md text-on-surface-variant">
                        {row.skill.category}
                      </span>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.candidateId} className="p-md text-center">
                        {cell.has ? (
                          <div className="flex flex-col items-center">
                            <span className="material-symbols-outlined text-success" style={{ fontSize: 19 }}>
                              check_circle
                            </span>
                            {cell.mentions > 1 && (
                              <span className="font-body text-label-md text-on-surface-variant">
                                ×{cell.mentions}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="material-symbols-outlined text-error/40" style={{ fontSize: 19 }}>
                            remove
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-container-high">
                  <td className="p-md sticky left-0 bg-surface-container-high z-10">
                    <span className="font-body text-body-sm font-semibold text-on-surface">Coverage</span>
                  </td>
                  {data.candidates.map((c) => (
                    <td key={c.id} className="p-md text-center">
                      <span className={`font-body text-body-sm font-bold tabular-nums ${toneClass(c.analysis.skills.coverage * 100).text}`}>
                        {pct(c.analysis.skills.coverage)}
                      </span>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {data && !loading && view === 'metrics' && (
        <div className="grid md:grid-cols-2 gap-md stagger">
          {METRICS.map((m) => (
            <MetricChart key={m.key} metric={m} candidates={chosen} />
          ))}
        </div>
      )}

      {data && !loading && view === 'gaps' && (
        <div className="grid lg:grid-cols-2 gap-lg items-start animate-slide-up">
          <section className="panel p-lg">
            <h3 className="font-heading text-headline-md mb-xs">Scarcest skills in this pool</h3>
            <p className="font-body text-body-sm text-on-surface-variant mb-md">
              Where the shortlist is weakest against the role.
            </p>
            <ul className="space-y-md">
              {data.scarcity.map(({ skill, have, total, rate, weight }) => (
                <li key={skill.id}>
                  <div className="flex items-center justify-between gap-sm mb-xs">
                    <span className="font-body text-body-sm text-on-surface flex items-center gap-xs">
                      {weight >= 3 && (
                        <span className="material-symbols-outlined filled text-warning" style={{ fontSize: 13 }}>
                          priority_high
                        </span>
                      )}
                      {skill.label}
                    </span>
                    <span className="font-body text-label-md text-on-surface-variant tabular-nums">
                      {have}/{total}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-1000 ease-smooth"
                      style={{
                        width: `${rate * 100}%`,
                        background:
                          rate < 0.3 ? 'rgb(var(--error))'
                          : rate < 0.6 ? 'rgb(var(--warning))'
                          : 'rgb(var(--success))',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel p-lg">
            <h3 className="font-heading text-headline-md mb-xs">Profile overlap</h3>
            <p className="font-body text-body-sm text-on-surface-variant mb-md">
              How similar these resumes are to each other. High overlap means you are
              looking at interchangeable profiles.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="p-xs" />
                    {data.candidates.map((c) => (
                      <th key={c.id} className="p-xs font-body text-label-md text-on-surface-variant">
                        {initials(c.parsed.name)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.overlap.map((row) => {
                    const rowCandidate = data.candidates.find((c) => c.id === row.candidateId);
                    return (
                      <tr key={row.candidateId}>
                        <td className="p-xs font-body text-label-md text-on-surface-variant text-right">
                          {initials(rowCandidate?.parsed.name)}
                        </td>
                        {row.scores.map((s) => (
                          <td key={s.candidateId} className="p-xs">
                            <div
                              className="w-full aspect-square rounded-lg grid place-items-center font-body text-label-md tabular-nums"
                              style={{
                                background: `rgb(var(--primary) / ${Math.max(0.06, s.value)})`,
                                color:
                                  s.value > 0.55
                                    ? 'rgb(var(--on-primary))'
                                    : 'rgb(var(--on-surface-variant))',
                                minWidth: 34,
                              }}
                              title={`${Math.round(s.value * 100)}% similar`}
                            >
                              {Math.round(s.value * 100)}
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
