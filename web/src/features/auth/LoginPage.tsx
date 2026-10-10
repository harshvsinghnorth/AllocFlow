import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Boxes, LogIn } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Alert, Spinner } from '../../components/ui';

/**
 * Demo accounts. Every role in the SRS has one so the RBAC model can be
 * exercised without seeding accounts by hand; the shared password is the one
 * the seed script writes.
 */
const DEMO_ACCOUNTS = [
  { role: 'Student (male)', email: 'student@allocflow.edu', hint: 'Lives in BSH - can book men’s blocks only' },
  { role: 'Student (female)', email: 'student.f@allocflow.edu', hint: 'Lives in KCH - can book women’s blocks only' },
  { role: 'Warden', email: 'warden.bsh@allocflow.edu', hint: 'Approve, allocate, inspect (BSH)' },
  { role: 'Supervisor', email: 'supervisor@allocflow.edu', hint: 'Campus-wide occupancy reporting' },
  { role: 'Security', email: 'security@allocflow.edu', hint: 'Verify gatepasses at the gate' },
  { role: 'Mess Staff', email: 'mess@allocflow.edu', hint: 'Menus and feedback' },
  { role: 'Administrator', email: 'admin@allocflow.edu', hint: 'Full system access' },
];

const DEMO_PASSWORD = 'Password@123';

export default function LoginPage() {
  const { login, status } = useAuth();
  const [email, setEmail] = useState('student@allocflow.edu');
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not sign in. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-2">
        {/* ---------- form ---------- */}
        <div className="card p-7">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-lg">
              <Boxes className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white">AllocFlow</h1>
              <p className="text-xs text-slate-500">Hostel Room Booking &amp; Management</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? <Spinner /> : <LogIn className="h-4 w-4" />}
              Sign in
            </button>
          </form>
        </div>

        {/* ---------- demo accounts ---------- */}
        <div className="card p-7">
          <h2 className="text-sm font-semibold text-slate-200">Demo accounts</h2>
          <p className="mt-1 text-xs text-slate-500">
            Select a role to load its credentials. Password for all:{' '}
            <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
              {DEMO_PASSWORD}
            </code>
          </p>
          <div className="mt-4 space-y-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                  setError(null);
                }}
                className="w-full rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-200">{a.role}</span>
                  {email === a.email && (
                    <span className="badge bg-brand-500/20 text-brand-200">Selected</span>
                  )}
                </div>
                <p className="truncate text-xs text-slate-500">{a.email}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-600">{a.hint}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
