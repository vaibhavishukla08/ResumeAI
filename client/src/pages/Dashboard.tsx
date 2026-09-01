import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import UploadZone from '@/components/UploadZone';
import CandidateRow from '@/components/CandidateRow';
import { api } from '@/lib/api';
import { toneClass, pct } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import type { Workspace } from '@/App';

function StatCard({
  label, value, sub, icon, tone = 'text-primary', index = 0,
}: {
  label: string; value: string | number; sub?: string;
  icon: string; tone?: string; index?: number;
}) {
  return (
    <div className="panel p-md hover-lift" style={{ '--i': index } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-sm">
        <span className="label-eyebrow">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-surface-container-high grid place-items-center">
          <span className={`material-symbols-outlined ${tone}`} style={{ fontSize: 18 }}>{icon}</span>
        </div>
      </div>
      <p className={`font-heading text-headline-lg mt-sm ${tone} tabular-nums`}>{value}</p>
      {sub && <p className="font-body text-body-sm text-on-surface-variant mt-xs">{sub}</p>}
    </div>
  );
}

export default function Dashboard({
  role, roleId, candidates, refreshCandidates, setStatus, health,
}: Workspace) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const { push } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    if (!candidates.length) return null;
    const scores = candidates.map((c) => c.analysis.overall);
    return {
      total: candidates.length,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      strong: candidates.filter((c) => c.analysis.overall >= 70).length,
      shortlisted: candidates.filter((c) => c.status === 'shortlisted').length,
      avgCoverage:
        candidates.reduce((sum, c) => sum + c.analysis.skills.coverage, 0) / candidates.length,
    };
  }, [candidates]);

  const top = useMemo(
    () => [...candidates].sort((a, b) => b.analysis.overall - a.analysis.overall).slice(0, 5),
    [candidates],
  );

  const gaps = useMemo(() => {
    if (!role || !candidates.length) return [];
    return role.requiredSkills
      .map((skill) => {
        const have = candidates.filter((c) =>
          c.analysis.skills.matched.some((m) => m.id === skill.id),
        ).length;
        return { skill, have, rate: have / candidates.length, weight: role.weights?.[skill.id] ?? 1 };
      })
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 6);
  }, [role, candidates]);

  async function handleAnalyze(files: File[]) {
    if (!role) return;
    setBusy(true);
    setProgress(0);
    try {
      const res = await api.analyze(roleId, files, setProgress);
      await refreshCandidates();

      if (res.analyzed) {
        push(`Analysed ${res.analyzed} resume${res.analyzed === 1 ? '' : 's'} against ${role.title}.`, 'success');
      }
      for (const f of res.failures ?? []) push(`${f.name}: ${f.reason}`, 'warning', 9000);
      if (!res.analyzed && !res.failures?.length) push('Nothing was analysed.', 'warning');
    } catch (err) {
      push((err as Error).message, 'error', 8000);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (!role) {
    return (
      <div className="panel p-2xl text-center max-w-lg mx-auto animate-scale-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-container-high grid place-items-center">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 30 }}>
            work_off
          </span>
        </div>
        <h2 className="font-heading text-headline-md mt-md">No job role yet</h2>
        <p className="font-body text-body-sm text-on-surface-variant mt-xs">
          Create a role with its required skills before uploading resumes.
        </p>
        <Link to="/roles" className="btn-primary mt-lg inline-flex">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Create a role
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      <header className="flex items-end justify-between gap-md flex-wrap">
        <div>
          <p className="label-eyebrow mb-xs">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="font-heading text-headline-lg">
            Welcome back, <span className="gradient-text">{user?.name?.split(' ')[0]}</span>
          </h1>
          <p className="font-body text-body-sm text-on-surface-variant mt-xs">
            Screening for <span className="text-primary font-semibold">{role.title}</span>
            {` · ${role.requiredSkills.length} required skills`}
            {role.minYears ? ` · ${role.minYears}y+ experience` : ''}
          </p>
        </div>

        <div className="flex items-center gap-sm">
          <span
            className={`chip ${
              health?.gemini?.enabled
                ? 'bg-success/12 border-success/35 text-success'
                : 'bg-surface-container-high border-outline-variant text-on-surface-variant'
            }`}
            title={
              health?.gemini?.enabled
                ? `Gemini active: ${health.gemini.extractModel}`
                : 'Running on the local engine. Add GEMINI_API_KEY to server/.env for AI analysis.'
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
              {health?.gemini?.enabled ? 'auto_awesome' : 'functions'}
            </span>
            {health?.gemini?.enabled ? 'Gemini engine' : 'Local engine'}
          </span>
          {candidates.length > 0 && (
            <Link to="/compare" className="btn-ghost">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>balance</span>
              Compare pool
            </Link>
          )}
        </div>
      </header>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-md stagger">
          <StatCard index={0} label="Candidates" value={stats.total} icon="group"
                    sub={`${stats.shortlisted} shortlisted`} />
          <StatCard index={1} label="Average score" value={stats.avg} icon="analytics"
                    tone={toneClass(stats.avg).text} sub={`across ${stats.total} resumes`} />
          <StatCard index={2} label="Strong matches" value={stats.strong} icon="verified"
                    tone="text-success" sub="scoring 70 or above" />
          <StatCard index={3} label="Avg skill coverage" value={pct(stats.avgCoverage)} icon="checklist"
                    sub={`of ${role.requiredSkills.length} required`} />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-lg items-start">
        <div className="lg:col-span-2 space-y-lg">
          <UploadZone
            onAnalyze={handleAnalyze}
            busy={busy}
            progress={progress}
            disabled={!roleId}
            disabledReason="Select a job role first"
          />

          {top.length > 0 && (
            <section className="panel p-lg">
              <div className="flex items-center justify-between gap-md mb-md">
                <h2 className="font-heading text-headline-md">Top candidates</h2>
                <Link to="/candidates" className="btn-quiet">
                  View all {candidates.length}
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                </Link>
              </div>
              <ul className="space-y-sm stagger">
                {top.map((c, i) => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    rank={i + 1}
                    index={i}
                    onSelect={(id) => navigate(`/candidate/${id}`)}
                    onStatus={setStatus}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-lg">
          {gaps.length > 0 && (
            <section className="panel p-lg">
              <h2 className="font-heading text-headline-md mb-xs">Talent gaps</h2>
              <p className="font-body text-body-sm text-on-surface-variant mb-md">
                Required skills the current pool is thinnest on.
              </p>
              <ul className="space-y-md">
                {gaps.map(({ skill, have, rate, weight }) => (
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
                        {have}/{candidates.length}
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
          )}

          <section className="panel p-lg">
            <h2 className="font-heading text-headline-md mb-md">Role requirements</h2>
            <p className="label-eyebrow mb-sm">Must-have</p>
            <div className="flex flex-wrap gap-xs mb-md">
              {role.requiredSkills
                .filter((s) => (role.weights?.[s.id] ?? 1) >= 3)
                .map((s) => (
                  <span key={s.id} className="chip bg-primary/12 border-primary/35 text-primary">
                    {s.label}
                  </span>
                ))}
              {!role.requiredSkills.some((s) => (role.weights?.[s.id] ?? 1) >= 3) && (
                <span className="font-body text-body-sm text-on-surface-variant">None marked.</span>
              )}
            </div>
            <p className="label-eyebrow mb-sm">Nice to have</p>
            <div className="flex flex-wrap gap-xs">
              {role.requiredSkills
                .filter((s) => (role.weights?.[s.id] ?? 1) < 3)
                .map((s) => (
                  <span
                    key={s.id}
                    className="chip bg-surface-container-high border-outline-variant text-on-surface-variant"
                  >
                    {s.label}
                  </span>
                ))}
            </div>
            <Link to="/roles" className="btn-ghost w-full mt-md">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
              Edit requirements
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
