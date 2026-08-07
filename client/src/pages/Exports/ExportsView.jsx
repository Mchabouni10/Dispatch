// client/src/pages/Exports/ExportsView.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faPencil, faTrash, faPlaneDeparture,
  faMagnifyingGlass, faBoxesStacked, faWeightHanging,
  faWarehouse, faClock, faCalendarCheck, faTruck,
  faFileLines, faCircleCheck,
  faPallet, faTriangleExclamation, faBarcode,
  faTable, faThLarge, faChevronDown
} from '@fortawesome/free-solid-svg-icons';
import { getShipments, createShipment, updateShipment, deleteShipment, getAirlines, getWarehouses } from '../../api/api.js';
import Modal from '../../components/Modal/Modal.jsx';
import StatusBadge from '../../components/StatusBadge/StatusBadge.jsx';
import DateTimePicker, { toLocalISO } from '../../styles/Datetimepicker.jsx';
import styles from '../Imports/ImportsView.module.css';
import tableStyles from './ExportsView.table.module.css';

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getLockoutStatus(lockoutTime) {
  if (!lockoutTime) return null;
  const now = new Date();
  const lockout = new Date(lockoutTime);
  const hoursLeft = (lockout - now) / (1000 * 3600);
  if (hoursLeft < 0) return { status: 'expired', label: 'Lockout passed', color: 'danger' };
  if (hoursLeft < 2) return { status: 'critical', label: `Lockout in ${Math.ceil(hoursLeft)}h`, color: 'warning' };
  return { status: 'ok', label: `Lockout in ${Math.ceil(hoursLeft)}h`, color: 'success' };
}

const INITIAL = {
  type: 'Export',
  airline: '',
  warehouse: '',
  airwaybillNumber: '',
  pieces: '',
  weight: '',
  weightUnit: 'lb',
  flightDate: '',
  pickupReadyAt: '',
  deliveryAppointmentAt: '',
  pmcCount: '',
  notes: '',
  status: 'Pending'
};

