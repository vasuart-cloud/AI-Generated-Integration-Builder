import React, { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (username: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('Asha Patel');
  const [password, setPassword] = useState('abcd');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const trimmedUser = username.trim();
    // Validate demo credentials: Asha Patel / abcd (case-insensitive for convenience)
    if (trimmedUser.toLowerCase() === 'asha patel' && password === 'abcd') {
      onLoginSuccess('Asha Patel');
    } else {
      setError('Invalid username or password. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        {/* CloudEagle Logo & Product Title */}
        <div className="inline-flex items-center justify-center gap-2.5 px-3 py-1.5 rounded-xl bg-sky-950/80 border border-sky-700/50 text-sky-400">
          <ShieldCheck size={20} className="text-sky-400" />
          <span className="font-display font-bold text-sm tracking-wide text-white">
            CloudEagle Integration Studio
          </span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Welcome to CloudEagle Integration Studio
        </h1>
        <p className="text-sm text-slate-400 max-w-sm mx-auto">
          Build, test and manage SaaS integrations with AI agents.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white text-slate-900 py-8 px-6 sm:px-10 rounded-2xl shadow-2xl border border-slate-200">
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            {/* Inline authentication error message */}
            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-xs font-medium flex items-start gap-2.5"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-rose-600 mt-1 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="username-input"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1"
              >
                Username
              </label>
              <div className="relative">
                <input
                  id="username-input"
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Asha Patel"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-sky-600 bg-white"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password-input"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password-input"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••"
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-sky-600 bg-white"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-xs text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-600 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </form>

          {/* Demo Credentials Disclaimer Box */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Lock size={13} className="text-slate-400" />
              <span>Demo Login Credentials</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Username: <strong className="font-mono text-slate-800">Asha Patel</strong>
              <br />
              Password: <strong className="font-mono text-slate-800">abcd</strong>
            </p>
            <p className="text-[10px] text-slate-400 leading-tight">
              These credentials are only for local demonstration, not production authentication.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
