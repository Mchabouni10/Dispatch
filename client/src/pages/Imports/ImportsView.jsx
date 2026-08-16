// client/src/pages/Imports/ImportsView.jsx
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faPencil,
  faTrash,
  faPrint,
  faPlaneArrival,
  faMagnifyingGlass,
  faTriangleExclamation,
  faBoxesStacked,
  faLayerGroup,
  faListUl,
  faWeightHanging,
  faWarehouse,
  faClock,
  faCalendarCheck,
  faFileLines,
  faSnowflake,
  faSkullCrossbones,
  faMoneyBillWave,
  faPallet,
  faCircleCheck,
  faTable,
  faThLarge,
  faChevronDown,
  faEnvelopeOpenText,
  faFileCsv,
} from "@fortawesome/free-solid-svg-icons";
import { useReactToPrint } from "react-to-print";
import {
  getShipments,
  createShipment,
  updateShipment,
  deleteShipment,
  getAirlines,
  getWarehouses,
} from "../../api/api.js";
import Modal from "../../components/Modal/Modal.jsx";
import StatusBadge from "../../components/StatusBadge/StatusBadge.jsx";
import DateTimePicker, { toLocalISO } from "../../styles/Datetimepicker.jsx";
// Template lives at src/pages/Import/templates/ (adjust if you move it under Imports/)
import CevaTemplate from "../Imports/Templates/Ceva-template.jsx";
import styles from "./ImportsView.module.css";
import LiveClock from "../../styles/Liveclock.jsx"; // adjust path to match your folder layout
import tableStyles from "./ImportsView.table.module.css";
import EmailPasteModal from "../../components/EmailPasteModal/EmailPasteModal.jsx";
import CsvImportModal from "../../components/CsvImportModal/CsvImportModal.jsx";
import {
  IMPORT_FIELD_SEVERITY,
  getFieldStatus,
  hasCriticalMissing,
  describeMissingCritical,
} from "../../utils/fieldSeverity.js";

const AIRLINE_PALETTE = [
  "#00d4ff",
  "#a78bfa",
  "#ffb347",
  "#00d084",
  "#ff6b9d",
  "#5eead4",
  "#f472b6",
  "#818cf8",
  "#f59e0b",
  "#10b981",
];

function airlineColor(id) {
  if (!id) return "#4f8ef7";
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AIRLINE_PALETTE[hash % AIRLINE_PALETTE.length];
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function storageDaysOver(lastFreeDay) {
  if (!lastFreeDay) return 0;
  const lfd = new Date(lastFreeDay);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  lfd.setHours(0, 0, 0, 0);
  if (today > lfd) return Math.ceil((today - lfd) / (1000 * 3600 * 24));
  return 0;
}

// Local-day boundaries (not UTC) so "Today" / "This Week" line up with what
// the dispatcher actually sees on their clock.
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
// Week = Sunday through Saturday of the current week.
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
  if (mode === "today") {
    return generated >= startOfDay(now) && generated <= endOfDay(now);
  }
  if (mode === "week") {
    return generated >= startOfWeek(now) && generated <= endOfDay(now);
  }
  if (mode === "custom") {
    if (!from && !to) return true; // range not fully set yet — don't filter anything out
    if (from && generated < startOfDay(from)) return false;
    if (to && generated > endOfDay(to)) return false;
    return true;
  }
  return true;
}

function daysUntil(lastFreeDay) {
  if (!lastFreeDay) return null;
  const lfd = new Date(lastFreeDay);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  lfd.setHours(0, 0, 0, 0);
  return Math.round((lfd - today) / (1000 * 3600 * 24));
}

const INITIAL = {
  type: "Import",
  airwaybillNumber: "",
  ordNumber: "",
  originCity: "",
  flightNumber: "",
  airline: "",
  warehouse: "",
  pieces: "",
  weight: "",
  weightUnit: "lb",
  flightEta: "",
  lastFreeDay: "",
  storageFeePerDay: "",
  storageFeePaid: false,
  terminalFee: "",
  terminalFeePaid: false,
  isGDP: false,
  gdpTemperatureRange: "",
  isHazmat: false,
  hazmatClass: "",
  pmcCount: "",
  pickupReadyAt: "",
  deliveryAppointmentAt: "",
  notes: "",
  status: "Pending",
};

