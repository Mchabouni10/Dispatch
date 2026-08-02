import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faBoxesStacked,
  faCheck,
  faChevronRight,
  faClock,
  faLocationDot,
  faPlaneArrival,
  faPlaneDeparture,
  faPlus,
  faRoute,
  faTruck,
  faUser,
  faTriangleExclamation,
  faFlagCheckered,
  faDoorOpen,
  faPen,
  faTrash,
  faHouse,
  faRotateLeft,
  faUserClock,
  faUserPlus,
} from "@fortawesome/free-solid-svg-icons";
import {
  createTrip,
  deleteTrip,
  finishTrip,
  getAirlines,
  getDrivers,
  getEquipment,
  getShipments,
  getTrips,
  getWarehouses,
  startTrip,
  updateTrip,
} from "../../api/api.js";
import Modal from "../../components/Modal/Modal.jsx";
import StatusBadge from "../../components/StatusBadge/StatusBadge.jsx";
import AddBackupDriverModal from "./AddBackupDriverModal.jsx";
import styles from "./DispatchView.module.css";

const KNOWN_AWB_PREFIXES = {
  "020": "Lufthansa Cargo",
  "057": "Air France",
  "014": "Air Canada Cargo",
  "016": "United Cargo",
  "006": "Delta Cargo",
  125: "British Airways",
  "074": "KLM Cargo",
  160: "Cathay Pacific",
  176: "Emirates SkyCargo",
  "081": "Qantas Freight",
  618: "Singapore Airlines",
  999: "IAG Cargo",
  205: "ANA Cargo",
  131: "Japan Airlines",
};

function detectAirlineFromShipments(selectedShipments, airlinesList = []) {
  if (!selectedShipments || selectedShipments.length === 0) return null;
  const first = selectedShipments[0];
  if (first.airline) return first.airline;
  if (first.airlineId) {
    const byId = airlinesList.find((a) => a.id === first.airlineId);
    if (byId) return byId;
  }
  const awb = first.airwaybillNumber || first.awbDisplay || "";
  const digits = String(awb).replace(/\D/g, "");
  if (digits.length >= 3) {
    const prefix = digits.substring(0, 3);
    const matched = airlinesList.find((a) => a.awbPrefix === prefix);
    if (matched) return matched;
    if (KNOWN_AWB_PREFIXES[prefix]) {
      return { name: KNOWN_AWB_PREFIXES[prefix], awbPrefix: prefix };
    }
  }
  return null;
}

function detectWarehouseFromShipments(selectedShipments) {
  if (!selectedShipments || selectedShipments.length === 0) return null;
  const first = selectedShipments[0];
  if (first.warehouse) return first.warehouse;
  if (first.warehouseId)
    return { id: first.warehouseId, name: first.warehouse?.name };
  return null;
}

const EMPTY_FORM = {
  runType: "",
  driver: "",
  truck: "",
  trailer: "",
  shipments: [],
  plannedDepartureTime: "",
  expectedCompletionTime: "",
  notes: "",
  doorNumber: "",
};

const DOOR_OPTIONS = Array.from({ length: 30 }, (_, i) => String(i + 1));

function shortDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function shortTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Prefer backend-enriched awbDisplay, then prefix + number, then raw number */
function awbLabel(shipment) {
  if (shipment?.awbDisplay) return shipment.awbDisplay;
  const prefix = shipment?.airline?.awbPrefix;
  const num = shipment?.airwaybillNumber;
  if (prefix && num) return `${prefix}-${num}`;
  if (num) return num;
  if (shipment?.airwaybillNumbers?.length) {
    const list = shipment.airwaybillNumbers;
    return list.length > 1 ? `${list[0]} +${list.length - 1} more` : list[0];
  }
  return "AWB pending";
}

/**
 * Pieces / weight THIS trip actually carries for a shipment.
 * Prefer backend `allocation` (from TripShipmentSplit enrichment).
 * Fall back to trip.shipmentSplits, then full AWB totals if unsplit.
 *
 * Weight is proportional:
 *   round((piecesOnTrip / totalPieces) * totalWeight, 2)
 */
function proportionalWeight(piecesOnTrip, totalPieces, totalWeight) {
  if (!totalPieces || totalPieces <= 0) return 0;
  return Math.round((piecesOnTrip / totalPieces) * totalWeight * 100) / 100;
}

function tripAllocation(shipment, trip) {
  if (shipment?.allocation) {
    return {
      pieces: Number(shipment.allocation.pieces) || 0,
      weight: Number(shipment.allocation.weight) || 0,
      isPartial: !!shipment.allocation.isPartial,
    };
  }

  const totalPieces = Number(shipment?.pieces) || 0;
  const totalWeight = Number(shipment?.weight) || 0;

  const split = (trip?.shipmentSplits || []).find(
    (sp) => sp.shipmentId === shipment?.id,
  );
  if (split) {
    const pcs = Number(split.pieces) || 0;
    const w =
      Number.isFinite(Number(split.weight)) && Number(split.weight) > 0
        ? Number(split.weight)
        : proportionalWeight(pcs, totalPieces, totalWeight);
    return {
      pieces: pcs,
      weight: w,
      isPartial: totalPieces > 0 && pcs < totalPieces,
    };
  }

  return {
    pieces: totalPieces,
    weight: totalWeight,
    isPartial: false,
  };
}

function cutoffState(shipment) {
  if (shipment.type !== "Export" || !shipment.lockoutTime) return null;
  const hours = (new Date(shipment.lockoutTime) - new Date()) / 3600000;
  if (hours <= 0) return { label: "Lockout passed", urgent: true };
  if (hours < 6)
    return { label: `${Math.ceil(hours)}h to airline cutoff`, urgent: true };
  return { label: `Cutoff ${shortDate(shipment.lockoutTime)}`, urgent: false };
}

