// src/pages/Handoff/HandoffView.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faKey,
  faTruckFront,
  faTruck,
  faTruckMoving,
  faVanShuttle,
  faClock,
  faHouse,
  faCircleCheck,
  faRotateLeft,
  faTriangleExclamation,
  faIdCard,
  faIdBadge,
  faUserCheck,
  faUserClock,
  faBell,
  faCalendarDay,
  faHistory,
  faArrowsRotate,
  faTrailer,
  faCheck,
  faXmark,
  faPen,
  faList,
} from "@fortawesome/free-solid-svg-icons";
import {
  getDrivers,
  getEquipment,
  updateDriverStatus,
  assignEquipment,
  getDriverHistory,
  getEquipmentHistory,
  swapEquipment,
  getActiveHandoffs,
} from "../../api/api.js";
import Modal from "../../components/Modal/Modal.jsx";
import styles from "./HandoffView.module.css";

// Statuses this board cares about
const BOARD_STATUSES = ["Available", "Break", "Off Duty", "On Call"];

const TYPE_ICONS = {
  Tractor: faTruckFront,
  "Straight Truck": faTruck,
  "Cube Truck": faTruckMoving,
  "Sprinter Van": faVanShuttle,
};

const CLASS_FALLBACK = {
  A: "Tractor",
  B: "Straight Truck",
  C: "Cube Truck",
  D: "Cube Truck",
};

const WORK_DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Swap reasons
const SWAP_REASONS = [
  { value: "MECHANICAL", label: "Mechanical Issue" },
  { value: "BREAKDOWN", label: "Breakdown" },
  { value: "MAINTENANCE", label: "Maintenance Required" },
  { value: "ROUTE_CHANGE", label: "Route Change" },
  { value: "DRIVER_REQUEST", label: "Driver Request" },
  { value: "DISPATCH", label: "Dispatch Decision" },
  { value: "TRAILER_SWAP", label: "Trailer Swap Only" },
  { value: "RELOCATION", label: "Equipment Relocation" },
];

const RETURN_REASONS = [
  { value: "SHIFT_END", label: "End of Shift" },
  { value: "BREAK", label: "Break (temporary)" },
  { value: "MAINTENANCE", label: "Maintenance Needed" },
  { value: "DAMAGE", label: "Damage Reported" },
  { value: "RELOCATION", label: "Relocation" },
];

