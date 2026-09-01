import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';

/** Landing target for the emailed password-reset link. */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    // Mirror the server's rules so an obvious problem does not cost a round
    // trip — and, more importantly, does not burn the single-use token.
    if (password.length < 10) return setError('Password must be at least 10 characters.');
    if (/^\d+$/.test(password)) return setError('Password cannot be only numbers.');
    if (password !== confirm) return setError('Passwords do not match.');

    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Shell icon="error" tone="text-error" title="This link is missing its token">
        <p className="font-body text-body-sm text-on-surface-variant">
          Request a fresh reset link from the sign-in page.
        </p>
        <Link to="/signin" className="btn-primary mt-lg inline-flex">Go to sign in</Link>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell icon="verified" tone="text-success" title="Password updated">
        <p className="font-body text-body-sm text-on-surface-variant">
          Every other session was signed out. Use your new password to sign back in.
        </p>
        <Link to="/signin" className="btn-primary mt-lg inline-flex">
          Sign in
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
        </Link>
      </Shell>
    );
  }

  return (
    <Shell icon="lock_reset" tone="text-primary" title="Choose a new password">
      <p className="font-body text-body-sm text-on-surface-variant">
        At least 10 characters. Long beats complicated.
      </p>

      <form onSubmit={onSubmit} className="mt-lg space-y-md text-left" noValidate>
        <label className="block">
          <span className="label-eyebrow block mb-xs">New password</span>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              className="field pr-[38px]"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              autoComplete="new-password"
              placeholder="At least 10 characters"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-sm top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {show ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </label>

        <label className="block">
          <span className="label-eyebrow block mb-xs">Confirm new password</span>
          <input
            type={show ? 'text' : 'password'}
            className="field"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(null); }}
            autoComplete="new-password"
            placeholder="Repeat it"
          />
        </label>

        {error && (
          <div className="flex items-start gap-sm p-sm rounded-lg bg-error/10 border border-error/30 animate-slide-down">
            <span className="material-symbols-outlined text-error flex-shrink-0" style={{ fontSize: 18 }}>error</span>
            <p className="font-body text-body-sm text-error">{error}</p>
          </div>
        )}

        <button type="submit" className="btn-primary w-full py-md" disabled={busy}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>

      <div className="mt-lg pt-md border-t border-outline-variant">
        <Link to="/signin" className="btn-quiet">Back to sign in</Link>
      </div>
    </Shell>
  );
}

function Shell({
  icon, tone, title, children,
}: {
  icon: string; tone: string; title: string; children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background gradient-mesh grid place-items-center p-lg">
      <div className="panel p-2xl max-w-md w-full text-center animate-scale-in">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-surface-container-high grid place-items-center">
          <span className={`material-symbols-outlined ${tone}`} style={{ fontSize: 28 }}>{icon}</span>
        </div>
        <h1 className="font-heading text-headline-md mt-md">{title}</h1>
        {children}
      </div>
    </div>
  );
}
