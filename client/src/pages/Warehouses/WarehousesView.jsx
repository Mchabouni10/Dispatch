import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faPencil, faTrash, faLocationDot,
  faThLarge, faTable, faMagnifyingGlass,
  faChevronDown, faSort, faSortUp, faSortDown, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } from '../../api/api.js';
import Modal from '../../components/Modal/Modal.jsx';
import TimePicker from '../../styles/TimePicker.jsx';
import styles from './WarehousesView.module.css';
import tableStyles from './WarehousesView.table.module.css';
import LiveClock from '../../styles/Liveclock.jsx'; // adjust path to match your folder layout

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

const VIEW_KEY = 'warehousesView.viewMode';

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

// Sort key derived per-column so clicking a header sorts on something meaningful,
// not just the raw field (e.g. Hours sorts 24/7 facilities first, then by open time).
function sortValue(w, key) {
  switch (key) {
    case 'name': return (w.name || '').toLowerCase();
    case 'address': return (w.address || '').toLowerCase();
    case 'hours': return w.is24Hours ? '' : `z${w.openTime || ''}`;
    default: return '';
  }
}

const COLUMNS = [
  { key: 'name', label: 'Warehouse' },
  { key: 'address', label: 'Address' },
  { key: 'hours', label: 'Hours' },
];

export default function WarehousesView() {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) || 'grid'; } catch { return 'grid'; }
  });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const load = useCallback(async () => {
    try { const d = await getWarehouses(); setWarehouses(d); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setView = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_KEY, mode); } catch { /* ignore */ }
  };

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

  const toggleSort = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  const toggleExpanded = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return warehouses;
    return warehouses.filter(w =>
      (w.name || '').toLowerCase().includes(q) ||
      (w.address || '').toLowerCase().includes(q) ||
      (w.contactPhone || '').toLowerCase().includes(q)
    );
  }, [warehouses, query]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const av = sortValue(a, sort.key), bv = sortValue(b, sort.key);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sort]);

  const sortIcon = (key) => sort.key !== key ? faSort : sort.dir === 'asc' ? faSortUp : faSortDown;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Warehouses</h1>
          <p className={styles.pageSub}>{warehouses.length} facilities registered</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LiveClock />
          <button className={styles.addBtn} onClick={openAdd} id="add-warehouse-btn">
            <FontAwesomeIcon icon={faPlus} /> Add Warehouse
          </button>
        </div>
      </div>

      <div className={tableStyles.toolbar}>
        <div className={tableStyles.searchBox}>
          <FontAwesomeIcon icon={faMagnifyingGlass} className={tableStyles.searchIcon} />
          <input
            className={tableStyles.searchInput}
            placeholder="Search by name, address, or phone…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            id="warehouse-search"
          />
          {query && (
            <button className={tableStyles.searchClear} onClick={() => setQuery('')} title="Clear search">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>

        <div className={tableStyles.viewToggle} role="group" aria-label="View mode">
          <button
            type="button"
            className={`${tableStyles.toggleBtn} ${viewMode === 'grid' ? tableStyles.toggleBtnActive : ''}`}
            onClick={() => setView('grid')}
            title="Card view"
            aria-pressed={viewMode === 'grid'}
          >
            <FontAwesomeIcon icon={faThLarge} />
            <span className={tableStyles.toggleLabel}>Cards</span>
          </button>
          <button
            type="button"
            className={`${tableStyles.toggleBtn} ${viewMode === 'table' ? tableStyles.toggleBtnActive : ''}`}
            onClick={() => setView('table')}
            title="Table view"
            aria-pressed={viewMode === 'table'}
          >
            <FontAwesomeIcon icon={faTable} />
            <span className={tableStyles.toggleLabel}>Table</span>
          </button>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Loading warehouses…</div>
      ) : sorted.length === 0 ? (
        <div className={styles.empty}>
          {query ? `No warehouses match "${query}".` : 'No warehouses yet. Add one!'}
        </div>
      ) : viewMode === 'grid' ? (
        <div className={styles.grid}>
          {sorted.map(w => (
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
      ) : (
        <div className={tableStyles.tableWrap}>
          <div className={tableStyles.tableScroll}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th className={tableStyles.thExpand} aria-hidden="true" />
                {COLUMNS.map(col => (
                  <th key={col.key} className={tableStyles.thSortable} onClick={() => toggleSort(col.key)}>
                    <span>{col.label}</span>
                    <FontAwesomeIcon icon={sortIcon(col.key)} className={tableStyles.sortIcon} />
                  </th>
                ))}
                <th>Phone</th>
                <th className={tableStyles.thActions}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(w => {
                const isOpen = expandedIds.has(w.id);
                return (
                  <React.Fragment key={w.id}>
                    <tr
                      className={`${tableStyles.tr} ${w.is24Hours ? tableStyles.tr24 : ''} ${isOpen ? tableStyles.trOpen : ''}`}
                      onClick={() => toggleExpanded(w.id)}
                    >
                      <td className={tableStyles.tdExpand}>
                        <FontAwesomeIcon icon={faChevronDown} className={tableStyles.expandChevron} />
                      </td>
                      <td>
                        <div className={tableStyles.tName}>
                          <div className={tableStyles.tIcon}>{getInitials(w.name)}</div>
                          <span>{w.name}</span>
                          {w.is24Hours && <span className={styles.badge24}>24/7</span>}
                        </div>
                      </td>
                      <td className={tableStyles.tMuted}>{w.address || '—'}</td>
                      <td className={tableStyles.tMono}>{formatHours(w)}</td>
                      <td className={tableStyles.tMono}>{w.contactPhone || '—'}</td>
                      <td className={tableStyles.tdActions} onClick={e => e.stopPropagation()}>
                        <div className={tableStyles.actionsRow}>
                          <button className={styles.editBtn} onClick={() => openEdit(w)} title="Edit"><FontAwesomeIcon icon={faPencil} /></button>
                          <button className={styles.deleteBtn} onClick={() => setDeleteId(w.id)} title="Delete"><FontAwesomeIcon icon={faTrash} /></button>
                        </div>
                      </td>
                    </tr>
                    <tr className={tableStyles.trExpandRow}>
                      <td colSpan={6} className={tableStyles.tdExpandContent}>
                        <div className={`${tableStyles.expandPanel} ${isOpen ? tableStyles.expandPanelOpen : ''}`}>
                          <div className={tableStyles.expandPanelInner}>
                            {w.address && (
                              <div className={tableStyles.expandItem}>
                                <FontAwesomeIcon icon={faLocationDot} />
                                <span>{w.address}</span>
                              </div>
                            )}
                            {w.notes
                              ? <p className={styles.notes}>{w.notes}</p>
                              : <p className={tableStyles.notesEmpty}>No notes on file.</p>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
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
                    <TimePicker
                      value={form.openTime || null}
                      onChange={(t) => setForm(f => ({ ...f, openTime: t || '' }))}
                      placeholder="Select open time"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Closes</label>
                    <TimePicker
                      value={form.closeTime || null}
                      onChange={(t) => setForm(f => ({ ...f, closeTime: t || '' }))}
                      placeholder="Select close time"
                    />
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