export default function ExportsView() {
  const [shipments, setShipments] = useState([]);
  const [airlines, setAirlines] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAirline, setFilterAirline] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedAirline, setSelectedAirline] = useState(null);

  const VIEW_KEY = 'exportsViewMode';
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) || 'cards'; } catch { return 'cards'; }
  });
  const switchView = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_KEY, mode); } catch {}
  };
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const load = useCallback(async () => {
    try {
      const [s, a, w] = await Promise.all([
        getShipments({ type: 'Export' }),
        getAirlines(),
        getWarehouses()
      ]);
      setShipments(s);
      setAirlines(a);
      setWarehouses(w);
    } catch (e) { 
      setError(e.message); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...INITIAL, weightUnit: 'lb' });
    setSelectedAirline(null);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    const airline = airlines.find(a => a.id === s.airline?.id);
    setSelectedAirline(airline || null);
    setForm({
      ...s,
      airline: s.airline?.id || '',
      warehouse: s.warehouse?.id || '',
      airwaybillNumber: s.airwaybillNumber || '',
      weightUnit: s.weightUnit || 'lb',
      flightDate: s.flightDate ? s.flightDate.slice(0, 16) : '',
      pickupReadyAt: s.pickupReadyAt || '',
      deliveryAppointmentAt: s.deliveryAppointmentAt || '',
      pmcCount: s.pmcCount || ''
    });
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setSelectedAirline(null);
    setError('');
  };

  const handleAirlineChange = (e) => {
    const airlineId = e.target.value;
    const airline = airlines.find(a => a.id === airlineId);
    setSelectedAirline(airline || null);
    setForm(f => ({
      ...f,
      airline: airlineId,
      airwaybillNumber: airline?.awbPrefix ? airline.awbPrefix : ''
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { airline, warehouse, ...rest } = form;
      const payload = {
        ...rest,
        type: 'Export',
        airlineId: airline || null,
        warehouseId: warehouse || null,
        airwaybillNumber: form.airwaybillNumber.trim(),
        pieces: Number(form.pieces),
        weight: Number(form.weight),
        weightUnit: form.weightUnit || 'lb',
        pmcCount: Number(form.pmcCount) || 0,
        flightDate: form.flightDate ? new Date(form.flightDate).toISOString() : null
      };

      if (!payload.airwaybillNumber) throw new Error('Enter the AWB number');
      if (!payload.pieces) throw new Error('Enter the number of pieces');
      if (!payload.weight) throw new Error('Enter the weight');
      if (!payload.flightDate) throw new Error('Enter flight departure time');
      
      if (editing) await updateShipment(editing.id, payload);
      else await createShipment(payload);

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
      await deleteShipment(deleteId);
      setDeleteId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const filtered = shipments.filter(s => {
    const term = search.toLowerCase();
    const matchSearch = !term
      || s.airline?.name?.toLowerCase().includes(term)
      || s.airline?.code?.toLowerCase().includes(term)
      || s.airwaybillNumber?.toLowerCase().includes(term)
      || s.notes?.toLowerCase().includes(term);
    const matchAirline = filterAirline ? s.airline?.id === filterAirline : true;
    const matchStatus = filterStatus ? s.status === filterStatus : true;
    return matchSearch && matchAirline && matchStatus;
  });

  const stats = useMemo(() => ({
    total: shipments.length,
    pieces: shipments.reduce((sum, s) => sum + (Number(s.pieces) || 0), 0),
    weight: shipments.reduce((sum, s) => sum + (Number(s.weight) || 0), 0),
    active: shipments.filter(s => s.status === 'In Transit' || s.status === 'Assigned').length
  }), [shipments]);

  const groups = useMemo(() => [{ key: 'all', name: null, items: filtered }], [filtered]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>
            <FontAwesomeIcon icon={faPlaneDeparture} className={styles.titleIcon} />
            Export Shipments
          </h1>
          <p className={styles.pageSub}>{shipments.length} export{shipments.length !== 1 ? 's' : ''} ready for dispatch</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className={tableStyles.viewToggle} role="group" aria-label="View mode">
            <button type="button"
              className={`${tableStyles.toggleBtn} ${viewMode === 'cards' ? tableStyles.toggleBtnActive : ''}`}
              onClick={() => switchView('cards')} title="Card view" aria-pressed={viewMode === 'cards'}>
              <FontAwesomeIcon icon={faThLarge} /><span className={tableStyles.toggleLabel}>Cards</span>
            </button>
            <button type="button"
              className={`${tableStyles.toggleBtn} ${viewMode === 'table' ? tableStyles.toggleBtnActive : ''}`}
              onClick={() => switchView('table')} title="Table view" aria-pressed={viewMode === 'table'}>
              <FontAwesomeIcon icon={faTable} /><span className={tableStyles.toggleLabel}>Table</span>
            </button>
          </div>
          <button className={styles.addBtn} onClick={openAdd} id="add-export-btn">
            <FontAwesomeIcon icon={faPlus} /> New Export
          </button>
        </div>
      </div>

      <div className={styles.statBar}>
        <div className={`${styles.statCard} ${styles.statAccent}`}>
          <FontAwesomeIcon icon={faFileLines} />
          <div><strong>{stats.total}</strong><span>total exports</span></div>
        </div>
        <div className={`${styles.statCard} ${styles.statPieces}`}>
          <FontAwesomeIcon icon={faBoxesStacked} />
          <div><strong>{stats.pieces}</strong><span>total pieces</span></div>
        </div>
        <div className={`${styles.statCard} ${styles.statWeight}`}>
          <FontAwesomeIcon icon={faWeightHanging} />
          <div><strong>{stats.weight.toLocaleString()}</strong><span>total {shipments[0]?.weightUnit || 'lbs'}</span></div>
        </div>
        <div className={`${styles.statCard} ${styles.statGood}`}>
          <FontAwesomeIcon icon={faCircleCheck} />
          <div><strong>{stats.active}</strong><span>in transit</span></div>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchIcon} />
          <input className={styles.searchInput} placeholder="Search AWB, airline, trailer…" 
            value={search} onChange={e => setSearch(e.target.value)} id="export-search" />
        </div>
        <select className={styles.filterSelect} value={filterAirline} onChange={e => setFilterAirline(e.target.value)}>
          <option value="">All Airlines</option>
          {airlines.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className={styles.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {['Pending', 'Assigned', 'In Transit', 'Completed', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading exports…</div>
      ) : viewMode === 'table' ? (
        <div className={tableStyles.tableWrap}>
          <div className={tableStyles.tableScroll}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th className={tableStyles.thExpand} aria-hidden="true" />
                  <th>AWB</th>
                  <th>Airline</th>
                  <th>Origin</th>
                  <th>Cargo</th>
                  <th>Status</th>
                  <th>Flight</th>
                  <th>Cutoff</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr className={tableStyles.emptyRow}><td colSpan={9}>No export shipments match your filters.</td></tr>
                ) : filtered.map(s => {
                  const lockoutStatus = getLockoutStatus(s.lockoutTime);
                  const isExpired = lockoutStatus?.status === 'expired';
                  const awbDisplay = s.airline?.awbPrefix && s.airwaybillNumber
                    ? `${s.airline.awbPrefix}-${s.airwaybillNumber}` : s.airwaybillNumber;
                  const isOpen = expandedIds.has(s.id);
                  return (
                    <React.Fragment key={s.id}>
                      <tr
                        className={`${tableStyles.tr} ${isExpired ? tableStyles.rowOverdue : ''} ${isOpen ? tableStyles.trOpen : ''}`}
                        onClick={() => toggleExpanded(s.id)}
                      >
                        <td className={tableStyles.tdExpand}>
                          <FontAwesomeIcon icon={faChevronDown} className={tableStyles.expandChevron} />
                        </td>
                        <td>
                          <div className={tableStyles.awb}>{awbDisplay || '—'}</div>
                        </td>
                        <td className={tableStyles.muted}>
                          {s.airline?.name || '—'} ({s.airline?.code || '—'})
                        </td>
                        <td className={tableStyles.muted}>{s.warehouse?.name || '—'}</td>
                        <td className={tableStyles.cargo}>
                          <strong>{s.pieces}</strong> pcs · {s.weight} {s.weightUnit}
                          {s.pmcCount > 0 && <span className={tableStyles.muted}> · {s.pmcCount} PMC</span>}
                        </td>
                        <td onClick={e => e.stopPropagation()}><StatusBadge status={s.status} /></td>
                        <td className={tableStyles.muted}>{formatDateTime(s.flightDate)}</td>
                        <td>
                          {lockoutStatus ? (
                            <span className={
                              lockoutStatus.color === 'danger' ? tableStyles.danger
                              : lockoutStatus.color === 'warning' ? tableStyles.warn
                              : tableStyles.success
                            }>
                              {lockoutStatus.label}
                            </span>
                          ) : '—'}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className={tableStyles.actions}>
                            <button className={`${tableStyles.actionBtn} ${tableStyles.editBtn}`} onClick={() => openEdit(s)} title="Edit">
                              <FontAwesomeIcon icon={faPencil} />
                            </button>
                            <button className={`${tableStyles.actionBtn} ${tableStyles.deleteBtn}`} onClick={() => setDeleteId(s.id)} title="Delete">
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr className={tableStyles.trExpandRow}>
                        <td colSpan={9} className={tableStyles.tdExpandContent}>
                          <div className={`${tableStyles.expandPanel} ${isOpen ? tableStyles.expandPanelOpen : ''}`}>
                            <div className={tableStyles.expandPanelInner}>
                              <div className={tableStyles.expandGrid}>
                                {s.pickupReadyAt && (
                                  <div className={tableStyles.expandItem}>
                                    <span className={tableStyles.expandLabel}>Cargo Ready</span>
                                    <span className={tableStyles.expandValue}>{formatDateTime(s.pickupReadyAt)}</span>
                                  </div>
                                )}
                                {s.deliveryAppointmentAt && (
                                  <div className={tableStyles.expandItem}>
                                    <span className={tableStyles.expandLabel}>Airport Appt</span>
                                    <span className={tableStyles.expandValue}>{formatDateTime(s.deliveryAppointmentAt)}</span>
                                  </div>
                                )}
                                {s.pmcCount > 0 && (
                                  <div className={tableStyles.expandItem}>
                                    <span className={tableStyles.expandLabel}>PMCs</span>
                                    <span className={tableStyles.expandValue}>{s.pmcCount}</span>
                                  </div>
                                )}
                                {s.lockoutTime && (
                                  <div className={tableStyles.expandItem}>
                                    <span className={tableStyles.expandLabel}>Lockout Time</span>
                                    <span className={tableStyles.expandValue}>{formatDateTime(s.lockoutTime)}</span>
                                  </div>
                                )}
                              </div>
                              {s.notes
                                ? <p className={tableStyles.expandNotes}>{s.notes}</p>
                                : <p className={tableStyles.expandNotes}>No notes on file.</p>}
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
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>No export shipments match your filters.</div>
      ) : (
        groups.map(group => (
          <section key={group.key} className={styles.airlineGroup}>
            <div className={styles.grid}>
              {group.items.map(s => {
                const lockoutStatus = getLockoutStatus(s.lockoutTime);
                const isExpired = lockoutStatus?.status === 'expired';
                const awbDisplay = s.airline?.awbPrefix && s.airwaybillNumber 
                  ? `${s.airline.awbPrefix}-${s.airwaybillNumber}`
                  : s.airwaybillNumber;

                return (
                  <div key={s.id} className={`${styles.card} ${isExpired ? styles.overdueCard : ''}`}>
                    {isExpired && (
                      <div className={styles.overdueAlert}>
                        <FontAwesomeIcon icon={faTriangleExclamation} />
                        Lockout Time Passed!
                      </div>
                    )}
                    <div className={styles.cardHeader}>
                      <div className={styles.awbBlock}>
                        <div className={styles.awbLabel}>AWB</div>
                        <div className={styles.awbNum}>{awbDisplay || '—'}</div>
                      </div>
                      <div className={styles.cardActions}>
                        <button className={styles.editBtn} onClick={() => openEdit(s)} title="Edit"><FontAwesomeIcon icon={faPencil} /></button>
                        <button className={styles.deleteBtn} onClick={() => setDeleteId(s.id)} title="Delete"><FontAwesomeIcon icon={faTrash} /></button>
                      </div>
                    </div>

                    <div className={styles.cardBody}>
                      <div className={styles.row}>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}><FontAwesomeIcon icon={faWarehouse} /> Origin</span>
                          <span className={styles.fieldValue}>{s.warehouse?.name || '—'}</span>
                        </div>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}>Status</span>
                          <StatusBadge status={s.status} />
                        </div>
                      </div>
                      <div className={styles.row}>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}><FontAwesomeIcon icon={faBoxesStacked} /> Cargo</span>
                          <span className={styles.fieldValueBig}>{s.pieces} pcs · {s.weight} {s.weightUnit}</span>
                        </div>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}>Airline</span>
                          <span className={styles.fieldValue}>{s.airline?.name || '—'} ({s.airline?.code})</span>
                        </div>
                      </div>
                      <div className={styles.row}>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}><FontAwesomeIcon icon={faClock} /> Flight</span>
                          <span className={styles.fieldValue}>{formatDateTime(s.flightDate)}</span>
                        </div>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}>Cutoff</span>
                          <span className={`${styles.fieldValue} ${lockoutStatus ? styles[lockoutStatus.color] : ''}`}>
                            {lockoutStatus ? lockoutStatus.label : '—'}
                          </span>
                        </div>
                      </div>
                      {s.pmcCount > 0 && (
                        <div className={styles.row}>
                          <div className={styles.field}>
                            <span className={styles.fieldLabel}><FontAwesomeIcon icon={faPallet} /> PMCs</span>
                            <span className={styles.fieldValue}>{s.pmcCount}</span>
                          </div>
                        </div>
                      )}
                      {(s.pickupReadyAt || s.deliveryAppointmentAt) && (
                        <div className={styles.lfdRow}>
                          <FontAwesomeIcon icon={faCalendarCheck} />
                          <span>
                            {s.pickupReadyAt && <>Ready: <strong>{formatDateTime(s.pickupReadyAt)}</strong></>}
                            {s.pickupReadyAt && s.deliveryAppointmentAt && ' · '}
                            {s.deliveryAppointmentAt && <>Airport appt: <strong>{formatDateTime(s.deliveryAppointmentAt)}</strong></>}
                          </span>
                        </div>
                      )}
                      {s.notes && <p className={styles.notes}>{s.notes}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Edit Export' : 'New Export Shipment'} size="lg">
        <form onSubmit={handleSubmit} id="export-form" className={styles.form}>
          {error && <div className={styles.formError}>{error}</div>}

          <div className={styles.formSectionLabel}>Route & AWB</div>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Origin Warehouse *</label>
              <select className={styles.input} required value={form.warehouse} onChange={e => setForm(f => ({ ...f, warehouse: e.target.value }))}>
                <option value="">Select Warehouse…</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Airline *</label>
              <select className={styles.input} required value={form.airline} onChange={handleAirlineChange}>
                <option value="">Select Airline…</option>
                {airlines.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.code}) · {a.defaultCutoffHours}h cutoff · AWB: {a.awbPrefix || 'No prefix'}
                  </option>
                ))}
              </select>
              {selectedAirline && (
                <small className={styles.hint}>AWB prefix: {selectedAirline.awbPrefix || 'None'}</small>
              )}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>AWB Number *</label>
              <input className={styles.input} required value={form.airwaybillNumber} 
                onChange={e => setForm(f => ({ ...f, airwaybillNumber: e.target.value }))} 
                placeholder={selectedAirline?.awbPrefix ? `${selectedAirline.awbPrefix}-12345678` : "898-12345678"} />
              <small className={styles.hint}>Include prefix if not auto-filled</small>
            </div>
          </div>

          <div className={styles.formSectionLabel}>Cargo Details</div>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Pieces *</label>
              <input className={styles.input} type="number" min={1} required value={form.pieces} 
                onChange={e => setForm(f => ({ ...f, pieces: e.target.value }))} placeholder="0" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Weight *</label>
              <div className={styles.weightInput}>
                <input className={styles.input} type="number" min={0} step="0.1" required value={form.weight} 
                  onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="0.0" />
                <select className={styles.weightUnitSelect} value={form.weightUnit} 
                  onChange={e => setForm(f => ({ ...f, weightUnit: e.target.value }))}>
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>PMC Count</label>
              <input className={styles.input} type="number" min={0} value={form.pmcCount} 
                onChange={e => setForm(f => ({ ...f, pmcCount: e.target.value }))} placeholder="0" />
            </div>
          </div>

          <div className={styles.formSectionLabel}>Timing</div>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Flight Departure *</label>
              <DateTimePicker
                value={form.flightDate}
                onChange={(date) => setForm((f) => ({ ...f, flightDate: date ? toLocalISO(date) : '' }))}
              />
              <small className={styles.hint}>Cutoff time will be calculated automatically</small>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Cargo Ready at Warehouse</label>
              <DateTimePicker
                value={form.pickupReadyAt}
                onChange={(date) => setForm((f) => ({ ...f, pickupReadyAt: date ? toLocalISO(date) : '' }))}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Airline Terminal Appointment</label>
              <DateTimePicker
                value={form.deliveryAppointmentAt}
                onChange={(date) => setForm((f) => ({ ...f, deliveryAppointmentAt: date ? toLocalISO(date) : '' }))}
              />
            </div>
          </div>

          <div className={styles.formSectionLabel}>Status & Notes</div>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Status</label>
              <select className={styles.input} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {['Pending', 'Assigned', 'In Transit', 'Completed', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Notes</label>
              <input className={styles.input} value={form.notes} 
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} 
                placeholder="Special handling, dock number, etc." />
            </div>
          </div>

          <div className={styles.formActions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving} id="ex-save-btn">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Export'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Export" size="sm">
        <p className={styles.confirmText}>Delete this export shipment?</p>
        <div className={styles.formActions}>
          <button className={styles.cancelBtn} onClick={() => setDeleteId(null)}>Cancel</button>
          <button className={styles.deleteConfirmBtn} onClick={handleDelete}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}