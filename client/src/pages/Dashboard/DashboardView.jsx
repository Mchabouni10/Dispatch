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
  faSnowflake,
  faWarehouse,
  faBuildingCircleCheck,
  faStopwatch,
} from "@fortawesome/free-solid-svg-icons";
import { io } from "socket.io-client";
import {
  getTrips,
  getDrivers,
  getShipments,
  getEquipment,
  getAuthToken,
} from "../../api/api.js";
import StatusBadge from "../../components/StatusBadge/StatusBadge.jsx";
import styles from "./DashboardView.module.css";
import LiveClock from "../../styles/Liveclock.jsx"; // adjust path to match your folder layout

const SOCKET_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SOCKET_URL) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_SOCKET_URL) ||
  "";

// Theme palette pulled from DashboardView.module.css CSS variables so chart
// colors stay in sync with the rest of the ops-board system.
const COLOR = {
  cyan: "#00D4FF",
  success: "#00D084",
  warning: "#FFB347",
  danger: "#FF4757",
  purple: "#7C5CBF",
  purpleLight: "#D6B7FF",
  muted: "#5B6472",
};

const STATUS_COLORS = {
  Pending: COLOR.warning,
  Assigned: COLOR.cyan,
  "In Transit": COLOR.purple,
  Completed: COLOR.success,
  Delivered: COLOR.success,
  Cancelled: COLOR.muted,
};

function statusColor(name, i) {
  return (
    STATUS_COLORS[name] ||
    [COLOR.cyan, COLOR.purple, COLOR.warning, COLOR.success, COLOR.muted][
      i % 5
    ]
  );
}

// Abstract internal coordinate width. The <svg> stretches this to the
// container's real width via preserveAspectRatio="none", so we never need
// to measure the container in JS — but height is a literal pixel value
// (never "100%"), which is what keeps the chart from inflating to match
// the panel's aspect ratio. That inflation was the "ugly chart" bug.
const CHART_UNITS = 1000;

