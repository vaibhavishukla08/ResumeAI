import { api } from '@/lib/api';
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
        <button className="btn-ghost mt-md" onClick={logout}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
          Sign out
        </button>
      </section>

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
