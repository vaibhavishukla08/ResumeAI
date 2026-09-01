import { useState } from 'react';
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
  roles, roleId, candidates, refreshRoles, refreshCandidates,
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

  /** Preview which terms the taxonomy will recognise as we type. */
  const previewSkills = (editing?.required ?? '')
    .split(/[,\n;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

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
              <p className="label-eyebrow mb-xs">Click a skill to mark it must-have (weighted 3×)</p>
              <div className="flex flex-wrap gap-xs">
                {previewSkills.map((label) => {
                  const key = label.toLowerCase();
                  const on = editing.mustHave.some((m) => m.toLowerCase() === key);
                  return (
                    <button
                      key={label}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          mustHave: on
                            ? editing.mustHave.filter((m) => m.toLowerCase() !== key)
                            : [...editing.mustHave, label],
                        })
                      }
                      className={`chip hover:scale-105 ${
                        on
                          ? 'bg-primary/12 border-primary/35 text-primary font-semibold'
                          : 'bg-surface-container-high border-outline-variant text-on-surface-variant'
                      }`}
                    >
                      {on && (
                        <span className="material-symbols-outlined filled" style={{ fontSize: 13 }}>
                          priority_high
                        </span>
                      )}
                      {label}
                    </button>
                  );
                })}
              </div>
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
