import React, { useState, useEffect, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faPencil,
  faTrash,
  faTruck,
  faTruckFront,
  faTruckMoving,
  faVanShuttle,
  faTrailer,
  faSnowflake,
  faLink,
  faLinkSlash,
  faTriangleExclamation,
  faCalendarDays,
  faIdCard,
  faWeightHanging,
  faBoxOpen,
  faClipboardCheck,
  faUser,
  faClock,
  faKey,
  faShieldHalved,
  faFileContract,
  faHandshake,
  faTable,
  faThLarge,
  faChevronDown,
  faSearch,
  faXmark,
  faCube,
  faCircleCheck,
  faBan,
  faEye,
  faCamera,
  faFileImage,
} from "@fortawesome/free-solid-svg-icons";
import {
  getEquipment,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getDrivers,
  assignEquipment,
  uploadEquipmentPhoto,
  updateEquipmentStatus,
  resolveUploadUrl,
} from "../../api/api.js";
import { canWrite, canOperate } from "../../permissions.js";
import Modal from "../../components/Modal/Modal.jsx";
import DateTimePicker, { toLocalISO } from "../../styles/Datetimepicker.jsx";
import EquipmentDetailView from "./EquipmentDetailView.jsx";
import styles from "./EquipmentView.module.css";
import tableStyles from "./EquipmentView.table.module.css";

const TYPE_GROUPS = {
  "Power Unit": ["Tractor", "Straight Truck", "Cube Truck", "Sprinter Van"],
  Trailer: [
    "Dry Van",
    "Reefer",
    "Open Deck",
    "Flat Bed",
    "Low Boy",
    "Roller Bed",
  ],
};
const isTrailerType = (type) => TYPE_GROUPS.Trailer.includes(type);
const pullsTrailer = (type) => type === "Tractor";

const TYPE_ICONS = {
  Tractor: faTruckFront,
  "Straight Truck": faTruck,
  "Cube Truck": faCube,
  "Sprinter Van": faVanShuttle,
  "Dry Van": faTrailer,
  Reefer: faTrailer,
  "Open Deck": faTrailer,
  "Flat Bed": faTrailer,
  "Low Boy": faTrailer,
  "Roller Bed": faTrailer,
};

const TYPE_SHORT = {
  Tractor: "TR",
  "Straight Truck": "ST",
  "Cube Truck": "CB",
  "Sprinter Van": "SV",
  "Dry Van": "DV",
  Reefer: "RF",
  "Open Deck": "OD",
  "Flat Bed": "FB",
  "Low Boy": "LB",
  "Roller Bed": "RB",
};

/** Drivers who should not still hold equipment */
const STUCK_DRIVER_STATUSES = new Set([
  "Off Duty",
  "Terminated",
  "Absent",
  "Vacation",
  "Sick Leave",
]);

const INITIAL_FORM = {
  unitNumber: "",
  equipmentType: "Tractor",
  modelDetails: "",
  licensePlate: "",
  vin: "",
  year: "",
  capacityLbs: "",
  palletPositions: "",
  status: "In Service",
  outOfServiceReason: "",
  registrationExpiration: "",
  nextMaintenanceDue: "",
  notes: "",
  insuranceProvider: "",
  insurancePolicyNumber: "",
  insuranceExpiration: "",
  iftaIrpExpiration: "",
  ownershipType: "Owned",
  leaseCompany: "",
  leaseEndDate: "",
  monthlyPaymentAmount: "",
};
const VIEW_KEY = "equipmentViewMode";

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}
function expiryClass(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return "";
  if (days < 0) return styles.expired;
  if (days <= 30) return styles.expiringSoon;
  return "";
}
function expiryLabel(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Due today";
  return `Due in ${days}d`;
}
function toDateInput(value) {
  return value ? String(value).slice(0, 10) : "";
}
function minutesUntil(value) {
  if (!value) return null;
  return Math.round((new Date(value).getTime() - Date.now()) / 60000);
}

/** Single source of truth for card/row availability (matches Handoff / Dispatch rules) */
function getAvailabilityKey(item, now) {
  if (item.status === "Out of Service") return "out_of_service";
  if (item.assignedDriverId) return "in_use";
  if (item.availableAt && new Date(item.availableAt).getTime() > now)
    return "cooling";
  if (item.status === "In Service") return "available";
  return "out_of_service";
}

