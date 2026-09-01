import { useEffect, useRef, useState } from 'react';

/**
 * Google Identity Services button.
 *
 * GIS is loaded on demand rather than in index.html, so a deployment without a
 * client id never reaches out to Google at all. The component renders nothing
 * unless a client id is configured — no dead button, no broken promise to the
 * user.
 */

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode?: string;
    auto_select?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

const SRC = 'https://accounts.google.com/gsi/client';
let loader: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Google script failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google script failed to load'));
    document.head.appendChild(script);
  });

  return loader;
}

interface GoogleButtonProps {
  clientId: string | null | undefined;
  onCredential: (credential: string) => void | Promise<void>;
  /** Changes the button's own label between the two tabs. */
  mode: 'login' | 'register';
  disabled?: boolean;
}

export default function GoogleButton({ clientId, onCredential, mode, disabled }: GoogleButtonProps) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Keep the latest callback without re-initialising GIS on every render.
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    if (!clientId || !host.current) return;
    let cancelled = false;

    loadGis()
      .then(() => {
        const id = window.google?.accounts?.id;
        if (cancelled || !id || !host.current) return;

        id.initialize({
          client_id: clientId,
          callback: (response) => { void callback.current(response.credential); },
          auto_select: false,
        });

        host.current.innerHTML = '';
        id.renderButton(host.current, {
          type: 'standard',
          theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'rectangular',
          text: mode === 'register' ? 'signup_with' : 'signin_with',
          logo_alignment: 'center',
          width: host.current.offsetWidth || 360,
        });
      })
      .catch(() => !cancelled && setFailed(true));

    return () => { cancelled = true; };
  }, [clientId, mode]);

  if (!clientId) return null;

  if (failed) {
    return (
      <p className="font-body text-body-sm text-on-surface-variant text-center">
        Google sign-in is unavailable right now — use email and password below.
      </p>
    );
  }

  return (
    <div className="space-y-md">
      <div
        ref={host}
        className={`flex justify-center min-h-[44px] ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      />
      <div className="flex items-center gap-sm">
        <span className="h-px flex-1 bg-outline-variant" />
        <span className="font-body text-label-md uppercase text-on-surface-variant">
          or with email
        </span>
        <span className="h-px flex-1 bg-outline-variant" />
      </div>
    </div>
  );
}
