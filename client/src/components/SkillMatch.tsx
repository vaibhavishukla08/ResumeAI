import { useState } from 'react';
import type { Analysis, MatchedSkill } from '@shared/types';

interface SkillMatchProps {
  analysis: Analysis;
}

/**
 * The two-column skill comparison from the Stitch "Skill Analysis" panel: what
 * the role asks for on the left, what the resume evidences on the right.
 */
export default function SkillMatch({ analysis }: SkillMatchProps) {
  const [hovered, setHovered] = useState<MatchedSkill | null>(null);
  const { matched, missing, additional, matchedCount, requiredCount } = analysis.skills;

  const required = [
    ...matched.map((s) => ({ ...s, has: true })),
    ...missing.map((s) => ({ ...s, has: false })),
  ].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1) || a.label.localeCompare(b.label));

  const coveragePct = requiredCount ? Math.round((matchedCount / requiredCount) * 100) : 0;

  return (
    <section className="panel p-lg" aria-label="Skill analysis">
      <div className="flex items-center justify-between gap-md mb-md flex-wrap">
        <h3 className="font-heading text-headline-md">Skill Analysis</h3>
        <div className="flex items-center gap-sm">
          <div className="w-28 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
            <div
              className="h-full gradient-surface rounded-full transition-[width] duration-1000 ease-smooth"
              style={{ width: `${coveragePct}%` }}
            />
          </div>
          <span className="chip bg-primary/12 border-primary/35 text-primary font-semibold">
            {matchedCount}/{requiredCount}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-lg">
        <div>
          <p className="label-eyebrow mb-sm">Required by role</p>
          <div className="flex flex-wrap gap-xs stagger">
            {required.map((skill, i) => (
              <span
                key={skill.id}
                style={{ '--i': i } as React.CSSProperties}
                className={`chip ${
                  skill.has
                    ? 'bg-surface-container-high border-outline-variant text-on-surface'
                    : 'bg-error/10 border-error/30 text-error'
                }`}
                title={(skill.weight ?? 1) >= 3 ? 'Must-have for this role' : 'Nice to have'}
              >
                {(skill.weight ?? 1) >= 3 && (
                  <span className="material-symbols-outlined filled" style={{ fontSize: 13 }}>
                    priority_high
                  </span>
                )}
                {skill.label}
              </span>
            ))}
            {!required.length && (
              <p className="font-body text-body-sm text-on-surface-variant">
                No requirements defined for this role.
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="label-eyebrow mb-sm">Detected in resume</p>
          <div className="flex flex-wrap gap-xs stagger">
            {matched.map((skill, i) => (
              <span
                key={skill.id}
                style={{ '--i': i } as React.CSSProperties}
                className="chip bg-success/12 border-success/35 text-success cursor-help
                           hover:bg-success/20 hover:scale-105"
                onMouseEnter={() => setHovered(skill)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
                {skill.label}
                {skill.mentions > 1 && (
                  <span className="font-body text-label-md opacity-70">×{skill.mentions}</span>
                )}
              </span>
            ))}
            {!matched.length && (
              <p className="font-body text-body-sm text-on-surface-variant">
                None of the required skills were found.
              </p>
            )}
          </div>

          {/* Evidence for the hovered chip — proves the match is not a guess. */}
          <div
            className={`mt-sm overflow-hidden transition-all duration-300 ease-smooth ${
              hovered?.evidence ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="p-sm rounded-xl bg-surface-container-high border border-outline-variant">
              <p className="label-eyebrow mb-xs">Evidence · {hovered?.label}</p>
              <p className="font-body text-body-sm text-on-surface-variant italic leading-relaxed">
                {hovered?.evidence}
              </p>
            </div>
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="mt-lg pt-md border-t border-outline-variant">
          <p className="label-eyebrow mb-sm">Missing · {missing.length}</p>
          <div className="flex flex-wrap gap-xs">
            {missing.map((skill) => (
              <span key={skill.id} className="chip bg-error/10 border-error/30 text-error">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                {skill.label}
                {(skill.weight ?? 1) >= 3 && (
                  <span className="font-body text-label-md font-bold">MUST-HAVE</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {additional.length > 0 && (
        <div className="mt-lg pt-md border-t border-outline-variant">
          <p className="label-eyebrow mb-sm">
            Additional skills not required · {additional.length}
          </p>
          <div className="flex flex-wrap gap-xs">
            {additional.map((skill) => (
              <span
                key={skill.id}
                className="chip bg-surface-container-high border-outline-variant text-on-surface-variant"
                title={skill.category}
              >
                {skill.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
