import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faPencil, faTrash, faPlane, faClock, faTag, faDoorOpen, faDoorClosed, faInfinity, faImage } from '@fortawesome/free-solid-svg-icons';
import { getAirlines, createAirline, updateAirline, deleteAirline, uploadAirlineLogo, resolveUploadUrl } from '../../api/api.js';
import Modal from '../../components/Modal/Modal.jsx';
import styles from './AirlinesView.module.css';

const INITIAL = { name: '', code: '', awbPrefix: '', terminalAddress: '', contactPhone: '', openTime: '08:00', closeTime: '18:00', open24h: false, defaultCutoffHours: 4, notes: '' };

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

  const load = useCallback(async () => {
    try { const d = await getAirlines(); setAirlines(d); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm(INITIAL); setError(''); setLogoFile(null); setLogoPreview(''); setModalOpen(true); };
  
  // ✅ FIXED: Use id instead of _id
  const openEdit = (a) => { 
    setEditing(a); 
    setForm({ ...INITIAL, ...a }); 
    setError(''); 
    setLogoFile(null); 
    setLogoPreview(a.logoUrl ? resolveUploadUrl(a.logoUrl) : ''); 
    setModalOpen(true); 
  };
  
  const closeModal = () => { setModalOpen(false); setEditing(null); setError(''); setLogoFile(null); setLogoPreview(''); };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  // ✅ FIXED: Use id instead of _id
  const handleSubmit = async (e) => {
    e.preventDefault(); 
    setSaving(true); 
    setError('');
    try {
      // Use id (Prisma) instead of _id (Mongoose)
      const saved = editing 
        ? await updateAirline(editing.id, form) 
        : await createAirline(form);
      
      // Use saved.id instead of saved._id
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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Airlines</h1>
          <p className={styles.pageSub}>{airlines.length} airline cargo stations</p>
        </div>
        <button className={styles.addBtn} onClick={openAdd} id="add-airline-btn">
          <FontAwesomeIcon icon={faPlus} /> Add Airline
        </button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Loading airlines…</div>
      ) : (
        <div className={styles.grid}>
          {airlines.length === 0 && <div className={styles.empty}>No airlines yet. Add one!</div>}
          {/* ✅ FIXED: Use id instead of _id for key */}
          {airlines.map(a => (
            <div key={a.id} className={styles.card}>
              <div className={styles.cardTop}>
                {a.logoUrl ? (
                  <img 
                    src={resolveUploadUrl(a.logoUrl)} 
                    alt={`${a.name} logo`} 
                    className={styles.logoTag}
                    onError={(e) => {
                      console.error('Image failed to load:', resolveUploadUrl(a.logoUrl));
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className={styles.codeTag}>{a.code}</div>
                )}
                <div className={styles.airlineInfo}>
                  <div className={styles.airlineName}>{a.name}</div>
                  <div className={styles.airlineAddr}>{a.terminalAddress || 'No address'}</div>
                </div>
                <div className={styles.cardActions}>
                  {/* ✅ FIXED: Pass the whole object, openEdit uses a.id */}
                  <button className={styles.editBtn} onClick={() => openEdit(a)} title="Edit">
                    <FontAwesomeIcon icon={faPencil} />
                  </button>
                  {/* ✅ FIXED: Use a.id instead of a._id */}
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
      )}

      <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Edit Airline' : 'Add Airline'} size="md">
        <form onSubmit={handleSubmit} id="airline-form" className={styles.form}>
          {error && <div className={styles.formError}>{error}</div>}
          <div className={styles.formGrid}>
            {/* Form fields remain the same */}
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
              <input id="al-open-time" className={styles.input} type="time" required disabled={form.open24h} value={form.openTime} onChange={e => setForm(f => ({ ...f, openTime: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Closes *</label>
              <input id="al-close-time" className={styles.input} type="time" required disabled={form.open24h} value={form.closeTime} onChange={e => setForm(f => ({ ...f, closeTime: e.target.value }))} />
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