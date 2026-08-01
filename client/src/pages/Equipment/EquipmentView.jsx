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
  faRoute,
} from "@fortawesome/free-solid-svg-icons";
import {
  getEquipment,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getDrivers,
} from "../../api/api.js";
import Modal from "../../components/Modal/Modal.jsx";
import styles from "./EquipmentView.module.css";

// One flat list the user picks from — grouped visually with <optgroup>,
// but stored/validated as a single equipmentType field. The category
// (Power Unit vs Trailer) is derived from this on the backend.
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

// Only Tractors pull a trailer — Straight Trucks, Cube Trucks, and Sprinter Vans
// are self-contained power units. Used purely for the informational tag on the card.
const pullsTrailer = (type) => type === "Tractor";

// A distinct icon per specific type reads much faster than one icon per category.
const TYPE_ICONS = {
  Tractor: faTruckFront,
  "Straight Truck": faTruck,
  "Cube Truck": faTruckMoving,
  "Sprinter Van": faVanShuttle,
  "Dry Van": faTrailer,
  Reefer: faTrailer,
  "Open Deck": faTrailer,
  "Flat Bed": faTrailer,
  "Low Boy": faTrailer,
  "Roller Bed": faTrailer,
};

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

function initials(name = "") {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function EquipmentView() {
  const [equipment, setEquipment] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0); // live cooldown countdowns

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

  // Refresh countdown labels + soft re-fetch so Handoff assignments appear here
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (tick > 0 && tick % 2 === 0) load();
  }, [tick, load]);

  const openAdd = () => {
    setEditing(null);
    setForm(INITIAL_FORM);
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
    setError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setError("");
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

      if (form.year && !isNaN(form.year) && form.year !== "") {
        payload.year = Number(form.year);
      }

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

      if (form.registrationExpiration && form.registrationExpiration !== "") {
        payload.registrationExpiration = new Date(
          form.registrationExpiration,
        ).toISOString();
      }

      if (form.nextMaintenanceDue && form.nextMaintenanceDue !== "") {
        payload.nextMaintenanceDue = new Date(
          form.nextMaintenanceDue,
        ).toISOString();
      }

      payload.insuranceProvider = form.insuranceProvider || "";
      payload.insurancePolicyNumber = form.insurancePolicyNumber || "";
      if (form.insuranceExpiration && form.insuranceExpiration !== "") {
        payload.insuranceExpiration = new Date(
          form.insuranceExpiration,
        ).toISOString();
      }

      if (form.iftaIrpExpiration && form.iftaIrpExpiration !== "") {
        payload.iftaIrpExpiration = new Date(
          form.iftaIrpExpiration,
        ).toISOString();
      }

      payload.ownershipType = form.ownershipType;
      if (form.ownershipType !== "Owned") {
        payload.leaseCompany = form.leaseCompany || "";
        if (form.leaseEndDate && form.leaseEndDate !== "") {
          payload.leaseEndDate = new Date(form.leaseEndDate).toISOString();
        }
        if (
          form.monthlyPaymentAmount &&
          !isNaN(form.monthlyPaymentAmount) &&
          form.monthlyPaymentAmount !== ""
        ) {
          payload.monthlyPaymentAmount = Number(form.monthlyPaymentAmount);
        }
      } else {
        // Switched back to Owned — clear any stale lease data rather than leaving it dangling
        payload.leaseCompany = "";
        payload.leaseEndDate = null;
        payload.monthlyPaymentAmount = null;
      }

      if (editing) {
        await updateEquipment(editing.id, payload);
      } else {
        await createEquipment(payload);
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

  const now = Date.now();
  void tick; // re-render countdowns

  const counts = {
    All: equipment.length,
    "Power Unit": equipment.filter((e) => e.category === "Power Unit").length,
    Trailer: equipment.filter((e) => e.category === "Trailer").length,
  };
  const filtered =
    tab === "All" ? equipment : equipment.filter((e) => e.category === tab);
  const formIsTrailer = isTrailerType(form.equipmentType);

  const assignedCount = equipment.filter((e) => e.assignedDriverId).length;
  const coolingCount = equipment.filter(
    (e) => e.availableAt && new Date(e.availableAt).getTime() > now,
  ).length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Equipment</h1>
          <p className={styles.pageSub}>
            {equipment.length} units registered
            {(assignedCount > 0 || coolingCount > 0) && (
              <span className={styles.headerMeta}>
                {assignedCount > 0 && <> · {assignedCount} handed off</>}
                {coolingCount > 0 && <> · {coolingCount} cooling down</>}
              </span>
            )}
          </p>
        </div>
        <button
          className={styles.addBtn}
          onClick={openAdd}
          id="add-equipment-btn"
        >
          <FontAwesomeIcon icon={faPlus} />
          Add Equipment
        </button>
      </div>

      <div className={styles.tabs}>
        {["All", "Power Unit", "Trailer"].map((t) => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.activeTab : ""}`}
            onClick={() => setTab(t)}
            id={`tab-${t.toLowerCase().replace(" ", "-")}`}
          >
            <FontAwesomeIcon icon={t === "Trailer" ? faTrailer : faTruck} />
            {t === "All" ? "All Units" : `${t}s`}{" "}
            <span className={styles.tabCount}>{counts[t]}</span>
          </button>
        ))}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Loading equipment…</div>
      ) : (
        <div className={styles.grid}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <FontAwesomeIcon icon={faBoxOpen} />
              <strong>No equipment found</strong>
              <span>Add a unit to start tracking it here.</span>
            </div>
          ) : (
            filtered.map((item) => {
              const regWarn = expiryClass(item.registrationExpiration);
              const maintWarn = expiryClass(item.nextMaintenanceDue);
              const insuranceWarn = expiryClass(item.insuranceExpiration);
              const iftaWarn = expiryClass(item.iftaIrpExpiration);
              const leaseWarn = expiryClass(item.leaseEndDate);
              const assigned = resolveAssignedDriver(item);
              const cooldownLeft =
                item.availableAt && new Date(item.availableAt).getTime() > now
                  ? minutesUntil(item.availableAt)
                  : null;
              const isCooling = cooldownLeft != null && cooldownLeft > 0;
              const isHandedOff = !!item.assignedDriverId;

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
                        className={styles.editBtn}
                        onClick={() => openEdit(item)}
                        title="Edit"
                      >
                        <FontAwesomeIcon icon={faPencil} />
                      </button>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => setDeleteId(item.id)}
                        title="Delete"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
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
                      {item.year && (
                        <span className={styles.metaTag}>
                          <FontAwesomeIcon icon={faCalendarDays} /> {item.year}
                        </span>
                      )}
                      {item.licensePlate && (
                        <span className={styles.metaTag}>
                          <FontAwesomeIcon icon={faIdCard} />{" "}
                          {item.licensePlate}
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
                            {item.capacityLbs && item.palletPositions
                              ? " · "
                              : ""}
                            {item.palletPositions
                              ? `${item.palletPositions} positions`
                              : ""}
                          </span>
                        )}
                    </div>

                    {/* Handoff state — assigned driver or cooldown */}
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
                          </span>
                        ) : (
                          <span className={styles.handoffDriver}>
                            Driver assigned
                          </span>
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
                    {!isHandedOff &&
                      !isCooling &&
                      item.category === "Power Unit" &&
                      item.status === "In Service" && (
                        <div className={styles.availableChip}>
                          Available for handoff
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
                          <span
                            className={`${styles.complianceTag} ${regWarn}`}
                          >
                            {regWarn && (
                              <FontAwesomeIcon icon={faTriangleExclamation} />
                            )}
                            Plate/Reg:{" "}
                            {expiryLabel(item.registrationExpiration)}
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
                          <span
                            className={`${styles.complianceTag} ${iftaWarn}`}
                          >
                            {iftaWarn && (
                              <FontAwesomeIcon icon={faTriangleExclamation} />
                            )}
                            IFTA/IRP: {expiryLabel(item.iftaIrpExpiration)}
                          </span>
                        )}
                        {item.nextMaintenanceDue && (
                          <span
                            className={`${styles.complianceTag} ${maintWarn}`}
                          >
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
              className={`${styles.formGroup} ${
                form.equipmentType && formIsTrailer ? "" : styles.fullWidth
              }`}
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
              <input
                id="eq-reg-exp"
                type="date"
                className={styles.input}
                value={form.registrationExpiration}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    registrationExpiration: e.target.value,
                  }))
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Next Maintenance Due</label>
              <input
                id="eq-maint-due"
                type="date"
                className={styles.input}
                value={form.nextMaintenanceDue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nextMaintenanceDue: e.target.value }))
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
              <input
                id="eq-ins-exp"
                type="date"
                className={styles.input}
                value={form.insuranceExpiration}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    insuranceExpiration: e.target.value,
                  }))
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>IFTA / IRP Renewal Date</label>
              <input
                id="eq-ifta-exp"
                type="date"
                className={styles.input}
                value={form.iftaIrpExpiration}
                onChange={(e) =>
                  setForm((f) => ({ ...f, iftaIrpExpiration: e.target.value }))
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
                  <input
                    id="eq-lease-end"
                    type="date"
                    className={styles.input}
                    value={form.leaseEndDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, leaseEndDate: e.target.value }))
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
