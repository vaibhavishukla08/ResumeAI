import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/lib/api';
import GoogleButton from '@/components/GoogleButton';

type Mode = 'login' | 'register' | 'forgot';

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

const FEATURES = [
  { icon: 'document_scanner', title: 'PDF, scans and photos', body: 'OCR handles the messy real-world uploads.' },
  { icon: 'balance', title: 'Two scores, not one', body: 'Objective similarity beside subjective confidence.' },
  { icon: 'grid_view', title: 'Compare a whole pool', body: 'Skill matrix across every candidate at once.' },
];

export default function Auth() {
  const { login, register, loginWithGoogle } = useAuth();
  const [params] = useSearchParams();
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  // The landing page's "Get Started" links deep-link straight to registration.
  const [mode, setMode] = useState<Mode>(
    params.get('mode') === 'register' ? 'register' : 'login',
  );
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    password: '',
    confirm: '',
  });

  /**
   * Honeypot. Never rendered visibly and never focusable, so a person cannot
   * fill it — but a form-filling bot populates every input it finds. The server
   * treats a non-empty value as a bot and answers exactly as it would a real
   * signup, so the script gets no feedback to adapt to.
   */
  const [honeypot, setHoneypot] = useState('');

  const set = (patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrors({});
    setFormError(null);
  };

  async function resendVerification() {
    if (!unverified) return;
    setBusy(true);
    try {
      const { message } = await api.resendVerification(unverified);
      setNotice(message);
      setUnverified(null);
      setFormError(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not resend the link.');
    } finally {
      setBusy(false);
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
    setNotice(null);
    setUnverified(null);
  };

  // Ask the server whether Google sign-in is configured for this deployment.
  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((h) => !cancelled && setGoogleClientId(h.google?.enabled ? h.google.clientId : null))
      .catch(() => {
        /* Health is optional here — the email form still works without it. */
      });
    return () => { cancelled = true; };
  }, []);

  async function onGoogleCredential(credential: string) {
    setBusy(true);
    setFormError(null);
    try {
      await loginWithGoogle(credential);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Google sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  /** Mirrors the server's rules so the user gets feedback without a round trip. */
  function validate(): boolean {
    const next: FieldErrors = {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      next.email = 'Enter a valid email address.';
    }

    // A reset request only needs an address.
    if (mode !== 'forgot') {
      if (mode === 'register') {
        if (form.name.trim().length < 2) next.name = 'Please enter your name.';
        if (form.password !== form.confirm) next.confirm = 'Passwords do not match.';
        // Only enforced on the way in; an existing password may predate the rule.
        if (form.password.length < 10) next.password = 'At least 10 characters.';
      } else if (!form.password) {
        next.password = 'Enter your password.';
      }
      if (form.password && /^\d+$/.test(form.password)) {
        next.password = 'Cannot be only numbers.';
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setBusy(true);
    setFormError(null);
    setNotice(null);
    setUnverified(null);

    try {
      if (mode === 'login') {
        await login(form.email.trim(), form.password);
      } else if (mode === 'register') {
        // Registration no longer signs you in: the address must be confirmed.
        setNotice(await register({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          company: form.company.trim() || undefined,
          website_url: honeypot,
        }));
        setForm((prev) => ({ ...prev, password: '', confirm: '' }));
      } else {
        const { message } = await api.forgotPassword(form.email.trim());
        setNotice(message);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        // Offer a resend rather than leaving them stuck at a wall.
        if (err.code === 'EMAIL_NOT_VERIFIED') setUnverified(form.email.trim());
      } else {
        setFormError('Something went wrong. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* ---- photographic brand panel ---- */}
      <aside className="hidden lg:flex flex-col justify-between w-[48%] max-w-3xl p-2xl relative overflow-hidden">
        <img
          src="/img/auth-bg.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-[52%_12%] scale-105"
        />
        {/* Three layers, each doing one job:
            1. a teal duotone wash that ties the photo to the brand palette,
            2. a diagonal ramp that darkens only where the headline sits, and
            3. a soft vignette so the panel edge does not cut the photo flat.
            Kept light enough that the photograph still reads as a photograph —
            the subject stays legible behind the type. */}
        <div
          className="absolute inset-0 mix-blend-multiply"
          style={{
            background:
              'linear-gradient(155deg, rgb(var(--grad-a) / 0.72), rgb(11 61 79 / 0.66) 50%, rgb(4 28 40 / 0.80))',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0"
          style={{
            // Heaviest across the lower-middle band, where the small feature
            // copy sits over the busiest part of the photograph.
            background:
              'linear-gradient(to top, rgb(2 18 27 / 0.82) 0%, rgb(2 18 27 / 0.62) 30%, rgb(2 18 27 / 0.34) 62%, rgb(2 18 27 / 0.16) 80%, rgb(2 18 27 / 0.46) 100%)',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0"
          style={{ boxShadow: 'inset 0 0 140px 40px rgb(2 18 27 / 0.45)' }}
          aria-hidden="true"
        />

        <div className="relative">
          <Link to="/" className="flex items-center gap-sm w-fit group">
            <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur border border-white/25 grid place-items-center">
              <span className="material-symbols-outlined filled text-white" style={{ fontSize: 23 }}>
                readiness_score
              </span>
            </div>
            <div>
              <p className="font-heading text-headline-md text-white leading-none">ResumeAI</p>
              <p className="font-body text-label-md uppercase text-white/70 mt-xs">
                Enterprise Scanner
              </p>
            </div>
          </Link>
        </div>

        <div className="relative animate-slide-up">
          <h1 className="font-display text-display-lg text-white max-w-lg drop-shadow-sm">
            The stack of resumes
            <br />
            <span className="text-primary-fixed" style={{ color: 'rgb(var(--accent-soft))' }}>
              does not have to be
            </span>
            <br />
            a whole afternoon.
          </h1>
          <p className="font-body text-body-lg text-white/80 mt-md max-w-md">
            Upload the batch, score every candidate against the role, and see exactly
            which skills the pool is missing.
          </p>

          <ul className="mt-xl space-y-md stagger">
            {FEATURES.map((f, i) => (
              <li
                key={f.title}
                className="flex items-start gap-md"
                style={{ '--i': i + 2 } as React.CSSProperties}
              >
                <div className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur border border-white/20 grid place-items-center flex-shrink-0">
                  <span className="material-symbols-outlined text-white" style={{ fontSize: 18 }}>
                    {f.icon}
                  </span>
                </div>
                <div>
                  <p className="font-body text-body-md font-semibold text-white">{f.title}</p>
                  <p className="font-body text-body-sm text-white/70">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative font-body text-body-sm text-white/65 max-w-md">
          Your resumes stay on your machine. Nothing is uploaded to a third party
          unless you enable the Gemini engine.
        </p>
      </aside>

      {/* ---- form panel ---- */}
      <main className="flex-1 flex items-center justify-center p-lg relative">
        {/* On small screens the photo becomes a faint backdrop behind the form. */}
        <img
          src="/img/auth-bg.jpg"
          alt=""
          aria-hidden="true"
          className="lg:hidden absolute inset-0 w-full h-full object-cover opacity-10"
        />
        <div className="relative z-10 w-full max-w-md animate-scale-in">
          <div className="flex items-center justify-between gap-sm mb-lg">
            <Link to="/" className="lg:hidden flex items-center gap-sm">
              <div className="w-10 h-10 rounded-xl gradient-surface grid place-items-center">
                <span className="material-symbols-outlined filled text-white" style={{ fontSize: 22 }}>
                  readiness_score
                </span>
              </div>
              <p className="font-heading text-headline-md text-on-surface">ResumeAI</p>
            </Link>
            <Link
              to="/"
              className="btn-quiet ml-auto"
              aria-label="Back to the home page"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back</span>
              Home
            </Link>
          </div>

          {/* mode switch */}
          <div
            className="relative flex p-xs rounded-xl bg-surface-container-high border border-outline-variant mb-lg"
            role="tablist"
          >
            <span
              className="absolute top-xs bottom-xs w-[calc(50%-4px)] rounded-lg gradient-surface
                         transition-transform duration-300 ease-smooth"
              style={{ transform: mode === 'register' ? 'translateX(100%)' : 'translateX(0)' }}
              aria-hidden="true"
            />
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={m === 'register' ? mode === 'register' : mode !== 'register'}
                onClick={() => switchMode(m)}
                className={`relative z-10 flex-1 py-sm rounded-lg font-body text-body-sm font-semibold
                            transition-colors duration-200 ${
                              (m === 'register' ? mode === 'register' : mode !== 'register')
                                ? 'text-white'
                                : 'text-on-surface-variant hover:text-on-surface'
                            }`}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <div key={mode} className="animate-slide-up">
            <h2 className="font-heading text-headline-lg text-on-surface">
              {mode === 'login' ? 'Welcome back'
                : mode === 'register' ? 'Create your workspace'
                : 'Reset your password'}
            </h2>
            <p className="font-body text-body-sm text-on-surface-variant mt-xs mb-lg">
              {mode === 'login'
                ? 'Sign in to reach your candidate pipeline.'
                : mode === 'register'
                  ? 'Each account is its own workspace, with its own roles and candidates.'
                  : 'Enter your address and we will send a link to choose a new password.'}
            </p>

            {notice && (
              <div className="flex items-start gap-sm p-md rounded-xl bg-success/10 border border-success/30 mb-md animate-slide-down">
                <span className="material-symbols-outlined text-success flex-shrink-0" style={{ fontSize: 19 }}>
                  mark_email_read
                </span>
                <p className="font-body text-body-sm text-on-surface">{notice}</p>
              </div>
            )}

            {mode !== 'forgot' && (
              <GoogleButton
                clientId={googleClientId}
                onCredential={onGoogleCredential}
                mode={mode === 'register' ? 'register' : 'login'}
                disabled={busy}
              />
            )}

            <form onSubmit={onSubmit} className="space-y-md mt-md" noValidate>
              {/* Off-screen rather than display:none — some bots skip hidden
                  inputs but fill positioned ones. aria-hidden and tabIndex keep
                  it away from assistive tech and keyboard users alike. */}
              <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
                <label htmlFor="website_url">Leave this field empty</label>
                <input
                  id="website_url"
                  name="website_url"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>
              {mode === 'register' && (
                <>
                  <Field
                    label="Full name"
                    icon="person"
                    value={form.name}
                    onChange={(v) => set({ name: v })}
                    error={errors.name}
                    autoComplete="name"
                    placeholder="Alex Morgan"
                  />
                  <Field
                    label="Company"
                    icon="business"
                    value={form.company}
                    onChange={(v) => set({ company: v })}
                    autoComplete="organization"
                    placeholder="Optional"
                  />
                </>
              )}

              <Field
                label="Work email"
                icon="mail"
                type="email"
                value={form.email}
                onChange={(v) => set({ email: v })}
                error={errors.email}
                autoComplete="email"
                placeholder="you@company.com"
              />

              {mode !== 'forgot' && (
              <Field
                label="Password"
                icon="lock"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(v) => set({ password: v })}
                error={errors.password}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-on-surface-variant hover:text-primary transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                }
              />
              )}

              {mode === 'login' && (
                <div className="flex justify-end -mt-sm">
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="font-body text-body-sm text-primary hover:underline"
                  >
                    Forgot your password?
                  </button>
                </div>
              )}

              {mode === 'register' && (
                <Field
                  label="Confirm password"
                  icon="lock_reset"
                  type={showPassword ? 'text' : 'password'}
                  value={form.confirm}
                  onChange={(v) => set({ confirm: v })}
                  error={errors.confirm}
                  autoComplete="new-password"
                  placeholder="Repeat it"
                />
              )}

              {formError && (
                <div className="flex items-start gap-sm p-sm rounded-lg bg-error/10 border border-error/30 animate-slide-down">
                  <span className="material-symbols-outlined text-error flex-shrink-0" style={{ fontSize: 18 }}>
                    error
                  </span>
                  <div>
                    <p className="font-body text-body-sm text-error">{formError}</p>
                    {unverified && (
                      <button
                        type="button"
                        onClick={resendVerification}
                        disabled={busy}
                        className="mt-xs font-body text-body-sm font-semibold text-primary hover:underline"
                      >
                        Resend the confirmation link
                      </button>
                    )}
                  </div>
                </div>
              )}

              <button type="submit" className="btn-primary w-full py-md text-body-md" disabled={busy}>
                {busy ? (
                  <>
                    <span className="material-symbols-outlined animate-spin" style={{ fontSize: 18 }}>
                      progress_activity
                    </span>
                    {mode === 'login' ? 'Signing in…' : mode === 'register' ? 'Creating account…' : 'Sending…'}
                  </>
                ) : (
                  <>
                    {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                  </>
                )}
              </button>
            </form>

            <p className="mt-lg text-center font-body text-body-sm text-on-surface-variant">
              {mode === 'forgot' ? (
                <button onClick={() => switchMode('login')} className="text-primary font-semibold hover:underline">
                  Back to sign in
                </button>
              ) : (
                <>
                  {mode === 'login' ? "Don't have an account? " : 'Already have one? '}
                  <button
                    onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                    className="text-primary font-semibold hover:underline"
                  >
                    {mode === 'login' ? 'Create one' : 'Sign in'}
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

interface FieldProps {
  label: string;
  icon: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  trailing?: React.ReactNode;
}

function Field({
  label,
  icon,
  value,
  onChange,
  type = 'text',
  error,
  placeholder,
  autoComplete,
  trailing,
}: FieldProps) {
  return (
    <label className="block">
      <span className="label-eyebrow block mb-xs">{label}</span>
      <div className="relative">
        <span
          className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2
                     text-on-surface-variant pointer-events-none"
          style={{ fontSize: 18 }}
        >
          {icon}
        </span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          className={`field pl-[38px] ${trailing ? 'pr-[38px]' : ''} ${error ? 'field-error' : ''}`}
        />
        {trailing && (
          <span className="absolute right-sm top-1/2 -translate-y-1/2">{trailing}</span>
        )}
      </div>
      {error && (
        <span className="block mt-xs font-body text-body-sm text-error animate-slide-down">
          {error}
        </span>
      )}
    </label>
  );
}
