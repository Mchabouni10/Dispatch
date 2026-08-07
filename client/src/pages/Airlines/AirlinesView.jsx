import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faPencil, faTrash, faPlane, faClock, faTag,
  faDoorOpen, faDoorClosed, faInfinity, faImage,
  faTable, faThLarge, faMapMarkerAlt, faSearch, faXmark
} from '@fortawesome/free-solid-svg-icons';
import { getAirlines, createAirline, updateAirline, deleteAirline, uploadAirlineLogo, resolveUploadUrl } from '../../api/api.js';
import Modal from '../../components/Modal/Modal.jsx';
import TimePicker from '../../styles/TimePicker.jsx';
import styles from './AirlinesView.module.css';
import tableStyles from './AirlinesView.table.module.css';

const INITIAL = {
  name: '', code: '', awbPrefix: '', terminalAddress: '', contactPhone: '',
  openTime: '08:00', closeTime: '18:00', open24h: false, defaultCutoffHours: 4, notes: ''
};

const VIEW_KEY = 'airlinesViewMode';

const formatTime12h = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
};

const isOpenNow = (airline) => {
  if (airline.open24h) return true;
  if (!airline.openTime || !airline.closeTime) return false;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = airline.openTime.split(':').map(Number);
  const [ch, cm] = airline.closeTime.split(':').map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  if (openMin === closeMin) return true;
  if (openMin < closeMin) return nowMin >= openMin && nowMin < closeMin;
  return nowMin >= openMin || nowMin < closeMin;
};

