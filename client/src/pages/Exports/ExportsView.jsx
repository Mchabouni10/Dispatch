// client/src/pages/Exports/ExportsView.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faPencil, faTrash, faPrint, faPlaneDeparture,
  faMagnifyingGlass, faBoxesStacked, faWeightHanging,
  faWarehouse, faClock, faCalendarCheck, faTruck,
  faFileLines, faCircleCheck,
  faPallet, faTriangleExclamation, faBarcode,
  faTable, faThLarge, faChevronDown, faEnvelopeOpenText,
  faLayerGroup, faListUl
} from '@fortawesome/free-solid-svg-icons';
import { useReactToPrint } from 'react-to-print';
import { getShipments, createShipment, updateShipment, deleteShipment, getAirlines, getWarehouses } from '../../api/api.js';
import Modal from '../../components/Modal/Modal.jsx';
import StatusBadge from '../../components/StatusBadge/StatusBadge.jsx';
import DateTimePicker, { toLocalISO } from '../../styles/Datetimepicker.jsx';
import CevaExportTemplate from './Templates/Ceva_Export_Template.jsx';
import styles from './ExportsView.module.css';
import LiveClock from "../../styles/Liveclock.jsx";
import tableStyles from './ExportsView.table.module.css';
import EmailPasteModal from '../../components/EmailPasteModal/EmailPasteModal.jsx';
import {
  EXPORT_FIELD_SEVERITY,
  getFieldStatus,
  hasCriticalMissing,
  describeMissingCritical,
} from '../../utils/fieldSeverity.js';

const AIRLINE_PALETTE = [
  '#00d4ff', '#a78bfa', '#ffb347', '#00d084', '#ff6b9d',
  '#5eead4', '#f472b6', '#818cf8', '#f59e0b', '#10b981'
];

function airlineColor(id) {
  if (!id) return '#4f8ef7';
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AIRLINE_PALETTE[hash % AIRLINE_PALETTE.length];
}

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

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function matchesGeneratedFilter(permitGeneratedAt, mode, from, to) {
  if (!mode) return true; // "Any time"
  if (!permitGeneratedAt) return false; // never generated, can't match a date range
  const generated = new Date(permitGeneratedAt);
  const now = new Date();
  if (mode === 'today') {
    return generated >= startOfDay(now) && generated <= endOfDay(now);
  }
  if (mode === 'week') {
    return generated >= startOfWeek(now) && generated <= endOfDay(now);
  }
  if (mode === 'custom') {
    if (!from && !to) return true; // range not fully set yet — don't filter anything out
    if (from && generated < startOfDay(from)) return false;
    if (to && generated > endOfDay(to)) return false;
    return true;
  }
  return true;
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
  status: 'Pending',
  isGDP: false,
  gdpTemperatureRange: '',
  isHazmat: false,
  hazmatClass: ''
};

