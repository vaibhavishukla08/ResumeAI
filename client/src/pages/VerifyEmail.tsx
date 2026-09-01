import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';

type State = 'working' | 'done' | 'expired' | 'invalid';

/** Landing target for the emailed confirmation link. */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('working');
  const [message, setMessage] = useState('');
  const [resendTo, setResendTo] = useState('');
  const [resent, setResent] = useState(false);
  // React 18 StrictMode double-invokes effects in development; without this the
  // single-use token is consumed twice and the second call reports "invalid".
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setState('invalid');
      setMessage('This link is missing its token.');
      return;
    }

    api
      .verifyEmail(token)
      .then((res) => {
        setState('done');
        setMessage(res.message);
      })
      .catch((err: unknown) => {
        const apiErr = err instanceof ApiError ? err : null;
        setState(apiErr?.code === 'VERIFICATION_EXPIRED' ? 'expired' : 'invalid');
        setMessage(apiErr?.message ?? 'That link could not be used.');
      });
  }, [token]);

  async function resend() {
    if (!resendTo.trim()) return;
    try {
      await api.resendVerification(resendTo.trim());
    } finally {
      // The endpoint answers identically either way, so the UI does too.
      setResent(true);
    }
  }

  const meta = {
    working: { icon: 'progress_activity', tone: 'text-primary', title: 'Confirming your address…' },
    done: { icon: 'verified', tone: 'text-success', title: 'Email confirmed' },
    expired: { icon: 'schedule', tone: 'text-warning', title: 'That link has expired' },
    invalid: { icon: 'error', tone: 'text-error', title: 'That link is not valid' },
  }[state];

  return (
    <div className="min-h-screen bg-background gradient-mesh grid place-items-center p-lg">
      <div className="panel p-2xl max-w-md w-full text-center animate-scale-in">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-surface-container-high grid place-items-center">
          <span
            className={`material-symbols-outlined ${meta.tone} ${state === 'working' ? 'animate-spin' : ''}`}
            style={{ fontSize: 28 }}
          >
            {meta.icon}
          </span>
        </div>

        <h1 className="font-heading text-headline-md mt-md">{meta.title}</h1>
        <p className="font-body text-body-sm text-on-surface-variant mt-xs">{message}</p>

        {state === 'done' && (
          <Link to="/signin" className="btn-primary mt-lg inline-flex">
            Sign in
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
          </Link>
        )}

        {(state === 'expired' || state === 'invalid') && (
          resent ? (
            <p className="font-body text-body-sm text-success mt-lg">
              If that address still needs confirming, a new link is on its way.
            </p>
          ) : (
            <div className="mt-lg text-left">
              <label className="label-eyebrow block mb-xs">Send a new link to</label>
              <div className="flex gap-sm">
                <input
                  type="email"
                  className="field"
                  placeholder="you@company.com"
                  value={resendTo}
                  onChange={(e) => setResendTo(e.target.value)}
                />
                <button className="btn-primary flex-shrink-0" onClick={resend}>Send</button>
              </div>
            </div>
          )
        )}

        <div className="mt-lg pt-md border-t border-outline-variant">
          <Link to="/" className="btn-quiet">Back to home</Link>
        </div>
      </div>
    </div>
  );
}
