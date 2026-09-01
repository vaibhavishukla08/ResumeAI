import { useEffect, useMemo, useState } from 'react';
import type { Candidate } from '@shared/types';
import { api } from '@/lib/api';

interface Segment {
  text: string;
  hit: boolean;
}

/**
 * The right-hand "Document Preview" pane from the Stitch screens.
 *
 * Two modes: the extracted text with matched skills highlighted (which is what
 * actually explains a score, since it shows the words the engine saw), and the
 * original file. The file endpoint requires a bearer token, so it is fetched as
 * a blob rather than pointed at directly.
 */
export default function DocumentPreview({ candidate }: { candidate: Candidate | null }) {
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [zoom, setZoom] = useState(1);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const isImage = candidate?.file?.mimeType?.startsWith('image/') ?? false;
  const isPdf = candidate?.file?.mimeType === 'application/pdf';
  const canRenderFile = isImage || isPdf;

  // Fetch the original only when the file tab is actually opened.
  useEffect(() => {
    if (mode !== 'file' || !candidate || !canRenderFile) return;

    let revoked: string | null = null;
    let cancelled = false;

    api
      .fileBlobUrl(candidate.id)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        revoked = url;
        setBlobUrl(url);
        setFileError(null);
      })
      .catch((err: Error) => !cancelled && setFileError(err.message));

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
      setBlobUrl(null);
    };
  }, [mode, candidate, canRenderFile]);

  // Reset to the text tab when a different candidate is selected.
  useEffect(() => {
    setMode('text');
    setFileError(null);
  }, [candidate?.id]);

  const segments = useMemo<Segment[]>(() => {
    if (!candidate?.text) return [];
    const terms = candidate.analysis.skills.matched.map((s) => s.label);
    if (!terms.length) return [{ text: candidate.text, hit: false }];

    const pattern = terms
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length)
      .join('|');

    // Boundaries mirror the server's matcher, so "Git" does not light up
    // inside "github.com". '+' and '#' stay word-ish for C++ and C#.
    const re = new RegExp(`(^|[^A-Za-z0-9+#])(${pattern})(?![A-Za-z0-9+#])`, 'gi');

    const parts: Segment[] = [];
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(candidate.text)) !== null) {
      const start = m.index + m[1].length;
      if (start > last) parts.push({ text: candidate.text.slice(last, start), hit: false });
      parts.push({ text: m[2], hit: true });
      last = start + m[2].length;
      if (parts.length > 4000) break;
    }
    if (last < candidate.text.length) parts.push({ text: candidate.text.slice(last), hit: false });
    return parts;
  }, [candidate]);

  if (!candidate) {
    return (
      <aside className="panel p-lg flex flex-col items-center justify-center text-center min-h-[420px]">
        <div className="w-14 h-14 rounded-2xl bg-surface-container-high grid place-items-center">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 26 }}>
            draft
          </span>
        </div>
        <p className="font-body text-body-sm text-on-surface-variant mt-md">
          Select a candidate to preview their document.
        </p>
      </aside>
    );
  }

  return (
    <aside className="panel flex flex-col overflow-hidden" aria-label="Document preview">
      <div className="flex items-center justify-between gap-sm px-md py-sm border-b border-outline-variant flex-wrap">
        <h3 className="label-eyebrow">Document Preview</h3>

        <div className="flex items-center gap-xs">
          <div className="relative flex rounded-lg bg-surface-container-high p-xs">
            <span
              className="absolute top-xs bottom-xs w-[calc(50%-4px)] rounded gradient-surface
                         transition-transform duration-300 ease-smooth"
              style={{ transform: mode === 'text' ? 'translateX(0)' : 'translateX(100%)' }}
              aria-hidden="true"
            />
            {(['text', 'file'] as const).map((m) => (
              <button
                key={m}
                className={`relative z-10 px-sm py-xs rounded font-body text-label-md transition-colors ${
                  mode === m ? 'text-white' : 'text-on-surface-variant hover:text-primary'
                } ${m === 'file' && !canRenderFile ? 'opacity-40' : ''}`}
                onClick={() => (m === 'text' || canRenderFile) && setMode(m)}
                disabled={m === 'file' && !canRenderFile}
                title={
                  m === 'file' && !canRenderFile
                    ? 'Inline preview not available for this format'
                    : undefined
                }
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>

          {mode === 'text' && (
            <>
              <button
                className="btn-quiet"
                onClick={() => setZoom((z) => Math.max(0.7, z - 0.1))}
                aria-label="Zoom out"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>zoom_out</span>
              </button>
              <button
                className="btn-quiet"
                onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
                aria-label="Zoom in"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>zoom_in</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div
        className="flex-1 overflow-auto p-md"
        style={{ background: 'rgb(var(--surface-container-lowest))', maxHeight: '70vh' }}
      >
        {mode === 'file' ? (
          fileError ? (
            <p className="font-body text-body-sm text-error p-md">{fileError}</p>
          ) : !blobUrl ? (
            <div className="space-y-sm">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton h-4" style={{ width: `${60 + ((i * 13) % 40)}%` }} />
              ))}
            </div>
          ) : isImage ? (
            <img
              src={blobUrl}
              alt={`Resume document for ${candidate.parsed.name}`}
              className="w-full rounded-xl border border-outline-variant animate-scale-in"
            />
          ) : (
            <iframe
              src={blobUrl}
              title={`Resume PDF for ${candidate.parsed.name}`}
              className="w-full rounded-xl border border-outline-variant animate-scale-in"
              style={{ height: '66vh' }}
            />
          )
        ) : (
          <div
            className="rounded-xl p-md font-mono leading-relaxed whitespace-pre-wrap break-words"
            style={{
              background: 'rgb(var(--preview-page))',
              fontSize: `${12 * zoom}px`,
              color: 'rgb(var(--on-surface))',
            }}
          >
            {segments.map((part, i) =>
              part.hit ? (
                <mark
                  key={i}
                  className="rounded px-xs"
                  style={{
                    background: 'rgb(var(--success) / 0.22)',
                    color: 'rgb(var(--on-surface))',
                  }}
                >
                  {part.text}
                </mark>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </div>
        )}
      </div>

      <div className="px-md py-sm border-t border-outline-variant flex items-center justify-between gap-sm flex-wrap">
        <span className="font-body text-label-md text-on-surface-variant truncate">
          {candidate.file?.originalName ?? 'Pasted text'}
        </span>
        <span className="font-body text-label-md text-on-surface-variant">
          {candidate.extraction?.kind?.toUpperCase()} · {candidate.parsed.wordCount} words
        </span>
      </div>
    </aside>
  );
}