export default function EquipmentView({ user }) {
  // Full access (SUPER_ADMIN/DIRECTOR/FLEET_MANAGER): create, edit specs,
  // delete, manage photos. Operational access (DISPATCHER): can see units and
  // run the Handoff Board (assign/release, force-release, out-of-service
  // toggle) but cannot create/edit/delete a unit or touch its photos. Those
  // routes are enforced server-side too — this just keeps the affordances
  // that would 403 off the screen.
  const canEditEquipment = canWrite(user?.role, "equipment");
  const canOperateEquipment = canOperate(user?.role, "equipment");

  const [equipment, setEquipment] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const [releasingId, setReleasingId] = useState(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [photoFiles, setPhotoFiles] = useState([]); // File[] pending upload on save
  const [photoPreviews, setPhotoPreviews] = useState([]); // object URLs + existing
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
    } catch {
      /* ignore */
    }
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
      const [eqData, driverData] = await Promise.all([
        getEquipment(),
        getDrivers().catch(() => []),
      ]);
      setEquipment(eqData);
      setDrivers(driverData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (tick > 0 && tick % 2 === 0) load();
  }, [tick, load]);

  const openAdd = () => {
    setEditing(null);
    setForm(INITIAL_FORM);
    setPhotoFiles([]);
    setPhotoPreviews([]);
    setError("");
    setModalOpen(true);
  };
  const openEdit = (item) => {
    setEditing(item);
    setForm({
      ...INITIAL_FORM,
      ...item,
      year: item.year ?? "",
      capacityLbs: item.capacityLbs ?? "",
      palletPositions: item.palletPositions ?? "",
      registrationExpiration: toDateInput(item.registrationExpiration),
      nextMaintenanceDue: toDateInput(item.nextMaintenanceDue),
      insuranceExpiration: toDateInput(item.insuranceExpiration),
      iftaIrpExpiration: toDateInput(item.iftaIrpExpiration),
      leaseEndDate: toDateInput(item.leaseEndDate),
      monthlyPaymentAmount: item.monthlyPaymentAmount ?? "",
    });
    setPhotoFiles([]);
    setPhotoPreviews(
      (item.images || []).map((path) => ({
        src: resolveUploadUrl(path),
        path,
        existing: true,
      })),
    );
    setError("");
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setError("");
    setPhotoFiles([]);
    setPhotoPreviews([]);
  };

  const handlePhotoPick = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPhotoFiles((prev) => [...prev, ...files]);
    setPhotoPreviews((prev) => [
      ...prev,
      ...files.map((f) => ({
        src: URL.createObjectURL(f),
        path: null,
        existing: false,
        file: f,
      })),
    ]);
    e.target.value = "";
  };

  const removePreview = (index) => {
    setPhotoPreviews((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      if (removed && !removed.existing && removed.src?.startsWith("blob:")) {
        try { URL.revokeObjectURL(removed.src); } catch {}
      }
      return next;
    });
    // Drop matching pending File if it was a new pick (order: existing first, then new)
    setPhotoFiles((prev) => {
      const preview = photoPreviews[index];
      if (!preview || preview.existing) return prev;
      const idx = prev.findIndex((f) => f === preview.file);
      if (idx < 0) return prev;
      const copy = [...prev];
      copy.splice(idx, 1);
      return copy;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const trailer = isTrailerType(form.equipmentType);
      const payload = {
        unitNumber: form.unitNumber.trim(),
        equipmentType: form.equipmentType,
        category: trailer ? "Trailer" : "Power Unit",
        modelDetails: form.modelDetails || "",
        licensePlate: form.licensePlate || "",
        vin: form.vin || "",
        status: form.status,
        notes: form.notes || "",
      };
      if (form.year && !isNaN(form.year) && form.year !== "")
        payload.year = Number(form.year);
      if (trailer) {
        if (
          form.capacityLbs &&
          !isNaN(form.capacityLbs) &&
          form.capacityLbs !== ""
        ) {
          payload.capacityLbs = Number(form.capacityLbs);
        }
        if (
          form.palletPositions &&
          !isNaN(form.palletPositions) &&
          form.palletPositions !== ""
        ) {
          payload.palletPositions = Number(form.palletPositions);
        }
      }
      if (form.status === "Out of Service" && form.outOfServiceReason) {
        payload.outOfServiceReason = form.outOfServiceReason;
      }
      if (form.registrationExpiration) {
        payload.registrationExpiration = new Date(
          form.registrationExpiration,
        ).toISOString();
      }
      if (form.nextMaintenanceDue) {
        payload.nextMaintenanceDue = new Date(
          form.nextMaintenanceDue,
        ).toISOString();
      }
      payload.insuranceProvider = form.insuranceProvider || "";
      payload.insurancePolicyNumber = form.insurancePolicyNumber || "";
      if (form.insuranceExpiration) {
        payload.insuranceExpiration = new Date(
          form.insuranceExpiration,
        ).toISOString();
      }
      if (form.iftaIrpExpiration) {
        payload.iftaIrpExpiration = new Date(
          form.iftaIrpExpiration,
        ).toISOString();
      }
      payload.ownershipType = form.ownershipType;
      if (form.ownershipType !== "Owned") {
        payload.leaseCompany = form.leaseCompany || "";
        if (form.leaseEndDate)
          payload.leaseEndDate = new Date(form.leaseEndDate).toISOString();
        if (
          form.monthlyPaymentAmount &&
          !isNaN(form.monthlyPaymentAmount) &&
          form.monthlyPaymentAmount !== ""
        ) {
          payload.monthlyPaymentAmount = Number(form.monthlyPaymentAmount);
        }
      } else {
        payload.leaseCompany = "";
        payload.leaseEndDate = null;
        payload.monthlyPaymentAmount = null;
      }
      let saved;
      if (editing) saved = await updateEquipment(editing.id, payload);
      else saved = await createEquipment(payload);

      const unitId = saved?.id || editing?.id;
      if (unitId && photoFiles.length) {
        for (const file of photoFiles) {
          await uploadEquipmentPhoto(unitId, file);
        }
      }
      await load();
      closeModal();
    } catch (err) {
      console.error("[EquipmentView] Error:", err);
      setError(err.message || "Failed to save equipment");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteEquipment(deleteId);
      setDeleteId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  // Force-release a "stuck" unit — one whose assigned driver has already
  // gone Off Duty/Terminated/Absent/Vacation/Sick Leave and therefore no
  // longer appears on the Handoff Board, so the normal return-equipment
  // flow can never reach them. This calls the same release path the
  // Handoff Board uses (closes the open EquipmentHandoff row + clears
  // assignedDriverId) directly from here instead.
  const handleForceRelease = async (item) => {
    const driverName = resolveAssignedDriver(item)?.name || "the assigned driver";
    if (
      !window.confirm(
        `Release ${item.unitNumber} from ${driverName}? This clears the assignment immediately with no cooldown.`,
      )
    ) {
      return;
    }
    setReleasingId(item.id);
    setError("");
    try {
      await assignEquipment(item.id, {
        release: true,
        cooldownMinutes: 0,
        reason: "SHIFT_END",
        reasonNote: "Force-released from Equipment page — driver no longer on shift",
      });
      await load();
    } catch (err) {
      setError(err.message || "Failed to release equipment");
    } finally {
      setReleasingId(null);
    }
  };

  // Quick in-service / out-of-service toggle — the one status-style write
  // Dispatcher is granted on Equipment (server: PATCH /equipment/:id/status,
  // 'operational'-gated, same tier as the "Release now" action above).
  // Dispatcher is usually the first person to hear from a driver that a
  // unit is broken down, so this needs to be reachable without asking a
  // Fleet Manager to open the full edit form. Mirrors handleForceRelease:
  // same confirm-before-acting pattern, same disabled-while-in-flight state.
  const handleToggleServiceStatus = async (item) => {
    const takingOutOfService = item.status !== "Out of Service";
    let outOfServiceReason = null;

    if (takingOutOfService) {
      outOfServiceReason = window.prompt(
        `Mark ${item.unitNumber} Out of Service — reason (optional):`,
        "",
      );
      if (outOfServiceReason === null) return; // cancelled the prompt
    } else if (
      !window.confirm(`Return ${item.unitNumber} to service?`)
    ) {
      return;
    }

    setStatusUpdatingId(item.id);
    setError("");
    try {
      await updateEquipmentStatus(item.id, {
        status: takingOutOfService ? "Out of Service" : "In Service",
        outOfServiceReason: outOfServiceReason || null,
      });
      await load();
    } catch (err) {
      setError(err.message || "Failed to update status");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const driverById = useMemo(() => {
    const map = {};
    drivers.forEach((d) => {
      map[d.id] = d;
    });
    return map;
  }, [drivers]);

  const resolveAssignedDriver = (item) => {
    if (item.assignedDriver?.name) return item.assignedDriver;
    if (item.assignedDriverId && driverById[item.assignedDriverId]) {
      return driverById[item.assignedDriverId];
    }
    return null;
  };

  /** True when unit is still assigned to a driver who is off the board */
  const isStuckAssignment = (item) => {
    if (!item.assignedDriverId) return false;
    const d = resolveAssignedDriver(item);
    if (!d) return true; // orphan assignment — driver missing
    return STUCK_DRIVER_STATUSES.has(d.status);
  };

  // Units where the SAME driver is currently handed off on more than one
  // unit of the SAME category at once (two tractors, or two trailers).
  // A driver holding one Power Unit + one Trailer together is a normal
  // rig pairing and is NOT flagged. This catches a different failure mode
  // than isStuckAssignment: the driver is still on shift and "Available",
  // so the off-duty check above never sees it — but an earlier checkout
  // left a stale assignment on a unit they no longer actually have.
  const duplicateAssignmentIds = useMemo(() => {
    const byDriverCategory = new Map();
    for (const e of equipment) {
      if (!e.assignedDriverId) continue;
      const key = `${e.assignedDriverId}|${e.category}`;
      if (!byDriverCategory.has(key)) byDriverCategory.set(key, []);
      byDriverCategory.get(key).push(e.id);
    }
    const dupes = new Set();
    for (const ids of byDriverCategory.values()) {
      if (ids.length > 1) ids.forEach((id) => dupes.add(id));
    }
    return dupes;
  }, [equipment]);

  const isDuplicateAssignment = (item) => duplicateAssignmentIds.has(item.id);

  const now = Date.now();
  void tick;

  const availabilityCounts = useMemo(() => {
    const c = {
      all: equipment.length,
      available: 0,
      in_use: 0,
      cooling: 0,
      out_of_service: 0,
      stuck: 0,
    };
    for (const e of equipment) {
      const key = getAvailabilityKey(e, now);
      c[key] += 1;
      if (isStuckAssignment(e) || isDuplicateAssignment(e)) c.stuck += 1;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isStuck uses drivers via resolveAssignedDriver
  }, [equipment, drivers, now, duplicateAssignmentIds]);

  const counts = {
    All: equipment.length,
    "Power Unit": equipment.filter((e) => e.category === "Power Unit").length,
    Trailer: equipment.filter((e) => e.category === "Trailer").length,
  };

  const filtered = useMemo(() => {
    let list =
      tab === "All"
        ? [...equipment]
        : equipment.filter((e) => e.category === tab);
    if (typeFilter !== "All")
      list = list.filter((e) => e.equipmentType === typeFilter);

    if (availabilityFilter === "available") {
      list = list.filter((e) => getAvailabilityKey(e, now) === "available");
    } else if (availabilityFilter === "in_use") {
      list = list.filter((e) => getAvailabilityKey(e, now) === "in_use");
    } else if (availabilityFilter === "cooling") {
      list = list.filter((e) => getAvailabilityKey(e, now) === "cooling");
    } else if (availabilityFilter === "out_of_service") {
      list = list.filter(
        (e) => getAvailabilityKey(e, now) === "out_of_service",
      );
    } else if (availabilityFilter === "stuck") {
      list = list.filter((e) => isStuckAssignment(e) || isDuplicateAssignment(e));
    }

    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.unitNumber?.toLowerCase().includes(q));

    // Dispatch-friendly order: available power units first, then available trailers,
    // then in-use, cooling, OOS. Within group, unit number.
    const rank = (e) => {
      const k = getAvailabilityKey(e, now);
      if (k === "available" && e.category === "Power Unit") return 0;
      if (k === "available") return 1;
      if (k === "in_use") return 2;
      if (k === "cooling") return 3;
      return 4;
    };
    list.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return (a.unitNumber || "").localeCompare(b.unitNumber || "");
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipment, tab, typeFilter, availabilityFilter, search, now, drivers]);

  const handleTypeFilterChange = (value) => {
    setTypeFilter(value);
    if (value !== "All")
      setTab(isTrailerType(value) ? "Trailer" : "Power Unit");
  };
  const handleTabChange = (t) => {
    setTab(t);
    setTypeFilter("All");
  };
  const clearFilters = () => {
    setSearch("");
    setTypeFilter("All");
    setAvailabilityFilter("all");
  };
  const filtersActive =
    !!search.trim() || typeFilter !== "All" || availabilityFilter !== "all";
  const formIsTrailer = isTrailerType(form.equipmentType);

  const getRowState = (item) => {
    const isHandedOff = !!item.assignedDriverId;
    const cooldownLeft =
      item.availableAt && new Date(item.availableAt).getTime() > now
        ? minutesUntil(item.availableAt)
        : null;
    const isCooling = cooldownLeft != null && cooldownLeft > 0;
    const offDuty = isStuckAssignment(item);
    const duplicate = isDuplicateAssignment(item);
    const stuck = offDuty || duplicate;
    const stuckMessage = offDuty
      ? "Stuck assignment — driver is not on shift."
      : "Duplicate assignment — driver already holds another unit of this type.";
    return { isHandedOff, isCooling, cooldownLeft, stuck, stuckMessage };
  };

  const ComplianceTags = ({ item }) => {
    const tags = [];
    const add = (date, label) => {
      if (!date) return;
      const days = daysUntil(date);
      if (days === null) return;
      let cls = tableStyles.compTag;
      if (days < 0) cls += ` ${tableStyles.compExpired}`;
      else if (days <= 30) cls += ` ${tableStyles.compWarn}`;
      tags.push(
        <span
          key={label}
          className={cls}
          title={`${label}: ${expiryLabel(date)}`}
        >
          {(days < 0 || days <= 30) && (
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              style={{ fontSize: 8 }}
            />
          )}
          {label}: {expiryLabel(date)}
        </span>,
      );
    };
    add(item.registrationExpiration, "Reg");
    add(item.insuranceExpiration, "Ins");
    add(item.iftaIrpExpiration, "IFTA");
    add(item.nextMaintenanceDue, "Maint");
    if (!tags.length) return <span className={tableStyles.metaTag}>—</span>;
    return <div className={tableStyles.compliance}>{tags}</div>;
  };

  const renderCards = () => (
    <div className={styles.grid}>
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <FontAwesomeIcon icon={faBoxOpen} />
          <strong>No equipment found</strong>
          <span>
            {equipment.length === 0
              ? "Add a unit to start tracking it here."
              : "Try adjusting your search or filters."}
          </span>
        </div>
      ) : (
        filtered.map((item) => {
          const regWarn = expiryClass(item.registrationExpiration);
          const maintWarn = expiryClass(item.nextMaintenanceDue);
          const insuranceWarn = expiryClass(item.insuranceExpiration);
          const iftaWarn = expiryClass(item.iftaIrpExpiration);
          const leaseWarn = expiryClass(item.leaseEndDate);
          const assigned = resolveAssignedDriver(item);
          const { isHandedOff, isCooling, cooldownLeft, stuck, stuckMessage } =
            getRowState(item);
          return (
            <div
              key={item.id}
              className={`${styles.card} ${
                item.status === "In Service"
                  ? isHandedOff
                    ? styles.cardAssigned
                    : isCooling
                      ? styles.cardCooldown
                      : styles.cardIn
                  : styles.cardOut
              }`}
            >
              <div className={styles.cardHeader}>
                <div
                  className={`${styles.unitIcon} ${
                    item.category === "Trailer"
                      ? styles.unitIconTrailer
                      : styles.unitIconPower
                  } ${item.equipmentType === "Reefer" ? styles.unitIconReefer : ""}`}
                >
                  <FontAwesomeIcon
                    icon={
                      TYPE_ICONS[item.equipmentType] ||
                      (item.category === "Trailer" ? faTrailer : faTruck)
                    }
                  />
                  {TYPE_SHORT[item.equipmentType] && (
                    <span
                      className={styles.typeBadge}
                      title={item.equipmentType}
                    >
                      {TYPE_SHORT[item.equipmentType]}
                    </span>
                  )}
                  {item.equipmentType === "Reefer" && (
                    <span
                      className={styles.coldBadge}
                      title="Temperature-controlled"
                    >
                      <FontAwesomeIcon icon={faSnowflake} />
                    </span>
                  )}
                </div>
                <div className={styles.unitInfo}>
                  <div className={styles.unitNumber}>{item.unitNumber}</div>
                  <div className={styles.unitModel}>
                    {item.equipmentType}
                    {item.modelDetails ? ` · ${item.modelDetails}` : ""}
                  </div>
                </div>
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.viewBtn}
                    onClick={() => setViewing(item)}
                    title="View"
                  >
                    <FontAwesomeIcon icon={faEye} />
                  </button>
                  {canEditEquipment && (
                    <button
                      className={styles.editBtn}
                      onClick={() => openEdit(item)}
                      title="Edit"
                    >
                      <FontAwesomeIcon icon={faPencil} />
                    </button>
                  )}
                  {canEditEquipment && (
                    <button
                      className={styles.deleteBtn}
                      onClick={() => setDeleteId(item.id)}
                      title="Delete"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  )}
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.statusRow}>
                  <span
                    className={`${styles.statusPill} ${
                      item.status === "In Service"
                        ? styles.statusIn
                        : styles.statusOut
                    }`}
                  >
                    {item.status}
                  </span>
                  {canOperateEquipment && (
                    <button
                      type="button"
                      className={
                        item.status === "Out of Service"
                          ? styles.returnServiceBtn
                          : styles.oosToggleBtn
                      }
                      onClick={() => handleToggleServiceStatus(item)}
                      disabled={statusUpdatingId === item.id}
                      title={
                        item.status === "Out of Service"
                          ? "Return to service"
                          : "Mark out of service"
                      }
                    >
                      <FontAwesomeIcon
                        icon={
                          item.status === "Out of Service"
                            ? faCircleCheck
                            : faBan
                        }
                      />
                      {statusUpdatingId === item.id
                        ? "Updating…"
                        : item.status === "Out of Service"
                          ? "Return to service"
                          : "Mark OOS"}
                    </button>
                  )}
                  {item.year && (
                    <span className={styles.metaTag}>
                      <FontAwesomeIcon icon={faCalendarDays} /> {item.year}
                    </span>
                  )}
                  {item.licensePlate && (
                    <span className={styles.metaTag}>
                      <FontAwesomeIcon icon={faIdCard} /> {item.licensePlate}
                    </span>
                  )}
                  {item.category === "Power Unit" && (
                    <span className={styles.metaTag}>
                      <FontAwesomeIcon
                        icon={
                          pullsTrailer(item.equipmentType)
                            ? faLink
                            : faLinkSlash
                        }
                      />
                      {pullsTrailer(item.equipmentType)
                        ? "Pulls trailer"
                        : "Self-contained"}
                    </span>
                  )}
                  {item.category === "Trailer" &&
                    (item.capacityLbs || item.palletPositions) && (
                      <span className={styles.capacity}>
                        <FontAwesomeIcon icon={faWeightHanging} />
                        {item.capacityLbs
                          ? `${item.capacityLbs.toLocaleString()} lb`
                          : ""}
                        {item.capacityLbs && item.palletPositions ? " · " : ""}
                        {item.palletPositions
                          ? `${item.palletPositions} positions`
                          : ""}
                      </span>
                    )}
                </div>

                {isHandedOff && (
                  <div className={styles.handoffChip}>
                    <FontAwesomeIcon icon={faKey} />
                    <span className={styles.handoffLabel}>Handed off</span>
                    {assigned ? (
                      <span className={styles.handoffDriver}>
                        <FontAwesomeIcon icon={faUser} />
                        {assigned.name}
                        {assigned.employeeId
                          ? ` · #${assigned.employeeId}`
                          : ""}
                        {assigned.status ? ` · ${assigned.status}` : ""}
                      </span>
                    ) : (
                      <span className={styles.handoffDriver}>
                        Driver assigned
                      </span>
                    )}
                  </div>
                )}

                {stuck && (
                  <div className={styles.oosReason}>
                    <FontAwesomeIcon icon={faTriangleExclamation} />
                    <span>{stuckMessage}</span>
                    {canOperateEquipment && (
                      <button
                        type="button"
                        className={styles.releaseBtn}
                        onClick={() => handleForceRelease(item)}
                        disabled={releasingId === item.id}
                      >
                        <FontAwesomeIcon icon={faLinkSlash} />
                        {releasingId === item.id ? "Releasing…" : "Release now"}
                      </button>
                    )}
                  </div>
                )}

                {!isHandedOff && isCooling && (
                  <div className={styles.cooldownChip}>
                    <FontAwesomeIcon icon={faClock} />
                    Cooling down ·{" "}
                    {cooldownLeft != null && cooldownLeft > 0
                      ? `${cooldownLeft} min left`
                      : "available soon"}
                  </div>
                )}

                {!isHandedOff && !isCooling && item.status === "In Service" && (
                  <div className={styles.availableChip}>
                    <FontAwesomeIcon icon={faCircleCheck} /> Available for
                    handoff
                  </div>
                )}

                {item.ownershipType && item.ownershipType !== "Owned" && (
                  <div
                    className={`${styles.leaseChip} ${leaseWarn ? styles.leaseChipWarn : ""}`}
                  >
                    <FontAwesomeIcon icon={faHandshake} />
                    {item.ownershipType}
                    {item.leaseCompany && <> · {item.leaseCompany}</>}
                    {item.leaseEndDate && (
                      <span className={styles.leaseChipDate}>
                        {leaseWarn && (
                          <FontAwesomeIcon icon={faTriangleExclamation} />
                        )}
                        Ends {expiryLabel(item.leaseEndDate)}
                      </span>
                    )}
                  </div>
                )}

                {item.status === "Out of Service" &&
                  item.outOfServiceReason && (
                    <p className={styles.oosReason}>
                      <FontAwesomeIcon icon={faTriangleExclamation} />{" "}
                      {item.outOfServiceReason}
                    </p>
                  )}

                {(item.registrationExpiration ||
                  item.nextMaintenanceDue ||
                  item.insuranceExpiration ||
                  item.iftaIrpExpiration) && (
                  <div className={styles.complianceRow}>
                    {item.registrationExpiration && (
                      <span className={`${styles.complianceTag} ${regWarn}`}>
                        {regWarn && (
                          <FontAwesomeIcon icon={faTriangleExclamation} />
                        )}
                        Plate/Reg: {expiryLabel(item.registrationExpiration)}
                      </span>
                    )}
                    {item.insuranceExpiration && (
                      <span
                        className={`${styles.complianceTag} ${insuranceWarn}`}
                      >
                        {insuranceWarn && (
                          <FontAwesomeIcon icon={faTriangleExclamation} />
                        )}
                        Insurance: {expiryLabel(item.insuranceExpiration)}
                      </span>
                    )}
                    {item.iftaIrpExpiration && (
                      <span className={`${styles.complianceTag} ${iftaWarn}`}>
                        {iftaWarn && (
                          <FontAwesomeIcon icon={faTriangleExclamation} />
                        )}
                        IFTA/IRP: {expiryLabel(item.iftaIrpExpiration)}
                      </span>
                    )}
                    {item.nextMaintenanceDue && (
                      <span className={`${styles.complianceTag} ${maintWarn}`}>
                        {maintWarn && (
                          <FontAwesomeIcon icon={faTriangleExclamation} />
                        )}
                        Maintenance: {expiryLabel(item.nextMaintenanceDue)}
                      </span>
                    )}
                  </div>
                )}
                {item.notes && <p className={styles.notes}>{item.notes}</p>}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const renderTable = () => (
    <div className={tableStyles.tableWrap}>
      <div className={tableStyles.tableScroll}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th className={tableStyles.thExpand} aria-hidden="true" />
              <th>Unit</th>
              <th>Status</th>
              <th>Availability</th>
              <th>Capacity</th>
              <th>Plate / Year</th>
              <th>Compliance</th>
              <th>Ownership</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className={tableStyles.emptyRow}>
                <td colSpan={9}>
                  {equipment.length === 0
                    ? "No equipment found. Add a unit to start tracking it here."
                    : "No equipment matches your search or filters."}
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const assigned = resolveAssignedDriver(item);
                const { isHandedOff, isCooling, cooldownLeft, stuck, stuckMessage } =
                  getRowState(item);
                const isOpen = expandedIds.has(item.id);
                const rowCls = [
                  tableStyles.tr,
                  isOpen ? tableStyles.trOpen : "",
                  item.status !== "In Service"
                    ? tableStyles.rowOut
                    : isHandedOff
                      ? tableStyles.rowAssigned
                      : isCooling
                        ? tableStyles.rowCooldown
                        : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <React.Fragment key={item.id}>
                    <tr
                      className={rowCls}
                      onClick={() => toggleExpanded(item.id)}
                    >
                      <td className={tableStyles.tdExpand}>
                        <FontAwesomeIcon
                          icon={faChevronDown}
                          className={tableStyles.expandChevron}
                        />
                      </td>
                      <td>
                        <div className={tableStyles.unitCell}>
                          <div
                            className={`${tableStyles.unitIcon} ${
                              item.category === "Trailer"
                                ? tableStyles.iconTrailer
                                : tableStyles.iconPower
                            } ${item.equipmentType === "Reefer" ? tableStyles.iconReefer : ""}`}
                          >
                            <FontAwesomeIcon
                              icon={
                                TYPE_ICONS[item.equipmentType] ||
                                (item.category === "Trailer"
                                  ? faTrailer
                                  : faTruck)
                              }
                            />
                            {TYPE_SHORT[item.equipmentType] && (
                              <span
                                className={tableStyles.typeBadge}
                                title={item.equipmentType}
                              >
                                {TYPE_SHORT[item.equipmentType]}
                              </span>
                            )}
                            {item.equipmentType === "Reefer" && (
                              <span className={tableStyles.coldDot}>
                                <FontAwesomeIcon icon={faSnowflake} />
                              </span>
                            )}
                          </div>
                          <div>
                            <div className={tableStyles.unitNumber}>
                              {item.unitNumber}
                            </div>
                            <div className={tableStyles.unitType}>
                              {item.equipmentType}
                              {item.modelDetails
                                ? ` · ${item.modelDetails}`
                                : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td onClick={(e) => canOperateEquipment && e.stopPropagation()}>
                        <div className={styles.stuckCell}>
                          <span
                            className={`${tableStyles.statusPill} ${
                              item.status === "In Service"
                                ? tableStyles.statusIn
                                : tableStyles.statusOut
                            }`}
                          >
                            {item.status}
                          </span>
                          {canOperateEquipment && (
                            <button
                              type="button"
                              className={
                                item.status === "Out of Service"
                                  ? styles.returnServiceBtnSm
                                  : styles.oosToggleBtnSm
                              }
                              onClick={() => handleToggleServiceStatus(item)}
                              disabled={statusUpdatingId === item.id}
                              title={
                                item.status === "Out of Service"
                                  ? "Return to service"
                                  : "Mark out of service"
                              }
                            >
                              <FontAwesomeIcon
                                icon={
                                  item.status === "Out of Service"
                                    ? faCircleCheck
                                    : faBan
                                }
                              />
                            </button>
                          )}
                        </div>
                      </td>
                      <td
                        className={tableStyles.availCell}
                        onClick={(e) => stuck && e.stopPropagation()}
                      >
                        {stuck ? (
                          <div className={styles.stuckCell} title={stuckMessage}>
                            <span className={tableStyles.danger}>
                              {stuckMessage.split(" — ")[0]}
                            </span>
                            {canOperateEquipment && (
                              <button
                                type="button"
                                className={styles.releaseBtnSm}
                                onClick={() => handleForceRelease(item)}
                                disabled={releasingId === item.id}
                              >
                                <FontAwesomeIcon icon={faLinkSlash} />
                                {releasingId === item.id
                                  ? "Releasing…"
                                  : "Release"}
                              </button>
                            )}
                          </div>
                        ) : isHandedOff ? (
                          <span>
                            <FontAwesomeIcon
                              icon={faKey}
                              style={{ marginRight: 4 }}
                            />
                            {assigned?.name || "Handed off"}
                          </span>
                        ) : isCooling ? (
                          <span>
                            <FontAwesomeIcon
                              icon={faClock}
                              style={{ marginRight: 4 }}
                            />
                            {cooldownLeft != null && cooldownLeft > 0
                              ? `${cooldownLeft}m cooldown`
                              : "Cooling"}
                          </span>
                        ) : item.status === "In Service" ? (
                          <span className={tableStyles.success}>Available</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={tableStyles.capacity}>
                        {item.category === "Trailer" &&
                        (item.capacityLbs || item.palletPositions) ? (
                          <>
                            {item.capacityLbs && (
                              <strong>
                                {item.capacityLbs.toLocaleString()} lb
                              </strong>
                            )}
                            {item.capacityLbs && item.palletPositions && " · "}
                            {item.palletPositions &&
                              `${item.palletPositions} pos`}
                          </>
                        ) : item.category === "Power Unit" ? (
                          <span className={tableStyles.metaTag}>
                            <FontAwesomeIcon
                              icon={
                                pullsTrailer(item.equipmentType)
                                  ? faLink
                                  : faLinkSlash
                              }
                              style={{ fontSize: 10 }}
                            />
                            {pullsTrailer(item.equipmentType)
                              ? "Pulls"
                              : "Self"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          {item.licensePlate && (
                            <span className={tableStyles.metaTag}>
                              <FontAwesomeIcon
                                icon={faIdCard}
                                style={{ fontSize: 9 }}
                              />
                              {item.licensePlate}
                            </span>
                          )}
                          {item.year && (
                            <span className={tableStyles.metaTag}>
                              <FontAwesomeIcon
                                icon={faCalendarDays}
                                style={{ fontSize: 9 }}
                              />
                              {item.year}
                            </span>
                          )}
                          {!item.licensePlate && !item.year && "—"}
                        </div>
                      </td>
                      <td>
                        <ComplianceTags item={item} />
                      </td>
                      <td>
                        {item.ownershipType &&
                        item.ownershipType !== "Owned" ? (
                          <span className={tableStyles.ownershipLease}>
                            {item.ownershipType}
                            {item.leaseCompany ? ` · ${item.leaseCompany}` : ""}
                          </span>
                        ) : (
                          <span className={tableStyles.ownership}>Owned</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className={tableStyles.actions}>
                          <button
                            type="button"
                            className={`${tableStyles.actionBtn} ${tableStyles.viewBtn}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewing(item);
                            }}
                            title="View"
                          >
                            <FontAwesomeIcon icon={faEye} />
                          </button>
                          {canEditEquipment && (
                            <button
                              className={`${tableStyles.actionBtn} ${tableStyles.editBtn}`}
                              onClick={() => openEdit(item)}
                              title="Edit"
                            >
                              <FontAwesomeIcon icon={faPencil} />
                            </button>
                          )}
                          {canEditEquipment && (
                            <button
                              className={`${tableStyles.actionBtn} ${tableStyles.deleteBtn}`}
                              onClick={() => setDeleteId(item.id)}
                              title="Delete"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    <tr className={tableStyles.trExpandRow}>
                      <td colSpan={9} className={tableStyles.tdExpandContent}>
                        <div
                          className={`${tableStyles.expandPanel} ${
                            isOpen ? tableStyles.expandPanelOpen : ""
                          }`}
                        >
                          <div className={tableStyles.expandPanelInner}>
                            <div className={tableStyles.expandGrid}>
                              {item.vin && (
                                <div className={tableStyles.expandItem}>
                                  <span className={tableStyles.expandLabel}>
                                    VIN
                                  </span>
                                  <span className={tableStyles.expandValue}>
                                    {item.vin}
                                  </span>
                                </div>
                              )}
                              {item.registrationExpiration && (
                                <div className={tableStyles.expandItem}>
                                  <span className={tableStyles.expandLabel}>
                                    Registration
                                  </span>
                                  <span className={tableStyles.expandValue}>
                                    {toDateInput(item.registrationExpiration)} ·{" "}
                                    {expiryLabel(item.registrationExpiration)}
                                  </span>
                                </div>
                              )}
                              {item.insuranceProvider && (
                                <div className={tableStyles.expandItem}>
                                  <span className={tableStyles.expandLabel}>
                                    Insurance
                                  </span>
                                  <span className={tableStyles.expandValue}>
                                    {item.insuranceProvider}
                                    {item.insurancePolicyNumber
                                      ? ` · ${item.insurancePolicyNumber}`
                                      : ""}
                                    {item.insuranceExpiration
                                      ? ` · ${expiryLabel(item.insuranceExpiration)}`
                                      : ""}
                                  </span>
                                </div>
                              )}
                              {item.iftaIrpExpiration && (
                                <div className={tableStyles.expandItem}>
                                  <span className={tableStyles.expandLabel}>
                                    IFTA / IRP
                                  </span>
                                  <span className={tableStyles.expandValue}>
                                    {toDateInput(item.iftaIrpExpiration)} ·{" "}
                                    {expiryLabel(item.iftaIrpExpiration)}
                                  </span>
                                </div>
                              )}
                              {item.nextMaintenanceDue && (
                                <div className={tableStyles.expandItem}>
                                  <span className={tableStyles.expandLabel}>
                                    Maintenance
                                  </span>
                                  <span className={tableStyles.expandValue}>
                                    {toDateInput(item.nextMaintenanceDue)} ·{" "}
                                    {expiryLabel(item.nextMaintenanceDue)}
                                  </span>
                                </div>
                              )}
                              {item.ownershipType &&
                                item.ownershipType !== "Owned" && (
                                  <div className={tableStyles.expandItem}>
                                    <span className={tableStyles.expandLabel}>
                                      {item.ownershipType}
                                    </span>
                                    <span className={tableStyles.expandValue}>
                                      {item.leaseCompany || "—"}
                                      {item.leaseEndDate
                                        ? ` · ends ${toDateInput(item.leaseEndDate)}`
                                        : ""}
                                      {item.monthlyPaymentAmount
                                        ? ` · $${item.monthlyPaymentAmount}/mo`
                                        : ""}
                                    </span>
                                  </div>
                                )}
                              {item.status === "Out of Service" &&
                                item.outOfServiceReason && (
                                  <div className={tableStyles.expandItem}>
                                    <span className={tableStyles.expandLabel}>
                                      OOS Reason
                                    </span>
                                    <span className={tableStyles.expandValue}>
                                      {item.outOfServiceReason}
                                    </span>
                                  </div>
                                )}
                              {isHandedOff && assigned && (
                                <div className={tableStyles.expandItem}>
                                  <span className={tableStyles.expandLabel}>
                                    Assigned Driver
                                  </span>
                                  <span className={tableStyles.expandValue}>
                                    {assigned.name}
                                    {assigned.employeeId
                                      ? ` · #${assigned.employeeId}`
                                      : ""}
                                    {assigned.status
                                      ? ` · ${assigned.status}`
                                      : ""}
                                  </span>
                                </div>
                              )}
                            </div>
                            {item.notes ? (
                              <p className={tableStyles.expandNotes}>
                                {item.notes}
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
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Equipment</h1>
          <p className={styles.pageSub}>
            {filtersActive
              ? `${filtered.length} of ${equipment.length} units`
              : `${equipment.length} units registered`}
            <span className={styles.headerMeta}>
              {" · "}
              {availabilityCounts.available} available
              {availabilityCounts.in_use > 0 && (
                <> · {availabilityCounts.in_use} in use</>
              )}
              {availabilityCounts.cooling > 0 && (
                <> · {availabilityCounts.cooling} cooling</>
              )}
              {availabilityCounts.out_of_service > 0 && (
                <> · {availabilityCounts.out_of_service} OOS</>
              )}
              {availabilityCounts.stuck > 0 && (
                <> · {availabilityCounts.stuck} stuck</>
              )}
            </span>
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            className={tableStyles.viewToggle}
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              className={`${tableStyles.toggleBtn} ${
                viewMode === "cards" ? tableStyles.toggleBtnActive : ""
              }`}
              onClick={() => switchView("cards")}
              title="Card view"
              aria-pressed={viewMode === "cards"}
            >
              <FontAwesomeIcon icon={faThLarge} />
              <span className={tableStyles.toggleLabel}>Cards</span>
            </button>
            <button
              type="button"
              className={`${tableStyles.toggleBtn} ${
                viewMode === "table" ? tableStyles.toggleBtnActive : ""
              }`}
              onClick={() => switchView("table")}
              title="Table view"
              aria-pressed={viewMode === "table"}
            >
              <FontAwesomeIcon icon={faTable} />
              <span className={tableStyles.toggleLabel}>Table</span>
            </button>
          </div>
          {canEditEquipment && (
            <button
              className={styles.addBtn}
              onClick={openAdd}
              id="add-equipment-btn"
            >
              <FontAwesomeIcon icon={faPlus} /> Add Equipment
            </button>
          )}
        </div>
      </div>

      <div className={styles.tabs}>
        {["All", "Power Unit", "Trailer"].map((t) => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.activeTab : ""}`}
            onClick={() => handleTabChange(t)}
            id={`tab-${t.toLowerCase().replace(" ", "-")}`}
          >
            <FontAwesomeIcon icon={t === "Trailer" ? faTrailer : faTruck} />
            {t === "All" ? "All Units" : `${t}s`}{" "}
            <span className={styles.tabCount}>{counts[t]}</span>
          </button>
        ))}
      </div>

      {/* Quick availability chips */}
      <div className={styles.toolbar} style={{ marginBottom: 10 }}>
        {[
          {
            key: "all",
            label: "All",
            count: availabilityCounts.all,
            icon: null,
          },
          {
            key: "available",
            label: "Available",
            count: availabilityCounts.available,
            icon: faCircleCheck,
          },
          {
            key: "in_use",
            label: "In use",
            count: availabilityCounts.in_use,
            icon: faKey,
          },
          {
            key: "cooling",
            label: "Cooling",
            count: availabilityCounts.cooling,
            icon: faClock,
          },
          {
            key: "out_of_service",
            label: "Out of service",
            count: availabilityCounts.out_of_service,
            icon: faBan,
          },
          ...(availabilityCounts.stuck > 0
            ? [
                {
                  key: "stuck",
                  label: "Stuck",
                  count: availabilityCounts.stuck,
                  icon: faTriangleExclamation,
                },
              ]
            : []),
        ].map((chip) => (
          <button
            key={chip.key}
            type="button"
            className={`${styles.tab} ${
              availabilityFilter === chip.key ? styles.activeTab : ""
            }`}
            onClick={() => setAvailabilityFilter(chip.key)}
            title={`Show ${chip.label.toLowerCase()}`}
          >
            {chip.icon && <FontAwesomeIcon icon={chip.icon} />}
            {chip.label} <span className={styles.tabCount}>{chip.count}</span>
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by unit number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>
        <select
          className={styles.filterSelect}
          value={typeFilter}
          onChange={(e) => handleTypeFilterChange(e.target.value)}
          aria-label="Filter by equipment type"
        >
          <option value="All">All Types</option>
          <optgroup label="Power Units">
            {TYPE_GROUPS["Power Unit"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </optgroup>
          <optgroup label="Trailers">
            {TYPE_GROUPS.Trailer.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </optgroup>
        </select>
        <select
          className={styles.filterSelect}
          value={availabilityFilter}
          onChange={(e) => setAvailabilityFilter(e.target.value)}
          aria-label="Filter by availability"
        >
          <option value="all">
            All availability ({availabilityCounts.all})
          </option>
          <option value="available">
            Available ({availabilityCounts.available})
          </option>
          <option value="in_use">
            In use / handed off ({availabilityCounts.in_use})
          </option>
          <option value="cooling">
            Cooling down ({availabilityCounts.cooling})
          </option>
          <option value="out_of_service">
            Out of service ({availabilityCounts.out_of_service})
          </option>
          {availabilityCounts.stuck > 0 && (
            <option value="stuck">
              Stuck assignments ({availabilityCounts.stuck})
            </option>
          )}
        </select>
        {filtersActive && (
          <button
            type="button"
            className={styles.clearFiltersBtn}
            onClick={clearFilters}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {loading ? (
        <div className={styles.loading}>Loading equipment…</div>
      ) : viewMode === "table" ? (
        renderTable()
      ) : (
        renderCards()
      )}

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? "Edit Equipment" : "Add Equipment"}
        size="md"
      >
        <form
          onSubmit={handleSubmit}
          id="equipment-form"
          className={styles.form}
        >
          {error && <div className={styles.formError}>{error}</div>}
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Unit Number *</label>
              <input
                id="eq-unit"
                className={styles.input}
                required
                value={form.unitNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, unitNumber: e.target.value }))
                }
                placeholder="T-001"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Equipment Type *</label>
              <select
                id="eq-type"
                className={styles.input}
                value={form.equipmentType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, equipmentType: e.target.value }))
                }
              >
                <optgroup label="Power Units">
                  {TYPE_GROUPS["Power Unit"].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Trailers">
                  {TYPE_GROUPS.Trailer.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Year</label>
              <input
                id="eq-year"
                type="number"
                className={styles.input}
                value={form.year}
                onChange={(e) =>
                  setForm((f) => ({ ...f, year: e.target.value }))
                }
                placeholder="2022"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>License Plate</label>
              <input
                id="eq-plate"
                className={styles.input}
                value={form.licensePlate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, licensePlate: e.target.value }))
                }
                placeholder="8ABC123"
              />
            </div>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>VIN</label>
              <input
                id="eq-vin"
                className={styles.input}
                value={form.vin}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vin: e.target.value }))
                }
                placeholder="1FUJGLDR6NLXXXXXX"
              />
            </div>
            {formIsTrailer && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Capacity (lb)</label>
                  <input
                    id="eq-capacity"
                    className={styles.input}
                    type="number"
                    min="0"
                    value={form.capacityLbs}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, capacityLbs: e.target.value }))
                    }
                    placeholder="e.g. 45000"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Pallet Positions</label>
                  <input
                    id="eq-positions"
                    className={styles.input}
                    type="number"
                    min="0"
                    value={form.palletPositions}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        palletPositions: e.target.value,
                      }))
                    }
                    placeholder="e.g. 18"
                  />
                </div>
              </>
            )}
            <div
              className={`${styles.formGroup} ${formIsTrailer ? "" : styles.fullWidth}`}
            >
              <label className={styles.label}>Model / Details</label>
              <input
                id="eq-model"
                className={styles.input}
                value={form.modelDetails}
                onChange={(e) =>
                  setForm((f) => ({ ...f, modelDetails: e.target.value }))
                }
                placeholder={
                  formIsTrailer
                    ? "Deck length or special handling"
                    : "Freightliner Cascadia"
                }
              />
            </div>
            <div
              className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}
            >
              <FontAwesomeIcon icon={faClipboardCheck} /> Status &amp;
              Compliance
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Status</label>
              <select
                id="eq-status"
                className={styles.input}
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                <option value="In Service">In Service</option>
                <option value="Out of Service">Out of Service</option>
              </select>
            </div>
            {form.status === "Out of Service" && (
              <div className={styles.formGroup}>
                <label className={styles.label}>Reason</label>
                <input
                  id="eq-oos-reason"
                  className={styles.input}
                  value={form.outOfServiceReason}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      outOfServiceReason: e.target.value,
                    }))
                  }
                  placeholder="Brake repair, awaiting parts…"
                />
              </div>
            )}
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Registration / Plate Expiration
              </label>
              <DateTimePicker
                value={form.registrationExpiration || ""}
                dateOnly
                onChange={(date) =>
                  setForm((f) => ({
                    ...f,
                    registrationExpiration: date
                      ? toLocalISO(date, { dateOnly: true })
                      : "",
                  }))
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Next Maintenance Due</label>
              <DateTimePicker
                value={form.nextMaintenanceDue || ""}
                dateOnly
                onChange={(date) =>
                  setForm((f) => ({
                    ...f,
                    nextMaintenanceDue: date
                      ? toLocalISO(date, { dateOnly: true })
                      : "",
                  }))
                }
              />
            </div>
            <div
              className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}
            >
              <FontAwesomeIcon icon={faShieldHalved} /> Insurance &amp; Tax
              Filings
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Insurance Provider</label>
              <input
                id="eq-ins-provider"
                className={styles.input}
                value={form.insuranceProvider}
                onChange={(e) =>
                  setForm((f) => ({ ...f, insuranceProvider: e.target.value }))
                }
                placeholder="Progressive Commercial"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Policy Number</label>
              <input
                id="eq-ins-policy"
                className={styles.input}
                value={form.insurancePolicyNumber}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    insurancePolicyNumber: e.target.value,
                  }))
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Insurance Renewal Date</label>
              <DateTimePicker
                value={form.insuranceExpiration || ""}
                dateOnly
                onChange={(date) =>
                  setForm((f) => ({
                    ...f,
                    insuranceExpiration: date
                      ? toLocalISO(date, { dateOnly: true })
                      : "",
                  }))
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>IFTA / IRP Renewal Date</label>
              <DateTimePicker
                value={form.iftaIrpExpiration || ""}
                dateOnly
                onChange={(date) =>
                  setForm((f) => ({
                    ...f,
                    iftaIrpExpiration: date
                      ? toLocalISO(date, { dateOnly: true })
                      : "",
                  }))
                }
              />
            </div>
            <div
              className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}
            >
              <FontAwesomeIcon icon={faFileContract} /> Ownership
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Ownership Type</label>
              <select
                id="eq-ownership"
                className={styles.input}
                value={form.ownershipType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ownershipType: e.target.value }))
                }
              >
                <option value="Owned">Owned</option>
                <option value="Leased">Leased</option>
                <option value="Financed">Financed</option>
              </select>
            </div>
            {form.ownershipType !== "Owned" && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    {form.ownershipType === "Leased"
                      ? "Leasing Company"
                      : "Lender"}
                  </label>
                  <input
                    id="eq-lease-company"
                    className={styles.input}
                    value={form.leaseCompany}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, leaseCompany: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    {form.ownershipType === "Leased"
                      ? "Lease End Date"
                      : "Payoff Date"}
                  </label>
                  <DateTimePicker
                    value={form.leaseEndDate || ""}
                    dateOnly
                    onChange={(date) =>
                      setForm((f) => ({
                        ...f,
                        leaseEndDate: date
                          ? toLocalISO(date, { dateOnly: true })
                          : "",
                      }))
                    }
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Monthly Payment ($)</label>
                  <input
                    id="eq-lease-payment"
                    type="number"
                    min="0"
                    step="0.01"
                    className={styles.input}
                    value={form.monthlyPaymentAmount}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        monthlyPaymentAmount: e.target.value,
                      }))
                    }
                  />
                </div>
              </>
            )}
            <div className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}>
              <FontAwesomeIcon icon={faCamera} /> Unit photos
            </div>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Photos (optional)</label>
              <div className={styles.photoGrid}>
                {photoPreviews.map((p, i) => (
                  <div key={`${p.src}-${i}`} className={styles.photoThumb}>
                    <img src={p.src} alt={`Unit photo ${i + 1}`} />
                    <button
                      type="button"
                      className={styles.photoRemove}
                      onClick={() => removePreview(i)}
                      title="Remove"
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                ))}
                <label className={styles.photoAdd}>
                  <FontAwesomeIcon icon={faFileImage} />
                  <span>Add photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handlePhotoPick}
                    hidden
                  />
                </label>
              </div>
              <small>JPEG, PNG or WEBP · max 5 MB each · exterior, plate, damage, interior…</small>
            </div>

            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Notes</label>
              <input
                id="eq-notes"
                className={styles.input}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Any additional info…"
              />
            </div>
          </div>
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
              disabled={saving}
              id="eq-save-btn"
            >
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Equipment"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.unitNumber || "Equipment"}
        size="lg"
      >
        <EquipmentDetailView
          item={viewing}
          assignedDriver={viewing ? resolveAssignedDriver(viewing) : null}
          onClose={() => setViewing(null)}
          onEdit={
            canEditEquipment
              ? (it) => {
                  setViewing(null);
                  openEdit(it);
                }
              : undefined
          }
        />
      </Modal>

      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Equipment"
        size="sm"
      >
        <p className={styles.confirmText}>
          Delete this unit? This cannot be undone.
        </p>
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
            id="eq-delete-confirm"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}



