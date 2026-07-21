import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import './Login.css';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="#eaf1f7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 17V8a1 1 0 0 1 1-1h9v10H2Z" />
              <path d="M12 10h4.5L19 13v4h-7" />
              <circle cx="6" cy="18" r="1.6" />
              <circle cx="16.5" cy="18" r="1.6" />
            </svg>
          </div>
          <div>
            <div className="login-brand-name">VELAN</div>
            <div className="login-brand-sub">Freight Carriers</div>
          </div>
        </div>

        <div className="login-heading">
          <h1>Sign in</h1>
          <p>Fleet ERP &middot; internal use only</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="login-hint">developer / DevFleet2026!</div>
      </div>
    </div>
  );
}
