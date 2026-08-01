import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faChevronLeft,
  faChevronRight,
  faIdCard,
  faTruck,
  faTriangleExclamation,
  faPlaneArrival,
  faPlaneDeparture,
  faMoneyBillWave,
  faBolt,
  faFilter,
  faClock,
  faWrench,
  faUserSlash,
  faUserCheck,
  faBriefcase,
} from "@fortawesome/free-solid-svg-icons";
import {
  getDrivers,
  getEquipment,
  getShipments,
  getTrips,
} from "../../api/api.js";
import styles from "./CalendarView.module.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_NAME_TO_INDEX = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "urgent", label: "Urgent ≤30d" },
  { id: "driver", label: "Drivers" },
  { id: "daysoff", label: "Days off" },
  { id: "equipment", label: "Equipment" },
  { id: "shipment", label: "Cargo deadlines" },
  { id: "fee", label: "Fees" },
  { id: "trip", label: "Trips" },
];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function daysUntil(date) {
  if (!date) return null;
  const t = startOfDay(new Date());
  const d = startOfDay(new Date(date));
  return Math.round((d - t) / 86400000);
}

function urgency(days) {
  if (days === null || days === undefined) return "ok";
  if (days < 0) return "expired";
  if (days <= 7) return "critical";
  if (days <= 30) return "warn";
  return "ok";
}

