import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  leaving?: boolean;
}

interface ToastContextValue {
  push: (message: string, tone?: ToastTone, ttl?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_META: Record<ToastTone, { icon: string; className: string }> = {
  success: { icon: 'check_circle', className: 'text-success border-success/40' },
  error: { icon: 'error', className: 'text-error border-error/40' },
  warning: { icon: 'warning', className: 'text-warning border-warning/40' },
  info: { icon: 'info', className: 'text-primary border-primary/40' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    // Mark as leaving first so the exit transition can run, then unmount.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 220);
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = 'info', ttl = 5000) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, tone }]);
      if (ttl) setTimeout(() => remove(id), ttl);
    },
    [remove],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-lg right-lg z-[100] flex flex-col gap-sm max-w-md pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const meta = TONE_META[t.tone];
          return (
            <div
              key={t.id}
              className={`glass border ${meta.className} px-md py-sm flex items-start gap-sm
                          shadow-lift pointer-events-auto transition-all duration-200 ease-smooth
                          ${t.leaving ? 'opacity-0 translate-x-4' : 'animate-slide-in-right'}`}
            >
              <span className={`material-symbols-outlined ${meta.className}`} style={{ fontSize: 20 }}>
                {meta.icon}
              </span>
              <p className="font-body text-body-sm text-on-surface flex-1">{t.message}</p>
              <button
                onClick={() => remove(t.id)}
                className="text-on-surface-variant hover:text-on-surface transition-colors"
                aria-label="Dismiss notification"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
