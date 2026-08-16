import React, { useEffect, useState } from 'react';
import { getBootstrapStatus, login, register, saveAuthToken } from '../../api/api.js';
import styles from './AuthView.module.css';

export default function AuthView({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Whether self-service sign-up is even possible right now. Starts false so
  // the "Create one" link doesn't flash in before we know — the server only
  // allows /auth/register for the very first (bootstrap) account; after that
  // it 403s. Checking this up front means someone who isn't the first user
  // never sees the option at all, instead of clicking it and hitting an error.
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

  // If bootstrap status resolves to "already set up" while somehow still in
  // register mode (e.g. a stale tab), fall back to login rather than showing
  // a form that will just 403 on submit.
  const effectiveMode = mode === 'register' && !needsSetup ? 'login' : mode;

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.mark}>DP</div>
        <p className={styles.eyebrow}>Dispatch Pro</p>
        <h1>{effectiveMode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className={styles.subtitle}>
          {effectiveMode === 'login' ? 'Sign in to your shared dispatch workspace.' : 'Set up the first account for this workspace.'}
        </p>

        <form onSubmit={submit} className={styles.form}>
          {effectiveMode === 'register' && (
            <label>Name<input name="name" value={form.name} onChange={update} autoComplete="name" required /></label>
          )}
          <label>Email<input name="email" type="email" value={form.email} onChange={update} autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" value={form.password} onChange={update} autoComplete={effectiveMode === 'login' ? 'current-password' : 'new-password'} minLength="8" required /></label>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Working...' : effectiveMode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>

        {/* Self-service sign-up only exists for the very first (bootstrap)
            account. Once the workspace has a user, the server 403s /register,
            so the toggle is hidden rather than left there to produce an error —
            accounts after that come from an admin via Users → Create User. */}
        {needsSetup && (
          <button className={styles.switch} type="button" onClick={() => { setMode(effectiveMode === 'login' ? 'register' : 'login'); setError(''); }}>
            {effectiveMode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
          </button>
        )}
      </section>
    </main>
  );
}