import { useMemo, useState } from 'react';
import type { RoleInput, Role } from '@shared/types';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import type { Workspace } from '@/App';

type Draft = Required<Pick<RoleInput, 'title' | 'department' | 'description' | 'required'>> & {
  id?: string;
  minYears: number | string;
  maxYears: number | string;
  mustHave: string[];
};

const BLANK: Draft = {
  title: '',
  department: '',
  description: '',
  required: '',
  minYears: 0,
  maxYears: '',
  mustHave: [],
};

export default function Roles({
  roles, roleId, candidates, skills, refreshRoles, refreshCandidates,
}: Workspace) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const { push } = useToast();

  const startEdit = (role: Role) =>
    setEditing({
      id: role.id,
      title: role.title,
      department: role.department ?? '',
      description: role.description ?? '',
      required: role.required || role.requiredSkills.map((s) => s.label).join(', '),
      minYears: role.minYears ?? 0,
      maxYears: role.maxYears ?? '',
      mustHave: role.mustHave ?? [],
    });

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.saveRole(editing);
      await refreshRoles();
      push(`Saved "${editing.title}".`, 'success');
      setEditing(null);
    } catch (err) {
      push((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(role: Role) {
    const count = candidates.filter((c) => c.roleId === role.id).length;
    const message = count
      ? `Delete "${role.title}" and its ${count} analysed candidate(s)? This cannot be undone.`
      : `Delete "${role.title}"?`;
    if (!window.confirm(message)) return;

    try {
      await api.deleteRole(role.id);
      await refreshRoles();
      push(`Deleted "${role.title}".`, 'success');
    } catch (err) {
      push((err as Error).message, 'error');
    }
  }

  async function rescore(role: Role) {
    try {
      push(`Re-scoring candidates for "${role.title}"…`, 'info');
      const { updated } = await api.rescore(role.id);
      await refreshCandidates();
      push(`Re-scored ${updated} candidate(s).`, 'success');
    } catch (err) {
      push((err as Error).message, 'error');
    }
  }

  /**
   * Resolve a typed term the same way the server does: exact match on a skill's
   * label or on any of its aliases, case-insensitively. Building the lookup from
   * the same data the server sends means the badge shown here cannot disagree
   * with the id the role is actually stored under.
   */
  const lookup = useMemo(() => {
    const map = new Map<string, { id: string; label: string; category: string }>();
    for (const skill of skills) {
      map.set(skill.label.toLowerCase(), skill);
      for (const alias of skill.aliases ?? []) map.set(alias.toLowerCase(), skill);
    }
    return map;
  }, [skills]);

  /** Each typed term, with whether the taxonomy recognised it. */
  const previewSkills = useMemo(() => {
    const seen = new Set<string>();
    return (editing?.required ?? '')
      .split(/[,\n;|]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((typed) => {
        const match = lookup.get(typed.toLowerCase());
        return {
          typed,
          matched: match ?? null,
          // What the role will actually be keyed on once saved.
          id: match ? match.id : `custom:${typed.toLowerCase()}`,
        };
      })
      .filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      });
  }, [editing?.required, lookup]);

  const recognised = previewSkills.filter((p) => p.matched).length;

  return (
    <div className="space-y-lg">
      <header className="flex items-end justify-between gap-md flex-wrap">
        <div>
          <h1 className="font-heading text-headline-lg">Job roles</h1>
          <p className="font-body text-body-sm text-on-surface-variant mt-xs">
            Each role defines the requirements every resume is scored against.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ ...BLANK })}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          New role
        </button>
      </header>

      {editing && (
        <section className="panel gradient-border p-lg animate-slide-down">
          <h2 className="font-heading text-headline-md mb-md">
            {editing.id ? 'Edit role' : 'New role'}
          </h2>

          <div className="grid md:grid-cols-2 gap-md">
            <label>
              <span className="label-eyebrow block mb-xs">Title *</span>
              <input
                className="field"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="Senior Frontend Engineer"
              />
            </label>
            <label>
              <span className="label-eyebrow block mb-xs">Department</span>
              <input
                className="field"
                value={editing.department}
                onChange={(e) => setEditing({ ...editing, department: e.target.value })}
                placeholder="Engineering"
              />
            </label>
            <label>
              <span className="label-eyebrow block mb-xs">Minimum years</span>
              <input
                type="number"
                min="0"
                max="40"
                className="field"
                value={editing.minYears}
                onChange={(e) => setEditing({ ...editing, minYears: e.target.value })}
              />
            </label>
            <label>
              <span className="label-eyebrow block mb-xs">Maximum years (optional)</span>
              <input
                type="number"
                min="0"
                max="40"
                className="field"
                value={editing.maxYears}
                onChange={(e) => setEditing({ ...editing, maxYears: e.target.value })}
                placeholder="no upper bound"
              />
            </label>
          </div>

          <label className="block mt-md">
            <span className="label-eyebrow block mb-xs">Required skills * (comma separated)</span>
            <textarea
              className="field min-h-[80px] resize-y"
              value={editing.required}
              onChange={(e) => setEditing({ ...editing, required: e.target.value })}
              placeholder="React, TypeScript, Node.js, GraphQL, Testing"
            />
          </label>

          {previewSkills.length > 0 && (
            <div className="mt-sm animate-slide-down">
              <div className="flex items-baseline justify-between gap-md mb-xs flex-wrap">
                <p className="label-eyebrow">
                  Click a skill to mark it must-have (weighted 3×)
                </p>
                <p className="font-body text-body-sm text-on-surface-variant">
                  <span className="text-success font-semibold">{recognised}</span> recognised
                  {previewSkills.length - recognised > 0 && (
                    <>
                      {' · '}
                      <span className="text-warning font-semibold">
                        {previewSkills.length - recognised}
                      </span>{' '}
                      custom
                    </>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap gap-xs">
                {previewSkills.map(({ typed, matched }) => {
                  const key = typed.toLowerCase();
                  const on = editing.mustHave.some((m) => m.toLowerCase() === key);
                  return (
                    <button
                      key={typed}
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          mustHave: on
                            ? editing.mustHave.filter((m) => m.toLowerCase() !== key)
                            : [...editing.mustHave, typed],
                        })
                      }
                      title={
                        matched
                          ? `Recognised as "${matched.label}" (${matched.category}). Detected in resumes under that name and its aliases.`
                          : 'Not in the skill library — matched literally against resume text. Still works, but only exact wording will match.'
                      }
                      className={`chip hover:scale-105 ${
                        on
                          ? 'bg-primary/12 border-primary/35 text-primary font-semibold'
                          : matched
                            ? 'bg-surface-container-high border-outline-variant text-on-surface'
                            : 'bg-warning/10 border-warning/30 text-warning'
                      }`}
                    >
                      {on && (
                        <span className="material-symbols-outlined filled" style={{ fontSize: 13 }}>
                          priority_high
                        </span>
                      )}
                      {matched ? matched.label : typed}
                      {!matched && (
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: 13 }}
                          aria-label="custom skill"
                        >
                          help
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {previewSkills.length - recognised > 0 && (
                <p className="font-body text-body-sm text-on-surface-variant mt-sm">
                  Amber skills are not in the library. They still work — they are
                  matched literally against the resume text — but only that exact
                  wording will match, so a synonym on the candidate's resume will
                  be missed. Renaming to the library term picks up its aliases too.
                </p>
              )}
            </div>
          )}

          <label className="block mt-md">
            <span className="label-eyebrow block mb-xs">
              Job description — used for the similarity score
            </span>
            <textarea
              className="field min-h-[140px] resize-y"
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Paste the full job description. The more real language it contains, the more meaningful the similarity score."
            />
          </label>

          <div className="flex items-center gap-sm mt-md">
            <button className="btn-primary" onClick={save} disabled={saving || !editing.title.trim()}>
              {saving ? 'Saving…' : 'Save role'}
            </button>
            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-md stagger">
        {roles.map((role, i) => {
          const count = candidates.filter((c) => c.roleId === role.id).length;
          return (
            <section
              key={role.id}
              style={{ '--i': i } as React.CSSProperties}
              className={`panel p-lg hover-lift ${role.id === roleId ? 'border-primary/50 shadow-glow' : ''}`}
            >
              <div className="flex items-start justify-between gap-sm">
                <div className="min-w-0">
                  <h3 className="font-heading text-headline-md truncate">{role.title}</h3>
                  <p className="font-body text-body-sm text-on-surface-variant mt-xs">
                    {role.department} · {role.minYears}
                    {role.maxYears ? `–${role.maxYears}` : '+'}y · {count} candidates
                  </p>
                </div>
                <div className="flex items-center gap-xs flex-shrink-0">
                  <button
                    className="btn-quiet"
                    onClick={() => rescore(role)}
                    title="Re-score all candidates against the current requirements"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
                  </button>
                  <button className="btn-quiet" onClick={() => startEdit(role)} title="Edit">
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                  </button>
                  <button
                    className="btn-quiet hover:text-error"
                    onClick={() => remove(role)}
                    title="Delete"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  </button>
                </div>
              </div>

              {role.description && (
                <p className="font-body text-body-sm text-on-surface-variant mt-sm line-clamp-3">
                  {role.description}
                </p>
              )}

              <div className="flex flex-wrap gap-xs mt-md">
                {role.requiredSkills.map((s) => (
                  <span
                    key={s.id}
                    className={`chip ${
                      (role.weights?.[s.id] ?? 1) >= 3
                        ? 'bg-primary/12 border-primary/35 text-primary'
                        : 'bg-surface-container-high border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