export default function ImportsView() {
  const [shipments, setShipments] = useState([]);
  const [airlines, setAirlines] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAirline, setFilterAirline] = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  // "" = any time, "today", "week", or "custom" (uses generatedFrom/To below)
  const [filterGenerated, setFilterGenerated] = useState("");
  const [generatedFrom, setGeneratedFrom] = useState("");
  const [generatedTo, setGeneratedTo] = useState("");
  const [groupByAirline, setGroupByAirline] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedAirline, setSelectedAirline] = useState(null);

  // ── Field-severity flagging ────────────────────────────────────
  // Derived live from current form state, not just at parse time — so a
  // field that's red because it was missing from the email clears the
  // moment the dispatcher types a value in, and the same flags apply
  // whether the form was opened via "New Import Permit" or a parsed email.
  const fieldStatus = (key) =>
    getFieldStatus(form[key], IMPORT_FIELD_SEVERITY[key]);
  const formGroupClass = (key) => {
    const status = fieldStatus(key);
    if (status === "missing-critical") return styles.formGroupCritical;
    if (status === "missing-tolerant") return styles.formGroupTolerant;
    return styles.formGroup;
  };
  const saveDisabled =
    saving || hasCriticalMissing(form, IMPORT_FIELD_SEVERITY);

  const VIEW_KEY = "importsViewMode";
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || "cards";
    } catch {
      return "cards";
    }
  });
  const switchView = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {}
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
    setForm({ ...INITIAL, weightUnit: "lb", ...fields });
    setEmailModalOpen(false);
    setError("");
    setModalOpen(true);
  };
  // ───────────────────────────────────────────────────────────────

  // ── CSV bulk import (dispatch/recovery log) ──────────────────────
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  // ───────────────────────────────────────────────────────────────

  // ── Print permit (react-to-print) ─────────────────────────────
  const printRef = useRef(null);
  const [printJob, setPrintJob] = useState(null); // { shipment, nonce }

  const triggerPrint = useReactToPrint({
    contentRef: printRef,
    pageStyle:
      "@page { size: auto; margin: 0mm !important; } @media print { body { margin: 0 !important; -webkit-print-color-adjust: exact; } }",
    documentTitle: printJob
      ? `CEVA-Permit-${printJob.shipment.awbDisplay || printJob.shipment.airwaybillNumber || "draft"}`
      : "CEVA-Permit",
  });

  const requestPrint = (s) => {
    setPrintJob({ shipment: s, nonce: Date.now() });
    // Stamp when this permit was (re)generated so the "Generated" date
    // filter (Today / This Week / Custom range) below has something to
    // filter on. Applied optimistically so the filter is accurate right
    // away; persisted in the background and non-fatal if it fails — the
    // print itself should never be blocked on this.
    const generatedAt = new Date().toISOString();
    setShipments((prev) =>
      prev.map((row) =>
        row.id === s.id ? { ...row, permitGeneratedAt: generatedAt } : row,
      ),
    );
    updateShipment(s.id, { permitGeneratedAt: generatedAt }).catch(() => {});
  };

  // The print target (below, in the JSX) is now ALWAYS mounted off-screen,
  // so printRef.current is never null — no more racing a setTimeout against
  // React's commit.
  useEffect(() => {
    if (!printJob) return;
    triggerPrint();
  }, [printJob, triggerPrint]);
  // ───────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const [s, a, w] = await Promise.all([
        getShipments({ type: "Import" }),
        getAirlines(),
        getWarehouses(),
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

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...INITIAL, weightUnit: "lb" });
    setSelectedAirline(null);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    const airline = airlines.find((a) => a.id === s.airline?.id);
    setSelectedAirline(airline || null);
    setForm({
      ...s,
      airwaybillNumber: s.airwaybillNumber || "",
      ordNumber: s.ordNumber || "",
      originCity: s.originCity || "",
      flightNumber: s.flightNumber || "",
      airline: s.airline?.id || "",
      warehouse: s.warehouse?.id || "",
      weightUnit: s.weightUnit || "lb",
      flightEta: s.flightEta || "",
      lastFreeDay: s.lastFreeDay ? s.lastFreeDay.split("T")[0] : "",
      pickupReadyAt: s.pickupReadyAt || "",
      deliveryAppointmentAt: s.deliveryAppointmentAt || "",
      storageFeePaid: s.storageFeePaid || false,
      terminalFeePaid: s.terminalFeePaid || false,
      isGDP: s.isGDP || false,
      gdpTemperatureRange: s.gdpTemperatureRange || "",
      isHazmat: s.isHazmat || false,
      hazmatClass: s.hazmatClass || "",
      pmcCount: s.pmcCount || "",
    });
    setError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setSelectedAirline(null);
    setError("");
  };

  const handleAirlineChange = (e) => {
    const airlineId = e.target.value;
    const airline = airlines.find((a) => a.id === airlineId);
    setSelectedAirline(airline || null);
    setForm((f) => ({
      ...f,
      airline: airlineId,
      airwaybillNumber: airline?.awbPrefix ? airline.awbPrefix : "",
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { airline, warehouse, ...rest } = form;
      const payload = {
        ...rest,
        type: "Import",
        airlineId: airline || null,
        warehouseId: warehouse || null,
        airwaybillNumber: form.airwaybillNumber.trim(),
        ordNumber: form.ordNumber.trim(),
        originCity: (form.originCity || "").trim(),
        flightNumber: (form.flightNumber || "").trim(),
        pieces: Number(form.pieces),
        weight: Number(form.weight),
        weightUnit: form.weightUnit || "lb",
        flightEta: form.flightEta || null,
        storageFeePerDay: Number(form.storageFeePerDay) || 0,
        terminalFee: Number(form.terminalFee) || 0,
        pmcCount: Number(form.pmcCount) || 0,
        isGDP: form.isGDP || false,
      };
      const missingMsg = describeMissingCritical(form, IMPORT_FIELD_SEVERITY);
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
    const term = search.toLowerCase().replace(/[\s-]/g, "");
    const rawAwb = s.airwaybillNumber?.toLowerCase().replace(/[\s-]/g, "");
    const fullAwb = s.airline?.awbPrefix
      ? `${s.airline.awbPrefix}${s.airwaybillNumber || ""}`
          .toLowerCase()
          .replace(/[\s-]/g, "")
      : rawAwb;
    const matchSearch =
      !term ||
      rawAwb?.includes(term) ||
      fullAwb?.includes(term) ||
      s.ordNumber?.toLowerCase().includes(term) ||
      s.airline?.name?.toLowerCase().includes(term) ||
      s.airline?.code?.toLowerCase().includes(term);
    const matchAirline = filterAirline ? s.airline?.id === filterAirline : true;
    const matchWarehouse = filterWarehouse
      ? s.warehouse?.id === filterWarehouse
      : true;
    const matchStatus = filterStatus ? s.status === filterStatus : true;
    const matchGenerated = matchesGeneratedFilter(
      s.permitGeneratedAt,
      filterGenerated,
      generatedFrom,
      generatedTo,
    );
    return (
      matchSearch &&
      matchAirline &&
      matchWarehouse &&
      matchStatus &&
      matchGenerated
    );
  });

  const stats = useMemo(() => {
    // Storage-fee alerts only count open permits (not Completed/Cancelled)
    const overdue = shipments.filter(
      (s) =>
        storageDaysOver(s.lastFreeDay) > 0 &&
        s.status !== "Completed" &&
        s.status !== "Cancelled",
    );
    const gdp = shipments.filter((s) => s.isGDP);
    const hazmat = shipments.filter((s) => s.isHazmat);
    const completed = shipments.filter((s) => s.status === "Completed");
    return {
      total: shipments.length,
      pieces: shipments.reduce((sum, s) => sum + (Number(s.pieces) || 0), 0),
      weight: shipments.reduce((sum, s) => sum + (Number(s.weight) || 0), 0),
      overdue: overdue.length,
      gdp: gdp.length,
      hazmat: hazmat.length,
      completed: completed.length,
    };
  }, [shipments]);

  const groups = useMemo(() => {
    if (!groupByAirline)
      return [{ key: "all", name: null, code: null, items: filtered }];
    const byAirline = new Map();
    filtered.forEach((s) => {
      const key = s.airline?.id || "unassigned";
      if (!byAirline.has(key)) {
        byAirLineSet(key, s);
      }
      byAirline.get(key).items.push(s);
    });
    function byAirLineSet(key, s) {
      byAirline.set(key, {
        key,
        name: s.airline?.name || "No airline set",
        code: s.airline?.code || "—",
        items: [],
        color: airlineColor(key),
      });
    }
    return [...byAirline.values()].sort(
      (a, b) => b.items.length - a.items.length,
    );
  }, [filtered, groupByAirline]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>
            <FontAwesomeIcon
              icon={faPlaneArrival}
              className={styles.titleIcon}
            />
            Import Permits
          </h1>
          <p className={styles.pageSub}>
            {shipments.length} permit{shipments.length !== 1 ? "s" : ""} on file
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <LiveClock />
          <div
            className={tableStyles.viewToggle}
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              className={`${tableStyles.toggleBtn} ${viewMode === "cards" ? tableStyles.toggleBtnActive : ""}`}
              onClick={() => switchView("cards")}
              title="Card view"
              aria-pressed={viewMode === "cards"}
            >
              <FontAwesomeIcon icon={faThLarge} />{" "}
              <span className={tableStyles.toggleLabel}>Cards</span>
            </button>
            <button
              type="button"
              className={`${tableStyles.toggleBtn} ${viewMode === "table" ? tableStyles.toggleBtnActive : ""}`}
              onClick={() => switchView("table")}
              title="Table view"
              aria-pressed={viewMode === "table"}
            >
              <FontAwesomeIcon icon={faTable} />{" "}
              <span className={tableStyles.toggleLabel}>Table</span>
            </button>
          </div>
          <button
            className={styles.cancelBtn}
            onClick={openEmailPaste}
            id="paste-email-import-btn"
          >
            <FontAwesomeIcon icon={faEnvelopeOpenText} /> Paste Email
          </button>
          <button
            className={styles.cancelBtn}
            onClick={() => setCsvModalOpen(true)}
            id="import-csv-btn"
          >
            <FontAwesomeIcon icon={faFileCsv} /> Import CSV
          </button>
          <button
            className={styles.addBtn}
            onClick={openAdd}
            id="add-import-btn"
          >
            <FontAwesomeIcon icon={faPlus} /> New Permit
          </button>
        </div>
      </div>

      <div className={styles.statBar}>
        <div className={`${styles.statCard} ${styles.statAccent}`}>
          <FontAwesomeIcon icon={faFileLines} />
          <div>
            <strong>{stats.total}</strong>
            <span>total permits</span>
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statPieces}`}>
          <FontAwesomeIcon icon={faBoxesStacked} />
          <div>
            <strong>{stats.pieces}</strong>
            <span>total pieces</span>
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statWeight}`}>
          <FontAwesomeIcon icon={faWeightHanging} />
          <div>
            <strong>{stats.weight.toLocaleString()}</strong>
            <span>total {shipments[0]?.weightUnit || "lbs"}</span>
          </div>
        </div>
        <div
          className={`${styles.statCard} ${stats.overdue ? styles.statDanger : styles.statGood}`}
        >
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <div>
            <strong>{stats.overdue}</strong>
            <span>storage fees active</span>
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statGdp}`}>
          <FontAwesomeIcon icon={faSnowflake} />
          <div>
            <strong>{stats.gdp}</strong>
            <span>GDP shipments</span>
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statHazmat}`}>
          <FontAwesomeIcon icon={faSkullCrossbones} />
          <div>
            <strong>{stats.hazmat}</strong>
            <span>hazmat shipments</span>
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statGood}`}>
          <FontAwesomeIcon icon={faCircleCheck} />
          <div>
            <strong>{stats.completed}</strong>
            <span>completed</span>
          </div>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className={styles.searchIcon}
          />
          <input
            className={styles.searchInput}
            placeholder="Search AWB, ORD, or airline…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="import-search"
          />
        </div>
        <select
          className={styles.filterSelect}
          value={filterAirline}
          onChange={(e) => setFilterAirline(e.target.value)}
          id="import-filter-airline"
        >
          <option value="">All Airlines</option>
          {airlines.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.code})
            </option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={filterWarehouse}
          onChange={(e) => setFilterWarehouse(e.target.value)}
          id="import-filter-warehouse"
        >
          <option value="">All Warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          id="import-filter-status"
        >
          <option value="">All Statuses</option>
          {["Pending", "Assigned", "In Transit", "Completed", "Cancelled"].map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ),
          )}
        </select>
        <select
          className={styles.filterSelect}
          value={filterGenerated}
          onChange={(e) => {
            const mode = e.target.value;
            setFilterGenerated(mode);
            if (mode !== "custom") {
              setGeneratedFrom("");
              setGeneratedTo("");
            }
          }}
          id="import-filter-generated"
          title="Filter by when the permit was generated"
        >
          <option value="">Generated: Any Time</option>
          <option value="today">Generated Today</option>
          <option value="week">Generated This Week</option>
          <option value="custom">Custom Range…</option>
        </select>
        {filterGenerated === "custom" && (
          <div className={styles.dateRangeRow}>
            <input
              type="date"
              className={styles.filterSelect}
              value={generatedFrom}
              onChange={(e) => setGeneratedFrom(e.target.value)}
              aria-label="Generated from date"
            />
            <span className={styles.dateRangeSep}>–</span>
            <input
              type="date"
              className={styles.filterSelect}
              value={generatedTo}
              onChange={(e) => setGeneratedTo(e.target.value)}
              aria-label="Generated to date"
            />
          </div>
        )}
        <button
          type="button"
          className={`${styles.groupToggle} ${groupByAirline ? styles.groupToggleActive : ""}`}
          onClick={() => setGroupByAirline((g) => !g)}
          title="Group permits by airline"
        >
          <FontAwesomeIcon icon={groupByAirline ? faLayerGroup : faListUl} />
          {groupByAirline ? "Grouped by airline" : "Flat list"}
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading permits…</div>
      ) : viewMode === "table" ? (
        <div className={tableStyles.tableWrap}>
          <div className={tableStyles.tableScroll}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th className={tableStyles.thExpand} aria-hidden="true" />
                  <th>AWB / ORD</th>
                  <th>Airline</th>
                  <th>Warehouse</th>
                  <th>Cargo</th>
                  <th>Status</th>
                  <th>Last Free Day</th>
                  <th>Flags</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr className={tableStyles.emptyRow}>
                    <td colSpan={9}>No import permits match your filters.</td>
                  </tr>
                ) : (
                  filtered.map((s) => {
                    const daysOver = storageDaysOver(s.lastFreeDay);
                    // Only flag storage fees for open permits (not Completed/Cancelled)
                    const isOverdue =
                      daysOver > 0 &&
                      s.status !== "Completed" &&
                      s.status !== "Cancelled";
                    const remaining = daysUntil(s.lastFreeDay);
                    const color = airlineColor(s.airline?.id);
                    const awbDisplay =
                      s.airline?.awbPrefix && s.airwaybillNumber
                        ? `${s.airline.awbPrefix}-${s.airwaybillNumber}`
                        : s.airwaybillNumber;
                    const isOpen = expandedIds.has(s.id);
                    return (
                      <React.Fragment key={s.id}>
                        <tr
                          className={`${tableStyles.tr} ${isOverdue ? tableStyles.rowOverdue : ""} ${isOpen ? tableStyles.trOpen : ""}`}
                          onClick={() => toggleExpanded(s.id)}
                        >
                          <td className={tableStyles.tdExpand}>
                            <FontAwesomeIcon
                              icon={faChevronDown}
                              className={tableStyles.expandChevron}
                            />
                          </td>
                          <td>
                            <div className={tableStyles.awb}>
                              {awbDisplay || "—"}
                            </div>
                            <div className={tableStyles.subId}>
                              ORD {s.ordNumber || "—"}
                            </div>
                          </td>
                          <td>
                            <div className={tableStyles.airlineCell}>
                              <span
                                className={tableStyles.airlinePip}
                                style={{ backgroundColor: color }}
                              />
                              {s.airline?.name || "—"} ({s.airline?.code || "—"}
                              )
                            </div>
                          </td>
                          <td className={tableStyles.muted}>
                            {s.warehouse?.name || "—"}
                          </td>
                          <td className={tableStyles.cargo}>
                            <strong>{s.pieces}</strong> pcs · {s.weight}{" "}
                            {s.weightUnit}
                            {s.pmcCount > 0 && (
                              <span className={tableStyles.muted}>
                                {" "}
                                · {s.pmcCount} PMC
                              </span>
                            )}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <StatusBadge status={s.status} />
                          </td>
                          <td>
                            {s.lastFreeDay ? (
                              isOverdue ? (
                                <span className={tableStyles.danger}>
                                  +{daysOver}d over
                                </span>
                              ) : remaining !== null &&
                                remaining <= 1 &&
                                remaining >= 0 ? (
                                <span className={tableStyles.warn}>
                                  {remaining === 0
                                    ? "Due today"
                                    : `${remaining}d left`}
                                </span>
                              ) : (
                                <span className={tableStyles.muted}>
                                  {formatDate(s.lastFreeDay)}
                                </span>
                              )
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 4,
                              }}
                            >
                              {s.isGDP && (
                                <span
                                  className={`${tableStyles.badge} ${tableStyles.badgeGdp}`}
                                >
                                  <FontAwesomeIcon icon={faSnowflake} /> GDP
                                </span>
                              )}
                              {s.isHazmat && (
                                <span
                                  className={`${tableStyles.badge} ${tableStyles.badgeHazmat}`}
                                >
                                  <FontAwesomeIcon icon={faSkullCrossbones} />{" "}
                                  HAZMAT
                                </span>
                              )}
                              {isOverdue && !s.storageFeePaid && (
                                <span
                                  className={`${tableStyles.badge} ${tableStyles.badgeFee}`}
                                >
                                  Storage
                                </span>
                              )}
                              {s.storageFeePaid && (
                                <span
                                  className={`${tableStyles.badge} ${tableStyles.badgeOk}`}
                                >
                                  Paid
                                </span>
                              )}
                            </div>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className={tableStyles.actions}>
                              <button
                                className={`${tableStyles.actionBtn} ${tableStyles.printBtn}`}
                                onClick={() => requestPrint(s)}
                                title="Print permit"
                              >
                                <FontAwesomeIcon icon={faPrint} />
                              </button>
                              <button
                                className={`${tableStyles.actionBtn} ${tableStyles.editBtn}`}
                                onClick={() => openEdit(s)}
                                title="Edit"
                              >
                                <FontAwesomeIcon icon={faPencil} />
                              </button>
                              <button
                                className={`${tableStyles.actionBtn} ${tableStyles.deleteBtn}`}
                                onClick={() => setDeleteId(s.id)}
                                title="Delete"
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        <tr className={tableStyles.trExpandRow}>
                          <td
                            colSpan={9}
                            className={tableStyles.tdExpandContent}
                          >
                            <div
                              className={`${tableStyles.expandPanel} ${isOpen ? tableStyles.expandPanelOpen : ""}`}
                            >
                              <div className={tableStyles.expandPanelInner}>
                                <div className={tableStyles.expandGrid}>
                                  {s.flightEta && (
                                    <div className={tableStyles.expandItem}>
                                      <span className={tableStyles.expandLabel}>
                                        Flight ETA
                                      </span>
                                      <span className={tableStyles.expandValue}>
                                        {formatDateTime(s.flightEta)}
                                      </span>
                                    </div>
                                  )}
                                  {s.permitGeneratedAt && (
                                    <div className={tableStyles.expandItem}>
                                      <span className={tableStyles.expandLabel}>
                                        Permit Generated
                                      </span>
                                      <span className={tableStyles.expandValue}>
                                        {formatDateTime(s.permitGeneratedAt)}
                                      </span>
                                    </div>
                                  )}
                                  {s.lastFreeDay && (
                                    <div className={tableStyles.expandItem}>
                                      <span className={tableStyles.expandLabel}>
                                        Last Free Day
                                      </span>
                                      <span className={tableStyles.expandValue}>
                                        {formatDate(s.lastFreeDay)}
                                      </span>
                                    </div>
                                  )}
                                  {(s.storageFeePerDay > 0 ||
                                    s.terminalFee > 0) && (
                                    <div className={tableStyles.expandItem}>
                                      <span className={tableStyles.expandLabel}>
                                        Fees
                                      </span>
                                      <span className={tableStyles.expandValue}>
                                        {s.terminalFee > 0 && (
                                          <>
                                            Terminal ${s.terminalFee}
                                            {s.terminalFeePaid
                                              ? " ✓"
                                              : " ⚠"}{" "}
                                          </>
                                        )}
                                        {s.storageFeePerDay > 0 && (
                                          <>
                                            Storage ${s.storageFeePerDay}/day
                                            {s.storageFeePaid ? " ✓" : " ⚠"}
                                          </>
                                        )}
                                      </span>
                                    </div>
                                  )}
                                  {s.isGDP && (
                                    <div className={tableStyles.expandItem}>
                                      <span className={tableStyles.expandLabel}>
                                        GDP
                                      </span>
                                      <span className={tableStyles.expandValue}>
                                        {s.gdpTemperatureRange ||
                                          "Temperature controlled"}
                                      </span>
                                    </div>
                                  )}
                                  {s.isHazmat && (
                                    <div className={tableStyles.expandItem}>
                                      <span className={tableStyles.expandLabel}>
                                        Hazmat
                                      </span>
                                      <span className={tableStyles.expandValue}>
                                        {s.hazmatClass || "Dangerous goods"}
                                      </span>
                                    </div>
                                  )}
                                  {s.pickupReadyAt && (
                                    <div className={tableStyles.expandItem}>
                                      <span className={tableStyles.expandLabel}>
                                        Cargo Available
                                      </span>
                                      <span className={tableStyles.expandValue}>
                                        {formatDateTime(s.pickupReadyAt)}
                                      </span>
                                    </div>
                                  )}
                                  {s.deliveryAppointmentAt && (
                                    <div className={tableStyles.expandItem}>
                                      <span className={tableStyles.expandLabel}>
                                        Warehouse Appt
                                      </span>
                                      <span className={tableStyles.expandValue}>
                                        {formatDateTime(
                                          s.deliveryAppointmentAt,
                                        )}
                                      </span>
                                    </div>
                                  )}
                                  {s.pmcCount > 0 && (
                                    <div className={tableStyles.expandItem}>
                                      <span className={tableStyles.expandLabel}>
                                        PMCs
                                      </span>
                                      <span className={tableStyles.expandValue}>
                                        {s.pmcCount}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {s.notes ? (
                                  <p className={tableStyles.expandNotes}>
                                    {s.notes}
                                  </p>
                                ) : (
                                  <p className={tableStyles.expandNotes}>
                                    No notes on file.
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          No import permits match your filters.
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className={styles.airlineGroup}>
            {groupByAirline && (
              <div
                className={styles.groupHeading}
                style={{ "--airline-color": group.color }}
              >
                <span className={styles.groupDot} />
                <h2>{group.name}</h2>
                <span className={styles.groupCode}>{group.code}</span>
                <span className={styles.groupCount}>
                  {group.items.length} permit
                  {group.items.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            <div className={styles.grid}>
              {group.items.map((s) => {
                const daysOver = storageDaysOver(s.lastFreeDay);
                // Only flag storage fees for open permits (not Completed/Cancelled)
                const isOverdue =
                  daysOver > 0 &&
                  s.status !== "Completed" &&
                  s.status !== "Cancelled";
                const remaining = daysUntil(s.lastFreeDay);
                const color = airlineColor(s.airline?.id);
                const awbDisplay =
                  s.airline?.awbPrefix && s.airwaybillNumber
                    ? `${s.airline.awbPrefix}-${s.airwaybillNumber}`
                    : s.airwaybillNumber;
                return (
                  <div
                    key={s.id}
                    className={`${styles.card} ${isOverdue ? styles.overdueCard : ""}`}
                    style={{ "--airline-color": color }}
                  >
                    {isOverdue && (
                      <div className={styles.overdueAlert}>
                        <FontAwesomeIcon icon={faTriangleExclamation} />
                        Storage Fee Active – {daysOver} day
                        {daysOver !== 1 ? "s" : ""} over!
                        {s.storageFeePerDay > 0 &&
                          ` ($${s.storageFeePerDay}/day)`}
                        {s.storageFeePaid && (
                          <span className={styles.paidBadge}>✓ PAID</span>
                        )}
                      </div>
                    )}
                    <div className={styles.cardHeader}>
                      <div className={styles.awbBlock}>
                        <div className={styles.awbLabel}>AWB</div>
                        <div className={styles.awbNum}>{awbDisplay || "—"}</div>
                      </div>
                      <div className={styles.cardActions}>
                        <button
                          className={styles.printBtn}
                          onClick={() => requestPrint(s)}
                          title="Print permit"
                        >
                          <FontAwesomeIcon icon={faPrint} />
                        </button>
                        <button
                          className={styles.editBtn}
                          onClick={() => openEdit(s)}
                          title="Edit"
                        >
                          <FontAwesomeIcon icon={faPencil} />
                        </button>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => setDeleteId(s.id)}
                          title="Delete"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </div>
                    <div className={styles.cardBody}>
                      <div className={styles.row}>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}>ORD</span>
                          <span className={styles.fieldValue}>
                            {s.ordNumber || "—"}
                          </span>
                        </div>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}>Status</span>
                          <StatusBadge status={s.status} />
                        </div>
                      </div>
                      {(s.originCity || s.flightNumber || s.flightEta) && (
                        <div className={styles.row}>
                          <div className={styles.field}>
                            <span className={styles.fieldLabel}>Origin</span>
                            <span className={styles.fieldValue}>
                              {s.originCity || "—"}
                            </span>
                          </div>
                          <div className={styles.field}>
                            <span className={styles.fieldLabel}>Flight</span>
                            <span className={styles.fieldValue}>
                              {s.flightNumber || "—"}
                            </span>
                          </div>
                          {s.flightEta && (
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>
                                Flight ETA
                              </span>
                              <span className={styles.fieldValue}>
                                {new Date(s.flightEta).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className={styles.row}>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}>Airline</span>
                          <span className={styles.fieldValue}>
                            <span
                              className={styles.airlinePip}
                              style={{ backgroundColor: color }}
                            />
                            {s.airline?.name || "—"} ({s.airline?.code})
                          </span>
                        </div>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}>
                            <FontAwesomeIcon icon={faWarehouse} /> Warehouse
                          </span>
                          <span className={styles.fieldValue}>
                            {s.warehouse?.name || "—"}
                          </span>
                        </div>
                      </div>
                      <div className={styles.row}>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}>
                            <FontAwesomeIcon icon={faBoxesStacked} /> Pieces
                          </span>
                          <span className={styles.fieldValueBig}>
                            {s.pieces}
                          </span>
                        </div>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}>
                            <FontAwesomeIcon icon={faWeightHanging} /> Weight
                          </span>
                          <span className={styles.fieldValueBig}>
                            {s.weight} {s.weightUnit}
                          </span>
                        </div>
                      </div>
                      {s.pmcCount > 0 && (
                        <div className={styles.row}>
                          <div className={styles.field}>
                            <span className={styles.fieldLabel}>
                              <FontAwesomeIcon icon={faPallet} /> PMCs
                            </span>
                            <span className={styles.fieldValue}>
                              {s.pmcCount}
                            </span>
                          </div>
                        </div>
                      )}
                      {s.isGDP && (
                        <div className={styles.gdpBadge}>
                          <FontAwesomeIcon icon={faSnowflake} />
                          GDP:{" "}
                          {s.gdpTemperatureRange || "Temperature Controlled"}
                        </div>
                      )}
                      {s.isHazmat && (
                        <div className={styles.hazmatBadge}>
                          <FontAwesomeIcon icon={faSkullCrossbones} />
                          HAZMAT{s.hazmatClass ? `: ${s.hazmatClass}` : ""}
                        </div>
                      )}
                      {s.lastFreeDay && (
                        <div
                          className={`${styles.lfdRow} ${isOverdue ? styles.lfdOverdue : remaining !== null && remaining <= 1 && remaining >= 0 ? styles.lfdWarn : ""}`}
                        >
                          <span>
                            <FontAwesomeIcon icon={faClock} /> Last Free Day:{" "}
                            <strong>{formatDate(s.lastFreeDay)}</strong>
                          </span>
                          {isOverdue ? (
                            <span className={styles.feeBadge}>
                              +{daysOver}d @ ${s.storageFeePerDay || "?"}/day
                            </span>
                          ) : (
                            remaining !== null &&
                            remaining >= 0 && (
                              <span className={styles.dueSoonBadge}>
                                {remaining === 0
                                  ? "Due today"
                                  : `${remaining}d left`}
                              </span>
                            )
                          )}
                        </div>
                      )}
                      {(s.terminalFee > 0 || s.storageFeePerDay > 0) && (
                        <div className={styles.feeRow}>
                          {s.terminalFee > 0 && (
                            <span
                              className={
                                s.terminalFeePaid
                                  ? styles.paidFee
                                  : styles.unpaidFee
                              }
                            >
                              <FontAwesomeIcon icon={faMoneyBillWave} />{" "}
                              Terminal: ${s.terminalFee}
                              {s.terminalFeePaid ? " ✓" : " ⚠"}
                            </span>
                          )}
                          {s.storageFeePerDay > 0 && (
                            <span
                              className={
                                s.storageFeePaid
                                  ? styles.paidFee
                                  : styles.unpaidFee
                              }
                            >
                              Storage: ${s.storageFeePerDay}/day
                              {s.storageFeePaid ? " ✓" : " ⚠"}
                            </span>
                          )}
                        </div>
                      )}
                      {(s.pickupReadyAt || s.deliveryAppointmentAt) && (
                        <div className={styles.lfdRow}>
                          <FontAwesomeIcon icon={faCalendarCheck} />
                          <span>
                            {s.pickupReadyAt && (
                              <>
                                Cargo available:{" "}
                                <strong>
                                  {formatDateTime(s.pickupReadyAt)}
                                </strong>
                              </>
                            )}
                            {s.pickupReadyAt &&
                              s.deliveryAppointmentAt &&
                              " · "}
                            {s.deliveryAppointmentAt && (
                              <>
                                Warehouse appt:{" "}
                                <strong>
                                  {formatDateTime(s.deliveryAppointmentAt)}
                                </strong>
                              </>
                            )}
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

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? "Edit Import Permit" : "New Import Permit"}
        size="lg"
      >
        <form onSubmit={handleSubmit} id="import-form" className={styles.form}>
          {error && <div className={styles.formError}>{error}</div>}
          <div className={styles.formSectionLabel}>Permit Identifiers</div>
          <div className={styles.formGrid}>
            <div className={formGroupClass("airline")}>
              <label className={styles.label}>Airline *</label>
              <select
                className={styles.input}
                required
                value={form.airline}
                onChange={handleAirlineChange}
              >
                <option value="">Select Airline…</option>
                {airlines.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.code}) · AWB: {a.awbPrefix || "No prefix"}
                  </option>
                ))}
              </select>
              {selectedAirline && (
                <small className={styles.hint}>
                  AWB prefix: {selectedAirline.awbPrefix || "None"}
                </small>
              )}
            </div>
            <div className={formGroupClass("airwaybillNumber")}>
              <label className={styles.label}>AWB Number *</label>
              <input
                className={styles.input}
                required
                value={form.airwaybillNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, airwaybillNumber: e.target.value }))
                }
                placeholder={
                  selectedAirline?.awbPrefix
                    ? `${selectedAirline.awbPrefix}-12345678`
                    : "898-12345678"
                }
              />
              <small className={styles.hint}>
                Include prefix if not auto-filled
              </small>
            </div>
            <div className={formGroupClass("ordNumber")}>
              <label className={styles.label}>ORD Number *</label>
              <input
                className={styles.input}
                required
                value={form.ordNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ordNumber: e.target.value }))
                }
                placeholder="CVA2116055"
              />
            </div>
            <div className={formGroupClass("originCity")}>
              <label className={styles.label}>Origin</label>
              <input
                className={styles.input}
                value={form.originCity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, originCity: e.target.value }))
                }
                placeholder="Heathrow Apt/London"
              />
            </div>
            <div className={formGroupClass("flightNumber")}>
              <label className={styles.label}>Flight Number</label>
              <input
                className={styles.input}
                value={form.flightNumber}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    flightNumber: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="AA91/08"
              />
            </div>
            <div className={formGroupClass("flightEta")}>
              <label className={styles.label}>Flight ETA</label>
              <DateTimePicker
                value={form.flightEta || ""}
                onChange={(date) =>
                  setForm((f) => ({
                    ...f,
                    flightEta: date ? toLocalISO(date) : "",
                  }))
                }
              />
            </div>
          </div>
          <div className={styles.formSectionLabel}>Destination & Cargo</div>
          <div className={styles.formGrid}>
            <div className={formGroupClass("warehouse")}>
              <label className={styles.label}>Destination Warehouse *</label>
              <select
                className={styles.input}
                required
                value={form.warehouse}
                onChange={(e) =>
                  setForm((f) => ({ ...f, warehouse: e.target.value }))
                }
              >
                <option value="">Select Warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={formGroupClass("pieces")}>
              <label className={styles.label}>Pieces *</label>
              <input
                className={styles.input}
                type="number"
                min={1}
                required
                value={form.pieces}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pieces: e.target.value }))
                }
                placeholder="0"
              />
            </div>
            <div className={formGroupClass("weight")}>
              <label className={styles.label}>Weight *</label>
              <div className={styles.weightInput}>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="any"
                  required
                  value={form.weight}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, weight: e.target.value }))
                  }
                  placeholder="0.0"
                />
                <select
                  className={styles.weightUnitSelect}
                  value={form.weightUnit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, weightUnit: e.target.value }))
                  }
                >
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>PMC Count</label>
              <input
                className={styles.input}
                type="number"
                min={0}
                value={form.pmcCount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pmcCount: e.target.value }))
                }
                placeholder="0"
              />
            </div>
          </div>
          <div className={styles.formSectionLabel}>Timing & Fees</div>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Last Free Day</label>
              <DateTimePicker
                value={form.lastFreeDay || ""}
                onChange={(date) =>
                  setForm((f) => ({
                    ...f,
                    lastFreeDay: date
                      ? toLocalISO(date, { dateOnly: true })
                      : "",
                  }))
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Storage Fee ($/day)</label>
              <input
                className={styles.input}
                type="number"
                min={0}
                step="0.01"
                value={form.storageFeePerDay}
                onChange={(e) =>
                  setForm((f) => ({ ...f, storageFeePerDay: e.target.value }))
                }
                placeholder="0.00"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Terminal Fee ($)</label>
              <input
                className={styles.input}
                type="number"
                min={0}
                step="0.01"
                value={form.terminalFee}
                onChange={(e) =>
                  setForm((f) => ({ ...f, terminalFee: e.target.value }))
                }
                placeholder="0.00"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Airline Cargo Available</label>
              <DateTimePicker
                value={form.pickupReadyAt || ""}
                onChange={(date) =>
                  setForm((f) => ({
                    ...f,
                    pickupReadyAt: date ? toLocalISO(date) : "",
                  }))
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Warehouse Delivery Appointment
              </label>
              <DateTimePicker
                value={form.deliveryAppointmentAt || ""}
                onChange={(date) =>
                  setForm((f) => ({
                    ...f,
                    deliveryAppointmentAt: date ? toLocalISO(date) : "",
                  }))
                }
              />
            </div>
          </div>
          <div className={styles.formSectionLabel}>
            Special Handling & Status
          </div>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.isGDP}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isGDP: e.target.checked }))
                  }
                />
                GDP (Temperature Controlled)
              </label>
              {form.isGDP && (
                <input
                  className={styles.input}
                  placeholder="Temperature range (e.g., 2-8°C)"
                  value={form.gdpTemperatureRange}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      gdpTemperatureRange: e.target.value,
                    }))
                  }
                />
              )}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.isHazmat}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isHazmat: e.target.checked }))
                  }
                />
                Hazmat (Dangerous Goods)
              </label>
              {form.isHazmat && (
                <input
                  className={styles.input}
                  placeholder="Hazmat class (e.g., Class 9, UN3480)"
                  value={form.hazmatClass}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hazmatClass: e.target.value }))
                  }
                />
              )}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.storageFeePaid}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, storageFeePaid: e.target.checked }))
                  }
                />
                Storage Fee Paid
              </label>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.terminalFeePaid}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      terminalFeePaid: e.target.checked,
                    }))
                  }
                />
                Terminal Fee Paid
              </label>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Status</label>
              <select
                className={styles.input}
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                {[
                  "Pending",
                  "Assigned",
                  "In Transit",
                  "Completed",
                  "Cancelled",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.formSectionLabel}>Notes</div>
          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <input
                className={styles.input}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Additional notes..."
              />
            </div>
          </div>
          {saveDisabled && !saving && (
            <div
              className={styles.hint}
              style={{ color: "var(--danger)", marginBottom: 8 }}
            >
              {describeMissingCritical(form, IMPORT_FIELD_SEVERITY) ||
                "Fill in the required fields above to save."}
            </div>
          )}
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={closeModal}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={saveDisabled}
              id="im-save-btn"
            >
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Permit"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Permit"
        size="sm"
      >
        <p className={styles.confirmText}>Delete this import permit?</p>
        <div className={styles.formActions}>
          <button
            className={styles.cancelBtn}
            onClick={() => setDeleteId(null)}
          >
            Cancel
          </button>
          <button
            className={styles.deleteConfirmBtn}
            onClick={handleDelete}
            id="im-delete-confirm"
          >
            Delete
          </button>
        </div>
      </Modal>

      <EmailPasteModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        type="Import"
        airlines={airlines}
        warehouses={warehouses}
        formStyles={styles}
        onUseDetails={handleEmailFields}
      />

      <CsvImportModal
        isOpen={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        airlines={airlines}
        warehouses={warehouses}
        formStyles={styles}
        onImported={load}
      />

      {/* ── Hidden print-only render of the CEVA permit ──
          Always mounted (not conditional on printJob) so printRef.current
          is never null when triggerPrint() fires. */}
      <div
        style={{
          position: "absolute",
          top: "-10000px",
          left: "-10000px",
          // No fixed width/height/overflow here — the wrapper must not
          // clip or zero-out .page's own layout (8.5in x 11in). It just
          // needs to sit off-screen so it never overlaps app UI on screen.
        }}
        aria-hidden="true"
      >
        <div ref={printRef}>
          <CevaTemplate
            shipment={printJob?.shipment}
            airline={
              // Prefer full airline (includes terminalAddress) over the
              // partial relation embedded on the shipment.
              airlines.find((a) => a.id === printJob?.shipment?.airline?.id) ||
              printJob?.shipment?.airline
            }
            warehouse={
              // Prefer the full warehouse record (has address fields) over
              // the partial relation embedded on the shipment (often just id/name).
              warehouses.find(
                (w) => w.id === printJob?.shipment?.warehouse?.id,
              ) || printJob?.shipment?.warehouse
            }
          />
        </div>
      </div>
    </div>
  );
}
