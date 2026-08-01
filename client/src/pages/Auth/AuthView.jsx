import React, { useState } from 'react';
import { login, register, saveAuthToken } from '../../api/api.js';
import styles from './AuthView.module.css';

export default function AuthView({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.mark}>DP</div>
        <p className={styles.eyebrow}>Dispatch Pro</p>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className={styles.subtitle}>
          {mode === 'login' ? 'Sign in to your shared dispatch workspace.' : 'Invite your dispatch team into the same live workspace.'}
        </p>

        <form onSubmit={submit} className={styles.form}>
          {mode === 'register' && (
            <label>Name<input name="name" value={form.name} onChange={update} autoComplete="name" required /></label>
          )}
          <label>Email<input name="email" type="email" value={form.email} onChange={update} autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" value={form.password} onChange={update} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength="8" required /></label>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>

        <button className={styles.switch} type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  );
}