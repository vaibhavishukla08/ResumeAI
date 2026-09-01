import { useEffect, useMemo, useState } from 'react';
import type { RoleInput, Role, TemplateSector } from '@shared/types';
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

  const [browsing, setBrowsing] = useState(false);
  const [sectors, setSectors] = useState<TemplateSector[]>([]);
  const [templateCount, setTemplateCount] = useState(0);
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [templateSearch, setTemplateSearch] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  // Fetched once when the catalogue is first opened, not on mount: most visits
  // to this page are to edit an existing role, and the payload is reference
  // data that never changes within a session.
  useEffect(() => {
    if (!browsing || sectors.length) return;
    api
      .roleTemplates()
      .then((r) => { setSectors(r.sectors); setTemplateCount(r.count); })
      .catch((err: Error) => push(err.message, 'error'));
  }, [browsing, sectors.length, push]);

  const visibleTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    return sectors
      .filter((g) => sectorFilter === 'all' || g.sector === sectorFilter)
      .map((g) => ({
        ...g,
        templates: g.templates.filter(
          (t) =>
            !q ||
            t.title.toLowerCase().includes(q) ||
            t.department.toLowerCase().includes(q) ||
            t.required.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.templates.length > 0);
  }, [sectors, sectorFilter, templateSearch]);

  const alreadyAdded = useMemo(
    () => new Set(roles.map((r) => r.title.toLowerCase())),
    [roles],
  );

  async function addTemplate(templateId: string, title: string) {
    setAdding(templateId);
    try {
      const { role } = await api.addRoleFromTemplate(templateId);
      await refreshRoles();
      push(`Added "${role.title}".`, 'success');
    } catch (err) {
      push((err as Error).message, 'error');
    } finally {
      setAdding(null);
    }
    void title;
  }

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
        <div className="flex items-center gap-sm">
          <button
            className={`btn-ghost ${browsing ? 'border-primary/60 text-primary' : ''}`}
            onClick={() => setBrowsing((v) => !v)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>library_books</span>
            Browse templates
            <span
              className="material-symbols-outlined transition-transform duration-300"
              style={{ fontSize: 16, transform: browsing ? 'rotate(180deg)' : 'none' }}
            >
              expand_more
            </span>
          </button>
          <button className="btn-primary" onClick={() => setEditing({ ...BLANK })}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            New role
          </button>
        </div>
      </header>

      {browsing && (
        <section className="panel p-lg animate-slide-down">
          <div className="flex items-end justify-between gap-md flex-wrap mb-md">
            <div>
              <h2 className="font-heading text-headline-md">Role library</h2>
              <p className="font-body text-body-sm text-on-surface-variant mt-xs">
                {templateCount || '…'} ready-made roles across tech, healthcare, finance,
                legal, trades and more. Adding one copies it into your workspace, where you
                can edit it like any other role.
              </p>
            </div>
            <div className="flex items-center gap-sm flex-wrap">
              <div className="relative">
                <span
                  className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant"
                  style={{ fontSize: 18 }}
                >
                  search
                </span>
                <input
                  className="field pl-[38px] py-xs w-56"
                  placeholder="Search roles or skills…"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                />
              </div>
              <select
                className="field py-xs cursor-pointer w-44"
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
              >
                <option value="all">All sectors</option>
                {sectors.map((g) => (
                  <option key={g.sector} value={g.sector}>{g.sector}</option>
                ))}
              </select>
            </div>
          </div>

          {!sectors.length && (
            <div className="space-y-sm">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-20" />
              ))}
            </div>
          )}

          <div className="space-y-lg max-h-[560px] overflow-y-auto pr-xs">
            {visibleTemplates.map((group) => (
              <div key={group.sector}>
                <p className="label-eyebrow mb-sm sticky top-0 bg-surface-container py-xs z-10">
                  {group.sector} · {group.templates.length}
                </p>
                <div className="grid md:grid-cols-2 gap-sm">
                  {group.templates.map((t) => {
                    const added = alreadyAdded.has(t.title.toLowerCase());
                    return (
                      <article
                        key={t.id}
                        className="panel p-md flex flex-col gap-sm hover-lift"
                      >
                        <div className="flex items-start justify-between gap-sm">
                          <div className="min-w-0">
                            <h3 className="font-body text-body-md font-semibold text-on-surface truncate">
                              {t.title}
                            </h3>
                            <p className="font-body text-label-md text-on-surface-variant mt-xs">
                              {t.department} · {t.minYears}
                              {t.maxYears ? `–${t.maxYears}` : '+'}y
                            </p>
                          </div>
                          <button
                            className={added ? 'btn-ghost flex-shrink-0' : 'btn-primary flex-shrink-0'}
                            onClick={() => addTemplate(t.id, t.title)}
                            disabled={adding === t.id}
                            title={added ? 'You already have a role with this title — this adds a copy' : undefined}
                          >
                            {adding === t.id ? (
                              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 17 }}>
                                progress_activity
                              </span>
                            ) : (
                              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                                {added ? 'library_add_check' : 'add'}
                              </span>
                            )}
                            {added ? 'Added' : 'Add'}
                          </button>
                        </div>

                        <p className="font-body text-body-sm text-on-surface-variant line-clamp-2">
                          {t.description}
                        </p>

                        <div className="flex flex-wrap gap-xs">
                          {t.required.split(',').slice(0, 5).map((skill) => {
                            const label = skill.trim();
                            const must = t.mustHave.some(
                              (m) => m.toLowerCase() === label.toLowerCase(),
                            );
                            return (
                              <span
                                key={label}
                                className={`chip ${
                                  must
                                    ? 'bg-primary/12 border-primary/35 text-primary font-semibold'
                                    : 'bg-surface-container-high border-outline-variant text-on-surface-variant'
                                }`}
                              >
                                {must && (
                                  <span className="material-symbols-outlined filled" style={{ fontSize: 12 }}>
                                    priority_high
                                  </span>
                                )}
                                {label}
                              </span>
                            );
                          })}
                          {t.required.split(',').length > 5 && (
                            <span className="chip bg-surface-container-high border-outline-variant text-on-surface-variant">
                              +{t.required.split(',').length - 5}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}

            {sectors.length > 0 && !visibleTemplates.length && (
              <p className="font-body text-body-sm text-on-surface-variant text-center py-lg">
                No templates match that search.
              </p>
            )}
          </div>
        </section>
      )}

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
