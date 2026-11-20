import { useState, type FormEvent } from 'react';
import { Flag, ArrowRight, ShieldCheck } from 'lucide-react';
import { apiFetch, ApiProblemError, setStoredToken } from '../api/client.ts';
import type { User } from '../types/flagship.ts';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}

const DEMO_ACCOUNTS = [
  { email: 'admin@flagship.dev', role: 'Admin', name: 'Aria Vance' },
  { email: 'approver@flagship.dev', role: 'Approver', name: 'Marcus Chen' },
  { email: 'editor@flagship.dev', role: 'Editor', name: 'Elena Rostova' },
  { email: 'viewer@flagship.dev', role: 'Viewer', name: 'Devon Brooks' },
];

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('admin@flagship.dev');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('flagship123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
      const body = mode === 'login' ? { email, password } : { email, name, password };
      const res = await apiFetch<{ token: string; user: User }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setStoredToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      if (err instanceof ApiProblemError) {
        setError(err.detail);
      } else {
        setError('Unable to reach FlagShip server.');
      }
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('flagship123');
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: demoEmail, password: 'flagship123' }),
      });
      setStoredToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof ApiProblemError ? err.detail : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-8 lg:p-10 bg-slate-900 text-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                <Flag className="w-4 h-4" />
              </div>
              <span className="text-xl font-bold tracking-tight font-display">FlagShip</span>
            </div>
            <h1 className="mt-8 text-2xl font-bold tracking-tight text-white font-display">
              Ship Features. Control Releases. Stay Resilient.
            </h1>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Self-hosted feature flag management, deterministic MurmurHash3 gradual rollouts,
              peer-reviewed production approvals, and offline-resilient Spring Boot SDK streaming.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Role-Based Access &amp; Peer Approval Demo Accounts</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => quickLogin(acc.email)}
                  disabled={loading}
                  className="text-left rounded-lg border border-slate-800 bg-slate-950/60 hover:bg-slate-800 px-3 py-2 transition-colors"
                >
                  <div className="text-xs font-semibold text-white">{acc.role}</div>
                  <div className="text-xs text-slate-400 truncate">{acc.name}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-10 flex flex-col justify-center">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 font-display">
                {mode === 'login' ? 'Sign in to Console' : 'Create Viewer Account'}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {mode === 'login'
                  ? 'Authenticate with your FlagShip credentials'
                  : 'Register a new account with Viewer permissions'}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white transition-colors"
            >
              <span>{loading ? 'Signing in...' : mode === 'login' ? 'Sign In' : 'Create Account'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {mode === 'login'
                ? 'Need an account? Register as Viewer'
                : 'Already have an account? Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