function toDatetimeLocal(date) {
  const d = date ? new Date(date) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isSameDay(a, b) {
  if (!a) return false;
  const d1 = new Date(a);
  const d2 = b || new Date();
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/** Break is over when breakUntil is in the past — soft-eligible for dispatch. */
function isBreakOver(driver) {
  if (driver?.status !== "Break" || !driver.breakUntil) return false;
  return new Date(driver.breakUntil).getTime() <= Date.now();
}

function isDispatchEligible(driver) {
  if (!driver) return false;
  if (driver.status === "Available" || driver.status === "On Call") return true;
  return isBreakOver(driver);
}

function checkedInToday(driver) {
  return isSameDay(driver?.lastCheckin);
}

/** Flexible power-unit detection — data may use "Power Unit", "Tractor", "Truck", etc. */
function isPowerUnit(e) {
  const cat = (e.category || "").toLowerCase();
  const type = (e.equipmentType || "").toLowerCase();
  return (
    cat.includes("power") ||
    cat === "truck" ||
    cat === "tractor" ||
    cat === "power unit" ||
    type.includes("truck") ||
    type.includes("tractor") ||
    type.includes("power") ||
    type.includes("straight") ||
    type.includes("cube")
  );
}

function isTrailer(e) {
  const cat = (e.category || "").toLowerCase();
  const type = (e.equipmentType || "").toLowerCase();
  return cat.includes("trailer") || type.includes("trailer");
}

function Lane({ shipment, compact = false }) {
  const isImport = shipment.type === "Import";
  const cutoff = cutoffState(shipment);
  return (
    <div className={`${styles.lane} ${compact ? styles.laneCompact : ""}`}>
      <div className={styles.lanePoint}>
        <FontAwesomeIcon icon={isImport ? faPlaneArrival : faLocationDot} />
        <span>
          {isImport
            ? `${shipment.airline?.code || "Airline"} cargo terminal`
            : shipment.warehouse?.name || "Origin warehouse"}
        </span>
      </div>
      <div className={styles.laneLine}>
        <FontAwesomeIcon icon={faChevronRight} />
      </div>
      <div className={styles.lanePoint}>
        <FontAwesomeIcon icon={isImport ? faLocationDot : faPlaneDeparture} />
        <span>
          {isImport
            ? shipment.warehouse?.name || "Destination warehouse"
            : `${shipment.airline?.code || "Airline"} cargo terminal`}
        </span>
      </div>
      {cutoff && (
        <span
          className={`${styles.cutoff} ${cutoff.urgent ? styles.cutoffUrgent : ""}`}
        >
          <FontAwesomeIcon icon={faClock} /> {cutoff.label}
        </span>
      )}
    </div>
  );
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function RunTimeline({ trip }) {
  const planned = trip.plannedDepartureTime
    ? new Date(trip.plannedDepartureTime)
    : null;
  const expected = trip.expectedCompletionTime
    ? new Date(trip.expectedCompletionTime)
    : null;
  if (!planned || !expected || expected <= planned) return null;

  const totalMs = expected - planned;
  const started = !!trip.startTime;
  const finished = trip.status === "Completed" && !!trip.finishTime;
  const startAt = trip.startTime ? new Date(trip.startTime) : null;
  const finishAt = trip.finishTime ? new Date(trip.finishTime) : null;
  const now = finished ? finishAt : new Date();

  // Progress is measured from planned window so the truck always sits on the same scale
  const elapsedFromPlan = now - planned;
  const pct = Math.min(1.05, Math.max(0, elapsedFromPlan / totalMs));
  const displayPct = Math.min(1, Math.max(0, pct));

  const departureLate = !started && planned < new Date();
  const runningLate = trip.status === "En Route" && now > expected;
  const completedLate = finished && finishAt > expected;
  const onTime = finished && !completedLate;

  const remainingMs = expected - now;
  const remainingLabel =
    remainingMs > 0
      ? `${formatDuration(remainingMs)} left`
      : `${formatDuration(-remainingMs)} over`;

  let phase = "scheduled";
  let trackClass = styles.trackScheduled;
  if (trip.status === "En Route") {
    phase = runningLate ? "overdue" : "active";
    trackClass = runningLate ? styles.trackOverdue : styles.trackActive;
  } else if (finished) {
    phase = completedLate ? "late" : "done";
    trackClass = completedLate ? styles.trackLate : styles.trackDone;
  } else if (departureLate) {
    phase = "waiting";
    trackClass = styles.trackWaiting;
  }

  const statusChip = (() => {
    if (phase === "scheduled")
      return { text: "Awaiting departure", cls: styles.chipIdle };
    if (phase === "waiting")
      return { text: "Departure overdue", cls: styles.chipWarn };
    if (phase === "active")
      return { text: remainingLabel, cls: styles.chipLive };
    if (phase === "overdue")
      return { text: remainingLabel, cls: styles.chipDanger };
    if (phase === "done") return { text: "On time", cls: styles.chipGood };
    if (phase === "late")
      return { text: "Finished late", cls: styles.chipWarn };
    return null;
  })();

  return (
    <div className={`${styles.timeline} ${styles[`phase_${phase}`] || ""}`}>
      {/* Top row: endpoints + live status chip */}
      <div className={styles.timelineHeader}>
        <div className={styles.endpoint}>
          <span className={styles.endpointDot} data-tone="start" />
          <div>
            <span className={styles.endpointLabel}>Depart</span>
            <strong>{shortTime(planned)}</strong>
            {started && (
              <em className={styles.actualNote}>actual {shortTime(startAt)}</em>
            )}
          </div>
        </div>

        {statusChip && (
          <div className={`${styles.statusChip} ${statusChip.cls}`}>
            {(phase === "active" || phase === "overdue") && (
              <span className={styles.livePulse} />
            )}
            {(phase === "waiting" ||
              phase === "overdue" ||
              phase === "late") && (
              <FontAwesomeIcon icon={faTriangleExclamation} />
            )}
            {phase === "done" && <FontAwesomeIcon icon={faFlagCheckered} />}
            {statusChip.text}
          </div>
        )}

        <div className={`${styles.endpoint} ${styles.endpointEnd}`}>
          <div>
            <span className={styles.endpointLabel}>Expected empty</span>
            <strong>{shortTime(expected)}</strong>
            {finished && (
              <em className={styles.actualNote}>
                actual {shortTime(finishAt)}
              </em>
            )}
          </div>
          <span className={styles.endpointDot} data-tone="end" />
        </div>
      </div>

      {/* The road */}
      <div className={styles.roadWrap}>
        <div className={`${styles.track} ${trackClass}`}>
          {/* dashed center line for “road” feel */}
          <div className={styles.roadDashes} aria-hidden />
          <div
            className={styles.trackFill}
            style={{ width: `${displayPct * 100}%` }}
          />
          {/* planned end marker */}
          <div className={styles.goalMark} title="Expected completion" />

          {/* Truck / flag marker */}
          {trip.status === "En Route" && (
            <div
              className={`${styles.truckMarker} ${runningLate ? styles.truckMarkerOverdue : ""}`}
              style={{ left: `${displayPct * 100}%` }}
            >
              <div className={styles.truckGlow} />
              <FontAwesomeIcon icon={faTruck} />
              <span className={styles.truckWake} />
            </div>
          )}
          {finished && (
            <div
              className={`${styles.truckMarkerDone} ${completedLate ? styles.truckMarkerLate : ""}`}
              style={{ left: `${Math.min(displayPct, 1) * 100}%` }}
            >
              <FontAwesomeIcon icon={faFlagCheckered} />
            </div>
          )}
          {!started && (
            <div className={styles.truckParked} style={{ left: "0%" }}>
              <FontAwesomeIcon icon={faTruck} />
            </div>
          )}
        </div>
      </div>

      {/* Bottom meta: window length + elapsed */}
      <div className={styles.timelineMeta}>
        <span>
          Window <strong>{formatDuration(totalMs)}</strong>
        </span>
        {started && !finished && (
          <span>
            Elapsed <strong>{formatDuration(now - startAt)}</strong>
          </span>
        )}
        {finished && startAt && (
          <span>
            Duration <strong>{formatDuration(finishAt - startAt)}</strong>
          </span>
        )}
        {onTime && (
          <span className={styles.metaGood}>Delivered inside window</span>
        )}
        {completedLate && (
          <span className={styles.metaWarn}>
            +{formatDuration(finishAt - expected)} past plan
          </span>
        )}
      </div>
    </div>
  );
}

export default function DispatchView() {
  const [trips, setTrips] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [airlines, setAirlines] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [deleteConfirmTrip, setDeleteConfirmTrip] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [handoffTrip, setHandoffTrip] = useState(null);
  const [handoffTime, setHandoffTime] = useState("");
  // After cargo handoff: ready for next run | 30-min break | end of shift
  const [handoffAction, setHandoffAction] = useState("available");
  const [handoffSaving, setHandoffSaving] = useState(false);

  // One truck/driver can't fit the whole manifest — add a linked backup run
  const [backupModalOpen, setBackupModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, s, d, e, a, w] = await Promise.all([
        getTrips(),
        getShipments(),
        getDrivers(),
        getEquipment(),
        getAirlines(),
        getWarehouses(),
      ]);
      setTrips(t);
      setShipments(s);
      setDrivers(d);
      setEquipment(e);
      setAirlines(a);
      setWarehouses(w);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-render every 30s while any run is En Route so the timeline truck keeps moving
  useEffect(() => {
    if (!trips.some((t) => t.status === "En Route")) return;
    const id = setInterval(() => setTrips((current) => [...current]), 30000);
    return () => clearInterval(id);
  }, [trips]);

  const availableShipments = useMemo(
    () => shipments.filter((s) => s.status === "Pending"),
    [shipments],
  );

  // Available | On Call | Break whose timer has expired (soft-available for dispatch)
  const availableDrivers = useMemo(
    () => drivers.filter(isDispatchEligible),
    [drivers],
  );

  const activeTrips = trips.filter(
    (t) => t.status !== "Completed" && t.status !== "Cancelled",
  );

  const busyEquipmentIds = useMemo(
    () =>
      new Set(
        activeTrips
          .filter((t) => !editingTrip || t.id !== editingTrip.id)
          .flatMap((t) => [t.truck?.id, t.trailer?.id].filter(Boolean)),
      ),
    [activeTrips, editingTrip],
  );

  // Map driverId → unit handed to them this morning (Handoff Board)
  const unitAssignedToDriver = useMemo(() => {
    const map = {};
    equipment.forEach((e) => {
      if (e.assignedDriverId) map[e.assignedDriverId] = e;
    });
    return map;
  }, [equipment]);

  const trucks = useMemo(
    () =>
      equipment.filter(
        (e) =>
          isPowerUnit(e) &&
          e.status === "In Service" &&
          !busyEquipmentIds.has(e.id) &&
          // Cooldown units are not really free yet
          (!e.availableAt || new Date(e.availableAt).getTime() <= Date.now()),
      ),
    [equipment, busyEquipmentIds],
  );
  const trailers = useMemo(
    () =>
      equipment.filter(
        (e) =>
          isTrailer(e) &&
          e.status === "In Service" &&
          !busyEquipmentIds.has(e.id) &&
          (!e.availableAt || new Date(e.availableAt).getTime() <= Date.now()),
      ),
    [equipment, busyEquipmentIds],
  );

  // Prefer: checked-in today → assigned to selected truck → break-over last → name
  const driverOptions = useMemo(() => {
    const list = [...availableDrivers];
    if (
      editingTrip &&
      editingTrip.driver &&
      !list.some((d) => d.id === editingTrip.driver.id)
    ) {
      list.unshift(editingTrip.driver);
    }

    const selectedTruckId = form.truck;
    list.sort((a, b) => {
      const aMatchTruck =
        selectedTruckId && unitAssignedToDriver[a.id]?.id === selectedTruckId
          ? 0
          : 1;
      const bMatchTruck =
        selectedTruckId && unitAssignedToDriver[b.id]?.id === selectedTruckId
          ? 0
          : 1;
      if (aMatchTruck !== bMatchTruck) return aMatchTruck - bMatchTruck;

      const aIn = checkedInToday(a) ? 0 : 1;
      const bIn = checkedInToday(b) ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn;

      const aBreak = isBreakOver(a) ? 1 : 0;
      const bBreak = isBreakOver(b) ? 1 : 0;
      if (aBreak !== bBreak) return aBreak - bBreak;

      return (a.name || "").localeCompare(b.name || "");
    });
    return list;
  }, [availableDrivers, editingTrip, form.truck, unitAssignedToDriver]);

  // Prefer truck already handed to the selected driver; then free units
  const truckOptions = useMemo(() => {
    let list =
      trucks.length > 0
        ? [...trucks]
        : equipment.filter(
            (e) =>
              e.status === "In Service" &&
              !busyEquipmentIds.has(e.id) &&
              !isTrailer(e) &&
              (!e.availableAt ||
                new Date(e.availableAt).getTime() <= Date.now()),
          );
    if (
      editingTrip &&
      editingTrip.truck &&
      !list.some((t) => t.id === editingTrip.truck.id)
    ) {
      list = [editingTrip.truck, ...list];
    }

    const preferredId = form.driver
      ? unitAssignedToDriver[form.driver]?.id
      : null;
    list.sort((a, b) => {
      const aPref = preferredId && a.id === preferredId ? 0 : 1;
      const bPref = preferredId && b.id === preferredId ? 0 : 1;
      if (aPref !== bPref) return aPref - bPref;
      // Units already assigned to someone else sort lower (still selectable if needed)
      const aOther =
        a.assignedDriverId && a.assignedDriverId !== form.driver ? 1 : 0;
      const bOther =
        b.assignedDriverId && b.assignedDriverId !== form.driver ? 1 : 0;
      if (aOther !== bOther) return aOther - bOther;
      return (a.unitNumber || "").localeCompare(b.unitNumber || "");
    });
    return list;
  }, [
    trucks,
    equipment,
    busyEquipmentIds,
    editingTrip,
    form.driver,
    unitAssignedToDriver,
  ]);

  const trailerOptions = useMemo(() => {
    let list =
      trailers.length > 0
        ? [...trailers]
        : equipment.filter(
            (e) =>
              e.status === "In Service" &&
              !busyEquipmentIds.has(e.id) &&
              isTrailer(e) &&
              (!e.availableAt ||
                new Date(e.availableAt).getTime() <= Date.now()),
          );
    if (
      editingTrip &&
      editingTrip.trailer &&
      !list.some((t) => t.id === editingTrip.trailer.id)
    ) {
      list = [editingTrip.trailer, ...list];
    }
    return list;
  }, [trailers, equipment, busyEquipmentIds, editingTrip]);

  function driverOptionLabel(d) {
    const parts = [d.name];
    if (d.phone) parts.push(d.phone);
    const tags = [];
    if (checkedInToday(d)) tags.push("checked in");
    const unit = unitAssignedToDriver[d.id];
    if (unit) tags.push(`has ${unit.unitNumber}`);
    if (isBreakOver(d)) tags.push("break over");
    else if (d.status === "On Call") tags.push("on call");
    if (tags.length) parts.push(`[${tags.join(" · ")}]`);
    return parts.join(" · ");
  }

  function truckOptionLabel(t) {
    const parts = [t.unitNumber, t.equipmentType || t.category].filter(Boolean);
    if (t.capacityLbs) parts.push(`${t.capacityLbs.toLocaleString()} lb`);
    if (form.driver && t.assignedDriverId === form.driver) {
      parts.push("★ their unit");
    } else if (t.assignedDriverId) {
      const owner = drivers.find((d) => d.id === t.assignedDriverId);
      parts.push(owner ? `with ${owner.name}` : "assigned");
    }
    return parts.join(" · ");
  }

  // Driver's morning handoff unit — locked when free and eligible
  const lockedTruckForDriver = useMemo(() => {
    if (!form.driver) return null;
    const unit = unitAssignedToDriver[form.driver];
    if (!unit || !isPowerUnit(unit)) return null;
    if (unit.status !== "In Service") return null;
    if (busyEquipmentIds.has(unit.id)) return null;
    if (unit.availableAt && new Date(unit.availableAt).getTime() > Date.now())
      return null;
    return unit;
  }, [form.driver, unitAssignedToDriver, busyEquipmentIds]);

  // When driver changes, force their morning handoff truck when available
  const selectDriver = (driverId) => {
    setForm((f) => {
      const next = { ...f, driver: driverId };
      if (!driverId) {
        next.truck = "";
        return next;
      }
      const unit = unitAssignedToDriver[driverId];
      if (
        unit &&
        isPowerUnit(unit) &&
        unit.status === "In Service" &&
        !busyEquipmentIds.has(unit.id) &&
        (!unit.availableAt ||
          new Date(unit.availableAt).getTime() <= Date.now())
      ) {
        next.truck = unit.id;
      }
      return next;
    });
  };

  // Does this trip's driver still have morning handoff on the trip truck/trailer?
  const handoffEquipmentStatus = useMemo(() => {
    if (!handoffTrip?.driverId && !handoffTrip?.driver?.id) {
      return { hasMorningHandoff: false, units: [] };
    }
    const driverId = handoffTrip.driverId || handoffTrip.driver?.id;
    const units = [];
    const truck = handoffTrip.truckId
      ? equipment.find((e) => e.id === handoffTrip.truckId) || handoffTrip.truck
      : handoffTrip.truck;
    const trailer = handoffTrip.trailerId
      ? equipment.find((e) => e.id === handoffTrip.trailerId) ||
        handoffTrip.trailer
      : handoffTrip.trailer;

    if (truck) {
      units.push({
        kind: "truck",
        unitNumber: truck.unitNumber,
        assignedToDriver: truck.assignedDriverId === driverId,
      });
    }
    if (trailer) {
      units.push({
        kind: "trailer",
        unitNumber: trailer.unitNumber,
        assignedToDriver: trailer.assignedDriverId === driverId,
      });
    }
    const hasMorningHandoff = units.some((u) => u.assignedToDriver);
    return { hasMorningHandoff, units, driverId };
  }, [handoffTrip, equipment]);

  // Manifest: pending shipments of selected run type (+ current trip cargo when editing)
  const manifestOptions = useMemo(() => {
    if (!form.runType) return [];
    const unassigned = availableShipments.filter(
      (s) => s.type === form.runType,
    );
    if (!editingTrip) return unassigned;
    const currentTripShipments = (editingTrip.shipments || []).filter(
      (s) => s.type === form.runType,
    );
    const map = new Map();
    unassigned.forEach((s) => map.set(s.id, s));
    currentTripShipments.forEach((s) => map.set(s.id, s));
    return Array.from(map.values());
  }, [availableShipments, form.runType, editingTrip]);

  const selectedShipments = manifestOptions.filter((s) =>
    form.shipments.includes(s.id),
  );

  // Route display derived purely from selected permits (already have airline + warehouse from create)
  const routeFromPermit = useMemo(() => {
    if (selectedShipments.length === 0)
      return { airline: null, warehouse: null, door: "" };
    const airline = detectAirlineFromShipments(selectedShipments, airlines);
    const warehouse = detectWarehouseFromShipments(selectedShipments);
    const door = selectedShipments.find((s) => s.doorNumber)?.doorNumber || "";
    return { airline, warehouse, door };
  }, [selectedShipments, airlines]);

  // Auto-fill door on export when permit has one
  useEffect(() => {
    if (!modalOpen || form.runType !== "Export") return;
    if (form.doorNumber) return;
    if (routeFromPermit.door) {
      setForm((f) => ({ ...f, doorNumber: String(routeFromPermit.door) }));
    }
  }, [modalOpen, form.runType, form.doorNumber, routeFromPermit.door]);

  const suggestedAirline = routeFromPermit.airline;

  const importCount = availableShipments.filter(
    (s) => s.type === "Import",
  ).length;
  const exportCount = availableShipments.filter(
    (s) => s.type === "Export",
  ).length;

  const chooseRunType = (runType) =>
    setForm((f) => ({ ...f, runType, shipments: [], doorNumber: "" }));

  const toggleShipment = (id) =>
    setForm((current) => ({
      ...current,
      shipments: current.shipments.includes(id)
        ? current.shipments.filter((value) => value !== id)
        : [...current.shipments, id],
    }));

  const openBuildRun = () => {
    setEditingTrip(null);
    setForm({
      ...EMPTY_FORM,
      plannedDepartureTime: toDatetimeLocal(new Date()),
    });
    setError("");
    setModalOpen(true);
  };

  const openEditRun = (trip) => {
    setEditingTrip(trip);
    setForm({
      runType: trip.runType || "",
      driver: trip.driverId || trip.driver?.id || "",
      truck: trip.truckId || trip.truck?.id || "",
      trailer: trip.trailerId || trip.trailer?.id || "",
      shipments: (trip.shipments || []).map((s) => s.id),
      plannedDepartureTime: trip.plannedDepartureTime
        ? toDatetimeLocal(trip.plannedDepartureTime)
        : toDatetimeLocal(new Date()),
      expectedCompletionTime: trip.expectedCompletionTime
        ? toDatetimeLocal(trip.expectedCompletionTime)
        : "",
      notes: trip.notes || "",
      doorNumber: trip.shipments?.find((s) => s.doorNumber)?.doorNumber || "",
    });
    setError("");
    setModalOpen(true);
  };

  const submitTrip = async (event) => {
    event.preventDefault();
    if (!form.runType) {
      setError("Choose Import or Export for this run.");
      return;
    }
    if (!form.shipments.length) {
      setError("Select at least one cargo shipment for this run.");
      return;
    }
    if (!form.driver) {
      setError("Select a driver.");
      return;
    }
    if (!form.truck) {
      setError("Select a power unit / truck.");
      return;
    }
    if (form.runType === "Export" && !form.doorNumber) {
      setError("Select the warehouse door number (1–30) for this export.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        driverId: form.driver,
        truckId: form.truck,
        trailerId: form.trailer || undefined,
        shipmentIds: form.shipments,
        runType: form.runType,
        plannedDepartureTime: form.plannedDepartureTime || undefined,
        expectedCompletionTime: form.expectedCompletionTime || undefined,
        notes: form.notes || "",
        doorNumber: form.runType === "Export" ? form.doorNumber : undefined,
      };

      if (editingTrip) {
        await updateTrip(editingTrip.id, payload);
      } else {
        await createTrip(payload);
      }

      setModalOpen(false);
      setEditingTrip(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteRun = async () => {
    if (!deleteConfirmTrip) return;
    setDeleting(true);
    setError("");
    try {
      await deleteTrip(deleteConfirmTrip.id);
      setDeleteConfirmTrip(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const startRun = async (trip) => {
    try {
      await startTrip(trip.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const openHandoff = (trip) => {
    setHandoffTrip(trip);
    setHandoffTime(toDatetimeLocal(new Date()));
    setHandoffAction("available");
    setError("");
  };

  const confirmHandoff = async (event) => {
    event.preventDefault();
    if (!handoffTrip) return;
    setHandoffSaving(true);
    setError("");
    try {
      await finishTrip(handoffTrip.id, {
        finishTime: handoffTime,
        postTripAction: handoffAction,
        // Match Handoff Board send-home cooldown so equipment stays reserved 1 hour
        cooldownMinutes: handoffAction === "send_home" ? 60 : undefined,
      });
      setHandoffTrip(null);
      setHandoffAction("available");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setHandoffSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            <FontAwesomeIcon icon={faBolt} /> Ground-to-air control tower
          </div>
          <h1>Air Cargo Dispatch</h1>
          <p>
            Connect every truck movement to a warehouse handoff and airline
            commitment.
          </p>
        </div>
        <button className={styles.primaryButton} onClick={openBuildRun}>
          <FontAwesomeIcon icon={faPlus} /> Build a run
        </button>
      </div>

      {error && !modalOpen && !handoffTrip && (
        <div className={styles.error}>{error}</div>
      )}

      <section className={styles.overview}>
        <div className={styles.metric}>
          <FontAwesomeIcon icon={faTruck} />
          <div>
            <strong>{activeTrips.length}</strong>
            <span>active ground runs</span>
          </div>
        </div>
        <div className={styles.metric}>
          <FontAwesomeIcon icon={faBoxesStacked} />
          <div>
            <strong>{availableShipments.length}</strong>
            <span>cargo ready to assign</span>
          </div>
        </div>
        <div className={styles.metric}>
          <FontAwesomeIcon icon={faUser} />
          <div>
            <strong>{availableDrivers.length}</strong>
            <span>drivers available</span>
          </div>
        </div>
        <div className={styles.metric}>
          <FontAwesomeIcon icon={faClock} />
          <div>
            <strong>
              {availableShipments.filter((s) => cutoffState(s)?.urgent).length}
            </strong>
            <span>cutoff-sensitive exports</span>
          </div>
        </div>
      </section>

      <div className={styles.layout}>
        <section className={styles.board}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Run board</h2>
              <span>Live truck movements and their cargo handoffs</span>
            </div>
            <span className={styles.count}>{activeTrips.length} open</span>
          </div>

          {loading ? (
            <div className={styles.empty}>Loading dispatch board…</div>
          ) : activeTrips.length === 0 ? (
            <div className={styles.empty}>
              <FontAwesomeIcon icon={faRoute} />
              <strong>No active runs yet</strong>
              <span>
                Build a run from ready cargo to connect the warehouse and
                airline sides.
              </span>
            </div>
          ) : (
            <div className={styles.tripList}>
              {activeTrips.map((trip) => (
                <article key={trip.id} className={styles.tripCard}>
                  <div className={styles.tripTop}>
                    <div>
                      <div className={styles.tripNumber}>
                        {trip.tripNumber}{" "}
                        {trip.runType && (
                          <span
                            className={`${styles.runTypeTag} ${trip.runType === "Export" ? styles.runTypeExport : ""}`}
                          >
                            {trip.runType}
                          </span>
                        )}
                      </div>
                      <div className={styles.tripMeta}>
                        {trip.driver?.name || "—"} ·{" "}
                        {trip.truck?.unitNumber || "—"}
                        {trip.trailer ? ` + ${trip.trailer.unitNumber}` : ""}
                      </div>
                    </div>
                    <div className={styles.tripActions}>
                      <button
                        type="button"
                        className={styles.actionIconButton}
                        title="Edit run"
                        onClick={() => openEditRun(trip)}
                      >
                        <FontAwesomeIcon icon={faPen} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionIconButton} ${styles.dangerIcon}`}
                        title="Cancel / Delete run"
                        onClick={() => setDeleteConfirmTrip(trip)}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                      <StatusBadge status={trip.status} />
                    </div>
                  </div>

                  {/* Route Flow (From Where to Where) */}
                  <div className={styles.tripRouteFlow}>
                    <span className={styles.routePoint}>
                      <FontAwesomeIcon
                        icon={
                          trip.runType === "Export"
                            ? faLocationDot
                            : faPlaneArrival
                        }
                      />
                      {trip.runType === "Export"
                        ? trip.shipments?.[0]?.warehouse?.name ||
                          "Origin Warehouse"
                        : trip.shipments?.[0]?.airline?.name
                          ? `${trip.shipments[0].airline.name} Cargo Terminal`
                          : "Air Cargo Terminal"}
                    </span>
                    <span className={styles.routeConnector}>
                      <FontAwesomeIcon icon={faChevronRight} />
                    </span>
                    <span className={styles.routePoint}>
                      <FontAwesomeIcon
                        icon={
                          trip.runType === "Export"
                            ? faPlaneDeparture
                            : faLocationDot
                        }
                      />
                      {trip.runType === "Export"
                        ? trip.shipments?.[0]?.airline?.name
                          ? `${trip.shipments[0].airline.name} Cargo Terminal${trip.shipments?.[0]?.doorNumber ? ` (Door ${trip.shipments[0].doorNumber})` : ""}`
                          : `Airline Terminal${trip.shipments?.[0]?.doorNumber ? ` (Door ${trip.shipments[0].doorNumber})` : ""}`
                        : trip.shipments?.[0]?.warehouse?.name ||
                          "Destination Warehouse"}
                    </span>
                  </div>

                  <RunTimeline trip={trip} />

                  <div className={styles.manifest}>
                    {(trip.shipments || []).map((shipment) => {
                      const alloc = tripAllocation(shipment, trip);
                      return (
                        <div key={shipment.id} className={styles.manifestRow}>
                          <div>
                            <span className={styles.direction}>
                              {shipment.type}
                            </span>
                            <strong>{awbLabel(shipment)}</strong>
                            <span>
                              {alloc.pieces} pcs · {alloc.weight}{" "}
                              {shipment.weightUnit || "lb"}
                              {alloc.isPartial
                                ? ` · of ${shipment.pieces} total`
                                : ""}
                              {shipment.airline?.name
                                ? ` · ${shipment.airline.name}`
                                : ""}
                              {shipment.doorNumber
                                ? ` · Door ${shipment.doorNumber}`
                                : ""}
                            </span>
                          </div>
                          <Lane shipment={shipment} compact />
                        </div>
                      );
                    })}
                    {(!trip.shipments || trip.shipments.length === 0) && (
                      <div className={styles.manifestRow}>
                        <div>
                          <span className={styles.direction}>—</span>
                          <strong>No shipments linked</strong>
                          <span>Check shipmentIds / relation</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={styles.tripFooter}>
                    <span>
                      {trip.status === "En Route"
                        ? `Departed ${shortDate(trip.startTime)}`
                        : "Scheduled — driver has not departed"}
                    </span>
                    {trip.status === "Scheduled" ? (
                      <button onClick={() => startRun(trip)}>
                        Start run <FontAwesomeIcon icon={faChevronRight} />
                      </button>
                    ) : (
                      <button
                        className={styles.complete}
                        onClick={() => openHandoff(trip)}
                      >
                        <FontAwesomeIcon icon={faCheck} /> Confirm handoff
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className={styles.readyPanel}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Ready cargo</h2>
              <span>Unassigned shipments</span>
            </div>
          </div>
          {availableShipments.length === 0 ? (
            <p className={styles.noCargo}>All cargo is assigned to a run.</p>
          ) : (
            availableShipments.slice(0, 6).map((shipment) => (
              <div key={shipment.id} className={styles.readyItem}>
                <div className={styles.readyTop}>
                  <span
                    className={`${styles.direction} ${shipment.type === "Export" ? styles.export : ""}`}
                  >
                    {shipment.type}
                  </span>
                  <strong>{awbLabel(shipment)}</strong>
                </div>
                <span>
                  {shipment.airline?.name || "—"} · {shipment.pieces} pcs
                  {shipment.doorNumber ? ` · Door ${shipment.doorNumber}` : ""}
                </span>
                <Lane shipment={shipment} compact />
              </div>
            ))
          )}
          {availableShipments.length > 6 && (
            <p className={styles.more}>
              +{availableShipments.length - 6} more ready shipments
            </p>
          )}
        </aside>
      </div>

      {/* ── Build / Edit Run modal ───────────────────────────────────── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingTrip
            ? `Edit run ${editingTrip.tripNumber}`
            : "Build an air-cargo run"
        }
        size="lg"
      >
        <form className={styles.form} onSubmit={submitTrip}>
          <p className={styles.formIntro}>
            Choose Import or Export, pick cargo permits (route auto-fills from
            the permit), assign the vehicle team, then set the timing window.
          </p>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.runTypePicker}>
            <button
              type="button"
              className={`${styles.runTypeBtn} ${form.runType === "Import" ? styles.runTypeBtnActive : ""}`}
              onClick={() => chooseRunType("Import")}
            >
              <FontAwesomeIcon icon={faPlaneArrival} /> Import{" "}
              <span>{importCount} ready</span>
            </button>
            <button
              type="button"
              className={`${styles.runTypeBtn} ${form.runType === "Export" ? styles.runTypeBtnActive : ""} ${form.runType === "Export" ? styles.runTypeBtnExport : ""}`}
              onClick={() => chooseRunType("Export")}
            >
              <FontAwesomeIcon icon={faPlaneDeparture} /> Export{" "}
              <span>{exportCount} ready</span>
            </button>
          </div>

          {/* Route display — filled from selected permits */}
          {form.runType && (
            <div className={styles.routeBanner}>
              <div className={styles.routeStep}>
                <span className={styles.routeBadge}>
                  {form.runType === "Export"
                    ? "PICKUP ORIGIN"
                    : "PICKUP TERMINAL"}
                </span>
                <div className={styles.routeInfo}>
                  <FontAwesomeIcon
                    icon={
                      form.runType === "Export" ? faLocationDot : faPlaneArrival
                    }
                  />
                  <strong>
                    {form.runType === "Export"
                      ? routeFromPermit.warehouse?.name ||
                        "Select cargo to show warehouse"
                      : suggestedAirline
                        ? `${suggestedAirline.name} Air Cargo Terminal`
                        : "Select cargo to show airline terminal"}
                  </strong>
                </div>
              </div>

              <div className={styles.routeArrow}>
                <FontAwesomeIcon icon={faChevronRight} />
                <span className={styles.routeTruckTag}>
                  <FontAwesomeIcon icon={faTruck} /> Ground Transit
                </span>
              </div>

              <div className={styles.routeStep}>
                <span className={styles.routeBadge}>
                  {form.runType === "Export"
                    ? "DELIVERY DESTINATION"
                    : "DELIVERY WAREHOUSE"}
                </span>
                <div className={styles.routeInfo}>
                  <FontAwesomeIcon
                    icon={
                      form.runType === "Export"
                        ? faPlaneDeparture
                        : faLocationDot
                    }
                  />
                  <strong>
                    {form.runType === "Export"
                      ? suggestedAirline
                        ? `${suggestedAirline.name} Cargo Terminal${form.doorNumber ? ` (Door ${form.doorNumber})` : ""}`
                        : `Select cargo to show airline${form.doorNumber ? ` (Door ${form.doorNumber})` : ""}`
                      : routeFromPermit.warehouse?.name ||
                        "Select cargo to show warehouse"}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Smart Airline Suggestion Banner */}
          {suggestedAirline && form.runType && selectedShipments.length > 0 && (
            <div className={styles.airlineSuggestionBanner}>
              <FontAwesomeIcon icon={faPlaneArrival} />
              <div>
                <strong>Route from permit: {suggestedAirline.name}</strong>
                <span>
                  {suggestedAirline.awbPrefix
                    ? `AWB Prefix ${suggestedAirline.awbPrefix} · `
                    : ""}
                  {form.runType === "Import"
                    ? `Pickup at airline terminal → deliver to ${routeFromPermit.warehouse?.name || "warehouse"}`
                    : `Pickup at ${routeFromPermit.warehouse?.name || "warehouse"} → deliver to airline terminal`}
                </span>
              </div>
            </div>
          )}

          <div className={styles.formGrid}>
            <label>
              Driver
              <select
                required
                value={form.driver}
                onChange={(e) => selectDriver(e.target.value)}
              >
                <option value="">Select driver</option>
                {driverOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {driverOptionLabel(d)}
                  </option>
                ))}
              </select>
              {form.driver && (
                <span className={styles.fieldHint}>
                  {(() => {
                    const d = drivers.find((x) => x.id === form.driver);
                    if (!d) return null;
                    const unit = unitAssignedToDriver[d.id];
                    if (isBreakOver(d)) {
                      return "Break ended — soft-available for dispatch (still shows Break on Handoff until cleared).";
                    }
                    if (unit) {
                      return `Morning handoff: ${unit.unitNumber} · auto-selected when free.`;
                    }
                    if (checkedInToday(d)) {
                      return "Checked in today — no unit on the Handoff board yet.";
                    }
                    return "Not checked in on the Handoff board today.";
                  })()}
                </span>
              )}
            </label>

            <label>
              Power unit / Truck
              <select
                required
                value={form.truck}
                disabled={!!lockedTruckForDriver}
                onChange={(e) =>
                  setForm((f) => ({ ...f, truck: e.target.value }))
                }
              >
                <option value="">
                  {truckOptions.length === 0
                    ? "No available power units"
                    : "Select in-service power unit"}
                </option>
                {truckOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {truckOptionLabel(t)}
                  </option>
                ))}
              </select>
              {lockedTruckForDriver ? (
                <span className={styles.fieldHintGood}>
                  Locked to morning handoff unit {lockedTruckForDriver.unitNumber}.
                  Change driver to pick a different truck.
                </span>
              ) : form.driver &&
                form.truck &&
                unitAssignedToDriver[form.driver]?.id === form.truck ? (
                <span className={styles.fieldHintGood}>
                  Matches this driver’s morning handoff unit.
                </span>
              ) : null}
            </label>

            <label>
              Trailer <span>(optional)</span>
              <select
                value={form.trailer}
                onChange={(e) =>
                  setForm((f) => ({ ...f, trailer: e.target.value }))
                }
              >
                <option value="">No trailer</option>
                {trailerOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.unitNumber} · {t.equipmentType || t.category}
                    {t.capacityLbs
                      ? ` · ${t.capacityLbs.toLocaleString()} lb`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            {form.runType === "Export" && (
              <label>
                <FontAwesomeIcon icon={faDoorOpen} style={{ marginRight: 6 }} />
                Warehouse door (1–30) *
                <select
                  required
                  value={form.doorNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, doorNumber: e.target.value }))
                  }
                >
                  <option value="">Select door…</option>
                  {DOOR_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      Door {n}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Dispatcher notes
              <input
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Dock, terminal or handling instructions"
              />
            </label>

            <label>
              Planned departure
              <input
                type="datetime-local"
                required
                value={form.plannedDepartureTime}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    plannedDepartureTime: e.target.value,
                  }))
                }
              />
            </label>

            <label>
              Expected completion <span>(driver empty)</span>
              <input
                type="datetime-local"
                required
                value={form.expectedCompletionTime}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    expectedCompletionTime: e.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className={styles.manifestPicker}>
            <div className={styles.pickerTitle}>
              Cargo manifest <span>{selectedShipments.length} selected</span>
            </div>
            {!form.runType ? (
              <p className={styles.noCargo}>
                Choose Import or Export above to see matching cargo.
              </p>
            ) : manifestOptions.length === 0 ? (
              <p className={styles.noCargo}>
                No pending {form.runType.toLowerCase()} shipments are available.
              </p>
            ) : (
              manifestOptions.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`${styles.pickRow} ${form.shipments.includes(s.id) ? styles.picked : ""}`}
                  onClick={() => toggleShipment(s.id)}
                >
                  <span className={styles.checkbox}>
                    <FontAwesomeIcon icon={faCheck} />
                  </span>
                  <div>
                    <strong>{awbLabel(s)}</strong>
                    <span>
                      {s.type} · {s.airline?.name || "—"} · {s.pieces} pcs /{" "}
                      {s.weight} {s.weightUnit || "lb"}
                      {s.warehouse?.name ? ` · ${s.warehouse.name}` : ""}
                      {s.doorNumber ? ` · Door ${s.doorNumber}` : ""}
                    </span>
                    <Lane shipment={s} compact />
                  </div>
                </button>
              ))
            )}
          </div>

          <div className={styles.formActions}>
            {editingTrip &&
              ["Scheduled", "En Route"].includes(editingTrip.status) && (
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() => setBackupModalOpen(true)}
                >
                  <FontAwesomeIcon icon={faUserPlus} /> Add backup driver
                </button>
              )}
            <button
              type="button"
              className={styles.cancel}
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </button>
            <button className={styles.primaryButton} disabled={saving}>
              {saving
                ? editingTrip
                  ? "Saving changes…"
                  : "Building run…"
                : editingTrip
                  ? "Save Changes"
                  : "Create dispatch run"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Add backup driver modal ─────────────────────────────────── */}
      {editingTrip && (
        <AddBackupDriverModal
          open={backupModalOpen}
          parentTrip={editingTrip}
          manifestShipments={editingTrip.shipments || []}
          awbLabel={awbLabel}
          unitAssignedToDriver={unitAssignedToDriver}
          driverOptions={availableDrivers.filter(
            (d) => d.id !== (editingTrip.driverId || editingTrip.driver?.id),
          )}
          driverOptionLabel={driverOptionLabel}
          truckOptions={trucks.filter(
            (t) => t.id !== (editingTrip.truckId || editingTrip.truck?.id),
          )}
          truckOptionLabel={truckOptionLabel}
          trailerOptions={trailers.filter(
            (t) => t.id !== (editingTrip.trailerId || editingTrip.trailer?.id),
          )}
          onClose={() => setBackupModalOpen(false)}
          onSaved={async () => {
            setBackupModalOpen(false);
            setModalOpen(false);
            setEditingTrip(null);
            setForm(EMPTY_FORM);
            await load();
          }}
        />
      )}

      {/* ── Confirm handoff modal ───────────────────────────────────── */}
      <Modal
        isOpen={!!handoffTrip}
        onClose={() => {
          setHandoffTrip(null);
          setHandoffAction("available");
        }}
        title={`Confirm Handoff${handoffTrip?.tripNumber ? ` — ${handoffTrip.tripNumber}` : ""}`}
        size="md"
      >
        <form className={styles.form} onSubmit={confirmHandoff}>
          <p className={styles.formIntro}>
            Record when the truck was reported empty, then choose what the
            driver does next. Equipment stays with them unless you send them
            home.
          </p>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.formGrid}>
            <label>
              Time reported empty
              <input
                type="datetime-local"
                required
                value={handoffTime}
                onChange={(e) => setHandoffTime(e.target.value)}
              />
            </label>
          </div>

          {(handoffTrip?.driver || handoffTrip?.truck) && (
            <div className={styles.handoffContext}>
              {handoffTrip.driver?.name && (
                <span>
                  <FontAwesomeIcon icon={faUser} /> {handoffTrip.driver.name}
                </span>
              )}
              {handoffTrip.truck?.unitNumber && (
                <span>
                  <FontAwesomeIcon icon={faTruck} />{" "}
                  {handoffTrip.truck.unitNumber}
                  {handoffTrip.trailer?.unitNumber
                    ? ` + ${handoffTrip.trailer.unitNumber}`
                    : ""}
                </span>
              )}
            </div>
          )}

          <div className={styles.handoffActionList}>
            <button
              type="button"
              className={`${styles.handoffOption} ${
                handoffAction === "available"
                  ? styles.handoffOptionSelected
                  : ""
              }`}
              onClick={() => setHandoffAction("available")}
            >
              <FontAwesomeIcon icon={faRotateLeft} />
              <div>
                <div className={styles.handoffOptionTitle}>
                  Ready for next run
                </div>
                <div className={styles.handoffOptionSub}>
                  Driver becomes Available. Truck
                  {handoffTrip?.trailer ? " and trailer stay" : " stays"}{" "}
                  assigned for the rest of the shift.
                </div>
              </div>
            </button>

            <button
              type="button"
              className={`${styles.handoffOption} ${
                handoffAction === "break" ? styles.handoffOptionSelected : ""
              }`}
              onClick={() => setHandoffAction("break")}
            >
              <FontAwesomeIcon icon={faUserClock} />
              <div>
                <div className={styles.handoffOptionTitle}>30-minute break</div>
                <div className={styles.handoffOptionSub}>
                  Driver is on Break and hidden from new dispatches until the
                  break ends. Equipment stays with them.
                </div>
              </div>
            </button>

            <button
              type="button"
              className={`${styles.handoffOption} ${styles.handoffOptionDanger} ${
                handoffAction === "send_home"
                  ? styles.handoffOptionSelected
                  : ""
              }`}
              onClick={() => setHandoffAction("send_home")}
            >
              <FontAwesomeIcon icon={faHouse} />
              <div>
                <div className={styles.handoffOptionTitle}>Send home</div>
                <div className={styles.handoffOptionSub}>
                  Driver goes Off Duty.{" "}
                  {handoffEquipmentStatus.hasMorningHandoff ? (
                    <>
                      {handoffEquipmentStatus.units
                        .filter((u) => u.assignedToDriver)
                        .map((u) => u.unitNumber)
                        .join(" + ")}{" "}
                      will release after a 1-hour cooldown.
                    </>
                  ) : (
                    <>
                      No morning handoff found on these units — only driver
                      status changes to Off Duty (nothing to release).
                    </>
                  )}
                </div>
              </div>
            </button>
          </div>

          {handoffAction === "send_home" &&
            !handoffEquipmentStatus.hasMorningHandoff && (
              <div className={styles.handoffWarn}>
                <FontAwesomeIcon icon={faTriangleExclamation} />
                <span>
                  This driver does not currently hold the trip truck
                  {handoffTrip?.trailer ? "/trailer" : ""} via the Handoff
                  Board. Sending home will set them Off Duty but will not free
                  equipment for another driver.
                </span>
              </div>
            )}

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancel}
              onClick={() => {
                setHandoffTrip(null);
                setHandoffAction("available");
              }}
            >
              Cancel
            </button>
            <button className={styles.primaryButton} disabled={handoffSaving}>
              {handoffSaving
                ? "Saving…"
                : handoffAction === "send_home"
                  ? "Confirm & send home"
                  : handoffAction === "break"
                    ? "Confirm & start break"
                    : "Confirm handoff"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete / Cancel run modal ────────────────────────────────── */}
      <Modal
        isOpen={Boolean(deleteConfirmTrip)}
        onClose={() => setDeleteConfirmTrip(null)}
        title="Cancel & Delete Run"
        size="md"
      >
        <div className={styles.deleteConfirmContent}>
          <div className={styles.deleteWarningHeader}>
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <span>Are you sure you want to cancel this run?</span>
          </div>
          <p>
            Deleting <strong>{deleteConfirmTrip?.tripNumber}</strong> will:
          </p>
          <ul>
            <li>
              Release driver{" "}
              <strong>
                {deleteConfirmTrip?.driver?.name || "assigned driver"}
              </strong>{" "}
              back to <em>Available</em> status.
            </li>
            <li>
              Revert{" "}
              <strong>
                {(deleteConfirmTrip?.shipments || []).length} cargo permit(s)
              </strong>{" "}
              back to <em>Pending</em> status.
            </li>
          </ul>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.confirmButtons}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setDeleteConfirmTrip(null)}
              disabled={deleting}
            >
              Keep Run
            </button>
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={confirmDeleteRun}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Cancel & Delete Run"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

