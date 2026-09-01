import { useCallback, useRef, useState, type DragEvent } from 'react';
import { fileSize } from '@/lib/format';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.tif,.gif,.docx,.txt,.md';

interface UploadZoneProps {
  onAnalyze: (files: File[]) => Promise<void>;
  busy: boolean;
  progress: number | null;
  disabled?: boolean;
  disabledReason?: string;
}

export default function UploadZone({
  onAnalyze,
  busy,
  progress,
  disabled,
  disabledReason,
}: UploadZoneProps) {
  const [staged, setStaged] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((list: FileList | null) => {
    const incoming = Array.from(list ?? []);
    setStaged((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))].slice(0, 60);
    });
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) addFiles(e.dataTransfer.files);
  };

  const run = async () => {
    if (!staged.length) return;
    await onAnalyze(staged);
    setStaged([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const totalBytes = staged.reduce((sum, f) => sum + f.size, 0);

  return (
    <section className="panel p-lg" aria-label="Upload resumes">
      <div className="flex items-start justify-between gap-md mb-md">
        <div>
          <h2 className="font-heading text-headline-md">Upload resumes</h2>
          <p className="font-body text-body-sm text-on-surface-variant mt-xs">
            PDF, photo or scan, DOCX, TXT — drop a whole batch at once.
          </p>
        </div>
        <span className="chip bg-surface-container-high border-outline-variant text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>folder_open</span>
          Max 60
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-disabled={disabled}
        className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-xl text-center
                    transition-all duration-300 ease-smooth ${
                      disabled
                        ? 'border-outline-variant opacity-60 cursor-not-allowed'
                        : dragging
                          ? 'border-primary bg-primary/10 scale-[1.01] shadow-glow cursor-pointer'
                          : 'border-outline-variant hover:border-primary/60 hover:bg-surface-container-high/60 cursor-pointer'
                    }`}
      >
        {busy && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-surface-container-highest overflow-hidden">
            <div
              className="h-full gradient-surface transition-[width] duration-300"
              style={{ width: `${(progress ?? 0) * 100}%` }}
            />
          </div>
        )}

        <div
          className={`w-16 h-16 mx-auto rounded-2xl grid place-items-center transition-all duration-300 ${
            dragging ? 'gradient-surface scale-110' : 'bg-surface-container-high'
          }`}
        >
          <span
            className={`material-symbols-outlined transition-colors ${
              dragging ? 'text-white' : 'text-on-surface-variant'
            }`}
            style={{ fontSize: 30 }}
          >
            {dragging ? 'download' : 'cloud_upload'}
          </span>
        </div>

        <p className="font-body text-body-md text-on-surface mt-md font-semibold">
          {disabled
            ? disabledReason ?? 'Unavailable'
            : dragging
              ? 'Release to add these files'
              : 'Drop resumes here, or click to browse'}
        </p>
        <p className="font-body text-body-sm text-on-surface-variant mt-xs">
          Scanned PDFs and phone photos run through OCR automatically.
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          disabled={disabled}
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {staged.length > 0 && (
        <div className="mt-md animate-slide-down">
          <div className="flex items-center justify-between mb-sm">
            <span className="label-eyebrow">
              {staged.length} staged · {fileSize(totalBytes)}
            </span>
            <button
              className="btn-quiet"
              onClick={(e) => {
                e.stopPropagation();
                setStaged([]);
              }}
            >
              Clear all
            </button>
          </div>

          <ul className="max-h-56 overflow-y-auto space-y-xs pr-xs stagger">
            {staged.map((file, i) => (
              <li
                key={`${file.name}-${file.size}-${i}`}
                style={{ '--i': i } as React.CSSProperties}
                className="flex items-center gap-sm px-sm py-xs rounded-lg bg-surface-container-high
                           hover:bg-surface-container-highest transition-colors"
              >
                <span
                  className="material-symbols-outlined text-on-surface-variant flex-shrink-0"
                  style={{ fontSize: 17 }}
                >
                  {file.type.startsWith('image/') ? 'image' : 'description'}
                </span>
                <span className="font-body text-body-sm text-on-surface truncate flex-1">
                  {file.name}
                </span>
                <span className="font-body text-label-md text-on-surface-variant flex-shrink-0">
                  {fileSize(file.size)}
                </span>
                <button
                  className="text-on-surface-variant hover:text-error transition-colors flex-shrink-0"
                  onClick={() => setStaged((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${file.name}`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>close</span>
                </button>
              </li>
            ))}
          </ul>

          <button className="btn-primary w-full mt-md py-md" onClick={run} disabled={busy || disabled}>
            {busy ? (
              <>
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: 18 }}>
                  progress_activity
                </span>
                Analysing… {progress != null ? `${Math.round(progress * 100)}%` : ''}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>bolt</span>
                Analyse {staged.length} resume{staged.length === 1 ? '' : 's'}
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}
