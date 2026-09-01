import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import type { Analysis, Candidate, InsightType } from '@shared/types';
import ScoreGauge, { ScoreBar } from '@/components/ScoreGauge';
import SkillMatch from '@/components/SkillMatch';
import DocumentPreview from '@/components/DocumentPreview';
import { api } from '@/lib/api';
import { pct, toneClass } from '@/lib/format';
import { downloadCandidateReport } from '@/lib/report-pdf';
import { useToast } from '@/context/ToastContext';
import type { Workspace } from '@/App';

const INSIGHT_META: Record<InsightType, { icon: string; className: string; bg: string }> = {
  strength: { icon: 'trending_up', className: 'text-success', bg: 'bg-success/10 border-success/25' },
  gap: { icon: 'report', className: 'text-error', bg: 'bg-error/10 border-error/25' },
  suggestion: { icon: 'lightbulb', className: 'text-warning', bg: 'bg-warning/10 border-warning/25' },
};

/** Similarity vs confidence, shown side by side and explained. */
function DualScore({ analysis }: { analysis: Analysis }) {
  return (
    <div className="grid grid-cols-2 gap-md">
      <div className="panel p-md">
        <div className="flex items-center gap-xs mb-xs">
          <span className="label-eyebrow">Similarity</span>
          <span
            className="material-symbols-outlined text-on-surface-variant cursor-help"
            style={{ fontSize: 13 }}
            title="Objective. Vector distance between this resume and the job description. No judgement — just how closely the language overlaps."
          >
            help
          </span>
        </div>
        <p className="font-heading text-headline-lg text-primary tabular-nums">
          {pct(analysis.similarity)}
        </p>
        <ScoreBar value={analysis.similarity} className="mt-sm" gradient />
        <p className="font-body text-body-sm text-on-surface-variant mt-xs">
          Objective · vector match to the JD
        </p>
      </div>

      <div className="panel p-md">
        <div className="flex items-center gap-xs mb-xs">
          <span className="label-eyebrow">Confidence</span>
          <span
            className="material-symbols-outlined text-on-surface-variant cursor-help"
            style={{ fontSize: 13 }}
            title="Subjective. How much to trust the match, given evidence quality: were skills shown in context or just listed, does seniority fit, did the document parse cleanly."
          >
            help
          </span>
        </div>
        <p className="font-heading text-headline-lg text-tertiary tabular-nums">
          {pct(analysis.confidence)}
        </p>
        <ScoreBar value={analysis.confidence} tone="rgb(var(--tertiary))" className="mt-sm" />
        <p className="font-body text-body-sm text-on-surface-variant mt-xs">
          Subjective · trust in this assessment
        </p>
      </div>
    </div>
  );
}