export default function AirlinesView() {
  const [airlines, setAirlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [search, setSearch] = useState('');

  // View mode: 'cards' | 'table' (persisted)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || 'cards';
    } catch {
      return 'cards';
    }
  });

  const switchView = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_KEY, mode); } catch { /* ignore */ }
  };

  const load = useCallback(async () => {
    try {
      const d = await getAirlines();
      setAirlines(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredAirlines = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return airlines;
    return airlines.filter(a =>
      a.name?.toLowerCase().includes(q) ||
      a.awbPrefix?.toLowerCase().includes(q) ||
      a.code?.toLowerCase().includes(q)
    );
  }, [airlines, search]);

  const openAdd = () => {
    setEditing(null);
    setForm(INITIAL);
    setError('');
    setLogoFile(null);
    setLogoPreview('');
    setModalOpen(true);
  };

  const openEdit = (a) => {
    setEditing(a);
    setForm({ ...INITIAL, ...a });
    setError('');
    setLogoFile(null);
    setLogoPreview(a.logoUrl ? resolveUploadUrl(a.logoUrl) : '');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setError('');
    setLogoFile(null);
    setLogoPreview('');
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = editing
        ? await updateAirline(editing.id, form)
        : await createAirline(form);

      if (logoFile && saved && saved.id) {
        await uploadAirlineLogo(saved.id, logoFile);
      }
      await load();
      closeModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteAirline(deleteId);
      setDeleteId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  /* Shared status badge for table */
  const StatusBadge = ({ airline }) => {
    if (airline.open24h) {
      return (
        <span className={`${tableStyles.statusBadge} ${tableStyles.status24h}`}>
          <FontAwesomeIcon icon={faInfinity} /> Open 24h
        </span>
      );
    }
    const open = isOpenNow(airline);
    return (
      <span className={`${tableStyles.statusBadge} ${open ? tableStyles.statusOpen : tableStyles.statusClosed}`}>
        <span className={`${tableStyles.statusDot} ${open ? tableStyles.statusDotOpen : tableStyles.statusDotClosed}`} />
        <FontAwesomeIcon icon={open ? faDoorOpen : faDoorClosed} />
        {formatTime12h(airline.openTime)}–{formatTime12h(airline.closeTime)}
      </span>
    );
  };

  /* ── Card view – address always visible under name ── */
  const renderCards = () => (
    <div className={styles.grid}>
      {filteredAirlines.length === 0 && (
        <div className={styles.empty}>
          {airlines.length === 0 ? 'No airlines yet. Add one!' : 'No airlines match your search.'}
        </div>
      )}
      {filteredAirlines.map(a => (
        <div key={a.id} className={styles.card}>
          <div className={styles.cardTop}>
            {a.logoUrl ? (
              <img
                src={resolveUploadUrl(a.logoUrl)}
                alt={`${a.name} logo`}
                className={styles.logoTag}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className={styles.codeTag}>{a.code}</div>
            )}
            <div className={styles.airlineInfo}>
              <div className={styles.airlineName}>{a.name}</div>
              {/* Address is important – always shown */}
              <div className={styles.airlineAddr} title={a.terminalAddress || undefined}>
                <FontAwesomeIcon icon={faMapMarkerAlt} style={{ marginRight: 5, fontSize: 10, opacity: 0.7 }} />
                {a.terminalAddress || 'No address'}
              </div>
            </div>
            <div className={styles.cardActions}>
              <button className={styles.editBtn} onClick={() => openEdit(a)} title="Edit">
                <FontAwesomeIcon icon={faPencil} />
              </button>
              <button className={styles.deleteBtn} onClick={() => setDeleteId(a.id)} title="Delete">
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          </div>
          <div className={styles.badgeRow}>
            <span className={`${styles.badge} ${styles.badgeAwb}`}>
              <FontAwesomeIcon icon={faTag} /> AWB {a.awbPrefix}-
            </span>
            {a.open24h ? (
              <span className={`${styles.badge} ${styles.badge24h}`}>
                <FontAwesomeIcon icon={faInfinity} /> Open 24 Hours
              </span>
            ) : (
              <span className={`${styles.badge} ${isOpenNow(a) ? styles.badgeOpen : styles.badgeClosed}`}>
                <span className={`${styles.statusDot} ${isOpenNow(a) ? styles.statusDotOpen : styles.statusDotClosed}`} />
                <FontAwesomeIcon icon={isOpenNow(a) ? faDoorOpen : faDoorClosed} />
                {formatTime12h(a.openTime)}–{formatTime12h(a.closeTime)}
              </span>
            )}
          </div>
          <div className={styles.cardBody}>
            {a.contactPhone && <div className={styles.infoRow}><span>📞</span>{a.contactPhone}</div>}
            <div className={styles.infoRow}>
              <FontAwesomeIcon icon={faClock} />
              <span>Export Cutoff: <strong>{a.defaultCutoffHours} hours</strong> before flight</span>
            </div>
            {a.notes && <p className={styles.notes}>{a.notes}</p>}
          </div>
        </div>
      ))}
    </div>
  );

  /* ── Table view – dedicated Address column ── */
  const renderTable = () => (
    <div className={tableStyles.tableWrap}>
      <div className={tableStyles.tableScroll}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th className={tableStyles.colLogo}></th>
              <th>Airline</th>
              <th>AWB</th>
              <th>Address</th>
              <th>Hours</th>
              <th>Cutoff</th>
              <th>Phone</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAirlines.length === 0 ? (
              <tr className={tableStyles.emptyRow}>
                <td colSpan={8}>
                  {airlines.length === 0 ? 'No airlines yet. Add one!' : 'No airlines match your search.'}
                </td>
              </tr>
            ) : (
              filteredAirlines.map(a => (
                <tr key={a.id}>
                  <td>
                    {a.logoUrl ? (
                      <img
                        src={resolveUploadUrl(a.logoUrl)}
                        alt=""
                        className={tableStyles.logoCell}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className={tableStyles.codeFallback}>{a.code}</div>
                    )}
                  </td>
                  <td>
                    <div className={tableStyles.airlineName}>{a.name}</div>
                    <div className={tableStyles.airlineCode}>{a.code}</div>
                  </td>
                  <td>
                    <span className={tableStyles.awbBadge}>
                      <FontAwesomeIcon icon={faTag} style={{ fontSize: 10 }} />
                      {a.awbPrefix}-
                    </span>
                  </td>
                  {/* Address column – truncated with full text on hover */}
                  <td>
                    {a.terminalAddress ? (
                      <div className={tableStyles.address} title={a.terminalAddress}>
                        {a.terminalAddress}
                      </div>
                    ) : (
                      <div className={`${tableStyles.address} ${tableStyles.addressEmpty}`}>—</div>
                    )}
                  </td>
                  <td>
                    <StatusBadge airline={a} />
                  </td>
                  <td className={tableStyles.cutoff}>
                    <strong>{a.defaultCutoffHours}h</strong>
                  </td>
                  <td className={tableStyles.phone}>
                    {a.contactPhone || '—'}
                  </td>
                  <td>
                    <div className={tableStyles.actions}>
                      <button
                        className={`${tableStyles.actionBtn} ${tableStyles.editBtn}`}
                        onClick={() => openEdit(a)}
                        title="Edit"
                      >
                        <FontAwesomeIcon icon={faPencil} />
                      </button>
                      <button
                        className={`${tableStyles.actionBtn} ${tableStyles.deleteBtn}`}
                        onClick={() => setDeleteId(a.id)}
                        title="Delete"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Airlines</h1>
          <p className={styles.pageSub}>
            {search.trim()
              ? `${filteredAirlines.length} of ${airlines.length} airline cargo stations`
              : `${airlines.length} airline cargo stations`}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className={tableStyles.viewToggle} role="group" aria-label="View mode">
            <button
              type="button"
              className={`${tableStyles.toggleBtn} ${viewMode === 'cards' ? tableStyles.toggleBtnActive : ''}`}
              onClick={() => switchView('cards')}
              title="Card view"
              aria-pressed={viewMode === 'cards'}
            >
              <FontAwesomeIcon icon={faThLarge} />
              <span className={tableStyles.toggleLabel}>Cards</span>
            </button>
            <button
              type="button"
              className={`${tableStyles.toggleBtn} ${viewMode === 'table' ? tableStyles.toggleBtnActive : ''}`}
              onClick={() => switchView('table')}
              title="Table view"
              aria-pressed={viewMode === 'table'}
            >
              <FontAwesomeIcon icon={faTable} />
              <span className={tableStyles.toggleLabel}>Table</span>
            </button>
          </div>

          <button className={styles.addBtn} onClick={openAdd} id="add-airline-btn">
            <FontAwesomeIcon icon={faPlus} /> Add Airline
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by name or AWB prefix…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Loading airlines…</div>
      ) : (
        viewMode === 'table' ? renderTable() : renderCards()
      )}

      {/* Add / Edit Modal */}
      <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Edit Airline' : 'Add Airline'} size="md">
        <form onSubmit={handleSubmit} id="airline-form" className={styles.form}>
          {error && <div className={styles.formError}>{error}</div>}
          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Airline Name *</label>
              <input id="al-name" className={styles.input} required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Lufthansa Cargo" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>IATA Code *</label>
              <input id="al-code" className={styles.input} required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="LH" maxLength={3} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>AWB Prefix *</label>
              <input id="al-awb-prefix" className={styles.input} required pattern="\d{3}" maxLength={3} inputMode="numeric" value={form.awbPrefix} onChange={e => setForm(f => ({ ...f, awbPrefix: e.target.value.replace(/\D/g, '').slice(0, 3) }))} placeholder="020" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Cutoff Hours *</label>
              <input id="al-cutoff" className={styles.input} type="number" min={1} max={24} value={form.defaultCutoffHours} onChange={e => setForm(f => ({ ...f, defaultCutoffHours: Number(e.target.value) }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Opens *</label>
              <TimePicker
                value={form.openTime || null}
                onChange={(t) => setForm(f => ({ ...f, openTime: t || '' }))}
                placeholder="Select open time"
                disabled={form.open24h}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Closes *</label>
              <TimePicker
                value={form.closeTime || null}
                onChange={(t) => setForm(f => ({ ...f, closeTime: t || '' }))}
                placeholder="Select close time"
                disabled={form.open24h}
              />
            </div>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" id="al-open24h" checked={form.open24h} onChange={e => setForm(f => ({ ...f, open24h: e.target.checked }))} />
                Open 24 Hours
              </label>
            </div>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Terminal Address</label>
              <input id="al-address" className={styles.input} value={form.terminalAddress} onChange={e => setForm(f => ({ ...f, terminalAddress: e.target.value }))} placeholder="TBIT Cargo - LAX" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Contact Phone</label>
              <input id="al-phone" className={styles.input} value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="(310) 646-0000" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Notes</label>
              <input id="al-notes" className={styles.input} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional info…" />
            </div>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Logo</label>
              <div className={styles.logoUploadRow}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className={styles.logoPreview} />
                ) : (
                  <div className={styles.logoPreviewEmpty}><FontAwesomeIcon icon={faImage} /></div>
                )}
                <label htmlFor="al-logo" className={styles.logoUploadBtn}>
                  <FontAwesomeIcon icon={faPlane} /> Choose Image
                </label>
                <input id="al-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoChange} className={styles.logoInputHidden} />
              </div>
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving} id="al-save-btn">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Airline'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Airline" size="sm">
        <p className={styles.confirmText}>Delete this airline? This cannot be undone.</p>
        <div className={styles.formActions}>
          <button className={styles.cancelBtn} onClick={() => setDeleteId(null)}>Cancel</button>
          <button className={styles.deleteConfirmBtn} onClick={handleDelete} id="al-delete-confirm">Delete</button>
        </div>
      </Modal>
    </div>
  );
}