export default function ExportsView() {
  const [shipments, setShipments] = useState([]);
  const [airlines, setAirlines] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAirline, setFilterAirline] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterGenerated, setFilterGenerated] = useState('');
  const [generatedFrom, setGeneratedFrom] = useState('');
  const [generatedTo, setGeneratedTo] = useState('');
  const [groupByAirline, setGroupByAirline] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedAirline, setSelectedAirline] = useState(null);

  // ── Field-severity flagging (see fieldSeverity.js) ──────────────
  const fieldStatus = (key) => getFieldStatus(form[key], EXPORT_FIELD_SEVERITY[key]);
  const formGroupClass = (key) => {
    const status = fieldStatus(key);
    if (status === 'missing-critical') return styles.formGroupCritical;
    if (status === 'missing-tolerant') return styles.formGroupTolerant;
    return styles.formGroup;
  };
  const saveDisabled = saving || hasCriticalMissing(form, EXPORT_FIELD_SEVERITY);

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

  // ── Paste-email prefill ──────────────────────────────────────────
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const openEmailPaste = () => setEmailModalOpen(true);
  const handleEmailFields = (fields) => {
    setEditing(null);
    setSelectedAirline(airlines.find((a) => a.id === fields.airline) || null);
    setForm({ ...INITIAL, weightUnit: 'lb', ...fields });
    setEmailModalOpen(false);
    setError('');
    setModalOpen(true);
  };
  // ───────────────────────────────────────────────────────────────

  // ── Print transfer manifest (react-to-print) ─────────────────
  const printRef = useRef(null);
  const [printJob, setPrintJob] = useState(null); // { data, nonce }

  const triggerPrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: printJob
      ? `CEVA-Manifest-${printJob.data.awbDisplay || printJob.data.airwaybillNumber || 'draft'}`
      : 'CEVA-Manifest',
    onPrintError: (errorLocation, error) => {
      console.error('Print error:', errorLocation, error);
    },
  });

  const requestPrint = (shipment) => {
    const generatedAt = new Date().toISOString();
    setShipments((prev) =>
      prev.map((row) =>
        row.id === shipment.id ? { ...row, permitGeneratedAt: generatedAt } : row,
      ),
    );
    updateShipment(shipment.id, { permitGeneratedAt: generatedAt }).catch(() => {});

    const airline = airlines.find((a) => a.id === shipment.airline?.id) || shipment.airline;
    const awbDisplay =
      airline?.awbPrefix && shipment.airwaybillNumber
        ? `${airline.awbPrefix}-${shipment.airwaybillNumber}`
        : shipment.airwaybillNumber;

    const lockoutLabel = shipment.lockoutTime
      ? new Date(shipment.lockoutTime).toLocaleString('en-US', {
          hour12: false,
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    setPrintJob({
      nonce: Date.now(),
      data: {
        shipment,
        airline,
        awbDisplay,
        lockoutLabel,
        transferTo: airline?.code || '',
        transferredBy: "Geanto's Trucking",
        shipments: [
          {
            mawbNumber: awbDisplay || '',
            dest: shipment.destination || '',
            pieces: shipment.pieces || '',
            weight: shipment.weight
              ? `${shipment.weight} ${shipment.weightUnit || ''}`.trim()
              : '',
            lockout: lockoutLabel,
            remarks: shipment.notes || '',
            loose: '',
            uld: shipment.pmcCount || '',
            dg: '',
          },
        ],
      },
    });
  };

  // The print target (below, in the JSX) is now ALWAYS mounted off-screen,
  // so printRef.current is never null — no more racing a setTimeout against
  // React's commit. Once printJob updates and this effect's render has
  // committed, the ref already points at the freshly-updated content.
  useEffect(() => {
    if (!printJob) return;
    triggerPrint();
  }, [printJob, triggerPrint]);
  // ───────────────────────────────────────────────────────────────

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
      pmcCount: s.pmcCount || '',
      isGDP: s.isGDP || false,
      gdpTemperatureRange: s.gdpTemperatureRange || '',
      isHazmat: s.isHazmat || false,
      hazmatClass: s.hazmatClass || ''
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

      const missingMsg = describeMissingCritical(form, EXPORT_FIELD_SEVERITY);
      if (missingMsg) throw new Error(missingMsg);

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

  const filtered = shipments.filter((s) => {
    const term = search.toLowerCase().replace(/[\s-]/g, '');
    const rawAwb = s.airwaybillNumber?.toLowerCase().replace(/[\s-]/g, '');
    const fullAwb = s.airline?.awbPrefix
      ? `${s.airline.awbPrefix}${s.airwaybillNumber || ''}`.toLowerCase().replace(/[\s-]/g, '')
      : rawAwb;
    const matchSearch = !term
      || rawAwb?.includes(term)
      || fullAwb?.includes(term)
      || s.airline?.name?.toLowerCase().includes(term)
      || s.airline?.code?.toLowerCase().includes(term)
      || s.warehouse?.name?.toLowerCase().includes(term)
      || s.notes?.toLowerCase().includes(term)
      || s.trailerNumber?.toLowerCase().includes(term)
      || s.doorNumber?.toLowerCase().includes(term);
    const matchAirline = filterAirline ? s.airline?.id === filterAirline : true;
    const matchWarehouse = filterWarehouse ? s.warehouse?.id === filterWarehouse : true;
    const matchStatus = filterStatus ? s.status === filterStatus : true;
    const matchGenerated = matchesGeneratedFilter(
      s.permitGeneratedAt,
      filterGenerated,
      generatedFrom,
      generatedTo
    );
    return matchSearch && matchAirline && matchWarehouse && matchStatus && matchGenerated;
  });

  const stats = useMemo(() => ({
    total: shipments.length,
    pieces: shipments.reduce((sum, s) => sum + (Number(s.pieces) || 0), 0),
    weight: shipments.reduce((sum, s) => sum + (Number(s.weight) || 0), 0),
    active: shipments.filter(s => s.status === 'In Transit' || s.status === 'Assigned').length
  }), [shipments]);

  const groups = useMemo(() => {
    if (!groupByAirline) return [{ key: 'all', name: null, code: null, items: filtered }];
    const byAirline = new Map();
    filtered.forEach(s => {
      const key = s.airline?.id || 'unassigned';
      if (!byAirline.has(key)) {
        byAirline.set(key, {
          key,
          name: s.airline?.name || 'No airline set',
          code: s.airline?.code || '—',
          items: [],
          color: airlineColor(key),
        });
      }
      byAirline.get(key).items.push(s);
    });
    return [...byAirline.values()].sort((a, b) => b.items.length - a.items.length);
  }, [filtered, groupByAirline]);

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
          <LiveClock />
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
          <button className={styles.cancelBtn} onClick={openEmailPaste} id="paste-email-export-btn">
            <FontAwesomeIcon icon={faEnvelopeOpenText} /> Paste Email
          </button>
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
          <input
            className={styles.searchInput}
            placeholder="Search AWB, airline, or warehouse…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            id="export-search"
          />
        </div>
        <select
          className={styles.filterSelect}
          value={filterAirline}
          onChange={e => setFilterAirline(e.target.value)}
          id="export-filter-airline"
        >
          <option value="">All Airlines</option>
          {airlines.map(a => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.code})
            </option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={filterWarehouse}
          onChange={e => setFilterWarehouse(e.target.value)}
          id="export-filter-warehouse"
        >
          <option value="">All Warehouses</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          id="export-filter-status"
        >
          <option value="">All Statuses</option>
          {['Pending', 'Assigned', 'In Transit', 'Completed', 'Cancelled'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={filterGenerated}
          onChange={e => {
            const mode = e.target.value;
            setFilterGenerated(mode);
            if (mode !== 'custom') {
              setGeneratedFrom('');
              setGeneratedTo('');
            }
          }}
          id="export-filter-generated"
          title="Filter by when the manifest was generated"
        >
          <option value="">Generated: Any Time</option>
          <option value="today">Generated Today</option>
          <option value="week">Generated This Week</option>
          <option value="custom">Custom Range…</option>
        </select>
        {filterGenerated === 'custom' && (
          <div className={styles.dateRangeRow}>
            <input
              type="date"
              className={styles.filterSelect}
              value={generatedFrom}
              onChange={e => setGeneratedFrom(e.target.value)}
              aria-label="Generated from date"
            />
            <span className={styles.dateRangeSep}>–</span>
            <input
              type="date"
              className={styles.filterSelect}
              value={generatedTo}
              onChange={e => setGeneratedTo(e.target.value)}
              aria-label="Generated to date"
            />
          </div>
        )}
        <button
          type="button"
          className={`${styles.groupToggle} ${groupByAirline ? styles.groupToggleActive : ''}`}
          onClick={() => setGroupByAirline(g => !g)}
          title="Group exports by airline"
        >
          <FontAwesomeIcon icon={groupByAirline ? faLayerGroup : faListUl} />
          {groupByAirline ? 'Grouped by airline' : 'Flat list'}
        </button>
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
                            <button className={`${tableStyles.actionBtn} ${tableStyles.printBtn}`} onClick={() => requestPrint(s)} title="Print manifest">
                              <FontAwesomeIcon icon={faPrint} />
                            </button>
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
                                {s.permitGeneratedAt && (
                                  <div className={tableStyles.expandItem}>
                                    <span className={tableStyles.expandLabel}>Manifest Generated</span>
                                    <span className={tableStyles.expandValue}>{formatDateTime(s.permitGeneratedAt)}</span>
                                  </div>
                                )}
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
            {groupByAirline && (
              <div
                className={styles.groupHeading}
                style={{ '--airline-color': group.color }}
              >
                <span className={styles.groupDot} />
                <h2>{group.name}</h2>
                <span className={styles.groupCode}>{group.code}</span>
                <span className={styles.groupCount}>
                  {group.items.length} export{group.items.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            <div className={styles.grid}>
              {group.items.map(s => {
                const lockoutStatus = getLockoutStatus(s.lockoutTime);
                const isExpired = lockoutStatus?.status === 'expired';
                const awbDisplay = s.airline?.awbPrefix && s.airwaybillNumber 
                  ? `${s.airline.awbPrefix}-${s.airwaybillNumber}`
                  : s.airwaybillNumber;
                const color = airlineColor(s.airline?.id);

                return (
                  <div
                    key={s.id}
                    className={`${styles.card} ${isExpired ? styles.overdueCard : ''}`}
                    style={{ '--airline-color': color }}
                  >
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
                        <button className={styles.printBtn} onClick={() => requestPrint(s)} title="Print manifest"><FontAwesomeIcon icon={faPrint} /></button>
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
            <div className={formGroupClass('warehouse')}>
              <label className={styles.label}>Origin Warehouse *</label>
              <select className={styles.input} required value={form.warehouse} onChange={e => setForm(f => ({ ...f, warehouse: e.target.value }))}>
                <option value="">Select Warehouse…</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className={formGroupClass('airline')}>
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
            <div className={formGroupClass('airwaybillNumber')}>
              <label className={styles.label}>AWB Number *</label>
              <input className={styles.input} required value={form.airwaybillNumber} 
                onChange={e => setForm(f => ({ ...f, airwaybillNumber: e.target.value }))} 
                placeholder={selectedAirline?.awbPrefix ? `${selectedAirline.awbPrefix}-12345678` : "898-12345678"} />
              <small className={styles.hint}>Include prefix if not auto-filled</small>
            </div>
          </div>

          <div className={styles.formSectionLabel}>Cargo Details</div>
          <div className={styles.formGrid}>
            <div className={formGroupClass('pieces')}>
              <label className={styles.label}>Pieces *</label>
              <input className={styles.input} type="number" min={1} required value={form.pieces} 
                onChange={e => setForm(f => ({ ...f, pieces: e.target.value }))} placeholder="0" />
            </div>
            <div className={formGroupClass('weight')}>
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
            <div className={formGroupClass('pmcCount')}>
              <label className={styles.label}>PMC Count</label>
              <input className={styles.input} type="number" min={0} value={form.pmcCount} 
                onChange={e => setForm(f => ({ ...f, pmcCount: e.target.value }))} placeholder="0" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={form.isGDP}
                  onChange={e => setForm(f => ({ ...f, isGDP: e.target.checked }))} />
                GDP (Temperature Controlled)
              </label>
              {form.isGDP && (
                <input className={styles.input} placeholder="Temperature range (e.g., 2-8°C)"
                  value={form.gdpTemperatureRange}
                  onChange={e => setForm(f => ({ ...f, gdpTemperatureRange: e.target.value }))} />
              )}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={form.isHazmat}
                  onChange={e => setForm(f => ({ ...f, isHazmat: e.target.checked }))} />
                Hazmat (Dangerous Goods)
              </label>
              {form.isHazmat && (
                <input className={styles.input} placeholder="Hazmat class (e.g., Class 9, UN3480)"
                  value={form.hazmatClass}
                  onChange={e => setForm(f => ({ ...f, hazmatClass: e.target.value }))} />
              )}
            </div>
          </div>

          <div className={styles.formSectionLabel}>Timing</div>
          <div className={styles.formGrid}>
            <div className={formGroupClass('flightDate')}>
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

          {saveDisabled && !saving && (
            <div className={styles.hint} style={{ color: 'var(--danger)', marginBottom: 8 }}>
              {describeMissingCritical(form, EXPORT_FIELD_SEVERITY) ||
                'Fill in the required fields above to save.'}
            </div>
          )}
          <div className={styles.formActions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saveDisabled} id="ex-save-btn">
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

      <EmailPasteModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        type="Export"
        airlines={airlines}
        warehouses={warehouses}
        formStyles={styles}
        onUseDetails={handleEmailFields}
      />

      {/* ── Hidden print-only render of the CEVA transfer manifest ──
          Always mounted (not conditional on printJob) so printRef.current
          is never null when triggerPrint() fires — that null-ref race was
          the actual cause of the blank print output. */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: '-10000px',
          width: '8.5in',
          height: 0,
          overflow: 'hidden',
        }}
        aria-hidden="true"
      >
        <div ref={printRef}>
          <CevaExportTemplate
            movementOrderNumber=""
            transferTo={printJob?.data.transferTo || ''}
            transferredBy={printJob?.data.transferredBy || "Geanto's Trucking"}
            shipments={printJob?.data.shipments || []}
            printedAt={new Date()}
          />
        </div>
      </div>
    </div>
  );
}