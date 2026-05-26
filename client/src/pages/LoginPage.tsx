import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION } from './SettingsPage';

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const { login, signup, isLoading } = useAuth();
  const [mode, setMode]         = useState<Mode>('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  useEffect(() => { setError(''); }, [mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (mode === 'signup') {
      if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
      if (password !== confirm) { setError('Passwords do not match'); return; }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await signup(email.trim(), password);
      }
    } catch (err) {
      setError((err as Error).message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-sb-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sb-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col items-center justify-center px-6 safe-top">

      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <img
          src="/logo.png"
          alt="Scatterbrain"
          className="h-20 w-auto"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <span className="text-[10px] text-white/40 tracking-wider">v{APP_VERSION} beta</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-sb-card border border-sb-border rounded-2xl p-6">
        {/* Mode toggle */}
        <div className="flex rounded-xl overflow-hidden border border-sb-border mb-6">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2 text-sm font-medium transition ${mode === 'login' ? 'bg-sb-green text-black' : 'text-sb-muted hover:text-white'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 text-sm font-medium transition ${mode === 'signup' ? 'bg-sb-green text-black' : 'text-sb-muted hover:text-white'}`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-sb-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full bg-sb-card2 border border-sb-border rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-sb-green transition"
            />
          </div>

          <div>
            <label className="block text-xs text-sb-muted mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
              className="w-full bg-sb-card2 border border-sb-border rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-sb-green transition"
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-xs text-sb-muted mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full bg-sb-card2 border border-sb-border rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-sb-green transition"
              />
            </div>
          )}

          {error && (
            <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/40 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-sb-green text-black font-semibold text-sm disabled:opacity-50 hover:brightness-110 transition active:scale-95"
          >
            {busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>
      </div>

      <p className="mt-6 text-[11px] text-white/20 text-center">
        Your receipts are stored privately on this device.
      </p>
    </div>
  );
}
