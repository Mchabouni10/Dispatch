import React, { useEffect, useState } from 'react';
import { getBootstrapStatus, login, register, saveAuthToken } from '../../api/api.js';
import styles from './AuthView.module.css';

export default function AuthView({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Optional: still fetch bootstrap status if you want different copy
  // for the very first account, but we no longer hide the sign-up UI.
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    getBootstrapStatus()
      .then((result) => setNeedsSetup(!!result.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = mode === 'login' ? await login(form) : await register(form);
      saveAuthToken(result.token);
      onAuthenticated(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  const switchMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setError('');
  };

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.mark}>DP</div>
        <p className={styles.eyebrow}>Dispatch Pro</p>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className={styles.subtitle}>
          {mode === 'login'
            ? 'Sign in to your shared dispatch workspace.'
            : needsSetup
              ? 'Set up the first account for this workspace.'
              : 'Create a new account for this workspace.'}
        </p>

        <form onSubmit={submit} className={styles.form}>
          {mode === 'register' && (
            <label>
              Name
              <input
                name="name"
                value={form.name}
                onChange={update}
                autoComplete="name"
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={update}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={update}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength="8"
              required
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {/* Always show the toggle so users can sign up */}
        <button className={styles.switch} type="button" onClick={switchMode}>
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  );
}