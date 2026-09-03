import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import type { Workspace } from '@/App';

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-md py-sm border-b border-outline-variant last:border-0">
      <div>
        <p className="font-body text-body-sm text-on-surface">{label}</p>
        {hint && <p className="font-body text-label-md text-on-surface-variant mt-xs">{hint}</p>}
      </div>
      <span className="font-body text-body-sm text-on-surface-variant text-right flex-shrink-0 max-w-[45%]">
        {value}
      </span>
    </div>
  );
}

export default function Settings({ health, role, candidates, refreshCandidates }: Workspace) {
  const gemini = health?.gemini;
  const { user, logout } = useAuth();
  const { push } = useToast();

  async function clearAll() {
    const message = `Delete all ${candidates.length} analysed candidates for "${role?.title}"? This cannot be undone.`;
    if (!window.confirm(message)) return;
    try {
      const { removed } = await api.clearCandidates(role?.id);
      await refreshCandidates();
      push(`Cleared ${removed} candidate(s).`, 'success');
    } catch (err) {
      push((err as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-lg max-w-3xl">
      <header>
        <h1 className="font-heading text-headline-lg">Settings</h1>
        <p className="font-body text-body-sm text-on-surface-variant mt-xs">
          Account, engine status and workspace data.
        </p>
      </header>

      <section className="panel p-lg">
        <h2 className="font-heading text-headline-md mb-md">Account</h2>
        <Row label="Name" value={user?.name ?? '—'} />
        <Row label="Email" value={user?.email ?? '—'} />
        <Row label="Company" value={user?.company || '—'} />
        <Row label="Role" value={user?.role ?? '—'} hint="The first account created owns the deployment." />
        <Row
          label="Workspace"
          value={`${candidates.length} candidates`}
          hint="Roles and candidates are scoped to your account alone."
        />
        <button className="btn-ghost mt-md" onClick={() => void logout()}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
          Sign out
        </button>
      </section>

      <SecuritySection />

      <section className="panel p-lg">
        <div className="flex items-center gap-sm mb-md flex-wrap">
          <span
            className={`material-symbols-outlined ${gemini?.enabled ? 'text-success' : 'text-on-surface-variant'}`}
            style={{ fontSize: 21 }}
          >
            {gemini?.enabled ? 'auto_awesome' : 'functions'}
          </span>
          <h2 className="font-heading text-headline-md">Analysis engine</h2>
          <span
            className={`chip ml-auto ${
              gemini?.enabled
                ? 'bg-success/12 border-success/35 text-success'
                : 'bg-surface-container-high border-outline-variant text-on-surface-variant'
            }`}
          >
            {gemini?.enabled ? 'Gemini active' : 'Local only'}
          </span>
        </div>

        <Row
          label="Structured extraction"
          hint="Pulls name, roles, dates and skills out of raw resume text"
          value={gemini?.enabled ? gemini.extractModel : 'Local regex + taxonomy parser'}
        />
        <Row
          label="Recommendations"
          hint="The plain-English 'why this candidate' write-up"
          value={gemini?.enabled ? gemini.reasonModel : 'Rule-based insights'}
        />
        <Row
          label="Similarity"
          hint="Resume-to-JD distance"
          value={gemini?.enabled ? `${gemini.embedModel} (TF-IDF fallback)` : 'TF-IDF cosine'}
        />
        <Row
          label="Scanned PDFs and photos"
          hint="Documents with no text layer"
          value={gemini?.enabled ? 'Gemini vision, Tesseract fallback' : 'Tesseract OCR'}
        />
        <Row label="Max upload size" value={`${health?.maxFileMb ?? 12} MB per file`} />

        <div
          className={`mt-md p-md rounded-xl border ${
            gemini?.enabled
              ? 'bg-success/10 border-success/25'
              : 'bg-primary/10 border-primary/25'
          }`}
        >
          {gemini?.enabled ? (
            <p className="font-body text-body-sm text-on-surface">
              <span className="font-semibold">Gemini is active.</span> Resume text is sent to
              Google&apos;s API for extraction and recommendations. Turn it off by removing
              <code className="font-mono text-primary mx-xs">GEMINI_API_KEY</code>
              from <code className="font-mono text-primary">server/.env</code> and restarting.
            </p>
          ) : (
            <>
              <p className="font-body text-body-sm text-on-surface">
                <span className="font-semibold">Running without Gemini.</span> Every feature works,
                but extraction is regex-based and recommendations are rule-based rather than written
                prose. To enable the AI layer, add your key to{' '}
                <code className="font-mono text-primary">server/.env</code>:
              </p>
              <pre className="mt-sm p-sm rounded-lg bg-surface-container-lowest font-mono text-body-sm overflow-x-auto">
                GEMINI_API_KEY=your_key_here
              </pre>
              <p className="font-body text-body-sm text-on-surface-variant mt-sm">
                Free key at{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  aistudio.google.com/apikey
                </a>
                , then restart the server. The key stays server-side and is never sent to the browser.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="panel p-lg">
        <h2 className="font-heading text-headline-md mb-md">How the scores differ</h2>
        <div className="space-y-md">
          <div>
            <p className="font-body text-body-sm font-semibold text-primary">Similarity — objective</p>
            <p className="font-body text-body-sm text-on-surface-variant mt-xs">
              Cosine distance between the resume and the job description. Pure geometry: it measures
              language overlap and nothing else. A resume can score high here by repeating the JD&apos;s
              vocabulary without any real depth.
            </p>
          </div>
          <div>
            <p className="font-body text-body-sm font-semibold text-tertiary">Confidence — subjective</p>
            <p className="font-body text-body-sm text-on-surface-variant mt-xs">
              How much to trust the match. Built from evidence quality: whether skills appear in
              context or only in a list, whether seniority fits, whether the document parsed cleanly.
              High similarity with low confidence is the classic keyword-stuffed resume.
            </p>
          </div>
          <div>
            <p className="font-body text-body-sm font-semibold text-on-surface">ATS score — hygiene</p>
            <p className="font-body text-body-sm text-on-surface-variant mt-xs">
              How well this document would survive a conventional keyword-and-format ATS pass.
              Deliberately independent of fit — a well-built resume for the wrong role scores high
              here and low on similarity.
            </p>
          </div>
        </div>
      </section>

      <section className="panel border-error/30 p-lg">
        <h2 className="font-heading text-headline-md mb-xs">Danger zone</h2>
        <p className="font-body text-body-sm text-on-surface-variant mb-md">
          Removes every analysed candidate for {role?.title ?? 'the current role'} and their stored files.
        </p>
        <button className="btn-danger" onClick={clearAll} disabled={!candidates.length}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete_forever</span>
          Clear {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
        </button>
      </section>
    </div>
  );
}


/**
 * Account security: password change and visible session control.
 *
 * Showing active sessions matters more than it looks — it is the only way a
 * user can notice that somebody else is signed in as them, and "sign out
 * everywhere" is the fix once they do.
 */
interface SessionRow {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ip: string | null;
}

function SecuritySection() {
  const { user, logout } = useAuth();
  const { push } = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const loadSessions = () => {
    api
      .sessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => setSessions([]));
  };

  useEffect(loadSessions, []);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (next.length < 10) return setError('New password must be at least 10 characters.');
    if (next !== confirm) return setError('New passwords do not match.');

    setBusy(true);
    setError(null);
    try {
      const { revoked } = await api.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      push(
        revoked
          ? `Password updated. ${revoked} other session(s) signed out.`
          : 'Password updated.',
        'success',
      );
      loadSessions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  async function signOutEverywhere() {
    if (!window.confirm('Sign out of every device, including this one?')) return;
    try {
      await api.logoutAll();
    } finally {
      // The server has revoked the sessions either way; drop local state too.
      await logout();
    }
  }

  return (
    <section className="panel p-lg">
      <h2 className="font-heading text-headline-md mb-md">Security</h2>

      {user?.provider === 'demo' ? (
        <p className="font-body text-body-sm text-on-surface-variant">
          This is the shared demo workspace. It has no password to change, and
          everything in it is visible to anyone else exploring the demo — sign
          up for your own workspace before uploading anything real.
        </p>
      ) : user?.provider === 'google' ? (
        <p className="font-body text-body-sm text-on-surface-variant">
          This account signs in with Google, so there is no password here to change.
          Manage it from your Google account settings.
        </p>
      ) : (
        <form onSubmit={changePassword} className="space-y-md max-w-sm" noValidate>
          <label className="block">
            <span className="label-eyebrow block mb-xs">Current password</span>
            <input
              type="password"
              className="field"
              value={current}
              autoComplete="current-password"
              onChange={(e) => { setCurrent(e.target.value); setError(null); }}
            />
          </label>
          <label className="block">
            <span className="label-eyebrow block mb-xs">New password</span>
            <input
              type="password"
              className="field"
              value={next}
              autoComplete="new-password"
              placeholder="At least 10 characters"
              onChange={(e) => { setNext(e.target.value); setError(null); }}
            />
          </label>
          <label className="block">
            <span className="label-eyebrow block mb-xs">Confirm new password</span>
            <input
              type="password"
              className="field"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => { setConfirm(e.target.value); setError(null); }}
            />
          </label>

          {error && (
            <p className="font-body text-body-sm text-error animate-slide-down">{error}</p>
          )}

          <button type="submit" className="btn-primary" disabled={busy || !current || !next}>
            {busy ? 'Updating…' : 'Change password'}
          </button>
        </form>
      )}

      <div className="mt-lg pt-md border-t border-outline-variant">
        <div className="flex items-center justify-between gap-md flex-wrap mb-sm">
          <h3 className="font-body text-body-md font-semibold text-on-surface">
            Active sessions
          </h3>
          <button className="btn-quiet" onClick={loadSessions}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
            Refresh
          </button>
        </div>

        <ul className="space-y-xs">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-sm px-sm py-xs rounded-lg bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 17 }}>
                {s.current ? 'computer' : 'devices'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-body text-body-sm text-on-surface truncate">
                  {s.userAgent ?? 'Unknown device'}
                </p>
                <p className="font-body text-label-md text-on-surface-variant">
                  last seen {new Date(s.lastSeenAt).toLocaleString()}
                  {s.ip ? ` · ${s.ip}` : ''}
                </p>
              </div>
              {s.current && (
                <span className="chip bg-success/12 border-success/35 text-success flex-shrink-0">
                  This device
                </span>
              )}
            </li>
          ))}
          {!sessions.length && (
            <li className="font-body text-body-sm text-on-surface-variant">
              No other sessions.
            </li>
          )}
        </ul>

        <button className="btn-danger mt-md" onClick={signOutEverywhere}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
          Sign out everywhere
        </button>
      </div>
    </section>
  );
}
