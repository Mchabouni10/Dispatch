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
} from "@fortawesome/free-solid-svg-icons";
import {
  getDrivers,
  getEquipment,
  updateDriverStatus,
  assignEquipment,
} from "../../api/api.js";
import Modal from "../../components/Modal/Modal.jsx";
import styles from "./HandoffView.module.css";

// Statuses this board cares about. Leave statuses (Vacation/Sick Leave/Absent/Training),
// "On Trip" (owned by the Dispatch board) and "Terminated" are intentionally excluded.
const BOARD_STATUSES = ["Available", "Break", "Off Duty", "On Call"];

const TYPE_ICONS = {
  Tractor: faTruckFront,
  "Straight Truck": faTruck,
  "Cube Truck": faTruckMoving,
  "Sprinter Van": faVanShuttle,
};

// Fallback only — used when a driver has no vehicleTypes set on their profile.
// vehicleTypes (curated on the Drivers page) is the real source of truth, since a
// Class A CDL legally covers B/C equipment too and shouldn't be locked to Tractors only.
const CLASS_FALLBACK = {
  A: "Tractor",
  B: "Straight Truck",
  C: "Cube Truck",
  D: "Cube Truck",
};

const WORK_DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function eligibleTypesFor(driver) {
  if (driver.vehicleTypes?.length) return driver.vehicleTypes;
  const fallback = CLASS_FALLBACK[driver.licenseClass];
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

/** Today's scheduled shift-start Date, or null if no shiftStart on file. */
function shiftStartToday(driver) {
  if (!driver?.shiftStart) return null;
  const [h] = String(driver.shiftStart).split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d;
}

/** Minutes late at check-in (positive = late). Null if not comparable. */
function latenessAtCheckin(driver) {
  const expected = shiftStartToday(driver);
  if (!expected || !driver.lastCheckin) return null;
  if (!isSameDay(driver.lastCheckin, expected)) return null;
  return Math.round(
    (new Date(driver.lastCheckin).getTime() - expected.getTime()) / 60000,
  );
}

/** Minutes past scheduled start while still not checked in. Null if N/A or early. */
function minutesPastExpectedStart(driver) {
  const expected = shiftStartToday(driver);
  if (!expected) return null;
  const diff = Math.round((Date.now() - expected.getTime()) / 60000);
  return diff > 0 ? diff : null;
}

function isScheduledToday(driver) {
  if (!driver) return true;
  const dayKey =
    WORK_DAY_KEYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  // daysOff is the source of truth when present; otherwise assume scheduled
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

export default function HandoffView() {
  const [drivers, setDrivers] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null); // driver id currently mid-request, for button spinners
  const [tick, setTick] = useState(0); // forces countdown re-render

  // Check-in modal
  const [checkInDriver, setCheckInDriver] = useState(null);
  const [selectedTruckId, setSelectedTruckId] = useState(null);

  // End-shift modal
  const [endShiftDriver, setEndShiftDriver] = useState(null);

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

  // Live-refresh so break countdowns, cooldown timers, and lateness stay accurate
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      // Soft re-fetch every 60s so Equipment/Drivers changes from other pages appear
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
  // tick is intentionally read so available/cooldown lists recompute each interval
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
    (driverId) => equipment.find((e) => e.assignedDriverId === driverId),
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
    setCheckInDriver(driver);
  };

  const confirmCheckIn = async (e) => {
    e.preventDefault();
    if (!selectedTruckId) return;
    setBusyId(checkInDriver.id);
    try {
      const nowIso = new Date().toISOString();
      await updateDriverStatus(checkInDriver.id, {
        status: "Available",
        lastCheckin: nowIso,
        shiftStartTime: nowIso,
      });
      await assignEquipment(selectedTruckId, { driverId: checkInDriver.id });
      setCheckInDriver(null);
      setSelectedTruckId(null);
      await load();
    } catch (err) {
      setError(err.message || "Check-in failed");
    } finally {
      setBusyId(null);
    }
  };

  const backToAvailable = async (driver) => {
    setBusyId(driver.id);
    try {
      await updateDriverStatus(driver.id, { status: "Available" });
      setEndShiftDriver(null);
      await load();
    } catch (err) {
      setError(err.message || "Update failed");
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
      setEndShiftDriver(null);
      await load();
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const sendHome = async (driver) => {
    setBusyId(driver.id);
    try {
      await updateDriverStatus(driver.id, {
        status: "Off Duty",
        shiftEndTime: new Date().toISOString(),
      });
      const truck = truckFor(driver.id);
      if (truck) {
        await assignEquipment(truck.id, { release: true, cooldownMinutes: 60 });
      }
      setEndShiftDriver(null);
      await load();
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setBusyId(null);
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
            Check drivers in with a truck for the day, and manage breaks or
            end-of-shift.
          </p>
        </div>
        {cooldownTrucks.length > 0 && (
          <div className={styles.cooldownSummary}>
            <FontAwesomeIcon icon={faClock} />
            {cooldownTrucks.length} truck
            {cooldownTrucks.length > 1 ? "s" : ""} cooling down
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
        {/* ── Not checked in ─────────────────────────────────────── */}
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
                    {/* Schedule vs now */}
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

        {/* ── On shift ────────────────────────────────────────────── */}
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
                      </div>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
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
                          {busyId === driver.id
                            ? "Updating…"
                            : "Make Available"}
                        </button>
                      ) : (
                        <button
                          className={styles.manageBtn}
                          onClick={() => setEndShiftDriver(driver)}
                          disabled={busyId === driver.id}
                        >
                          Manage Shift
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Check-in modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={!!checkInDriver}
        onClose={() => setCheckInDriver(null)}
        title={`Check In ${checkInDriver?.name || ""}`}
        size="md"
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
                : "Check In & Assign Truck"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Manage shift modal — the 3-way choice ────────────────────── */}
      <Modal
        isOpen={!!endShiftDriver}
        onClose={() => setEndShiftDriver(null)}
        title={`Manage Shift — ${endShiftDriver?.name || ""}`}
        size="sm"
      >
        <div className={styles.endShiftContent}>
          <p>What would you like to do?</p>
          {error && <div className={styles.formError}>{error}</div>}

          <button
            className={styles.endShiftOption}
            onClick={() => backToAvailable(endShiftDriver)}
            disabled={
              busyId === endShiftDriver?.id ||
              endShiftDriver?.status === "Available"
            }
          >
            <FontAwesomeIcon icon={faRotateLeft} />
            <div>
              <div className={styles.endShiftOptionTitle}>
                Make Available Again
              </div>
              <div className={styles.endShiftOptionSub}>
                {endShiftDriver?.status === "Available"
                  ? "Already available."
                  : "Ends the break early — truck stays assigned."}
              </div>
            </div>
          </button>

          <button
            className={styles.endShiftOption}
            onClick={() => startBreak(endShiftDriver)}
            disabled={busyId === endShiftDriver?.id}
          >
            <FontAwesomeIcon icon={faClock} />
            <div>
              <div className={styles.endShiftOptionTitle}>30-Minute Break</div>
              <div className={styles.endShiftOptionSub}>
                Truck stays assigned to this driver.
              </div>
            </div>
          </button>

          <button
            className={`${styles.endShiftOption} ${styles.endShiftOptionDanger}`}
            onClick={() => sendHome(endShiftDriver)}
            disabled={busyId === endShiftDriver?.id}
          >
            <FontAwesomeIcon icon={faHouse} />
            <div>
              <div className={styles.endShiftOptionTitle}>Send Home</div>
              <div className={styles.endShiftOptionSub}>
                Driver goes Off Duty; truck is reserved for 1 hour before
                it&apos;s available again.
              </div>
            </div>
          </button>

          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => setEndShiftDriver(null)}
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