function fmtShort(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Normalize daysOff strings → Set of weekday indices 0–6 */
function parseDaysOff(daysOff) {
  const set = new Set();
  if (!Array.isArray(daysOff)) return set;
  daysOff.forEach((raw) => {
    const key = String(raw || "")
      .trim()
      .toLowerCase();
    if (!key) return;
    // allow "Saturday", "Sat", "sat."
    const cleaned = key.replace(/\./g, "");
    if (cleaned in DAY_NAME_TO_INDEX) {
      set.add(DAY_NAME_TO_INDEX[cleaned]);
      return;
    }
    // allow ranges like "Mon-Fri" for schedule (handled separately)
  });
  return set;
}

/** True if driver is on leave / unavailable for a specific calendar day */
function isDriverOffOnDate(driver, day) {
  if (!day) return false;
  const dayIdx = day.getDay();
  const offWeekdays = parseDaysOff(driver.daysOff);

  // Weekly day off (unless they opted into working on days off)
  if (offWeekdays.has(dayIdx) && !driver.availableOnDaysOff) {
    return true;
  }

  // Explicit leave statuses with optional date window
  const leaveStatuses = [
    "Vacation",
    "Sick Leave",
    "Absent",
    "Training",
    "Off Duty",
    "Terminated",
  ];
  if (leaveStatuses.includes(driver.status)) {
    const from = driver.availableFrom
      ? startOfDay(new Date(driver.availableFrom))
      : null;
    const until = driver.availableUntil
      ? startOfDay(new Date(driver.availableUntil))
      : null;
    if (!from && !until) return true; // status alone = off indefinitely
    if (from && until) return day >= from && day <= until;
    if (from) return day >= from;
    if (until) return day <= until;
  }

  return false;
}

function isDriverWorkingOnDate(driver, day) {
  if (!day) return false;
  if (["Terminated"].includes(driver.status)) return false;
  if (isDriverOffOnDate(driver, day)) return false;
  // Available / On Call / On Trip / Break count as "on the board"
  return (
    ["Available", "On Call", "On Trip", "Break"].includes(driver.status) ||
    ![
      "Vacation",
      "Sick Leave",
      "Absent",
      "Training",
      "Off Duty",
      "Terminated",
    ].includes(driver.status)
  );
}

/** Build calendar events from live ops data */
function buildEvents({ drivers, equipment, shipments, trips, year, month }) {
  const events = [];
  const today = startOfDay(new Date());
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Expand weekly days-off into concrete dates for the visible month
  drivers.forEach((d) => {
    const offWeekdays = parseDaysOff(d.daysOff);
    if (offWeekdays.size) {
      for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
        const date = startOfDay(new Date(year, month, dayNum));
        if (!offWeekdays.has(date.getDay())) continue;
        if (d.availableOnDaysOff) continue; // they can still work these days
        events.push({
          id: `daysoff-${d.id}-${date.toISOString().slice(0, 10)}`,
          date,
          category: "daysoff",
          kind: "daysoff",
          urgency: "ok",
          title: `Day off — ${d.name}`,
          detail: d.schedule
            ? `Usual schedule: ${d.schedule}`
            : "Weekly day off",
          meta: (d.daysOff || []).join(", "),
          driverId: d.id,
          driverName: d.name,
        });
      }
    }

    // Leave window events
    if (
      ["Vacation", "Sick Leave", "Absent", "Training", "Off Duty"].includes(
        d.status,
      )
    ) {
      const from = d.availableFrom
        ? startOfDay(new Date(d.availableFrom))
        : today;
      const until = d.availableUntil
        ? startOfDay(new Date(d.availableUntil))
        : from;
      // mark each day in range that falls in this month
      const cursor = new Date(from);
      while (cursor <= until) {
        if (cursor.getFullYear() === year && cursor.getMonth() === month) {
          events.push({
            id: `leave-${d.id}-${cursor.toISOString().slice(0, 10)}`,
            date: startOfDay(cursor),
            category: "driver",
            kind: "leave",
            urgency: "ok",
            title: `${d.status} — ${d.name}`,
            detail: d.statusReason || d.status,
            meta: until > from ? `Until ${fmtShort(until)}` : "",
            driverId: d.id,
            driverName: d.name,
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    if (d.medicalCertExpiration) {
      const days = daysUntil(d.medicalCertExpiration);
      events.push({
        id: `med-${d.id}`,
        date: startOfDay(new Date(d.medicalCertExpiration)),
        category: "driver",
        kind: "medical",
        urgency: urgency(days),
        title: `DOT medical — ${d.name}`,
        detail:
          days < 0
            ? `Expired ${Math.abs(days)}d ago`
            : days === 0
              ? "Expires today"
              : `Expires in ${days}d`,
        meta: d.employeeId ? `#${d.employeeId}` : "",
        driverId: d.id,
      });
    }
    if (d.licenseExpiration) {
      const days = daysUntil(d.licenseExpiration);
      events.push({
        id: `lic-${d.id}`,
        date: startOfDay(new Date(d.licenseExpiration)),
        category: "driver",
        kind: "license",
        urgency: urgency(days),
        title: `CDL license — ${d.name}`,
        detail:
          days < 0
            ? `Expired ${Math.abs(days)}d ago`
            : days === 0
              ? "Expires today"
              : `Expires in ${days}d`,
        meta: d.licenseClass ? `Class ${d.licenseClass}` : "",
        driverId: d.id,
      });
    }
  });

  equipment.forEach((e) => {
    if (e.registrationExpiration) {
      const days = daysUntil(e.registrationExpiration);
      events.push({
        id: `reg-${e.id}`,
        date: startOfDay(new Date(e.registrationExpiration)),
        category: "equipment",
        kind: "registration",
        urgency: urgency(days),
        title: `Registration — ${e.unitNumber}`,
        detail: days < 0 ? `Expired ${Math.abs(days)}d ago` : `Due in ${days}d`,
        meta: e.equipmentType || e.category || "",
      });
    }
    if (e.nextMaintenanceDue) {
      const days = daysUntil(e.nextMaintenanceDue);
      events.push({
        id: `maint-${e.id}`,
        date: startOfDay(new Date(e.nextMaintenanceDue)),
        category: "equipment",
        kind: "maintenance",
        urgency: urgency(days),
        title: `Maintenance — ${e.unitNumber}`,
        detail: days < 0 ? `Overdue ${Math.abs(days)}d` : `Due in ${days}d`,
        meta: e.equipmentType || "",
      });
    }
    if (e.status === "Out of Service") {
      events.push({
        id: `oos-${e.id}`,
        date: today,
        category: "equipment",
        kind: "oos",
        urgency: "critical",
        title: `Out of service — ${e.unitNumber}`,
        detail: e.outOfServiceReason || "Not available for dispatch",
        meta: e.equipmentType || "",
      });
    }
  });

  shipments.forEach((s) => {
    const awb = s.awbDisplay || s.airwaybillNumber || "AWB";
    if (s.type === "Import" && s.lastFreeDay) {
      const days = daysUntil(s.lastFreeDay);
      events.push({
        id: `lfd-${s.id}`,
        date: startOfDay(new Date(s.lastFreeDay)),
        category: "shipment",
        kind: "lfd",
        urgency: urgency(days),
        title: `Last free day — ${awb}`,
        detail:
          days < 0
            ? `${Math.abs(days)}d over · storage active`
            : days === 0
              ? "LFD today"
              : `${days}d until storage fees`,
        meta: s.airline?.name || s.warehouse?.name || "Import",
      });
    }
    if (s.type === "Export" && s.lockoutTime) {
      const hours = (new Date(s.lockoutTime) - new Date()) / 3600000;
      let urg = "ok";
      if (hours < 0) urg = "expired";
      else if (hours < 6) urg = "critical";
      else if (hours < 24) urg = "warn";
      events.push({
        id: `lock-${s.id}`,
        date: startOfDay(new Date(s.lockoutTime)),
        category: "shipment",
        kind: "lockout",
        urgency: urg,
        title: `Airline lockout — ${awb}`,
        detail:
          hours < 0 ? "Lockout passed" : `Cutoff ${fmtTime(s.lockoutTime)}`,
        meta: s.airline?.name || "Export",
      });
    }
    if (s.type === "Import") {
      const unpaid = [];
      if (s.terminalFee > 0 && !s.terminalFeePaid)
        unpaid.push(`Terminal $${s.terminalFee}`);
      if (
        s.storageFeePerDay > 0 &&
        !s.storageFeePaid &&
        daysUntil(s.lastFreeDay) < 0
      ) {
        unpaid.push(`Storage $${s.storageFeePerDay}/day`);
      }
      if (unpaid.length) {
        events.push({
          id: `fee-${s.id}`,
          date: today,
          category: "fee",
          kind: "unpaid",
          urgency: "critical",
          title: `Unpaid fees — ${awb}`,
          detail: unpaid.join(" · "),
          meta: s.warehouse?.name || "Import",
        });
      }
    }
  });

  trips.forEach((t) => {
    if (
      t.plannedDepartureTime &&
      t.status !== "Completed" &&
      t.status !== "Cancelled"
    ) {
      events.push({
        id: `trip-dep-${t.id}`,
        date: startOfDay(new Date(t.plannedDepartureTime)),
        category: "trip",
        kind: "departure",
        urgency:
          t.status === "En Route"
            ? "ok"
            : new Date(t.plannedDepartureTime) < new Date()
              ? "warn"
              : "ok",
        title: `${t.tripNumber || "Run"} · ${t.runType || ""} depart`,
        detail: `${fmtTime(t.plannedDepartureTime)} · ${t.driver?.name || "No driver"}`,
        meta: t.status,
      });
    }
    if (t.expectedCompletionTime && t.status === "En Route") {
      events.push({
        id: `trip-empty-${t.id}`,
        date: startOfDay(new Date(t.expectedCompletionTime)),
        category: "trip",
        kind: "empty",
        urgency:
          new Date(t.expectedCompletionTime) < new Date() ? "critical" : "ok",
        title: `${t.tripNumber || "Run"} · expected empty`,
        detail: fmtTime(t.expectedCompletionTime),
        meta: t.driver?.name || "",
      });
    }
  });

  return events;
}

function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const KIND_ICON = {
  medical: faIdCard,
  license: faIdCard,
  leave: faUserSlash,
  daysoff: faUserSlash,
  registration: faTruck,
  maintenance: faWrench,
  oos: faTriangleExclamation,
  lfd: faPlaneArrival,
  lockout: faPlaneDeparture,
  unpaid: faMoneyBillWave,
  departure: faBolt,
  empty: faClock,
};

export default function CalendarView() {
  const [drivers, setDrivers] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const [d, e, s, t] = await Promise.all([
        getDrivers(),
        getEquipment(),
        getShipments(),
        getTrips(),
      ]);
      setDrivers(d || []);
      setEquipment(e || []);
      setShipments(s || []);
      setTrips(t || []);
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

  const allEvents = useMemo(
    () =>
      buildEvents({
        drivers,
        equipment,
        shipments,
        trips,
        year: cursor.year,
        month: cursor.month,
      }),
    [drivers, equipment, shipments, trips, cursor.year, cursor.month],
  );

  const filteredEvents = useMemo(() => {
    return allEvents.filter((ev) => {
      if (filter === "all") return true;
      if (filter === "urgent")
        return (
          ev.urgency === "expired" ||
          ev.urgency === "critical" ||
          ev.urgency === "warn"
        );
      if (filter === "fee") return ev.category === "fee";
      if (filter === "daysoff")
        return ev.category === "daysoff" || ev.kind === "leave";
      if (filter === "driver")
        return ev.category === "driver" || ev.category === "daysoff";
      return ev.category === filter;
    });
  }, [allEvents, filter]);

  const cells = useMemo(
    () => monthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  const eventsByDayKey = useMemo(() => {
    const map = new Map();
    filteredEvents.forEach((ev) => {
      if (!ev.date) return;
      const key = `${ev.date.getFullYear()}-${ev.date.getMonth()}-${ev.date.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    });
    return map;
  }, [filteredEvents]);

  /** Per-day driver roster snapshot (independent of event filter for the side panel) */
  const dayRoster = useMemo(() => {
    if (!selectedDay) return { off: [], working: [] };
    const off = [];
    const working = [];
    drivers.forEach((d) => {
      if (d.employmentStatus === "Terminated" || d.status === "Terminated")
        return;
      if (isDriverOffOnDate(d, selectedDay)) {
        off.push(d);
      } else if (isDriverWorkingOnDate(d, selectedDay)) {
        working.push(d);
      }
    });
    off.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    working.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return { off, working };
  }, [drivers, selectedDay]);

  const dayEvents = useMemo(() => {
    if (!selectedDay) return [];
    const key = `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`;
    return (eventsByDayKey.get(key) || [])
      .filter((ev) => ev.kind !== "daysoff") // daysoff shown in roster panel instead
      .slice()
      .sort((a, b) => {
        const rank = { expired: 0, critical: 1, warn: 2, ok: 3 };
        return (rank[a.urgency] ?? 9) - (rank[b.urgency] ?? 9);
      });
  }, [selectedDay, eventsByDayKey]);

  const agenda = useMemo(() => {
    const today = startOfDay(new Date());
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 45);
    return filteredEvents
      .filter((ev) => {
        if (!ev.date) return false;
        // Don't flood agenda with every weekly day-off occurrence
        if (ev.kind === "daysoff") return false;
        return (
          ev.date >= new Date(today.getTime() - 7 * 86400000) &&
          ev.date <= horizon
        );
      })
      .sort((a, b) => {
        const rank = { expired: 0, critical: 1, warn: 2, ok: 3 };
        if (a.date - b.date !== 0) return a.date - b.date;
        return (rank[a.urgency] ?? 9) - (rank[b.urgency] ?? 9);
      })
      .slice(0, 40);
  }, [filteredEvents]);

  const brief = useMemo(() => {
    const med = allEvents.filter(
      (e) =>
        e.kind === "medical" &&
        (e.urgency === "expired" ||
          e.urgency === "critical" ||
          e.urgency === "warn"),
    ).length;
    const lic = allEvents.filter(
      (e) =>
        e.kind === "license" &&
        (e.urgency === "expired" ||
          e.urgency === "critical" ||
          e.urgency === "warn"),
    ).length;
    const maint = allEvents.filter(
      (e) =>
        (e.kind === "maintenance" || e.kind === "registration") &&
        e.urgency !== "ok",
    ).length;
    const fees = allEvents.filter((e) => e.category === "fee").length;
    const lock = allEvents.filter(
      (e) =>
        e.kind === "lockout" &&
        (e.urgency === "expired" || e.urgency === "critical"),
    ).length;
    const lfd = allEvents.filter(
      (e) =>
        e.kind === "lfd" &&
        (e.urgency === "expired" ||
          e.urgency === "critical" ||
          e.urgency === "warn"),
    ).length;
    const offToday = drivers.filter((d) =>
      isDriverOffOnDate(d, startOfDay(new Date())),
    ).length;
    return { med, lic, maint, fees, lock, lfd, offToday };
  }, [allEvents, drivers]);

  /** Count of drivers off per day for grid badge */
  const offCountByDay = useMemo(() => {
    const map = new Map();
    cells.forEach((day) => {
      if (!day) return;
      const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
      const n = drivers.filter((d) =>
        isDriverOffOnDate(d, startOfDay(day)),
      ).length;
      if (n > 0) map.set(key, n);
    });
    return map;
  }, [cells, drivers]);

  const prevMonth = () => {
    setCursor((c) => {
      const m = c.month - 1;
      return m < 0
        ? { year: c.year - 1, month: 11 }
        : { year: c.year, month: m };
    });
  };
  const nextMonth = () => {
    setCursor((c) => {
      const m = c.month + 1;
      return m > 11
        ? { year: c.year + 1, month: 0 }
        : { year: c.year, month: m };
    });
  };
  const goToday = () => {
    const n = new Date();
    setCursor({ year: n.getFullYear(), month: n.getMonth() });
    setSelectedDay(startOfDay(n));
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            <FontAwesomeIcon icon={faCalendarDays} /> Operations calendar
          </div>
          <h1>Calendar</h1>
          <p>
            Compliance, cargo deadlines, driver days off, and dispatch on one
            board.
          </p>
        </div>
        <button type="button" className={styles.todayBtn} onClick={goToday}>
          Today
        </button>
      </div>

      <section className={styles.brief}>
        <div className={styles.briefCard}>
          <FontAwesomeIcon icon={faUserSlash} />
          <div>
            <strong>{brief.offToday}</strong>
            <span>drivers off today</span>
          </div>
        </div>
        <div className={styles.briefCard}>
          <FontAwesomeIcon icon={faIdCard} />
          <div>
            <strong>{brief.med + brief.lic}</strong>
            <span>medical / license ≤30d</span>
          </div>
        </div>
        <div className={styles.briefCard}>
          <FontAwesomeIcon icon={faWrench} />
          <div>
            <strong>{brief.maint}</strong>
            <span>equipment due / overdue</span>
          </div>
        </div>
        <div className={styles.briefCard}>
          <FontAwesomeIcon icon={faPlaneDeparture} />
          <div>
            <strong>{brief.lock}</strong>
            <span>urgent export lockouts</span>
          </div>
        </div>
        <div
          className={`${styles.briefCard} ${brief.fees ? styles.briefDanger : ""}`}
        >
          <FontAwesomeIcon icon={faMoneyBillWave} />
          <div>
            <strong>{brief.fees}</strong>
            <span>unpaid fee items</span>
          </div>
        </div>
      </section>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.filters}>
        <FontAwesomeIcon icon={faFilter} className={styles.filterIcon} />
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${styles.filterChip} ${filter === f.id ? styles.filterChipActive : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loading}>Loading calendar…</div>
      ) : (
        <div className={styles.layout}>
          <section className={styles.monthPanel}>
            <div className={styles.monthHeader}>
              <button
                type="button"
                className={styles.navBtn}
                onClick={prevMonth}
                aria-label="Previous month"
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>
              <h2>
                {MONTHS[cursor.month]} {cursor.year}
              </h2>
              <button
                type="button"
                className={styles.navBtn}
                onClick={nextMonth}
                aria-label="Next month"
              >
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
            </div>
            <div className={styles.weekdays}>
              {WEEKDAYS.map((w) => (
                <div key={w} className={styles.weekday}>
                  {w}
                </div>
              ))}
            </div>
            <div className={styles.grid}>
              {cells.map((day, idx) => {
                if (!day)
                  return (
                    <div key={`pad-${idx}`} className={styles.cellEmpty} />
                  );
                const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                const list = eventsByDayKey.get(key) || [];
                const offN = offCountByDay.get(key) || 0;
                const isSelected = sameDay(day, selectedDay);
                const isToday = sameDay(day, new Date());
                const hasHot = list.some(
                  (e) => e.urgency === "expired" || e.urgency === "critical",
                );
                // Prefer non-daysoff dots so urgency stays visible
                const dots = list
                  .filter((e) => e.kind !== "daysoff")
                  .slice(0, 3);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`${styles.cell} ${isSelected ? styles.cellSelected : ""} ${isToday ? styles.cellToday : ""} ${hasHot ? styles.cellHot : ""} ${offN > 0 ? styles.cellHasOff : ""}`}
                    onClick={() => setSelectedDay(startOfDay(day))}
                  >
                    <span className={styles.cellDay}>{day.getDate()}</span>
                    <div className={styles.cellMeta}>
                      {offN > 0 && (
                        <span
                          className={styles.offBadge}
                          title={`${offN} driver${offN !== 1 ? "s" : ""} off`}
                        >
                          <FontAwesomeIcon icon={faUserSlash} />
                          {offN}
                        </span>
                      )}
                      <div className={styles.dots}>
                        {dots.map((ev) => (
                          <span
                            key={ev.id}
                            className={`${styles.dot} ${styles[`urg_${ev.urgency}`]}`}
                            title={ev.title}
                          />
                        ))}
                        {list.filter((e) => e.kind !== "daysoff").length >
                          3 && (
                          <span className={styles.moreDots}>
                            +
                            {list.filter((e) => e.kind !== "daysoff").length -
                              3}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className={styles.legend}>
              <span>
                <i className={styles.offBadgeLegend}>
                  <FontAwesomeIcon icon={faUserSlash} /> n
                </i>{" "}
                Drivers off
              </span>
              <span>
                <i className={`${styles.dot} ${styles.urg_expired}`} /> Expired
                / overdue
              </span>
              <span>
                <i className={`${styles.dot} ${styles.urg_critical}`} />{" "}
                Critical ≤7d
              </span>
              <span>
                <i className={`${styles.dot} ${styles.urg_warn}`} /> Within 30d
              </span>
              <span>
                <i className={`${styles.dot} ${styles.urg_ok}`} /> Scheduled
              </span>
            </div>
          </section>

          <aside className={styles.sidePanel}>
            <div className={styles.sideHeading}>
              <h3>{fmtShort(selectedDay)}</h3>
              <span>
                {dayRoster.off.length} off · {dayRoster.working.length} working
              </span>
            </div>

            {/* Driver roster for selected day */}
            <div className={styles.rosterBlock}>
              <div className={styles.rosterTitle}>
                <FontAwesomeIcon icon={faUserSlash} />
                Drivers off
              </div>
              {dayRoster.off.length === 0 ? (
                <p className={styles.emptySide}>
                  Nobody scheduled off this day.
                </p>
              ) : (
                <ul className={styles.rosterList}>
                  {dayRoster.off.map((d) => {
                    const weekly = parseDaysOff(d.daysOff).has(
                      selectedDay.getDay(),
                    );
                    const leave = [
                      "Vacation",
                      "Sick Leave",
                      "Absent",
                      "Training",
                      "Off Duty",
                    ].includes(d.status);
                    return (
                      <li key={d.id} className={styles.rosterItem}>
                        <div className={styles.rosterAvatar}>
                          {(d.name || "?").slice(0, 1)}
                        </div>
                        <div>
                          <strong>{d.name}</strong>
                          <span>
                            {leave
                              ? `${d.status}${d.statusReason ? ` · ${d.statusReason}` : ""}`
                              : weekly
                                ? `Weekly off · ${(d.daysOff || []).join(", ")}`
                                : "Unavailable"}
                          </span>
                          {d.schedule && <em>{d.schedule}</em>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className={styles.rosterTitle}>
                <FontAwesomeIcon icon={faUserCheck} />
                Available / working
              </div>
              {dayRoster.working.length === 0 ? (
                <p className={styles.emptySide}>
                  No drivers available this day.
                </p>
              ) : (
                <ul className={styles.rosterList}>
                  {dayRoster.working.map((d) => (
                    <li
                      key={d.id}
                      className={`${styles.rosterItem} ${styles.rosterWorking}`}
                    >
                      <div className={styles.rosterAvatarOn}>
                        {(d.name || "?").slice(0, 1)}
                      </div>
                      <div>
                        <strong>{d.name}</strong>
                        <span>
                          {d.status}
                          {d.schedule ? ` · ${d.schedule}` : ""}
                        </span>
                        {(d.preferredRunTypes || []).length > 0 && (
                          <em>{d.preferredRunTypes.join(", ")}</em>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.sideHeading}>
              <h3>Other events</h3>
              <span>
                {dayEvents.length} item{dayEvents.length !== 1 ? "s" : ""}
              </span>
            </div>
            {dayEvents.length === 0 ? (
              <p className={styles.emptySide}>
                No compliance or cargo events this day.
              </p>
            ) : (
              <ul className={styles.eventList}>
                {dayEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className={`${styles.eventItem} ${styles[`urgBorder_${ev.urgency}`]}`}
                  >
                    <div className={styles.eventIcon}>
                      <FontAwesomeIcon
                        icon={KIND_ICON[ev.kind] || faCalendarDays}
                      />
                    </div>
                    <div>
                      <strong>{ev.title}</strong>
                      <span>{ev.detail}</span>
                      {ev.meta && <em>{ev.meta}</em>}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className={styles.sideHeading}>
              <h3>Agenda</h3>
              <span>Next ~45 days</span>
            </div>
            <ul className={styles.agendaList}>
              {agenda.map((ev) => (
                <li key={ev.id} className={styles.agendaItem}>
                  <div className={styles.agendaDate}>
                    <strong>
                      {ev.date.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </strong>
                    <span
                      className={`${styles.pill} ${styles[`pill_${ev.urgency}`]}`}
                    >
                      {ev.urgency}
                    </span>
                  </div>
                  <div className={styles.agendaBody}>
                    <FontAwesomeIcon
                      icon={KIND_ICON[ev.kind] || faCalendarDays}
                    />
                    <div>
                      <strong>{ev.title}</strong>
                      <span>{ev.detail}</span>
                    </div>
                  </div>
                </li>
              ))}
              {agenda.length === 0 && (
                <p className={styles.emptySide}>Nothing in range.</p>
              )}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