function niceAxisMax(value) {
  if (value <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const step = value / pow <= 2 ? 0.5 * pow : value / pow <= 5 ? pow : 2 * pow;
  return Math.ceil(value / step) * step;
}

function SimpleAreaChart({ data, series, height = 240 }) {
  if (!data?.length) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        No trend data yet
      </div>
    );
  }

  const padTop = 16;
  const padBottom = 28;
  const padLeft = 34;
  const padRight = 10;
  const plotWidth = CHART_UNITS - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const rawMax = Math.max(
    0,
    ...data.flatMap((entry) => series.map((s) => Number(entry[s.key]) || 0)),
  );
  const maxValue = niceAxisMax(rawMax);

  const x = (index) =>
    padLeft + (index / Math.max(1, data.length - 1)) * plotWidth;
  const y = (value) =>
    padTop + (1 - (maxValue ? value / maxValue : 0)) * plotHeight;
  const baseline = padTop + plotHeight;

  const buildPath = (key) => {
    const points = data
      .map((entry, index) => {
        const value = Number(entry[key]) || 0;
        return `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(value).toFixed(2)}`;
      })
      .join(" ");
    return `${points} L ${x(data.length - 1).toFixed(2)} ${baseline} L ${x(0).toFixed(2)} ${baseline} Z`;
  };

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxValue * f));

  // Show at most ~7 x-axis labels so they never overlap regardless of how
  // many days of data are passed in.
  const labelStep = Math.max(1, Math.ceil(data.length / 7));

  return (
    <svg
      viewBox={`0 0 ${CHART_UNITS} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      role="img"
      aria-label="Cargo flow trend"
    >
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={padLeft}
            x2={CHART_UNITS - padRight}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--border)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={padLeft - 8}
            y={y(tick) + 3}
            textAnchor="end"
            fill="var(--text-muted)"
            fontSize="10"
          >
            {tick}
          </text>
        </g>
      ))}

      {series.map((item) => (
        <path
          key={item.key}
          d={buildPath(item.key)}
          fill={item.fill}
          stroke={item.stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {data.map((entry, index) =>
        index % labelStep === 0 || index === data.length - 1 ? (
          <text
            key={entry.label || index}
            x={x(index)}
            y={height - 8}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="10"
          >
            {entry.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function SimpleDonutChart({ data, colors, size = 140 }) {
  if (!data?.length) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
        }}
      >
        No data
      </div>
    );
  }

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
  let offset = 0;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Status breakdown">
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--border)" strokeWidth={24} fill="none" />
      {data.map((entry, index) => {
        const value = Number(entry.value) || 0;
        const length = total > 0 ? (value / total) * circumference : 0;
        const segment = (
          <circle
            key={entry.name || index}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors[index] || COLOR.cyan}
            strokeWidth={24}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += length;
        return segment;
      })}
      <circle cx={size / 2} cy={size / 2} r={radius - 24} fill="var(--bg-card)" />
      <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fill="var(--text-primary)" fontSize="16" fontWeight="600">
        {total}
      </text>
      <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fill="var(--text-muted)" fontSize="10">
        items
      </text>
    </svg>
  );
}

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

function formatMoney(n) {
  return `$${Math.round(n || 0).toLocaleString("en-US")}`;
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

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
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

/** Group a list into { name, count } buckets, sorted descending, top N. */
function topBy(list, keyFn, labelFn, limit = 5) {
  const m = new Map();
  list.forEach((item) => {
    const key = keyFn(item);
    if (!key) return;
    const cur = m.get(key) || { name: labelFn(item), count: 0 };
    cur.count += 1;
    m.set(key, cur);
  });
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

function statusCounts(list) {
  const m = new Map();
  list.forEach((s) => {
    const key = s.status || "Unknown";
    m.set(key, (m.get(key) || 0) + 1);
  });
  return [...m.entries()].map(([name, value]) => ({ name, value }));
}

/** Custom tooltip so it matches the dark ops-board theme instead of
 * Recharts' default light box. */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.chartTooltip}>
      {label && <div className={styles.chartTooltipLabel}>{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} className={styles.chartTooltipRow}>
          <span
            className={styles.chartTooltipDot}
            style={{ background: p.color || p.fill }}
          />
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

const TREND_DAYS = 14;

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
    // The server now rejects any socket connection that doesn't present the
    // same Bearer token used for REST calls (see lib/realtime.js) — this was
    // previously wide open, letting anyone subscribe to live driver/trip/
    // shipment updates without being logged in at all.
    const socket = io(SOCKET_URL || undefined, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
      auth: { token: getAuthToken() },
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

  const today = useMemo(() => startOfDay(new Date()), [lastRefresh]);

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

  const imports = useMemo(
    () => shipments.filter((s) => s.type === "Import"),
    [shipments],
  );
  const exports_ = useMemo(
    () => shipments.filter((s) => s.type === "Export"),
    [shipments],
  );
  const pendingImports = useMemo(
    () => imports.filter((s) => s.status === "Pending"),
    [imports],
  );
  const pendingExports = useMemo(
    () => exports_.filter((s) => s.status === "Pending"),
    [exports_],
  );

  const importsToday = useMemo(
    () => imports.filter((s) => startOfDay(s.createdAt).getTime() === today.getTime()).length,
    [imports, today],
  );
  const exportsToday = useMemo(
    () => exports_.filter((s) => startOfDay(s.createdAt).getTime() === today.getTime()).length,
    [exports_, today],
  );

  /** Imports vs exports volume, last TREND_DAYS days, for the flow chart. */
  const cargoFlow = useMemo(() => {
    const buckets = new Map();
    const order = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      order.push(key);
      buckets.set(key, {
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        imports: 0,
        exports: 0,
      });
    }
    shipments.forEach((s) => {
      if (!s.createdAt) return;
      const key = startOfDay(s.createdAt).toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) return;
      if (s.type === "Import") bucket.imports += 1;
      else if (s.type === "Export") bucket.exports += 1;
    });
    return order.map((k) => buckets.get(k));
  }, [shipments, today]);

  const importStatusBreakdown = useMemo(() => statusCounts(imports), [imports]);
  const exportStatusBreakdown = useMemo(() => statusCounts(exports_), [exports_]);

  const feesAtRisk = useMemo(() => {
    let terminal = 0;
    let storage = 0;
    imports.forEach((s) => {
      if (s.terminalFee > 0 && !s.terminalFeePaid) terminal += s.terminalFee;
      if (s.storageFeePerDay > 0 && !s.storageFeePaid) {
        storage += s.storageFeePerDay * Math.max(s.storageFeeDaysOver || 0, 0);
      }
    });
    return { terminal, storage, total: terminal + storage };
  }, [imports]);

  const overdueLfdCount = useMemo(
    () =>
      imports.filter((s) => {
        if (s.status !== "Pending" && s.status !== "Assigned") return false;
        const d = daysUntil(s.lastFreeDay);
        return d !== null && d < 0;
      }).length,
    [imports],
  );

  const gdpActiveCount = useMemo(
    () =>
      imports.filter(
        (s) =>
          s.isGDP && (s.status === "Pending" || s.status === "Assigned"),
      ).length,
    [imports],
  );

  const lockoutsSoonCount = useMemo(
    () =>
      exports_.filter((s) => {
        if (s.status !== "Pending" && s.status !== "Assigned") return false;
        const h = hoursUntil(s.lockoutTime);
        return h !== null && h < 6;
      }).length,
    [exports_],
  );

  const readyToShipToday = useMemo(
    () =>
      exports_.filter(
        (s) => s.flightDate && startOfDay(s.flightDate).getTime() === today.getTime(),
      ).length,
    [exports_, today],
  );

  const topWarehouses = useMemo(
    () => topBy(imports, (s) => s.warehouseId, (s) => s.warehouse?.name || "Unknown"),
    [imports],
  );
  const topAirlines = useMemo(
    () => topBy(exports_, (s) => s.airlineId, (s) => s.airline?.name || "Unknown"),
    [exports_],
  );

  const onTimeDepartureRate = useMemo(() => {
    const withBoth = trips.filter((t) => t.startTime && t.plannedDepartureTime);
    if (!withBoth.length) return null;
    const onTime = withBoth.filter(
      (t) => new Date(t.startTime) <= new Date(t.plannedDepartureTime),
    ).length;
    return Math.round((onTime / withBoth.length) * 100);
  }, [trips]);

  const driverAlertCount = useMemo(() => {
    let c = 0;
    drivers.forEach((d) => {
      const med = daysUntil(d.medicalCertExpiration);
      if (med !== null && med <= 30) c += 1;
      const lic = daysUntil(d.licenseExpiration);
      if (lic !== null && lic <= 30) c += 1;
    });
    return c;
  }, [drivers]);

  /** Attention feed — cargo, fees, lockouts, dispatch, and equipment only.
   * Driver compliance (medical/license) lives on the Driver Notifications
   * page; see driverAlertCount above for the summary chip instead. */
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
  }, [shipments, equipment, activeTrips]);

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  const completedToday = useMemo(() => {
    return trips.filter((t) => {
      if (t.status !== "Completed" || !t.finishTime) return false;
      return startOfDay(t.finishTime).getTime() === today.getTime();
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
            Import and export cargo flow, ground runs, and compliance in one glance.
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
                <div className={styles.statSub}>{importsToday} created today</div>
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
                <div className={styles.statSub}>{exportsToday} created today</div>
              </div>
              <Link to="/exports" className={styles.statLink}>
                Exports <FontAwesomeIcon icon={faChevronRight} />
              </Link>
            </div>
          </div>

          {/* Cargo flow trend */}
          <section className={styles.panel} style={{ marginBottom: 24 }}>
            <div className={styles.panelHead}>
              <div>
                <h2>
                  <FontAwesomeIcon icon={faChartPie} />
                  Cargo flow — last {TREND_DAYS} days
                </h2>
                <p>New import and export permits created per day</p>
              </div>
              <div className={styles.chartHeadStats}>
                <div>
                  <strong>{onTimeDepartureRate ?? "—"}%</strong>
                  <span>on-time departures</span>
                </div>
                <div>
                  <strong>{formatMoney(feesAtRisk.total)}</strong>
                  <span>fees at risk</span>
                </div>
              </div>
            </div>
            <ul className={styles.trendLegend}>
              <li>
                <span style={{ background: COLOR.warning }} />
                Imports
              </li>
              <li>
                <span style={{ background: COLOR.purpleLight }} />
                Exports
              </li>
            </ul>
            <div className={styles.chartBody}>
              <SimpleAreaChart
                data={cargoFlow}
                series={[
                  { key: "imports", stroke: COLOR.warning, fill: "rgba(255, 179, 71, 0.24)" },
                  { key: "exports", stroke: COLOR.purpleLight, fill: "rgba(124, 92, 191, 0.20)" },
                ]}
                height={240}
              />
            </div>
          </section>

          {/* Imports / Exports deep-dive */}
          <div className={styles.cargoGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <h2>
                    <FontAwesomeIcon icon={faPlaneArrival} />
                    Imports snapshot
                  </h2>
                  <p>{imports.length} permits on file</p>
                </div>
                <Link to="/imports" className={styles.panelLink}>
                  Open <FontAwesomeIcon icon={faChevronRight} />
                </Link>
              </div>

              <div className={styles.miniStatRow}>
                <div className={styles.miniStat}>
                  <FontAwesomeIcon icon={faWarehouse} />
                  <div>
                    <strong>{overdueLfdCount}</strong>
                    <span>over LFD</span>
                  </div>
                </div>
                <div className={styles.miniStat}>
                  <FontAwesomeIcon icon={faMoneyBillWave} />
                  <div>
                    <strong>{formatMoney(feesAtRisk.total)}</strong>
                    <span>unpaid fees</span>
                  </div>
                </div>
                <div className={styles.miniStat}>
                  <FontAwesomeIcon icon={faSnowflake} />
                  <div>
                    <strong>{gdpActiveCount}</strong>
                    <span>cold-chain (GDP)</span>
                  </div>
                </div>
              </div>

              <div className={styles.donutRow}>
                <SimpleDonutChart
                  data={importStatusBreakdown}
                  colors={importStatusBreakdown.map((entry, i) => statusColor(entry.name, i))}
                  size={140}
                />
                <ul className={styles.chartLegend}>
                  {importStatusBreakdown.map((entry, i) => (
                    <li key={entry.name}>
                      <span style={{ background: statusColor(entry.name, i) }} />
                      {entry.name}
                      <strong>{entry.value}</strong>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.panelSubhead}>Top warehouses</div>
              <div className={styles.barList}>
                {topWarehouses.length === 0 && (
                  <p className={styles.barListEmpty}>No import warehouse data yet</p>
                )}
                {topWarehouses.map((w) => (
                  <div key={w.name} className={styles.barListRow}>
                    <span className={styles.barListLabel}>{w.name}</span>
                    <div className={styles.barListTrack}>
                      <div
                        className={styles.barListFill}
                        style={{
                          width: `${(w.count / topWarehouses[0].count) * 100}%`,
                          background: COLOR.warning,
                        }}
                      />
                    </div>
                    <span className={styles.barListCount}>{w.count}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <h2>
                    <FontAwesomeIcon icon={faPlaneDeparture} />
                    Exports snapshot
                  </h2>
                  <p>{exports_.length} loads on file</p>
                </div>
                <Link to="/exports" className={styles.panelLink}>
                  Open <FontAwesomeIcon icon={faChevronRight} />
                </Link>
              </div>

              <div className={styles.miniStatRow}>
                <div className={styles.miniStat}>
                  <FontAwesomeIcon icon={faStopwatch} />
                  <div>
                    <strong>{lockoutsSoonCount}</strong>
                    <span>lockout &lt; 6h</span>
                  </div>
                </div>
                <div className={styles.miniStat}>
                  <FontAwesomeIcon icon={faBuildingCircleCheck} />
                  <div>
                    <strong>{readyToShipToday}</strong>
                    <span>flying today</span>
                  </div>
                </div>
                <div className={styles.miniStat}>
                  <FontAwesomeIcon icon={faRoute} />
                  <div>
                    <strong>{onTimeDepartureRate ?? "—"}%</strong>
                    <span>on-time departure</span>
                  </div>
                </div>
              </div>

              <div className={styles.donutRow}>
                <SimpleDonutChart
                  data={exportStatusBreakdown}
                  colors={exportStatusBreakdown.map((entry, i) => statusColor(entry.name, i))}
                  size={140}
                />
                <ul className={styles.chartLegend}>
                  {exportStatusBreakdown.map((entry, i) => (
                    <li key={entry.name}>
                      <span style={{ background: statusColor(entry.name, i) }} />
                      {entry.name}
                      <strong>{entry.value}</strong>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.panelSubhead}>Top airlines</div>
              <div className={styles.barList}>
                {topAirlines.length === 0 && (
                  <p className={styles.barListEmpty}>No export airline data yet</p>
                )}
                {topAirlines.map((a) => (
                  <div key={a.name} className={styles.barListRow}>
                    <span className={styles.barListLabel}>{a.name}</span>
                    <div className={styles.barListTrack}>
                      <div
                        className={styles.barListFill}
                        style={{
                          width: `${(a.count / topAirlines[0].count) * 100}%`,
                          background: COLOR.purpleLight,
                        }}
                      />
                    </div>
                    <span className={styles.barListCount}>{a.count}</span>
                  </div>
                ))}
              </div>
            </section>
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
                  <p>Cargo, fees, lockouts, dispatch, and equipment — ranked by severity</p>
                </div>
                <Link to="/calendar" className={styles.panelLink}>
                  <FontAwesomeIcon icon={faCalendarDays} /> Full calendar
                </Link>
              </div>

              {driverAlertCount > 0 && (
                <Link to="/drivers" className={styles.driverAlertChip}>
                  <FontAwesomeIcon icon={faIdCard} />
                  {driverAlertCount} driver compliance alert
                  {driverAlertCount !== 1 ? "s" : ""} — see Driver Notifications
                  <FontAwesomeIcon icon={faChevronRight} />
                </Link>
              )}

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