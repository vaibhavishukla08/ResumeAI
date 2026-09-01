import { Link } from 'react-router-dom';
import type { CandidateStatus, CandidateSummary } from '@shared/types';
import { initials, toneClass } from '@/lib/format';

export const STATUS_META: Record<CandidateStatus, { label: string; icon: string; className: string }> = {
  new: {
    label: 'New',
    icon: 'fiber_new',
    className: 'bg-surface-container-high border-outline-variant text-on-surface-variant',
  },
  shortlisted: {
    label: 'Shortlisted',
    icon: 'bookmark',
    className: 'bg-success/12 border-success/35 text-success',
  },
  rejected: {
    label: 'Rejected',
    icon: 'block',
    className: 'bg-error/10 border-error/30 text-error',
  },
};

interface CandidateRowProps {
  candidate: CandidateSummary;
  selected?: boolean;
  onSelect: (id: string) => void;
  onStatus: (id: string, status: CandidateStatus) => void;
  checked?: boolean;
  onCheck?: (id: string) => void;
  rank?: number;
  index?: number;
}

export default function CandidateRow({
  candidate,
  selected,
  onSelect,
  onStatus,
  checked,
  onCheck,
  rank,
  index = 0,
}: CandidateRowProps) {
  const { analysis, parsed } = candidate;
  const tone = toneClass(analysis.overall);
  const status = STATUS_META[candidate.status] ?? STATUS_META.new;

  return (
    <li
      style={{ '--i': index } as React.CSSProperties}
      className={`panel p-md flex items-center gap-md cursor-pointer hover-lift
                  ${selected ? 'border-primary/50 shadow-glow' : ''}`}
      onClick={() => onSelect(candidate.id)}
    >
      {onCheck && (
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            e.stopPropagation();
            onCheck(candidate.id);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded accent-primary flex-shrink-0 cursor-pointer"
          aria-label={`Select ${parsed.name} for comparison`}
        />
      )}

      {rank != null && (
        <span className="font-body text-label-md text-on-surface-variant w-5 text-center flex-shrink-0 tabular-nums">
          {rank}
        </span>
      )}

      <div className="w-10 h-10 rounded-full gradient-surface grid place-items-center flex-shrink-0">
        <span className="font-body text-body-sm font-bold text-white">{initials(parsed.name)}</span>
      </div>

      {/* The name must win the flex fight against the metric columns. */}
      <div className="flex-1 min-w-[150px]">
        <div className="flex items-center gap-sm">
          <p className="font-body text-body-md font-semibold text-on-surface truncate">
            {parsed.name}
          </p>
          {candidate.extraction?.warning && (
            <span
              className="material-symbols-outlined text-warning flex-shrink-0"
              style={{ fontSize: 15 }}
              title={candidate.extraction.warning}
            >
              warning
            </span>
          )}
        </div>
        <p className="font-body text-body-sm text-on-surface-variant truncate">
          {parsed.title || parsed.roles?.[0]?.title || 'Role not stated'}
          {parsed.experienceYears != null && ` · ${parsed.experienceYears}y`}
          {` · ${analysis.skills.matchedCount}/${analysis.skills.requiredCount} skills`}
        </p>
      </div>

      <div className="hidden 2xl:flex flex-col items-end flex-shrink-0 w-14">
        <span className="font-body text-label-md text-on-surface-variant">ATS</span>
        <span className="font-body text-body-md font-semibold text-on-surface tabular-nums">
          {analysis.atsScore}
        </span>
      </div>

      <div className="flex flex-col items-end flex-shrink-0">
        <span className={`font-heading text-headline-md ${tone.text} tabular-nums`}>
          {analysis.overall}
        </span>
        <span className="font-body text-label-md text-on-surface-variant">Overall</span>
      </div>

      <span
        className={`chip ${tone.bg} ${tone.border} ${tone.text} font-semibold hidden lg:inline-flex flex-shrink-0`}
      >
        {analysis.band.label}
      </span>

      <span
        className={`chip ${status.className} hidden 2xl:inline-flex flex-shrink-0`}
        title={`Status: ${status.label}`}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{status.icon}</span>
        {status.label}
      </span>

      <div className="flex items-center gap-xs flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStatus(candidate.id, candidate.status === 'shortlisted' ? 'new' : 'shortlisted');
          }}
          className={`w-8 h-8 rounded-lg grid place-items-center transition-all duration-200 ${
            candidate.status === 'shortlisted'
              ? 'bg-success/20 text-success'
              : 'text-on-surface-variant hover:text-success hover:bg-success/10'
          }`}
          aria-label={`Shortlist ${parsed.name}`}
          title="Shortlist"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStatus(candidate.id, candidate.status === 'rejected' ? 'new' : 'rejected');
          }}
          className={`w-8 h-8 rounded-lg grid place-items-center transition-all duration-200 ${
            candidate.status === 'rejected'
              ? 'bg-error/20 text-error'
              : 'text-on-surface-variant hover:text-error hover:bg-error/10'
          }`}
          aria-label={`Reject ${parsed.name}`}
          title="Reject"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>cancel</span>
        </button>
        <Link
          to={`/candidate/${candidate.id}`}
          onClick={(e) => e.stopPropagation()}
          className="w-8 h-8 rounded-lg grid place-items-center text-on-surface-variant
                     hover:text-primary hover:bg-primary/10 transition-all duration-200
                     hover:translate-x-0.5"
          aria-label={`Open full analysis for ${parsed.name}`}
          title="Full analysis"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
        </Link>
      </div>
    </li>
  );
}
