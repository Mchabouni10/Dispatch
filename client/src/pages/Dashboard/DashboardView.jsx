import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTruck,
  faIdCard,
  faPlaneArrival,
  faPlaneDeparture,
  faTriangleExclamation,
  faRotate,
  faCircleCheck,
  faClock,
  faWifi,
  faPlugCircleXmark,
  faBolt,
  faCalendarDays,
  faChartPie,
  faMoneyBillWave,
  faChevronRight,
  faFlagCheckered,
  faBoxesStacked,
  faUserCheck,
  faRoute,
} from "@fortawesome/free-solid-svg-icons";
import { io } from "socket.io-client";
import {
  getTrips,
  getDrivers,
  getShipments,
  getEquipment,
} from "../../api/api.js";
import StatusBadge from "../../components/StatusBadge/StatusBadge.jsx";
import styles from "./DashboardView.module.css";

const SOCKET_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SOCKET_URL) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_SOCKET_URL) ||
  "";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hoursUntil(dateStr) {
  if (!dateStr) return null;
  return (new Date(dateStr) - new Date()) / 3600000;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

function awbLabel(shipment) {
  if (shipment?.awbDisplay) return shipment.awbDisplay;
  const prefix = shipment?.airline?.awbPrefix;
  const num = shipment?.airwaybillNumber;
  if (prefix && num) return `${prefix}-${num}`;
  if (num) return num;
  const awbs = shipment?.airwaybillNumbers?.length
    ? shipment.airwaybillNumbers
    : [];
  return awbs.length > 1
    ? `${awbs[0]} +${awbs.length - 1}`
    : awbs[0] || "AWB pending";
}

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={styles.clock}>
      <FontAwesomeIcon icon={faClock} className={styles.clockIcon} />
      <div>
        <div className={styles.clockTime}>
          {now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>
        <div className={styles.clockDate}>
          {now.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </div>
      </div>
    </div>
  );
}

function CountdownChip({ hours }) {
  if (hours === null || hours === undefined) return null;
  if (hours < 0)
    return (
      <span className={`${styles.chip} ${styles.chipDanger}`}>Passed</span>
    );
  if (hours < 1)
    return (
      <span className={`${styles.chip} ${styles.chipDanger}`}>
        {Math.max(1, Math.round(hours * 60))}m left
      </span>
    );
  if (hours < 6)
    return (
      <span className={`${styles.chip} ${styles.chipWarn}`}>
        {hours.toFixed(1)}h left
      </span>
    );
  return (
    <span className={`${styles.chip} ${styles.chipInfo}`}>
      {Math.ceil(hours)}h left
    </span>
  );
}

export default function DashboardView() {
  const [trips, setTrips] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [refreshError, setRefreshError] = useState("");
  const socketRef = useRef(null);
  const loadRef = useRef(null);

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setRefreshError("");
    try {
      const [t, d, s, e] = await Promise.all([
        getTrips(),
        getDrivers(),
        getShipments(),
        getEquipment().catch(() => []),
      ]);
      setTrips(Array.isArray(t) ? t : []);
      setDrivers(Array.isArray(d) ? d : []);
      setShipments(Array.isArray(s) ? s : []);
      setEquipment(Array.isArray(e) ? e : []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error(err);
      setRefreshError(err.message || "Refresh failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  loadRef.current = load;

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const socket = io(SOCKET_URL || undefined, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketStatus("live");
      socket.emit("subscribe", { room: "dashboard" });
      loadRef.current?.(false);
    });

    socket.on("disconnect", () => setSocketStatus("offline"));
    socket.on("connect_error", () => setSocketStatus("offline"));

    socket.on("dashboard:snapshot", (payload) => {
      if (payload?.trips) setTrips(payload.trips);
      if (payload?.drivers) setDrivers(payload.drivers);
      if (payload?.shipments) setShipments(payload.shipments);
      setLastRefresh(new Date());
      setLoading(false);
    });

    const refresh = () => loadRef.current?.(false);
    socket.on("dashboard:refresh", refresh);
    socket.on("trip:updated", refresh);
    socket.on("trip:created", refresh);
    socket.on("driver:updated", refresh);
    socket.on("shipment:updated", refresh);
    socket.on("shipment:created", refresh);

    const upsert = (setter) => (doc) => {
      if (!doc?.id) return;
      setter((list) => {
        const i = list.findIndex((x) => x.id === doc.id);
        if (i === -1) return [doc, ...list];
        const next = list.slice();
        next[i] = { ...list[i], ...doc };
        return next;
      });
      setLastRefresh(new Date());
    };
    socket.on("trip:upsert", upsert(setTrips));
    socket.on("driver:upsert", upsert(setDrivers));
    socket.on("shipment:upsert", upsert(setShipments));

    socket.on("trip:removed", (id) => {
      setTrips((list) => list.filter((x) => x.id !== id));
      setLastRefresh(new Date());
    });
    socket.on("shipment:removed", (id) => {
      setShipments((list) => list.filter((x) => x.id !== id));
      setLastRefresh(new Date());
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (socketStatus === "live") return undefined;
    const interval = setInterval(() => loadRef.current?.(false), 30000);
    return () => clearInterval(interval);
  }, [socketStatus]);

  const handleRefresh = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    load(true);
  };

  const activeTrips = useMemo(
    () =>
      trips.filter((t) => t.status === "En Route" || t.status === "Scheduled"),
    [trips],
  );
  const enRoute = useMemo(
    () => trips.filter((t) => t.status === "En Route"),
    [trips],
  );
  const availableDrivers = useMemo(
    () =>
      drivers.filter((d) => d.status === "Available" || d.status === "On Call"),
    [drivers],
  );
  const pendingImports = useMemo(
    () =>
      shipments.filter((s) => s.type === "Import" && s.status === "Pending"),
    [shipments],
  );
  const pendingExports = useMemo(
    () =>
      shipments.filter((s) => s.type === "Export" && s.status === "Pending"),
    [shipments],
  );

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, [lastRefresh]);

  /** Unified alert stream — severity ranked for a single attention feed */
  const alerts = useMemo(() => {
    const list = [];

    shipments.forEach((s) => {
      if (
        s.type === "Import" &&
        s.lastFreeDay &&
        (s.status === "Pending" || s.status === "Assigned")
      ) {
        const days = daysUntil(s.lastFreeDay);
        if (days !== null && days < 0) {
          list.push({
            id: `lfd-${s.id}`,
            severity: "critical",
            category: "Import · storage",
            title: `Storage active · ${awbLabel(s)}`,
            body: `${s.airline?.name || "Airline"} · ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} over LFD · ORD ${s.ordNumber || "—"}`,
            meta: s.warehouse?.name,
            href: "/imports",
            icon: faPlaneArrival,
          });
        } else if (days !== null && days <= 1) {
          list.push({
            id: `lfd-soon-${s.id}`,
            severity: "warning",
            category: "Import · LFD",
            title: `Last free day ${days === 0 ? "today" : "tomorrow"} · ${awbLabel(s)}`,
            body: `${s.airline?.name || "Airline"} · move before storage starts`,
            meta: s.warehouse?.name,
            href: "/imports",
            icon: faPlaneArrival,
          });
        }
      }

      if (s.type === "Import") {
        const feeBits = [];
        if (s.terminalFee > 0 && !s.terminalFeePaid)
          feeBits.push(`Terminal $${s.terminalFee}`);
        if (
          s.storageFeePerDay > 0 &&
          !s.storageFeePaid &&
          daysUntil(s.lastFreeDay) < 0
        ) {
          feeBits.push(`Storage $${s.storageFeePerDay}/day`);
        }
        if (feeBits.length) {
          list.push({
            id: `fee-${s.id}`,
            severity: "warning",
            category: "Fees unpaid",
            title: `${awbLabel(s)} · ${feeBits.join(" · ")}`,
            body: s.airline?.name || "Import permit",
            meta: s.warehouse?.name,
            href: "/imports",
            icon: faMoneyBillWave,
          });
        }
      }

      if (
        s.type === "Export" &&
        s.lockoutTime &&
        (s.status === "Pending" || s.status === "Assigned")
      ) {
        const hrs = hoursUntil(s.lockoutTime);
        if (hrs !== null && hrs < 6) {
          list.push({
            id: `lock-${s.id}`,
            severity: hrs < 0 ? "critical" : hrs < 2 ? "critical" : "warning",
            category: "Export · lockout",
            title: `${hrs < 0 ? "Lockout passed" : "Lockout soon"} · ${awbLabel(s)}`,
            body: `${s.airline?.name || "Airline"} · cutoff ${formatDate(s.lockoutTime)}`,
            meta: s.warehouse?.name,
            href: "/exports",
            icon: faPlaneDeparture,
            hours: hrs,
          });
        }
      }
    });

    drivers.forEach((d) => {
      const med = daysUntil(d.medicalCertExpiration);
      if (med !== null && med <= 30) {
        list.push({
          id: `med-${d.id}`,
          severity: med < 0 ? "critical" : med <= 7 ? "critical" : "warning",
          category: "Driver · DOT medical",
          title: `${d.name} · medical ${med < 0 ? "expired" : `in ${med}d`}`,
          body:
            med < 0
              ? `Expired ${Math.abs(med)} days ago`
              : "Renew before next tractor dispatch",
          href: "/drivers",
          icon: faIdCard,
        });
      }
      const lic = daysUntil(d.licenseExpiration);
      if (lic !== null && lic <= 30) {
        list.push({
          id: `lic-${d.id}`,
          severity: lic < 0 ? "critical" : lic <= 7 ? "critical" : "warning",
          category: "Driver · CDL",
          title: `${d.name} · license ${lic < 0 ? "expired" : `in ${lic}d`}`,
          body: d.licenseClass
            ? `Class ${d.licenseClass}`
            : "CDL renewal needed",
          href: "/drivers",
          icon: faIdCard,
        });
      }
    });

    equipment.forEach((e) => {
      const reg = daysUntil(e.registrationExpiration);
      if (reg !== null && reg <= 30) {
        list.push({
          id: `reg-${e.id}`,
          severity: reg < 0 ? "critical" : reg <= 7 ? "critical" : "info",
          category: "Equipment · registration",
          title: `${e.unitNumber} · reg ${reg < 0 ? "expired" : `due in ${reg}d`}`,
          body: e.equipmentType || e.category || "Unit",
          href: "/equipment",
          icon: faTruck,
        });
      }
      const maint = daysUntil(e.nextMaintenanceDue);
      if (maint !== null && maint <= 14) {
        list.push({
          id: `maint-${e.id}`,
          severity: maint < 0 ? "critical" : "info",
          category: "Equipment · maintenance",
          title: `${e.unitNumber} · service ${maint < 0 ? "overdue" : `in ${maint}d`}`,
          body: e.equipmentType || "Fleet unit",
          href: "/equipment",
          icon: faTruck,
        });
      }
    });

    // Late / overdue departures
    activeTrips.forEach((t) => {
      if (
        t.status === "Scheduled" &&
        t.plannedDepartureTime &&
        new Date(t.plannedDepartureTime) < new Date()
      ) {
        list.push({
          id: `late-dep-${t.id}`,
          severity: "warning",
          category: "Dispatch",
          title: `${t.tripNumber} · departure overdue`,
          body: `${t.driver?.name || "Driver"} · planned ${formatTime(t.plannedDepartureTime)}`,
          href: "/dispatch",
          icon: faBolt,
        });
      }
      if (
        t.status === "En Route" &&
        t.expectedCompletionTime &&
        new Date(t.expectedCompletionTime) < new Date()
      ) {
        list.push({
          id: `late-empty-${t.id}`,
          severity: "warning",
          category: "Dispatch",
          title: `${t.tripNumber} · past expected empty`,
          body: `${t.driver?.name || "Driver"} · expected ${formatTime(t.expectedCompletionTime)}`,
          href: "/dispatch",
          icon: faRoute,
        });
      }
    });

    const rank = { critical: 0, warning: 1, info: 2 };
    return list.sort(
      (a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9),
    );
  }, [shipments, drivers, equipment, activeTrips]);

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  const completedToday = useMemo(() => {
    return trips.filter((t) => {
      if (t.status !== "Completed" || !t.finishTime) return false;
      const f = new Date(t.finishTime);
      f.setHours(0, 0, 0, 0);
      return f.getTime() === today.getTime();
    }).length;
  }, [trips, today]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>
            <FontAwesomeIcon icon={faBolt} /> Live operations
          </div>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p className={styles.pageSub}>
            Ground runs, cargo pressure, and compliance in one glance.
          </p>
        </div>
        <div className={styles.headerRight}>
          <LiveClock />
          <div
            className={`${styles.socketBadge} ${
              socketStatus === "live"
                ? styles.socketLive
                : socketStatus === "connecting"
                  ? styles.socketConnecting
                  : styles.socketOffline
            }`}
            title={
              socketStatus === "live"
                ? "Receiving live WebSocket updates"
                : socketStatus === "connecting"
                  ? "Connecting to live feed…"
                  : "Live feed offline — polling every 30s"
            }
          >
            <FontAwesomeIcon
              icon={socketStatus === "offline" ? faPlugCircleXmark : faWifi}
            />
            <span>
              {socketStatus === "live"
                ? "Live"
                : socketStatus === "connecting"
                  ? "Connecting"
                  : "Offline"}
            </span>
          </div>
          <button
            type="button"
            className={`${styles.refreshBtn} ${refreshing ? styles.refreshSpin : ""}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh now"
          >
            <FontAwesomeIcon icon={faRotate} spin={refreshing} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {refreshError && <div className={styles.errorBanner}>{refreshError}</div>}

      {loading ? (
        <div className={styles.loading}>Loading dashboard…</div>
      ) : (
        <>
          {/* Pulse strip — severity at a glance */}
          <div className={styles.pulseStrip}>
            <div
              className={`${styles.pulseItem} ${criticalCount ? styles.pulseCritical : styles.pulseOk}`}
            >
              <span className={styles.pulseDot} />
              <div>
                <strong>{criticalCount}</strong>
                <span>critical now</span>
              </div>
            </div>
            <div
              className={`${styles.pulseItem} ${warningCount ? styles.pulseWarn : styles.pulseOk}`}
            >
              <span className={styles.pulseDot} />
              <div>
                <strong>{warningCount}</strong>
                <span>needs attention</span>
              </div>
            </div>
            <div className={styles.pulseItem}>
              <FontAwesomeIcon icon={faTruck} />
              <div>
                <strong>{enRoute.length}</strong>
                <span>trucks en route</span>
              </div>
            </div>
            <div className={styles.pulseItem}>
              <FontAwesomeIcon icon={faFlagCheckered} />
              <div>
                <strong>{completedToday}</strong>
                <span>handoffs today</span>
              </div>
            </div>
            <div className={styles.pulseItem}>
              <FontAwesomeIcon icon={faUserCheck} />
              <div>
                <strong>{availableDrivers.length}</strong>
                <span>drivers ready</span>
              </div>
            </div>
          </div>

          {/* Primary KPI cards */}
          <div className={styles.statsGrid}>
            <div className={`${styles.statCard} ${styles.accent}`}>
              <div className={styles.statIcon}>
                <FontAwesomeIcon icon={faTruck} />
              </div>
              <div>
                <div className={styles.statValue}>{activeTrips.length}</div>
                <div className={styles.statLabel}>Active runs</div>
                <div className={styles.statSub}>
                  {enRoute.length} en route ·{" "}
                  {activeTrips.length - enRoute.length} scheduled
                </div>
              </div>
              <Link to="/dispatch" className={styles.statLink}>
                Board <FontAwesomeIcon icon={faChevronRight} />
              </Link>
            </div>
            <div className={`${styles.statCard} ${styles.success}`}>
              <div className={styles.statIcon}>
                <FontAwesomeIcon icon={faIdCard} />
              </div>
              <div>
                <div className={styles.statValue}>
                  {availableDrivers.length}
                </div>
                <div className={styles.statLabel}>Drivers available</div>
                <div className={styles.statSub}>{drivers.length} on roster</div>
              </div>
              <Link to="/drivers" className={styles.statLink}>
                Drivers <FontAwesomeIcon icon={faChevronRight} />
              </Link>
            </div>
            <div className={`${styles.statCard} ${styles.warning}`}>
              <div className={styles.statIcon}>
                <FontAwesomeIcon icon={faPlaneArrival} />
              </div>
              <div>
                <div className={styles.statValue}>{pendingImports.length}</div>
                <div className={styles.statLabel}>Import permits ready</div>
                <div className={styles.statSub}>Unassigned cargo</div>
              </div>
              <Link to="/imports" className={styles.statLink}>
                Imports <FontAwesomeIcon icon={faChevronRight} />
              </Link>
            </div>
            <div className={`${styles.statCard} ${styles.purple}`}>
              <div className={styles.statIcon}>
                <FontAwesomeIcon icon={faPlaneDeparture} />
              </div>
              <div>
                <div className={styles.statValue}>{pendingExports.length}</div>
                <div className={styles.statLabel}>Export loads ready</div>
                <div className={styles.statSub}>Awaiting dispatch</div>
              </div>
              <Link to="/exports" className={styles.statLink}>
                Exports <FontAwesomeIcon icon={faChevronRight} />
              </Link>
            </div>
          </div>

          <div className={styles.mainGrid}>
            {/* Attention feed */}
            <section className={styles.attentionPanel}>
              <div className={styles.panelHead}>
                <div>
                  <h2>
                    <FontAwesomeIcon icon={faTriangleExclamation} />
                    Attention feed
                  </h2>
                  <p>Ranked by severity — cargo, fees, compliance, late runs</p>
                </div>
                <Link to="/calendar" className={styles.panelLink}>
                  <FontAwesomeIcon icon={faCalendarDays} /> Full calendar
                </Link>
              </div>

              {alerts.length === 0 ? (
                <div className={styles.allClear}>
                  <FontAwesomeIcon icon={faCircleCheck} />
                  <div>
                    <strong>All clear</strong>
                    <span>
                      No lockouts, overdue LFDs, unpaid fees, or expiring docs
                      in the critical window.
                    </span>
                  </div>
                </div>
              ) : (
                <ul className={styles.alertFeed}>
                  {alerts.slice(0, 12).map((a) => (
                    <li
                      key={a.id}
                      className={`${styles.alertRow} ${styles[`sev_${a.severity}`]}`}
                    >
                      <div className={styles.alertRail} />
                      <div className={styles.alertIconWrap}>
                        <FontAwesomeIcon icon={a.icon} />
                      </div>
                      <div className={styles.alertBody}>
                        <div className={styles.alertTop}>
                          <span className={styles.alertCat}>{a.category}</span>
                          {a.hours !== undefined && (
                            <CountdownChip hours={a.hours} />
                          )}
                        </div>
                        <strong>{a.title}</strong>
                        <span className={styles.alertDesc}>{a.body}</span>
                        {a.meta && (
                          <em className={styles.alertMeta}>{a.meta}</em>
                        )}
                      </div>
                      {a.href && (
                        <Link to={a.href} className={styles.alertAction}>
                          Open <FontAwesomeIcon icon={faChevronRight} />
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {alerts.length > 12 && (
                <p className={styles.moreAlerts}>
                  +{alerts.length - 12} more — see Calendar for the full list
                </p>
              )}
            </section>

            {/* Active trips + shortcuts */}
            <div className={styles.rightCol}>
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <div>
                    <h2>
                      <FontAwesomeIcon icon={faTruck} />
                      Active ground runs
                    </h2>
                    <p>{activeTrips.length} open on the board</p>
                  </div>
                  <Link to="/dispatch" className={styles.panelLink}>
                    Dispatch <FontAwesomeIcon icon={faChevronRight} />
                  </Link>
                </div>

                {activeTrips.length === 0 ? (
                  <div className={styles.empty}>
                    <FontAwesomeIcon icon={faCircleCheck} />
                    <span>
                      No active trips — build a run when cargo is ready
                    </span>
                  </div>
                ) : (
                  <div className={styles.tripStack}>
                    {activeTrips.slice(0, 6).map((trip) => (
                      <article key={trip.id} className={styles.tripCard}>
                        <div className={styles.tripTop}>
                          <span className={styles.tripNum}>
                            {trip.tripNumber}
                          </span>
                          <StatusBadge status={trip.status} />
                        </div>
                        <div className={styles.tripMeta}>
                          {trip.driver?.name || "No driver"} ·{" "}
                          {trip.truck?.unitNumber || "—"}
                          {trip.runType ? ` · ${trip.runType}` : ""}
                        </div>
                        <div className={styles.tripCargo}>
                          <FontAwesomeIcon icon={faBoxesStacked} />
                          {(trip.shipments || []).length} permit
                          {(trip.shipments || []).length !== 1 ? "s" : ""}
                          {trip.startTime
                            ? ` · departed ${formatTime(trip.startTime)}`
                            : trip.plannedDepartureTime
                              ? ` · planned ${formatTime(trip.plannedDepartureTime)}`
                              : ""}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.shortcuts}>
                <Link to="/dispatch" className={styles.shortcut}>
                  <FontAwesomeIcon icon={faBolt} />
                  <span>Dispatch board</span>
                </Link>
                <Link to="/calendar" className={styles.shortcut}>
                  <FontAwesomeIcon icon={faCalendarDays} />
                  <span>Ops calendar</span>
                </Link>
                <Link to="/analytics" className={styles.shortcut}>
                  <FontAwesomeIcon icon={faChartPie} />
                  <span>Analytics</span>
                </Link>
              </section>
            </div>
          </div>

          <div className={styles.lastRefresh}>
            <FontAwesomeIcon icon={faClock} />
            Last updated: {lastRefresh.toLocaleTimeString()}
            {socketStatus === "live"
              ? " · Live via WebSocket"
              : " · Polling every 30s (socket offline)"}
          </div>
        </>
      )}
    </div>
  );
}
