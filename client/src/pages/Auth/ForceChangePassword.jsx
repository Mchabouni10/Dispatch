import React, { useState } from 'react';
import { changePassword } from '../../api/api.js';
// Reuses the auth page's visual style — this is functionally the same kind
// of full-page, pre-app-access form.
import styles from './AuthView.module.css';

export default function ForceChangePassword({ user, onChanged, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const result = await changePassword(currentPassword, newPassword);
      onChanged(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.mark}>DP</div>
        <p className={styles.eyebrow}>Dispatch Pro</p>
        <h1>Set your password</h1>
        <p className={styles.subtitle}>
          Welcome, {user?.name}. Your account was created by an administrator with a temporary
          password. Enter it below along with a new password only you know — you won't be able
          to use the app until this is done.
        </p>

        <form onSubmit={submit} className={styles.form}>
          <label>
            Temporary password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="From the paper your admin gave you"
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength="8"
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength="8"
              required
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Set password and continue'}
          </button>
        </form>

        <button className={styles.switch} type="button" onClick={onLogout}>
          Not you? Sign out
        </button>
      </section>
    </main>
  );
}