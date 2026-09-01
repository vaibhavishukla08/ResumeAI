import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Candidate } from '@shared/types';
import FilterBar, { DEFAULT_FILTERS, applyFilters, type Filters } from '@/components/FilterBar';
import CandidateRow from '@/components/CandidateRow';
import DocumentPreview from '@/components/DocumentPreview';
import { api } from '@/lib/api';
import { toCsv, downloadFile, CANDIDATE_COLUMNS } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import type { Workspace } from '@/App';

export default function Candidates({
  role, candidates, skills, search, setStatus,
}: Workspace) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [full, setFull] = useState<Candidate | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const { push } = useToast();
  const navigate = useNavigate();

  const visible = useMemo(
    () => applyFilters(candidates, filters, search, role),
    [candidates, filters, search, role],
  );

  // List records omit the raw text; fetch the full record for the preview pane.
  useEffect(() => {
    if (!selectedId) {
      setFull(null);
      return;
    }
    let cancelled = false;
    api
      .candidate(selectedId)
      .then(({ candidate }) => !cancelled && setFull(candidate))
      .catch((err: Error) => push(err.message, 'error'));
    return () => {
      cancelled = true;
    };
  }, [selectedId, push]);

  const toggleCheck = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  function exportCsv() {
    downloadFile(
      toCsv(visible, CANDIDATE_COLUMNS),
      `${role?.id ?? 'candidates'}-${Date.now()}.csv`,
      'text/csv',
    );
    push(`Exported ${visible.length} rows.`, 'success');
  }

  async function bulkStatus(status: 'shortlisted' | 'rejected') {
    for (const id of checked) await setStatus(id, status);
    push(`${checked.length} candidate(s) marked ${status}.`, 'success');
    setChecked([]);
  }

  if (!role) {
    return (
      <div className="panel p-2xl text-center max-w-lg mx-auto">
        <p className="font-body text-body-md text-on-surface-variant">Create a job role first.</p>
        <Link to="/roles" className="btn-primary mt-md inline-flex">Go to roles</Link>
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      <header className="flex items-end justify-between gap-md flex-wrap">
        <div>
          <h1 className="font-heading text-headline-lg">Candidates</h1>
          <p className="font-body text-body-sm text-on-surface-variant mt-xs">
            {role.title} · {candidates.length} analysed
          </p>
        </div>

        <div className="flex items-center gap-sm flex-wrap">
          {checked.length > 0 && (
            <div className="flex items-center gap-sm animate-slide-in-right">
              <span className="chip bg-primary/12 border-primary/35 text-primary font-semibold">
                {checked.length} selected
              </span>
              <button className="btn-ghost" onClick={() => bulkStatus('shortlisted')}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                Shortlist
              </button>
              <button className="btn-ghost" onClick={() => bulkStatus('rejected')}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>cancel</span>
                Reject
              </button>
              <button
                className="btn-primary"
                onClick={() => navigate('/compare', { state: { candidateIds: checked } })}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>balance</span>
                Compare
              </button>
            </div>
          )}
          <button className="btn-ghost" onClick={exportCsv} disabled={!visible.length}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
            Export CSV
          </button>
        </div>
      </header>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        skills={skills}
        resultCount={visible.length}
        totalCount={candidates.length}
      />

      <div className="grid xl:grid-cols-3 gap-lg items-start">
        <div className="xl:col-span-2">
          {visible.length ? (
            <>
              <div className="flex items-center gap-sm mb-sm px-md">
                <input
                  type="checkbox"
                  checked={checked.length === visible.length && visible.length > 0}
                  onChange={(e) => setChecked(e.target.checked ? visible.map((c) => c.id) : [])}
                  className="w-4 h-4 rounded accent-primary cursor-pointer"
                  aria-label="Select all visible candidates"
                />
                <span className="label-eyebrow">Select all visible</span>
              </div>
              <ul className="space-y-sm stagger">
                {visible.map((c, i) => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    rank={i + 1}
                    index={i}
                    selected={selectedId === c.id}
                    onSelect={setSelectedId}
                    onStatus={setStatus}
                    checked={checked.includes(c.id)}
                    onCheck={toggleCheck}
                  />
                ))}
              </ul>
            </>
          ) : (
            <div className="panel p-2xl text-center animate-scale-in">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-surface-container-high grid place-items-center">
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 26 }}>
                  filter_alt_off
                </span>
              </div>
              <p className="font-body text-body-md text-on-surface mt-md">
                {candidates.length ? 'No candidates match these filters.' : 'No resumes analysed yet.'}
              </p>
              <p className="font-body text-body-sm text-on-surface-variant mt-xs">
                {candidates.length
                  ? 'Loosen a threshold or clear the skill filters.'
                  : 'Upload a batch from the dashboard to get started.'}
              </p>
              {candidates.length > 0 ? (
                <button className="btn-ghost mt-md" onClick={() => setFilters(DEFAULT_FILTERS)}>
                  Reset filters
                </button>
              ) : (
                <Link to="/" className="btn-primary mt-md inline-flex">Upload resumes</Link>
              )}
            </div>
          )}
        </div>

        <div className="hidden xl:block sticky top-24 space-y-sm">
          <DocumentPreview candidate={full} />
          {full && (
            <Link to={`/candidate/${full.id}`} className="btn-primary w-full">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>analytics</span>
              Open full analysis
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
