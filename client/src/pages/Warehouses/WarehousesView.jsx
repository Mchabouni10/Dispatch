import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faPencil, faTrash, faWarehouse, faLocationDot } from '@fortawesome/free-solid-svg-icons';
import { getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } from '../../api/api.js';
import Modal from '../../components/Modal/Modal.jsx';
import styles from './WarehousesView.module.css';

const DAYS = [
  { key: 'MON', label: 'M', full: 'Mon' },
  { key: 'TUE', label: 'T', full: 'Tue' },
  { key: 'WED', label: 'W', full: 'Wed' },
  { key: 'THU', label: 'T', full: 'Thu' },
  { key: 'FRI', label: 'F', full: 'Fri' },
  { key: 'SAT', label: 'S', full: 'Sat' },
  { key: 'SUN', label: 'S', full: 'Sun' },
];
const DAY_ORDER = DAYS.map(d => d.key);
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

const INITIAL = { name: '', address: '', contactPhone: '', is24Hours: false, daysOpen: WEEKDAYS, openTime: '08:00', closeTime: '17:00', notes: '' };

// Collapses a day array into a friendly label: "Every day", "Weekdays", "Mon–Sat", or a list.
function formatDays(daysOpen = []) {
  if (daysOpen.length === 0) return 'Days not set';
  if (daysOpen.length === 7) return 'Every day';
  if (daysOpen.length === 5 && WEEKDAYS.every(d => daysOpen.includes(d))) return 'Weekdays';
  const indices = daysOpen.map(d => DAY_ORDER.indexOf(d)).sort((a, b) => a - b);
  const isContiguous = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
  if (isContiguous && indices.length > 1) {
    return `${DAYS[indices[0]].full}–${DAYS[indices[indices.length - 1]].full}`;
  }
  return indices.map(i => DAYS[i].full).join(', ');
}

function formatHours(w) {
  if (w.is24Hours) return '24/7';
  const days = formatDays(w.daysOpen);
  const time = w.openTime && w.closeTime ? `${w.openTime}–${w.closeTime}` : '';
  return [days, time].filter(Boolean).join(' • ');
}

export default function WarehousesView() {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const d = await getWarehouses(); setWarehouses(d); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm(INITIAL); setError(''); setModalOpen(true); };
  const openEdit = (w) => {
    setEditing(w);
    setForm({ ...INITIAL, ...w, daysOpen: w.daysOpen?.length ? w.daysOpen : WEEKDAYS });
    setError('');
    setModalOpen(true);
  };

  const toggleDay = (key) => {
    setForm(f => ({
      ...f,
      daysOpen: f.daysOpen.includes(key) ? f.daysOpen.filter(d => d !== key) : DAY_ORDER.filter(d => f.daysOpen.includes(d) || d === key),
    }));
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      if (editing) await updateWarehouse(editing.id, form);
      else await createWarehouse(form);
      await load(); closeModal();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await deleteWarehouse(deleteId); setDeleteId(null); await load(); }
    catch (err) { setError(err.message); }
  };

  const getInitials = (name) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 3);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Warehouses</h1>
          <p className={styles.pageSub}>{warehouses.length} facilities registered</p>
        </div>
        <button className={styles.addBtn} onClick={openAdd} id="add-warehouse-btn">
          <FontAwesomeIcon icon={faPlus} /> Add Warehouse
        </button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Loading warehouses…</div>
      ) : (
        <div className={styles.grid}>
          {warehouses.length === 0 && <div className={styles.empty}>No warehouses yet. Add one!</div>}
          {warehouses.map(w => (
                <div key={w.id} className={styles.card}>
              <div className={styles.cardTop}>
                <div className={styles.whIcon}>{getInitials(w.name)}</div>
                <div className={styles.whInfo}>
                  <div className={styles.whName}>
                    {w.name}
                    {w.is24Hours && <span className={styles.badge24}>24/7</span>}
                  </div>
                  <div className={styles.whHours}>🕐 {formatHours(w)}</div>
                </div>
                <div className={styles.cardActions}>
                  <button className={styles.editBtn} onClick={() => openEdit(w)} title="Edit"><FontAwesomeIcon icon={faPencil} /></button>
                  <button className={styles.deleteBtn} onClick={() => setDeleteId(w.id)} title="Delete"><FontAwesomeIcon icon={faTrash} /></button>
                </div>
              </div>
              <div className={styles.cardBody}>
                {w.address && (
                  <div className={styles.infoRow}>
                    <FontAwesomeIcon icon={faLocationDot} />
                    <span>{w.address}</span>
                  </div>
                )}
                {w.contactPhone && <div className={styles.infoRow}><span>📞</span><span>{w.contactPhone}</span></div>}
                {w.notes && <p className={styles.notes}>{w.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Edit Warehouse' : 'Add Warehouse'} size="md">
        <form onSubmit={handleSubmit} id="warehouse-form" className={styles.form}>
          {error && <div className={styles.formError}>{error}</div>}
          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Warehouse Name *</label>
              <input id="wh-name" className={styles.input} required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="CEVA Logistics" />
            </div>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Address</label>
              <input id="wh-address" className={styles.input} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="11350 Hindry Ave, Los Angeles, CA 90045" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Contact Phone</label>
              <input id="wh-phone" className={styles.input} value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="(310) 555-0000" />
            </div>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Operating Hours</label>

              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  id="wh-24h"
                  className={styles.toggleInput}
                  checked={form.is24Hours}
                  onChange={e => setForm(f => ({ ...f, is24Hours: e.target.checked }))}
                />
                <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                Open 24 hours
              </label>

              <div className={styles.dayPicker}>
                <div className={styles.dayPills}>
                  {DAYS.map(d => (
                    <button
                      type="button"
                      key={d.key}
                      className={`${styles.dayPill} ${form.daysOpen.includes(d.key) ? styles.dayPillActive : ''}`}
                      onClick={() => toggleDay(d.key)}
                      title={d.full}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className={styles.dayPresets}>
                  <button type="button" className={styles.presetBtn} onClick={() => setForm(f => ({ ...f, daysOpen: DAY_ORDER }))}>Every day</button>
                  <button type="button" className={styles.presetBtn} onClick={() => setForm(f => ({ ...f, daysOpen: WEEKDAYS }))}>Weekdays</button>
                  <button type="button" className={styles.presetBtn} onClick={() => setForm(f => ({ ...f, daysOpen: [...WEEKDAYS, 'SAT'] }))}>Weekdays + Sat</button>
                </div>
              </div>

              {!form.is24Hours && (
                <div className={styles.timeRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Opens</label>
                    <input id="wh-open-time" type="time" className={styles.input} value={form.openTime} onChange={e => setForm(f => ({ ...f, openTime: e.target.value }))} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Closes</label>
                    <input id="wh-close-time" type="time" className={styles.input} value={form.closeTime} onChange={e => setForm(f => ({ ...f, closeTime: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Notes</label>
              <textarea id="wh-notes" className={styles.textarea} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Additional information…" />
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving} id="wh-save-btn">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Warehouse'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Warehouse" size="sm">
        <p className={styles.confirmText}>Delete this warehouse? This cannot be undone.</p>
        <div className={styles.formActions}>
          <button className={styles.cancelBtn} onClick={() => setDeleteId(null)}>Cancel</button>
          <button className={styles.deleteConfirmBtn} onClick={handleDelete} id="wh-delete-confirm">Delete</button>
        </div>
      </Modal>
    </div>
  );
}
