import React, { useEffect, useState } from 'react';
import { createUser, deleteUser, getUsers, updateUserRole } from '../../api/api.js';
import { ROLE_HIERARCHY } from '../../permissions.js';
import Modal from '../../components/Modal/Modal.jsx';
import styles from './UsersView.module.css';

const labels = {
  SUPER_ADMIN: 'Super Admin',
  DIRECTOR: 'Director',
  HR_MANAGER: 'HR Manager',
  FLEET_MANAGER: 'Fleet Manager',
  DISPATCHER: 'Dispatcher',
  VIEWER: 'Viewer',
};

const label = (role) => labels[role] || role?.replaceAll('_', ' ') || 'Unknown';

export default function UsersView({ user }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', role: 'DISPATCHER' });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  // Set once, right after a successful create — holds the temp password so it
  // can be shown to the admin exactly one time. Never re-fetchable after this.
  const [issuedCredentials, setIssuedCredentials] = useState(null);

  const load = () => {
    setLoading(true);
    setError('');
    return getUsers()
      .then(setUsers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  // ✅ Fixed: effect must not return a Promise
  useEffect(() => {
    load();
  }, []);

  const changeRole = async (target, role) => {
    try {
      await updateUserRole(target.id, role);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (target) => {
    if (!window.confirm(`Delete ${target.name}?`)) return;
    try {
      await deleteUser(target.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const assignable =
    user.role === 'SUPER_ADMIN'
      ? ROLE_HIERARCHY
      : ROLE_HIERARCHY.slice(ROLE_HIERARCHY.indexOf(user.role) + 1);

  const openCreate = () => {
    setCreateForm({ name: '', email: '', role: assignable[0] || 'DISPATCHER' });
    setCreateError('');
    setShowCreate(true);
  };

  const closeCreate = () => {
    setShowCreate(false);
    setCreateError('');
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const result = await createUser(createForm);
      setShowCreate(false);
      setIssuedCredentials({
        name: result.user.name,
        email: result.user.email,
        tempPassword: result.tempPassword,
      });
      await load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const updateCreateForm = (event) =>
    setCreateForm({ ...createForm, [event.target.name]: event.target.value });

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>User Management</h1>
          <p className={styles.pageSub}>Manage access levels for Dispatch users.</p>
        </div>
        {assignable.length > 0 && (
          <button className={styles.primaryButton} type="button" onClick={openCreate}>
            Create User
          </button>
        )}
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {loading ? (
        <p className={styles.empty}>Loading users…</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th align="left">Name</th>
                <th align="left">Email</th>
                <th align="left">Role</th>
                <th align="left">Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((target) => (
                <tr key={target.id}>
                  <td>
                    {target.name}
                    {target.mustChangePassword && (
                    <span className={styles.pending}>
                        (pending first login)
                      </span>
                    )}
                  </td>
                  <td>{target.email}</td>
                  <td>
                    <select
                      className={styles.select}
                      value={target.role}
                      disabled={
                        target.id === user.id ||
                        (!assignable.includes(target.role) && target.role !== user.role)
                      }
                      onChange={(event) => changeRole(target, event.target.value)}
                    >
                      {[...new Set([target.role, ...assignable])].map((role) => (
                        <option key={role} value={role}>
                          {label(role)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {target.createdAt
                      ? new Date(target.createdAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td>
                    {target.id !== user.id &&
                      (user.role === 'SUPER_ADMIN' || assignable.includes(target.role)) && (
                      <button className={styles.deleteButton} type="button" onClick={() => remove(target)}>
                          Delete
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showCreate} onClose={closeCreate} title="Create User" size="sm">
        <form onSubmit={submitCreate} className={styles.form}>
          <label className={styles.field}>
            Name
            <input className={styles.input} name="name" value={createForm.name} onChange={updateCreateForm} required />
          </label>
          <label className={styles.field}>
            Email
            <input className={styles.input} name="email" type="email" value={createForm.email} onChange={updateCreateForm} required />
          </label>
          <label className={styles.field}>
            Role
            <select className={styles.select} name="role" value={createForm.role} onChange={updateCreateForm}>
              {assignable.map((role) => (
                <option key={role} value={role}>
                  {label(role)}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.help}>
            A random temporary password will be generated. You'll see it once on the next screen —
            write it down and hand it to {createForm.name || 'the new user'} directly. They'll be
            required to set their own password the first time they log in.
          </p>
          {createError && <p className={styles.formError} role="alert">{createError}</p>}
          <button className={styles.primaryButton} type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={!!issuedCredentials}
        onClose={() => setIssuedCredentials(null)}
        title="Account created"
        size="sm"
      >
        {issuedCredentials && (
          <div className={styles.credentialPanel}>
            <p>
              <strong>{issuedCredentials.name}</strong>'s account is ready. This temporary password
              is shown <strong>only once</strong> — write it down now. It won't be shown again after
              you close this window.
            </p>
            <div className={styles.credentialField}>
              <span className={styles.credentialLabel}>Email</span>
              <code className={styles.credentialValue}>{issuedCredentials.email}</code>
            </div>
            <div className={styles.credentialField}>
              <span className={styles.credentialLabel}>Temporary password</span>
              <code className={styles.credentialPassword}>
                {issuedCredentials.tempPassword}
              </code>
            </div>
            <button className={styles.primaryButton} type="button" onClick={() => setIssuedCredentials(null)}>
              I've written it down — close
            </button>
          </div>
        )}
      </Modal>
    </section>
  );
}