export default function CandidateAnalysis({ roles, setStatus }: Workspace) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { push } = useToast();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Must sit above the early returns below: a hook called only on renders that
  // get past them changes the hook order between renders, which React treats
  // as a fatal error rather than a warning.
  const [exporting, setExporting] = useState(false);

  /**
   * The role this candidate was actually screened against — resolved from the
   * candidate's own roleId, not from whatever is selected in the top bar.
   * Using the selected role attributed the candidate to the wrong requisition
   * on screen and, worse, printed the wrong role into the exported PDF.
   */
  const role = useMemo(
    () => roles.find((r) => r.id === candidate?.roleId) ?? null,
    [roles, candidate?.roleId],
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .candidate(id)
      .then(({ candidate: c }) => !cancelled && setCandidate(c))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="panel p-2xl text-center max-w-lg mx-auto">
        <span className="material-symbols-outlined text-error" style={{ fontSize: 36 }}>error</span>
        <p className="font-body text-body-md text-on-surface mt-sm">{error}</p>
        <Link to="/candidates" className="btn-ghost mt-md inline-flex">Back to candidates</Link>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="grid lg:grid-cols-3 gap-lg">
        <div className="lg:col-span-2 space-y-lg">
          <div className="skeleton h-64" />
          <div className="skeleton h-48" />
        </div>
        <div className="skeleton h-96" />
      </div>
    );
  }

  const { analysis, parsed, recommendation } = candidate;

  async function exportReport() {
    if (!candidate || exporting) return;
    setExporting(true);
    try {
      const filename = await downloadCandidateReport(candidate, role);
      push(`Downloaded ${filename}`, 'success');
    } catch (err) {
      push(`Could not generate the PDF: ${(err as Error).message}`, 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-lg">
      <header className="flex items-start justify-between gap-md flex-wrap">
        <div className="flex items-start gap-md">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-lg grid place-items-center text-on-surface-variant
                       hover:text-primary hover:bg-surface-container-high transition-all
                       hover:-translate-x-0.5 mt-xs"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="font-heading text-headline-lg">{parsed.name}</h1>
            <p className="font-body text-body-sm text-on-surface-variant mt-xs">
              {parsed.title || parsed.roles?.[0]?.title || 'Role not stated'}
              {' · reviewing for '}
              <span className="text-primary font-semibold">{role?.title ?? candidate.roleId}</span>
            </p>
            <div className="flex items-center gap-sm mt-sm flex-wrap">
              {parsed.contact?.email && (
                <a
                  href={`mailto:${parsed.contact.email}`}
                  className="chip bg-surface-container-high border-outline-variant text-on-surface-variant hover:text-primary"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>mail</span>
                  {parsed.contact.email}
                </a>
              )}
              {parsed.contact?.phone && (
                <span className="chip bg-surface-container-high border-outline-variant text-on-surface-variant">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>call</span>
                  {parsed.contact.phone}
                </span>
              )}
              {parsed.contact?.linkedin && (
                <a
                  href={`https://${parsed.contact.linkedin}`}
                  target="_blank"
                  rel="noreferrer"
                  className="chip bg-surface-container-high border-outline-variant text-on-surface-variant hover:text-primary"
                >
                  LinkedIn
                </a>
              )}
              {parsed.contact?.github && (
                <a
                  href={`https://${parsed.contact.github}`}
                  target="_blank"
                  rel="noreferrer"
                  className="chip bg-surface-container-high border-outline-variant text-on-surface-variant hover:text-primary"
                >
                  GitHub
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-sm">
          <button className="btn-ghost" onClick={exportReport} disabled={exporting}>
            <span
              className={`material-symbols-outlined ${exporting ? 'animate-spin' : ''}`}
              style={{ fontSize: 18 }}
            >
              {exporting ? 'progress_activity' : 'picture_as_pdf'}
            </span>
            {exporting ? 'Building PDF…' : 'Export PDF'}
          </button>
          <button
            className="btn-primary"
            onClick={async () => {
              const next = candidate.status === 'shortlisted' ? 'new' : 'shortlisted';
              await setStatus(candidate.id, next);
              setCandidate({ ...candidate, status: next });
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {candidate.status === 'shortlisted' ? 'bookmark_added' : 'bookmark_add'}
            </span>
            {candidate.status === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}
          </button>
        </div>
      </header>

      {candidate.extraction?.warning && (
        <div className="panel border-warning/40 bg-warning/10 p-md flex items-start gap-sm animate-slide-down">
          <span className="material-symbols-outlined text-warning" style={{ fontSize: 20 }}>warning</span>
          <div>
            <p className="font-body text-body-sm font-semibold text-on-surface">Extraction warning</p>
            <p className="font-body text-body-sm text-on-surface-variant mt-xs">
              {candidate.extraction.warning} Scores below may be unreliable.
            </p>
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-lg items-start">
        <div className="xl:col-span-2 space-y-lg">
          <section className="panel gradient-border p-lg">
            <div className="grid md:grid-cols-[auto,1fr] gap-lg items-center">
              <div>
                <h2 className="font-heading text-headline-md mb-md">Overall Score</h2>
                <ScoreGauge value={analysis.overall} />
                <p className="font-body text-body-sm text-on-surface-variant text-center mt-sm">
                  ATS hygiene alone:{' '}
                  <span className="text-on-surface font-semibold">{analysis.atsScore}</span>
                </p>
              </div>

              <div className="space-y-md">
                <DualScore analysis={analysis} />
                <div className="panel p-md">
                  <span className="label-eyebrow">Experience</span>
                  <p className="font-body text-body-md text-on-surface mt-xs">
                    {parsed.experienceYears != null ? `${parsed.experienceYears} years` : 'Not determined'}
                  </p>
                  <p className="font-body text-body-sm text-on-surface-variant mt-xs">
                    {analysis.experienceFit.note}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <SkillMatch analysis={analysis} />

          <section className="panel p-lg">
            <h3 className="font-heading text-headline-md mb-md">ATS breakdown</h3>
            <ul className="space-y-md">
              {analysis.breakdown.map((b) => (
                <li key={b.key}>
                  <div className="flex items-center justify-between gap-sm mb-xs">
                    <span className="font-body text-body-sm text-on-surface">
                      {b.key}
                      <span className="text-on-surface-variant ml-xs font-body text-label-md">
                        weight {b.weight}
                      </span>
                    </span>
                    <span
                      className={`font-body text-body-sm font-semibold tabular-nums ${toneClass(b.score * 100).text}`}
                    >
                      {Math.round(b.score * 100)}%
                    </span>
                  </div>
                  <ScoreBar value={b.score} tone={toneClass(b.score * 100).stroke} />
                  <p className="font-body text-label-md text-on-surface-variant mt-xs">{b.detail}</p>
                </li>
              ))}
            </ul>
          </section>

          {recommendation && (
            <section className="panel gradient-border p-lg">
              <div className="flex items-center gap-sm mb-md flex-wrap">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 21 }}>
                  auto_awesome
                </span>
                <h3 className="font-heading text-headline-md">AI recommendation</h3>
                <span className="chip bg-primary/12 border-primary/35 text-primary ml-auto capitalize">
                  {recommendation.verdict.replace('_', ' ')} · {pct(recommendation.confidence)}
                </span>
              </div>
              <p className="font-body text-body-md text-on-surface leading-relaxed">
                {recommendation.summary}
              </p>
              <div className="grid md:grid-cols-2 gap-md mt-md">
                <div>
                  <p className="label-eyebrow mb-sm">Strengths</p>
                  <ul className="space-y-xs">
                    {recommendation.strengths.map((s, i) => (
                      <li key={i} className="font-body text-body-sm text-on-surface-variant flex gap-xs">
                        <span className="material-symbols-outlined text-success flex-shrink-0" style={{ fontSize: 15 }}>
                          add
                        </span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="label-eyebrow mb-sm">Concerns</p>
                  <ul className="space-y-xs">
                    {recommendation.concerns.map((s, i) => (
                      <li key={i} className="font-body text-body-sm text-on-surface-variant flex gap-xs">
                        <span className="material-symbols-outlined text-error flex-shrink-0" style={{ fontSize: 15 }}>
                          remove
                        </span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {recommendation.interviewQuestions && recommendation.interviewQuestions.length > 0 && (
                <div className="mt-md pt-md border-t border-outline-variant">
                  <p className="label-eyebrow mb-sm">Suggested interview questions</p>
                  <ol className="space-y-xs list-decimal list-inside">
                    {recommendation.interviewQuestions.map((q, i) => (
                      <li key={i} className="font-body text-body-sm text-on-surface-variant">{q}</li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}

          <section className="panel p-lg">
            <div className="flex items-center gap-sm mb-md">
              <span className="material-symbols-outlined text-tertiary" style={{ fontSize: 21 }}>
                lightbulb
              </span>
              <h3 className="font-heading text-headline-md">Insights &amp; suggestions</h3>
            </div>
            <ul className="space-y-sm stagger">
              {analysis.insights.map((insight, i) => {
                const meta = INSIGHT_META[insight.type] ?? INSIGHT_META.suggestion;
                return (
                  <li
                    key={i}
                    style={{ '--i': i } as React.CSSProperties}
                    className={`rounded-xl border p-md ${meta.bg}`}
                  >
                    <div className="flex items-start gap-sm">
                      <span
                        className={`material-symbols-outlined ${meta.className} flex-shrink-0`}
                        style={{ fontSize: 18 }}
                      >
                        {meta.icon}
                      </span>
                      <div>
                        <p className="font-body text-body-sm font-semibold text-on-surface">
                          {insight.title}
                        </p>
                        <p className="font-body text-body-sm text-on-surface-variant mt-xs leading-relaxed">
                          {insight.body}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="space-y-lg xl:sticky xl:top-24">
          <DocumentPreview candidate={candidate} />

          {parsed.roles?.length > 0 && (
            <section className="panel p-lg">
              <h3 className="font-heading text-headline-md mb-md">Experience</h3>
              <ol className="space-y-md">
                {parsed.roles.map((r, i) => (
                  <li key={i} className="relative pl-md border-l-2 border-outline-variant">
                    <span
                      className={`absolute -left-[5px] top-xs w-2 h-2 rounded-full ${
                        r.current ? 'gradient-surface' : 'bg-outline'
                      }`}
                    />
                    <p className="font-body text-body-sm font-semibold text-on-surface">{r.title}</p>
                    {r.company && (
                      <p className="font-body text-body-sm text-on-surface-variant">{r.company}</p>
                    )}
                    <p className="font-body text-label-md text-on-surface-variant mt-xs">
                      {r.start} — {r.end}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {parsed.education?.entries?.length > 0 && (
            <section className="panel p-lg">
              <h3 className="font-heading text-headline-md mb-md">Education</h3>
              <ul className="space-y-sm">
                {parsed.education.entries.map((e, i) => (
                  <li key={i} className="font-body text-body-sm text-on-surface-variant">{e.text}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel p-lg">
            <h3 className="font-heading text-headline-md mb-md">Confidence signals</h3>
            <ul className="space-y-sm">
              {analysis.confidenceSignals.map((s) => (
                <li key={s.label}>
                  <div className="flex items-center justify-between gap-sm mb-xs">
                    <span className="font-body text-body-sm text-on-surface-variant">{s.label}</span>
                    <span className="font-body text-label-md text-on-surface tabular-nums">
                      {Math.round(s.value * 100)}%
                    </span>
                  </div>
                  <ScoreBar value={s.value} tone="rgb(var(--tertiary))" />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