function eligibleTypesFor(driver) {
  if (driver?.vehicleTypes?.length) return driver.vehicleTypes;
  const fallback = CLASS_FALLBACK[driver?.licenseClass];
  return fallback ? [fallback] : [];
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

function initials(name = "") {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatHour12(hhmm) {
  if (!hhmm) return "";
  const h = Number(String(hhmm).split(":")[0]);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${period}`;
}

function minutesUntil(value) {
  if (!value) return null;
  return Math.round((new Date(value).getTime() - Date.now()) / 60000);
}

function shiftStartToday(driver) {
  if (!driver?.shiftStart) return null;
  const [h] = String(driver.shiftStart).split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d;
}

function latenessAtCheckin(driver) {
  const expected = shiftStartToday(driver);
  if (!expected || !driver.lastCheckin) return null;
  if (!isSameDay(driver.lastCheckin, expected)) return null;
  return Math.round(
    (new Date(driver.lastCheckin).getTime() - expected.getTime()) / 60000,
  );
}

function minutesPastExpectedStart(driver) {
  const expected = shiftStartToday(driver);
  if (!expected) return null;
  const diff = Math.round((Date.now() - expected.getTime()) / 60000);
  return diff > 0 ? diff : null;
}

function isScheduledToday(driver) {
  if (!driver) return true;
  const dayKey = WORK_DAY_KEYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  if (Array.isArray(driver.daysOff) && driver.daysOff.length > 0) {
    if (driver.daysOff.includes(dayKey)) {
      return !!driver.availableOnDaysOff;
    }
    return true;
  }
  return true;
}

function isPastShiftEnd(driver) {
  if (!driver?.shiftEnd) return false;
  const [h] = String(driver.shiftEnd).split(":").map(Number);
  if (Number.isNaN(h)) return false;
  const end = new Date();
  end.setHours(h, 0, 0, 0);
  return Date.now() > end.getTime();
}

function formatDuration(minutes) {
  if (!minutes) return "0m";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

export default function HandoffView() {
  const [drivers, setDrivers] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [tick, setTick] = useState(0);
  const [selectedDriverHistory, setSelectedDriverHistory] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  // Smart switch: history modal can show the full record or scope it to a
  // recent window for quick safety/compliance lookups (e.g. "what has this
  // driver been operating in the last 30 days?").
  const [historyRange, setHistoryRange] = useState("30d");
  const [historyLoading, setHistoryLoading] = useState(false);

  const HISTORY_RANGES = [
    { value: "30d", label: "Last 30 Days", days: 30 },
    { value: "90d", label: "Last 90 Days", days: 90 },
    { value: "all", label: "All Time", days: null },
  ];

  // Check-in modal
  const [checkInDriver, setCheckInDriver] = useState(null);
  const [selectedTruckId, setSelectedTruckId] = useState(null);
  const [selectedTrailerId, setSelectedTrailerId] = useState(null);
  const [odometerStart, setOdometerStart] = useState("");
  const [fuelLevelStart, setFuelLevelStart] = useState("");

  // End-shift modal
  const [endShiftDriver, setEndShiftDriver] = useState(null);
  const [endShiftData, setEndShiftData] = useState({
    odometerEnd: "",
    fuelLevelEnd: "",
    damageReported: false,
    damageDescription: "",
    returnReason: "SHIFT_END",
    returnNote: "",
  });

  // Swap modal
  const [swapDriver, setSwapDriver] = useState(null);
  const [swapData, setSwapData] = useState({
    currentEquipmentId: "",
    newEquipmentId: "",
    trailerId: "",
    reason: "DRIVER_REQUEST",
    reasonNote: "",
  });

  const load = useCallback(async () => {
    try {
      setError("");
      const [driverData, equipmentData] = await Promise.all([
        getDrivers(),
        getEquipment(),
      ]);
      setDrivers(driverData);
      setEquipment(equipmentData);
    } catch (err) {
      setError(err.message || "Failed to load handoff board");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (tick % 2 === 1) load();
    }, 30000);
    return () => clearInterval(id);
  }, [load, tick]);

  const boardDrivers = useMemo(
    () => drivers.filter((d) => BOARD_STATUSES.includes(d.status)),
    [drivers],
  );

  const onShiftDrivers = useMemo(
    () =>
      boardDrivers.filter(
        (d) =>
          isSameDay(d.lastCheckin) &&
          (d.status === "Available" || d.status === "Break"),
      ),
    [boardDrivers],
  );

  const notCheckedInDrivers = useMemo(
    () =>
      boardDrivers.filter((d) => !onShiftDrivers.some((o) => o.id === d.id)),
    [boardDrivers, onShiftDrivers],
  );

  const now = Date.now();
  void tick;

  const availableTrucks = useMemo(
    () =>
      equipment.filter(
        (e) =>
          e.category === "Power Unit" &&
          e.status === "In Service" &&
          !e.assignedDriverId &&
          (!e.availableAt || new Date(e.availableAt).getTime() <= now),
      ),
    [equipment, now],
  );

  const availableTrailers = useMemo(
    () =>
      equipment.filter(
        (e) =>
          e.category === "Trailer" &&
          e.status === "In Service" &&
          !e.assignedDriverId,
      ),
    [equipment],
  );

  const cooldownTrucks = useMemo(
    () =>
      equipment.filter(
        (e) =>
          e.status === "In Service" &&
          e.availableAt &&
          new Date(e.availableAt).getTime() > now,
      ),
    [equipment, now],
  );

  const truckFor = useCallback(
    (driverId) => equipment.find((e) => e.assignedDriverId === driverId && e.category === "Power Unit"),
    [equipment],
  );

  const trailerFor = useCallback(
    (driverId) => equipment.find((e) => e.assignedDriverId === driverId && e.category === "Trailer"),
    [equipment],
  );

  const stats = useMemo(() => {
    const lateNotIn = notCheckedInDrivers.filter((d) => {
      if (!isScheduledToday(d)) return false;
      return minutesPastExpectedStart(d) != null;
    }).length;
    const onBreak = onShiftDrivers.filter((d) => d.status === "Break").length;
    const available = onShiftDrivers.filter(
      (d) => d.status === "Available",
    ).length;
    const onCall = notCheckedInDrivers.filter(
      (d) => d.status === "On Call",
    ).length;
    return {
      onShift: onShiftDrivers.length,
      available,
      onBreak,
      notCheckedIn: notCheckedInDrivers.length,
      late: lateNotIn,
      onCall,
      cooldown: cooldownTrucks.length,
    };
  }, [onShiftDrivers, notCheckedInDrivers, cooldownTrucks]);

  const openCheckIn = (driver) => {
    setError("");
    const eligible = eligibleTypesFor(driver);
    const recommended = availableTrucks.find((t) =>
      eligible.includes(t.equipmentType),
    );
    setSelectedTruckId(recommended?.id || null);
    setSelectedTrailerId(null);
    setOdometerStart("");
    setFuelLevelStart("");
    setCheckInDriver(driver);
  };

  const confirmCheckIn = async (e) => {
    e.preventDefault();
    if (!selectedTruckId) {
      setError("Please select a truck");
      return;
    }
    setBusyId(checkInDriver.id);
    try {
      const nowIso = new Date().toISOString();
      
      // Update driver status
      await updateDriverStatus(checkInDriver.id, {
        status: "Available",
        lastCheckin: nowIso,
        shiftStartTime: nowIso,
      });

      // Assign equipment with history logging
      await assignEquipment(selectedTruckId, {
        driverId: checkInDriver.id,
        action: "CHECKOUT",
        reason: "SHIFT_START",
        ...(selectedTrailerId && { trailerId: selectedTrailerId }),
        ...(odometerStart && { odometerStart: parseInt(odometerStart) }),
        ...(fuelLevelStart && { fuelLevelStart }),
        preTripCompleted: true,
      });

      setCheckInDriver(null);
      setSelectedTruckId(null);
      setSelectedTrailerId(null);
      await load();
    } catch (err) {
      setError(err.message || "Check-in failed");
    } finally {
      setBusyId(null);
    }
  };

  const returnEquipment = async (driver) => {
    const truck = truckFor(driver.id);
    if (!truck) {
      setError("No truck found to return");
      return;
    }

    setBusyId(driver.id);
    try {
      await assignEquipment(truck.id, {
        release: true,
        cooldownMinutes: 0,
        reason: endShiftData.returnReason,
        reasonNote: endShiftData.returnNote || "End of shift",
        odometerEnd: endShiftData.odometerEnd ? parseInt(endShiftData.odometerEnd) : undefined,
        fuelLevelEnd: endShiftData.fuelLevelEnd || undefined,
        damageDescription: endShiftData.damageReported ? endShiftData.damageDescription : undefined,
        postTripNotes: endShiftData.damageReported ? `Damage reported: ${endShiftData.damageDescription}` : "Post-trip inspection completed",
        postTripCompleted: true,
      });

      // Update driver status
      await updateDriverStatus(driver.id, {
        status: "Off Duty",
        shiftEndTime: new Date().toISOString(),
      });

      setEndShiftDriver(null);
      setEndShiftData({
        odometerEnd: "",
        fuelLevelEnd: "",
        damageReported: false,
        damageDescription: "",
        returnReason: "SHIFT_END",
        returnNote: "",
      });
      await load();
    } catch (err) {
      setError(err.message || "Return failed");
    } finally {
      setBusyId(null);
    }
  };

  const startBreak = async (driver) => {
    setBusyId(driver.id);
    try {
      await updateDriverStatus(driver.id, {
        status: "Break",
        breakUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      await load();
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const backToAvailable = async (driver) => {
    setBusyId(driver.id);
    try {
      await updateDriverStatus(driver.id, { status: "Available" });
      await load();
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const openSwap = (driver) => {
    const truck = truckFor(driver.id);
    if (!truck) {
      setError("Driver has no truck to swap");
      return;
    }
    setSwapDriver(driver);
    setSwapData({
      currentEquipmentId: truck.id,
      newEquipmentId: "",
      trailerId: trailerFor(driver.id)?.id || "",
      reason: "DRIVER_REQUEST",
      reasonNote: "",
    });
    setError("");
  };

  const confirmSwap = async () => {
    if (!swapData.newEquipmentId) {
      setError("Please select replacement equipment");
      return;
    }

    setBusyId(swapDriver.id);
    try {
      await swapEquipment(swapData.currentEquipmentId, {
        driverId: swapDriver.id,
        newEquipmentId: swapData.newEquipmentId,
        trailerId: swapData.trailerId || undefined,
        reason: swapData.reason,
        reasonNote: swapData.reasonNote || "Equipment swapped mid-shift",
      });

      setSwapDriver(null);
      await load();
    } catch (err) {
      setError(err.message || "Swap failed");
    } finally {
      setBusyId(null);
    }
  };

  const fetchHistory = async (driver, range) => {
    const rangeConfig = HISTORY_RANGES.find((r) => r.value === range) || HISTORY_RANGES[0];
    setHistoryLoading(true);
    try {
      const data = await getDriverHistory(driver.id, {
        limit: 50,
        ...(rangeConfig.days ? { days: rangeConfig.days } : {}),
      });
      setHistoryData(data);
    } catch (err) {
      setError(err.message || "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const viewHistory = async (driver) => {
    setError("");
    setSelectedDriverHistory(driver);
    setShowHistory(true);
    await fetchHistory(driver, historyRange);
  };

  const switchHistoryRange = async (range) => {
    setHistoryRange(range);
    if (selectedDriverHistory) {
      await fetchHistory(selectedDriverHistory, range);
    }
  };

  if (loading) {
    return <div className={styles.page}>Loading handoff board…</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Handoff Board</h1>
          <p className={styles.pageSub}>
            Check drivers in with equipment for the day, manage swaps, and track complete history.
          </p>
        </div>
        {cooldownTrucks.length > 0 && (
          <div className={styles.cooldownSummary}>
            <FontAwesomeIcon icon={faClock} />
            {cooldownTrucks.length} truck{cooldownTrucks.length > 1 ? "s" : ""} cooling down
            <span className={styles.cooldownDetail}>
              {cooldownTrucks
                .map((t) => {
                  const left = minutesUntil(t.availableAt);
                  return `${t.unitNumber} (${left != null && left > 0 ? `${left}m` : "soon"})`;
                })
                .join(" · ")}
            </span>
          </div>
        )}
      </div>

      {/* Stats strip */}
      <div className={styles.statsBar}>
        <div className={`${styles.statCard} ${styles.statOnShift}`}>
          <span className={styles.statValue}>{stats.onShift}</span>
          <span className={styles.statLabel}>On Shift</span>
        </div>
        <div className={`${styles.statCard} ${styles.statAvailable}`}>
          <span className={styles.statValue}>{stats.available}</span>
          <span className={styles.statLabel}>Available</span>
        </div>
        <div className={`${styles.statCard} ${styles.statBreak}`}>
          <span className={styles.statValue}>{stats.onBreak}</span>
          <span className={styles.statLabel}>On Break</span>
        </div>
        <div className={`${styles.statCard} ${styles.statNotIn}`}>
          <span className={styles.statValue}>{stats.notCheckedIn}</span>
          <span className={styles.statLabel}>Not Checked In</span>
        </div>
        {stats.late > 0 && (
          <div className={`${styles.statCard} ${styles.statLate}`}>
            <span className={styles.statValue}>{stats.late}</span>
            <span className={styles.statLabel}>Late</span>
          </div>
        )}
        {stats.cooldown > 0 && (
          <div className={`${styles.statCard} ${styles.statCooldown}`}>
            <span className={styles.statValue}>{stats.cooldown}</span>
            <span className={styles.statLabel}>Cooldown</span>
          </div>
        )}
      </div>

      {error && <div className={styles.formError}>{error}</div>}

      <div className={styles.board}>
        {/* ── Not checked in ── */}
        <section className={styles.column}>
          <div className={styles.columnHeader}>
            <span>Not Checked In</span>
            <span className={styles.columnCount}>
              {notCheckedInDrivers.length}
            </span>
          </div>
          <div className={styles.cardList}>
            {notCheckedInDrivers.length === 0 && (
              <div className={styles.emptyState}>
                Everyone eligible is on shift.
              </div>
            )}
            {notCheckedInDrivers.map((driver) => {
              const scheduled = isScheduledToday(driver);
              const pastStart = minutesPastExpectedStart(driver);
              const late = scheduled && pastStart != null;
              return (
                <div
                  key={driver.id}
                  className={`${styles.card} ${styles.cardIdle} ${late ? styles.cardLate : ""}`}
                >
                  <div className={styles.cardTop}>
                    {driver.photo ? (
                      <img
                        src={driver.photo}
                        alt={driver.name}
                        className={styles.avatarImg}
                      />
                    ) : (
                      <div className={styles.avatar}>
                        {initials(driver.name)}
                      </div>
                    )}
                    <div className={styles.driverInfo}>
                      <div className={styles.driverName}>{driver.name}</div>
                      <div className={styles.driverSubline}>
                        <FontAwesomeIcon
                          icon={faIdCard}
                          className={styles.iconSmall}
                        />
                        Class {driver.licenseClass}
                        {driver.vehicleTypes?.length > 0 && (
                          <>
                            <span className={styles.dot}>·</span>
                            {driver.vehicleTypes.join(", ")}
                          </>
                        )}
                        {driver.status === "On Call" && (
                          <span className={styles.onCallBadge}>
                            <FontAwesomeIcon icon={faBell} /> On Call
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.scheduleRow}>
                      <FontAwesomeIcon
                        icon={faCalendarDay}
                        className={styles.iconSmall}
                      />
                      {driver.shiftStart && driver.shiftEnd ? (
                        <span>
                          Shift {formatHour12(driver.shiftStart)} –{" "}
                          {formatHour12(driver.shiftEnd)}
                        </span>
                      ) : (
                        <span className={styles.textMuted}>
                          No shift times on file
                        </span>
                      )}
                    </div>
                    {!scheduled && (
                      <div className={styles.notScheduledTag}>
                        Not scheduled today
                        {driver.availableOnDaysOff
                          ? " (willing on day off)"
                          : ""}
                      </div>
                    )}
                    {late && (
                      <div className={styles.lateTag}>
                        <FontAwesomeIcon icon={faTriangleExclamation} />
                        Late by {pastStart} min
                      </div>
                    )}
                    {scheduled && !late && driver.shiftStart && (
                      <div className={styles.onTimeHint}>
                        <FontAwesomeIcon icon={faClock} />
                        Expected by {formatHour12(driver.shiftStart)}
                      </div>
                    )}

                    <button
                      className={styles.checkInBtn}
                      onClick={() => openCheckIn(driver)}
                      disabled={busyId === driver.id}
                    >
                      <FontAwesomeIcon icon={faKey} />
                      Check In
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── On shift ── */}
        <section className={styles.column}>
          <div className={styles.columnHeader}>
            <span>On Shift</span>
            <span className={styles.columnCount}>{onShiftDrivers.length}</span>
          </div>
          <div className={styles.cardList}>
            {onShiftDrivers.length === 0 && (
              <div className={styles.emptyState}>
                No one checked in yet today.
              </div>
            )}
            {onShiftDrivers.map((driver) => {
              const truck = truckFor(driver.id);
              const trailer = trailerFor(driver.id);
              const statusClass = driver.status?.replace(" ", "_") || "Unknown";
              const remaining =
                driver.status === "Break"
                  ? minutesUntil(driver.breakUntil)
                  : null;
              const breakOver = remaining !== null && remaining <= 0;
              const lateMins = latenessAtCheckin(driver);
              const pastEnd = isPastShiftEnd(driver);

              return (
                <div
                  key={driver.id}
                  className={`${styles.card} ${styles[`status_${statusClass}`]} ${breakOver ? styles.breakOverCard : ""}`}
                >
                  <div className={styles.cardTop}>
                    {driver.photo ? (
                      <img
                        src={driver.photo}
                        alt={driver.name}
                        className={styles.avatarImg}
                      />
                    ) : (
                      <div className={styles.avatar}>
                        {initials(driver.name)}
                      </div>
                    )}
                    <div className={styles.driverInfo}>
                      <div className={styles.driverName}>{driver.name}</div>
                      <div className={styles.driverSubline}>
                        <span
                          className={`${styles.statusBadge} ${styles[`status_${statusClass}`]}`}
                        >
                          {driver.status}
                        </span>
                        {driver.status === "Break" && (
                          <span
                            className={
                              breakOver
                                ? styles.breakOver
                                : styles.breakCountdown
                            }
                          >
                            <FontAwesomeIcon
                              icon={faClock}
                              className={styles.iconSmall}
                            />
                            {breakOver
                              ? "Break over — free for dispatch"
                              : `${remaining} min left`}
                          </span>
                        )}
                        <button
                          className={styles.historyBtn}
                          onClick={() => viewHistory(driver)}
                          title="View equipment history"
                        >
                          <FontAwesomeIcon icon={faHistory} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.equipmentRow}>
                      {truck ? (
                        <div className={styles.truckChip}>
                          <FontAwesomeIcon
                            icon={TYPE_ICONS[truck.equipmentType] || faTruck}
                          />
                          {truck.unitNumber} · {truck.equipmentType}
                        </div>
                      ) : (
                        <div className={styles.noTruckChip}>
                          <FontAwesomeIcon icon={faTriangleExclamation} />
                          No truck assigned
                        </div>
                      )}
                      {trailer && (
                        <div className={styles.trailerChip}>
                          <FontAwesomeIcon icon={faTrailer} />
                          {trailer.unitNumber} · Trailer
                        </div>
                      )}
                    </div>

                    <div className={styles.checkinMeta}>
                      <div className={styles.checkinTime}>
                        <FontAwesomeIcon
                          icon={faUserCheck}
                          className={styles.iconSmall}
                        />
                        Checked in {formatTime(driver.lastCheckin)}
                        {lateMins != null && (
                          <span
                            className={
                              lateMins > 5
                                ? styles.lateInline
                                : lateMins < -5
                                  ? styles.earlyInline
                                  : styles.onTimeInline
                            }
                          >
                            {lateMins > 5
                              ? ` · ${lateMins} min late`
                              : lateMins < -5
                                ? ` · ${Math.abs(lateMins)} min early`
                                : " · On time"}
                          </span>
                        )}
                      </div>
                      {driver.shiftStart && driver.shiftEnd && (
                        <div className={styles.scheduleRow}>
                          <FontAwesomeIcon
                            icon={faUserClock}
                            className={styles.iconSmall}
                          />
                          Scheduled {formatHour12(driver.shiftStart)} –{" "}
                          {formatHour12(driver.shiftEnd)}
                        </div>
                      )}
                      {pastEnd && (
                        <div className={styles.pastEndTag}>
                          <FontAwesomeIcon icon={faTriangleExclamation} />
                          Past scheduled end
                        </div>
                      )}
                    </div>

                    <div className={styles.cardActions}>
                      {!truck && (
                        <button
                          className={styles.secondaryBtn}
                          onClick={() => openCheckIn(driver)}
                          disabled={busyId === driver.id}
                        >
                          <FontAwesomeIcon icon={faKey} />
                          Assign Truck
                        </button>
                      )}
                      {breakOver ? (
                        <button
                          className={`${styles.manageBtn} ${styles.manageBtnPrimary}`}
                          onClick={() => backToAvailable(driver)}
                          disabled={busyId === driver.id}
                        >
                          <FontAwesomeIcon icon={faRotateLeft} />
                          {busyId === driver.id ? "Updating…" : "Make Available"}
                        </button>
                      ) : (
                        <>
                          {truck && (
                            <button
                              className={styles.swapBtn}
                              onClick={() => openSwap(driver)}
                              disabled={busyId === driver.id}
                            >
                              <FontAwesomeIcon icon={faArrowsRotate} />
                              Swap
                            </button>
                          )}
                          <button
                            className={styles.manageBtn}
                            onClick={() => setEndShiftDriver(driver)}
                            disabled={busyId === driver.id}
                          >
                            <FontAwesomeIcon icon={faHouse} />
                            Return
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Check-in modal ── */}
      <Modal
        isOpen={!!checkInDriver}
        onClose={() => setCheckInDriver(null)}
        title={`Check In ${checkInDriver?.name || ""}`}
        size="lg"
      >
        <form className={styles.form} onSubmit={confirmCheckIn}>
          {error && <div className={styles.formError}>{error}</div>}
          <p className={styles.formIntro}>
            <FontAwesomeIcon icon={faIdBadge} /> Class{" "}
            {checkInDriver?.licenseClass} ·{" "}
            {eligibleTypesFor(checkInDriver || {}).join(", ") ||
              "no vehicle types on file"}
          </p>
          {checkInDriver?.shiftStart && (
            <p className={styles.formSchedule}>
              <FontAwesomeIcon icon={faCalendarDay} /> Scheduled{" "}
              {formatHour12(checkInDriver.shiftStart)}
              {checkInDriver.shiftEnd
                ? ` – ${formatHour12(checkInDriver.shiftEnd)}`
                : ""}
              {(() => {
                const past = minutesPastExpectedStart(checkInDriver);
                if (past != null) {
                  return (
                    <span className={styles.lateInline}>
                      {" "}
                      · currently {past} min past start
                    </span>
                  );
                }
                return null;
              })()}
            </p>
          )}

          <div className={styles.formSection}>
            <label className={styles.sectionLabel}>Select Truck</label>
            <div className={styles.truckGrid}>
              {availableTrucks.length === 0 && (
                <div className={styles.emptyState}>
                  No trucks available right now.
                  {cooldownTrucks.length > 0 && (
                    <span> {cooldownTrucks.length} cooling down.</span>
                  )}
                </div>
              )}
              {availableTrucks
                .slice()
                .sort((a, b) => {
                  const eligible = eligibleTypesFor(checkInDriver || {});
                  const aRec = eligible.includes(a.equipmentType) ? 0 : 1;
                  const bRec = eligible.includes(b.equipmentType) ? 0 : 1;
                  return aRec - bRec;
                })
                .map((truck) => {
                  const eligible = eligibleTypesFor(checkInDriver || {});
                  const recommended = eligible.includes(truck.equipmentType);
                  return (
                    <button
                      type="button"
                      key={truck.id}
                      className={`${styles.truckOption} ${
                        selectedTruckId === truck.id
                          ? styles.truckOptionSelected
                          : ""
                      }`}
                      onClick={() => setSelectedTruckId(truck.id)}
                    >
                      <FontAwesomeIcon
                        icon={TYPE_ICONS[truck.equipmentType] || faTruck}
                      />
                      <div>
                        <div className={styles.truckOptionUnit}>
                          {truck.unitNumber}
                        </div>
                        <div className={styles.truckOptionType}>
                          {truck.equipmentType}
                        </div>
                      </div>
                      {recommended && (
                        <span className={styles.recommendedTag}>Recommended</span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          <div className={styles.formSection}>
            <label className={styles.sectionLabel}>Select Trailer (optional)</label>
            <div className={styles.trailerGrid}>
              <button
                type="button"
                className={`${styles.trailerOption} ${
                  selectedTrailerId === null ? styles.trailerOptionSelected : ""
                }`}
                onClick={() => setSelectedTrailerId(null)}
              >
                <FontAwesomeIcon icon={faXmark} />
                <div>No Trailer</div>
              </button>
              {availableTrailers.map((trailer) => (
                <button
                  type="button"
                  key={trailer.id}
                  className={`${styles.trailerOption} ${
                    selectedTrailerId === trailer.id
                      ? styles.trailerOptionSelected
                      : ""
                  }`}
                  onClick={() => setSelectedTrailerId(trailer.id)}
                >
                  <FontAwesomeIcon icon={faTrailer} />
                  <div>
                    <div className={styles.trailerOptionUnit}>
                      {trailer.unitNumber}
                    </div>
                    <div className={styles.trailerOptionType}>
                      {trailer.equipmentType || "Trailer"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Odometer (miles)</label>
              <input
                type="number"
                value={odometerStart}
                onChange={(e) => setOdometerStart(e.target.value)}
                placeholder="Enter odometer"
                className={styles.formInput}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Fuel Level</label>
              <select
                value={fuelLevelStart}
                onChange={(e) => setFuelLevelStart(e.target.value)}
                className={styles.formSelect}
              >
                <option value="">Select fuel level</option>
                <option value="Full">Full</option>
                <option value="3/4">3/4</option>
                <option value="1/2">1/2</option>
                <option value="1/4">1/4</option>
                <option value="Empty">Empty</option>
              </select>
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setCheckInDriver(null)}
            >
              Cancel
            </button>
            <button
              className={styles.primaryButton}
              disabled={!selectedTruckId || busyId === checkInDriver?.id}
            >
              <FontAwesomeIcon icon={faCircleCheck} />
              {busyId === checkInDriver?.id
                ? "Checking in…"
                : "Check In & Assign"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Return/End shift modal ── */}
      <Modal
        isOpen={!!endShiftDriver}
        onClose={() => setEndShiftDriver(null)}
        title={`Return Equipment — ${endShiftDriver?.name || ""}`}
        size="md"
      >
        <div className={styles.endShiftContent}>
          {error && <div className={styles.formError}>{error}</div>}

          <div className={styles.formGroup}>
            <label>Return Reason</label>
            <select
              value={endShiftData.returnReason}
              onChange={(e) =>
                setEndShiftData({ ...endShiftData, returnReason: e.target.value })
              }
              className={styles.formSelect}
            >
              {RETURN_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Additional Note</label>
            <input
              type="text"
              value={endShiftData.returnNote}
              onChange={(e) =>
                setEndShiftData({ ...endShiftData, returnNote: e.target.value })
              }
              placeholder="Any notes about the return?"
              className={styles.formInput}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>End Odometer (miles)</label>
              <input
                type="number"
                value={endShiftData.odometerEnd}
                onChange={(e) =>
                  setEndShiftData({ ...endShiftData, odometerEnd: e.target.value })
                }
                placeholder="Enter ending odometer"
                className={styles.formInput}
              />
            </div>
            <div className={styles.formGroup}>
              <label>End Fuel Level</label>
              <select
                value={endShiftData.fuelLevelEnd}
                onChange={(e) =>
                  setEndShiftData({ ...endShiftData, fuelLevelEnd: e.target.value })
                }
                className={styles.formSelect}
              >
                <option value="">Select fuel level</option>
                <option value="Full">Full</option>
                <option value="3/4">3/4</option>
                <option value="1/2">1/2</option>
                <option value="1/4">1/4</option>
                <option value="Empty">Empty</option>
              </select>
            </div>
          </div>

          <div className={styles.damageSection}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={endShiftData.damageReported}
                onChange={(e) =>
                  setEndShiftData({
                    ...endShiftData,
                    damageReported: e.target.checked,
                    damageDescription: e.target.checked
                      ? endShiftData.damageDescription
                      : "",
                  })
                }
              />
              Report Damage
            </label>
            {endShiftData.damageReported && (
              <div className={styles.formGroup}>
                <label>Damage Description</label>
                <textarea
                  value={endShiftData.damageDescription}
                  onChange={(e) =>
                    setEndShiftData({
                      ...endShiftData,
                      damageDescription: e.target.value,
                    })
                  }
                  placeholder="Describe any damage to the equipment"
                  className={styles.formTextarea}
                  rows={3}
                />
              </div>
            )}
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setEndShiftDriver(null)}
            >
              Cancel
            </button>
            <button
              className={styles.primaryButton}
              onClick={() => returnEquipment(endShiftDriver)}
              disabled={busyId === endShiftDriver?.id}
            >
              <FontAwesomeIcon icon={faCheck} />
              {busyId === endShiftDriver?.id ? "Returning…" : "Return Equipment"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Swap modal ── */}
      <Modal
        isOpen={!!swapDriver}
        onClose={() => setSwapDriver(null)}
        title={`Swap Equipment — ${swapDriver?.name || ""}`}
        size="lg"
      >
        <div className={styles.swapContent}>
          {error && <div className={styles.formError}>{error}</div>}

          <div className={styles.currentEquipment}>
            <p className={styles.swapLabel}>Current Equipment:</p>
            <div className={styles.swapCurrentChip}>
              <FontAwesomeIcon icon={faTruckFront} />
              {equipment.find((e) => e.id === swapData.currentEquipmentId)
                ?.unitNumber || "Unknown"}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Swap Reason</label>
            <select
              value={swapData.reason}
              onChange={(e) =>
                setSwapData({ ...swapData, reason: e.target.value })
              }
              className={styles.formSelect}
            >
              {SWAP_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Reason Note</label>
            <input
              type="text"
              value={swapData.reasonNote}
              onChange={(e) =>
                setSwapData({ ...swapData, reasonNote: e.target.value })
              }
              placeholder="Explain why equipment needs to be swapped"
              className={styles.formInput}
            />
          </div>

          <div className={styles.formSection}>
            <label className={styles.sectionLabel}>Select Replacement Truck</label>
            <div className={styles.truckGrid}>
              {availableTrucks
                .filter((t) => t.id !== swapData.currentEquipmentId)
                .map((truck) => (
                  <button
                    type="button"
                    key={truck.id}
                    className={`${styles.truckOption} ${
                      swapData.newEquipmentId === truck.id
                        ? styles.truckOptionSelected
                        : ""
                    }`}
                    onClick={() =>
                      setSwapData({ ...swapData, newEquipmentId: truck.id })
                    }
                  >
                    <FontAwesomeIcon
                      icon={TYPE_ICONS[truck.equipmentType] || faTruck}
                    />
                    <div>
                      <div className={styles.truckOptionUnit}>
                        {truck.unitNumber}
                      </div>
                      <div className={styles.truckOptionType}>
                        {truck.equipmentType}
                      </div>
                    </div>
                  </button>
                ))}
              {availableTrucks.filter((t) => t.id !== swapData.currentEquipmentId)
                .length === 0 && (
                <div className={styles.emptyState}>
                  No other trucks available for swap
                </div>
              )}
            </div>
          </div>

          <div className={styles.formSection}>
            <label className={styles.sectionLabel}>Trailer (optional)</label>
            <div className={styles.trailerGrid}>
              <button
                type="button"
                className={`${styles.trailerOption} ${
                  swapData.trailerId === "" ? styles.trailerOptionSelected : ""
                }`}
                onClick={() => setSwapData({ ...swapData, trailerId: "" })}
              >
                <FontAwesomeIcon icon={faXmark} />
                <div>No Trailer</div>
              </button>
              {availableTrailers.map((trailer) => (
                <button
                  type="button"
                  key={trailer.id}
                  className={`${styles.trailerOption} ${
                    swapData.trailerId === trailer.id
                      ? styles.trailerOptionSelected
                      : ""
                  }`}
                  onClick={() => setSwapData({ ...swapData, trailerId: trailer.id })}
                >
                  <FontAwesomeIcon icon={faTrailer} />
                  <div>
                    <div className={styles.trailerOptionUnit}>
                      {trailer.unitNumber}
                    </div>
                    <div className={styles.trailerOptionType}>
                      {trailer.equipmentType || "Trailer"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setSwapDriver(null)}
            >
              Cancel
            </button>
            <button
              className={styles.primaryButton}
              onClick={confirmSwap}
              disabled={!swapData.newEquipmentId || busyId === swapDriver?.id}
            >
              <FontAwesomeIcon icon={faArrowsRotate} />
              {busyId === swapDriver?.id ? "Swapping…" : "Confirm Swap"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── History modal ── */}
      <Modal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        title={`Equipment History — ${selectedDriverHistory?.name || ""}`}
        size="lg"
      >
        <div className={styles.historyContent}>
          <div className={styles.historyRangeToggle}>
            {HISTORY_RANGES.map((r) => (
              <button
                type="button"
                key={r.value}
                className={`${styles.historyRangeBtn} ${
                  historyRange === r.value ? styles.historyRangeBtnActive : ""
                }`}
                onClick={() => switchHistoryRange(r.value)}
                disabled={historyLoading}
              >
                {r.label}
              </button>
            ))}
          </div>

          {historyLoading && (
            <div className={styles.emptyState}>Loading history…</div>
          )}

          {!historyLoading && historyData && (
            <>
              <div className={styles.historySummary}>
                <div className={styles.historyStat}>
                  <span className={styles.historyStatValue}>
                    {historyData.summary?.totalHandoffs || 0}
                  </span>
                  <span className={styles.historyStatLabel}>
                    {historyRange === "all" ? "Total Handoffs" : "Handoffs"}
                  </span>
                </div>
                <div className={styles.historyStat}>
                  <span className={styles.historyStatValue}>
                    {historyData.summary?.uniqueEquipmentDriven || 0}
                  </span>
                  <span className={styles.historyStatLabel}>Unique Equipment</span>
                </div>
                <div className={styles.historyStat}>
                  <span className={styles.historyStatValue}>
                    {historyData.summary?.activeHandoffs || 0}
                  </span>
                  <span className={styles.historyStatLabel}>Active</span>
                </div>
              </div>

              <div className={styles.historyList}>
                {historyData.history?.length === 0 && (
                  <div className={styles.emptyState}>
                    {historyRange === "all"
                      ? "No equipment history found for this driver."
                      : "No equipment checked out in this window."}
                  </div>
                )}
                {historyData.history?.map((handoff) => (
                  <div key={handoff.id} className={styles.historyItem}>
                    <div className={styles.historyItemHeader}>
                      <div className={styles.historyItemAction}>
                        {handoff.action === "CHECKOUT" && (
                          <span className={styles.actionCheckout}>
                            <FontAwesomeIcon icon={faKey} /> Checked Out
                          </span>
                        )}
                        {handoff.action === "SWAP" && (
                          <span className={styles.actionSwap}>
                            <FontAwesomeIcon icon={faArrowsRotate} /> Swapped
                          </span>
                        )}
                        {handoff.action === "RETURN" && (
                          <span className={styles.actionReturn}>
                            <FontAwesomeIcon icon={faHouse} /> Returned
                          </span>
                        )}
                        {handoff.action === "REPLACE" && (
                          <span className={styles.actionReplace}>
                            <FontAwesomeIcon icon={faRotateLeft} /> Replaced
                          </span>
                        )}
                      </div>
                      <div className={styles.historyItemTime}>
                        <FontAwesomeIcon icon={faClock} />
                        {formatTime(handoff.checkOutTime)}
                      </div>
                    </div>

                    <div className={styles.historyItemBody}>
                      <div className={styles.historyItemEquipment}>
                        <FontAwesomeIcon icon={faTruckFront} />
                        {handoff.equipment?.unitNumber || "Unknown"}
                        {handoff.replacedEquipment && (
                          <span className={styles.historySwapArrow}>
                            → {handoff.replacedEquipment.unitNumber}
                          </span>
                        )}
                      </div>
                      {handoff.trailer && (
                        <div className={styles.historyItemTrailer}>
                          <FontAwesomeIcon icon={faTrailer} />
                          Trailer: {handoff.trailer.unitNumber}
                        </div>
                      )}
                      {handoff.reason && (
                        <div className={styles.historyItemReason}>
                          <span className={styles.historyItemReasonLabel}>
                            Reason:
                          </span>
                          {handoff.reason.replace("_", " ")}
                          {handoff.reasonNote && ` — ${handoff.reasonNote}`}
                        </div>
                      )}
                      {handoff.isActive === false && (
                        <div className={styles.historyItemReturned}>
                          <FontAwesomeIcon icon={faCheck} />
                          Returned at {formatTime(handoff.returnTime)}
                        </div>
                      )}
                      {handoff.damageReported && (
                        <div className={styles.historyItemDamage}>
                          <FontAwesomeIcon icon={faTriangleExclamation} />
                          Damage reported: {handoff.damageDescription}
                        </div>
                      )}
                      {handoff.odometerStart && handoff.odometerEnd && (
                        <div className={styles.historyItemMileage}>
                          <FontAwesomeIcon icon={faClock} />
                          {handoff.odometerEnd - handoff.odometerStart} miles
                          ({handoff.odometerStart} → {handoff.odometerEnd})
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
