import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartPie,
  faTruck,
  faWeightHanging,
  faFlagCheckered,
  faTriangleExclamation,
  faMoneyBillWave,
  faPlaneArrival,
  faPlaneDeparture,
  faClock,
  faBoxesStacked,
  faChevronDown,
  faChevronUp,
  faUser,
  faRoute,
  faBarcode,
} from "@fortawesome/free-solid-svg-icons";
import { getShipments, getTrips } from "../../api/api.js";
import styles from "./AnalyticsView.module.css";

const PERIODS = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function rangeForPeriod(period) {
  const now = new Date();
  const end = now;
  let start;
  if (period === "7d") {
    start = new Date(now);
    start.setDate(start.getDate() - 7);
  } else if (period === "30d") {
    start = new Date(now);
    start.setDate(start.getDate() - 30);
  } else if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "year") {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    start = new Date(2000, 0, 1);
  }
  return { start: startOfDay(start), end };
}

function inRange(dateVal, start, end) {
  if (!dateVal) return false;
  const t = new Date(dateVal).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function weightOf(s) {
  const w = Number(s.weight) || 0;
  if ((s.weightUnit || "lb").toLowerCase() === "kg") return w * 2.20462;
  return w;
}

function fmtNum(n) {
  return Math.round(n).toLocaleString();
}

function fmtPct(n) {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function shortDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function awbLabel(shipment) {
  if (shipment?.awbDisplay) return shipment.awbDisplay;
  const prefix = shipment?.airline?.awbPrefix;
  const num = shipment?.airwaybillNumber;
  if (prefix && num) {
    const clean = String(num).startsWith(String(prefix))
      ? num
      : `${prefix}-${num}`;
    return clean;
  }
  if (num) return num;
  if (shipment?.airwaybillNumbers?.length) {
    const list = shipment.airwaybillNumbers;
    return list.length > 1 ? `${list[0]} +${list.length - 1}` : list[0];
  }
  return "AWB pending";
}

function tripCargoSummary(shipments = []) {
  let pieces = 0;
  let weightLb = 0;
  const awbs = [];
  const airlines = new Set();
  const warehouses = new Set();
  shipments.forEach((s) => {
    pieces += Number(s.pieces) || 0;
    weightLb += weightOf(s);
    awbs.push(awbLabel(s));
    if (s.airline?.name) airlines.add(s.airline.name);
    if (s.warehouse?.name) warehouses.add(s.warehouse.name);
  });
  return {
    pieces,
    weightLb,
    awbs,
    airlines: [...airlines],
    warehouses: [...warehouses],
  };
}

function tripTiming(t) {
  const planned = t.plannedDepartureTime
    ? new Date(t.plannedDepartureTime)
    : null;
  const expected = t.expectedCompletionTime
    ? new Date(t.expectedCompletionTime)
    : null;
  const started = t.startTime ? new Date(t.startTime) : null;
  const finished = t.finishTime ? new Date(t.finishTime) : null;

  const plannedWindowMs = planned && expected ? expected - planned : null;
  const actualDurationMs = started && finished ? finished - started : null;
  const departDeltaMs = planned && started ? started - planned : null; // + late depart
  const finishDeltaMs = expected && finished ? finished - expected : null; // + late finish

  let result = "—";
  let resultClass = "";
  if (finished && expected) {
    if (finished <= expected) {
      result = "On time";
      resultClass = "onTime";
    } else {
      result = `Late +${formatDurationMs(finishDeltaMs)}`;
      resultClass = "late";
    }
  }

  return {
    planned,
    expected,
    started,
    finished,
    plannedWindowMs,
    actualDurationMs,
    departDeltaMs,
    finishDeltaMs,
    result,
    resultClass,
  };
}

export default function AnalyticsView() {
  const [trips, setTrips] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("30d");
  const [expandedId, setExpandedId] = useState(null);
  const [runTypeFilter, setRunTypeFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([getTrips(), getShipments()]);
      setTrips(t || []);
      setShipments(s || []);
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

  const { start, end } = useMemo(() => rangeForPeriod(period), [period]);

  const tripStats = useMemo(() => {
    const inPeriod = trips.filter((t) =>
      inRange(
        t.finishTime || t.plannedDepartureTime || t.createdAt,
        start,
        end,
      ),
    );
    const completed = inPeriod.filter((t) => t.status === "Completed");
    const cancelled = inPeriod.filter((t) => t.status === "Cancelled");
    const active = trips.filter(
      (t) => t.status === "En Route" || t.status === "Scheduled",
    );

    let onTime = 0;
    let late = 0;
    completed.forEach((t) => {
      if (!t.finishTime || !t.expectedCompletionTime) return;
      if (new Date(t.finishTime) <= new Date(t.expectedCompletionTime))
        onTime += 1;
      else late += 1;
    });
    const scored = onTime + late;
    const onTimePct = scored ? (onTime / scored) * 100 : null;

    let weight = 0;
    let pieces = 0;
    completed.forEach((t) => {
      (t.shipments || []).forEach((s) => {
        weight += weightOf(s);
        pieces += Number(s.pieces) || 0;
      });
    });

    const byRun = {
      Import: completed.filter((t) => t.runType === "Import").length,
      Export: completed.filter((t) => t.runType === "Export").length,
    };

    // Average actual duration among completed with start+finish
    let durSum = 0;
    let durN = 0;
    completed.forEach((t) => {
      if (t.startTime && t.finishTime) {
        durSum += new Date(t.finishTime) - new Date(t.startTime);
        durN += 1;
      }
    });

    return {
      inPeriod: inPeriod.length,
      completed: completed.length,
      cancelled: cancelled.length,
      active: active.length,
      onTime,
      late,
      onTimePct,
      weight,
      pieces,
      byRun,
      avgDurationMs: durN ? durSum / durN : null,
      completedList: completed
        .slice()
        .sort(
          (a, b) =>
            new Date(b.finishTime || b.updatedAt || 0) -
            new Date(a.finishTime || a.updatedAt || 0),
        ),
    };
  }, [trips, start, end]);

  const freightStats = useMemo(() => {
    const inPeriod = shipments.filter((s) =>
      inRange(s.createdAt || s.updatedAt, start, end),
    );
    let importW = 0;
    let exportW = 0;
    let importPcs = 0;
    let exportPcs = 0;
    inPeriod.forEach((s) => {
      const w = weightOf(s);
      const p = Number(s.pieces) || 0;
      if (s.type === "Import") {
        importW += w;
        importPcs += p;
      } else if (s.type === "Export") {
        exportW += w;
        exportPcs += p;
      }
    });

    const byAirline = new Map();
    inPeriod.forEach((s) => {
      const name = s.airline?.name || "Unassigned";
      const prev = byAirline.get(name) || { name, weight: 0, count: 0 };
      prev.weight += weightOf(s);
      prev.count += 1;
      byAirline.set(name, prev);
    });
    const airlineRank = [...byAirline.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);

    const dayMap = new Map();
    inPeriod.forEach((s) => {
      const d = startOfDay(new Date(s.createdAt || s.updatedAt || Date.now()));
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, (dayMap.get(key) || 0) + weightOf(s));
    });
    const daily = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, w]) => ({ day, weight: w }));

    return {
      importW,
      exportW,
      importPcs,
      exportPcs,
      totalW: importW + exportW,
      airlineRank,
      daily,
      maxDaily: Math.max(1, ...[...dayMap.values(), 1]),
    };
  }, [shipments, start, end]);

  const feeStats = useMemo(() => {
    let unpaidTerminal = 0;
    let unpaidStorageDays = 0;
    let unpaidStorageRate = 0;
    let count = 0;
    shipments.forEach((s) => {
      if (s.type !== "Import") return;
      if (s.terminalFee > 0 && !s.terminalFeePaid) {
        unpaidTerminal += Number(s.terminalFee) || 0;
        count += 1;
      }
      if (s.storageFeePerDay > 0 && !s.storageFeePaid) {
        const lfd = s.lastFreeDay ? startOfDay(new Date(s.lastFreeDay)) : null;
        const today = startOfDay(new Date());
        if (lfd && today > lfd) {
          unpaidStorageRate += Number(s.storageFeePerDay) || 0;
          unpaidStorageDays += Math.ceil((today - lfd) / 86400000);
          count += 1;
        }
      }
    });
    return { unpaidTerminal, unpaidStorageRate, unpaidStorageDays, count };
  }, [shipments]);

  const maxAirlineW = Math.max(
    1,
    ...(freightStats.airlineRank.map((a) => a.weight) || [1]),
  );

  /** Driver scoreboard from completed trips in period */
  const driverBoard = useMemo(() => {
    const map = new Map();
    tripStats.completedList.forEach((t) => {
      const id = t.driverId || t.driver?.id || "unknown";
      const name = t.driver?.name || "Unassigned";
      const prev = map.get(id) || {
        id,
        name,
        trips: 0,
        onTime: 0,
        late: 0,
        pieces: 0,
        weight: 0,
        durationSum: 0,
        durationN: 0,
      };
      prev.trips += 1;
      const timing = tripTiming(t);
      if (timing.resultClass === "onTime") prev.onTime += 1;
      if (timing.resultClass === "late") prev.late += 1;
      if (timing.actualDurationMs != null) {
        prev.durationSum += timing.actualDurationMs;
        prev.durationN += 1;
      }
      const cargo = tripCargoSummary(t.shipments || []);
      prev.pieces += cargo.pieces;
      prev.weight += cargo.weightLb;
      map.set(id, prev);
    });
    return [...map.values()]
      .map((d) => ({
        ...d,
        onTimePct:
          d.onTime + d.late > 0 ? (d.onTime / (d.onTime + d.late)) * 100 : null,
        avgDurationMs: d.durationN ? d.durationSum / d.durationN : null,
      }))
      .sort((a, b) => b.trips - a.trips);
  }, [tripStats.completedList]);

  const historyRows = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    return tripStats.completedList.filter((t) => {
      if (runTypeFilter !== "all" && t.runType !== runTypeFilter) return false;
      const timing = tripTiming(t);
      if (resultFilter === "onTime" && timing.resultClass !== "onTime")
        return false;
      if (resultFilter === "late" && timing.resultClass !== "late")
        return false;
      if (!term) return true;
      const cargo = tripCargoSummary(t.shipments || []);
      const hay = [
        t.tripNumber,
        t.runType,
        t.driver?.name,
        t.truck?.unitNumber,
        t.trailer?.unitNumber,
        t.notes,
        ...cargo.awbs,
        ...cargo.airlines,
        ...cargo.warehouses,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [tripStats.completedList, runTypeFilter, resultFilter, historySearch]);

  const toggleExpand = (id) => setExpandedId((cur) => (cur === id ? null : id));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            <FontAwesomeIcon icon={faChartPie} /> Performance & history
          </div>
          <h1>Analytics</h1>
          <p>
            Completed runs with AWB, driver, duration, and cargo detail for
            complaints, audits, and driver evaluation.
          </p>
        </div>
        <div className={styles.periodGroup}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`${styles.periodBtn} ${period === p.id ? styles.periodBtnActive : ""}`}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Loading analytics…</div>
      ) : (
        <>
          <section className={styles.kpiRow}>
            <div className={styles.kpi}>
              <FontAwesomeIcon icon={faFlagCheckered} />
              <div>
                <strong>{tripStats.completed}</strong>
                <span>trips completed</span>
              </div>
            </div>
            <div className={styles.kpi}>
              <FontAwesomeIcon icon={faWeightHanging} />
              <div>
                <strong>
                  {fmtNum(tripStats.weight || freightStats.totalW)}
                </strong>
                <span>lb moved (period)</span>
              </div>
            </div>
            <div className={styles.kpi}>
              <FontAwesomeIcon icon={faClock} />
              <div>
                <strong>{fmtPct(tripStats.onTimePct)}</strong>
                <span>on-time handoffs</span>
              </div>
            </div>
            <div className={styles.kpi}>
              <FontAwesomeIcon icon={faRoute} />
              <div>
                <strong>
                  {tripStats.avgDurationMs
                    ? formatDurationMs(tripStats.avgDurationMs)
                    : "—"}
                </strong>
                <span>avg run duration</span>
              </div>
            </div>
            <div
              className={`${styles.kpi} ${feeStats.count ? styles.kpiWarn : ""}`}
            >
              <FontAwesomeIcon icon={faMoneyBillWave} />
              <div>
                <strong>${fmtNum(feeStats.unpaidTerminal)}</strong>
                <span>unpaid terminal · {feeStats.count} open</span>
              </div>
            </div>
            <div className={styles.kpi}>
              <FontAwesomeIcon icon={faBoxesStacked} />
              <div>
                <strong>
                  {fmtNum(
                    tripStats.pieces ||
                      freightStats.importPcs + freightStats.exportPcs,
                  )}
                </strong>
                <span>pieces handled</span>
              </div>
            </div>
          </section>

          <div className={styles.grid2}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h2>Import vs Export weight</h2>
                <span>Shipments created in period</span>
              </div>
              <div className={styles.splitBars}>
                <div className={styles.splitRow}>
                  <div className={styles.splitLabel}>
                    <FontAwesomeIcon icon={faPlaneArrival} /> Import
                    <strong>
                      {fmtNum(freightStats.importW)} lb ·{" "}
                      {freightStats.importPcs} pcs
                    </strong>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={`${styles.barFill} ${styles.barImport}`}
                      style={{
                        width: `${(freightStats.importW / Math.max(freightStats.totalW, 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <div className={styles.splitRow}>
                  <div className={styles.splitLabel}>
                    <FontAwesomeIcon icon={faPlaneDeparture} /> Export
                    <strong>
                      {fmtNum(freightStats.exportW)} lb ·{" "}
                      {freightStats.exportPcs} pcs
                    </strong>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={`${styles.barFill} ${styles.barExport}`}
                      style={{
                        width: `${(freightStats.exportW / Math.max(freightStats.totalW, 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className={styles.miniStats}>
                <div>
                  <span>Import runs done</span>
                  <strong>{tripStats.byRun.Import}</strong>
                </div>
                <div>
                  <span>Export runs done</span>
                  <strong>{tripStats.byRun.Export}</strong>
                </div>
                <div>
                  <span>Cancelled</span>
                  <strong>{tripStats.cancelled}</strong>
                </div>
                <div>
                  <span>Late handoffs</span>
                  <strong>{tripStats.late}</strong>
                </div>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h2>Driver evaluation (period)</h2>
                <span>Completed runs only</span>
              </div>
              {driverBoard.length === 0 ? (
                <p className={styles.empty}>No completed trips yet.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Driver</th>
                        <th>Trips</th>
                        <th>On-time</th>
                        <th>Late</th>
                        <th>Pieces</th>
                        <th>Weight</th>
                        <th>Avg duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driverBoard.slice(0, 12).map((d) => (
                        <tr key={d.id}>
                          <td>
                            <strong>{d.name}</strong>
                          </td>
                          <td>{d.trips}</td>
                          <td className={styles.onTime}>
                            {fmtPct(d.onTimePct)}
                          </td>
                          <td className={d.late ? styles.late : ""}>
                            {d.late}
                          </td>
                          <td>{fmtNum(d.pieces)}</td>
                          <td>{fmtNum(d.weight)} lb</td>
                          <td>
                            {d.avgDurationMs
                              ? formatDurationMs(d.avgDurationMs)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Top airlines by weight</h2>
              <span>Period volume</span>
            </div>
            {freightStats.airlineRank.length === 0 ? (
              <p className={styles.empty}>No shipment volume in this period.</p>
            ) : (
              <ul className={styles.rankList}>
                {freightStats.airlineRank.map((a) => (
                  <li key={a.name}>
                    <div className={styles.rankTop}>
                      <strong>{a.name}</strong>
                      <span>
                        {fmtNum(a.weight)} lb · {a.count} shp
                      </span>
                    </div>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{
                          width: `${(a.weight / maxAirlineW) * 100}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Daily freight weight</h2>
              <span>lb by day (shipments created)</span>
            </div>
            {freightStats.daily.length === 0 ? (
              <p className={styles.empty}>No daily series for this period.</p>
            ) : (
              <div className={styles.spark}>
                {freightStats.daily.map((d) => (
                  <div
                    key={d.day}
                    className={styles.sparkCol}
                    title={`${d.day}: ${fmtNum(d.weight)} lb`}
                  >
                    <div
                      className={styles.sparkBar}
                      style={{
                        height: `${Math.max(4, (d.weight / freightStats.maxDaily) * 100)}%`,
                      }}
                    />
                    <span>{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section
            className={`${styles.panel} ${feeStats.count ? styles.panelAlert : ""}`}
          >
            <div className={styles.panelHead}>
              <h2>
                <FontAwesomeIcon
                  icon={faTriangleExclamation}
                  style={{ marginRight: 8 }}
                />
                Open fee exposure
              </h2>
              <span>Import permits — unpaid terminal / active storage</span>
            </div>
            <div className={styles.feeGrid}>
              <div>
                <span>Unpaid terminal fees</span>
                <strong>${fmtNum(feeStats.unpaidTerminal)}</strong>
              </div>
              <div>
                <span>Active storage rate / day</span>
                <strong>${fmtNum(feeStats.unpaidStorageRate)}</strong>
              </div>
              <div>
                <span>Cumulative storage days over</span>
                <strong>{feeStats.unpaidStorageDays}</strong>
              </div>
              <div>
                <span>Permits with open fees</span>
                <strong>{feeStats.count}</strong>
              </div>
            </div>
          </section>

          {/* ── Completed trip history (detailed) ───────────────────── */}
          <section className={`${styles.panel} ${styles.panelWide}`}>
            <div className={styles.panelHead}>
              <div>
                <h2>Completed trip history</h2>
                <span>
                  {historyRows.length} of {tripStats.completedList.length} in
                  period — expand a row for full AWB / cargo detail
                </span>
              </div>
            </div>

            <div className={styles.historyToolbar}>
              <input
                className={styles.historySearch}
                placeholder="Search trip #, AWB, driver, airline, warehouse…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              <select
                className={styles.historySelect}
                value={runTypeFilter}
                onChange={(e) => setRunTypeFilter(e.target.value)}
              >
                <option value="all">All types</option>
                <option value="Import">Import</option>
                <option value="Export">Export</option>
              </select>
              <select
                className={styles.historySelect}
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
              >
                <option value="all">All results</option>
                <option value="onTime">On time only</option>
                <option value="late">Late only</option>
              </select>
            </div>

            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.historyTable}`}>
                <thead>
                  <tr>
                    <th />
                    <th>Trip</th>
                    <th>Type</th>
                    <th>Driver</th>
                    <th>Equipment</th>
                    <th>AWB(s)</th>
                    <th>Cargo</th>
                    <th>Departed</th>
                    <th>Finished</th>
                    <th>Duration</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className={styles.emptyCell}>
                        No completed trips match these filters.
                      </td>
                    </tr>
                  ) : (
                    historyRows.slice(0, 80).map((t) => {
                      const timing = tripTiming(t);
                      const cargo = tripCargoSummary(t.shipments || []);
                      const open = expandedId === t.id;
                      const awbPreview =
                        cargo.awbs.length === 0
                          ? "—"
                          : cargo.awbs.length === 1
                            ? cargo.awbs[0]
                            : `${cargo.awbs[0]} +${cargo.awbs.length - 1}`;

                      return (
                        <React.Fragment key={t.id}>
                          <tr
                            className={`${styles.historyRow} ${open ? styles.historyRowOpen : ""}`}
                            onClick={() => toggleExpand(t.id)}
                          >
                            <td className={styles.expandCell}>
                              <FontAwesomeIcon
                                icon={open ? faChevronUp : faChevronDown}
                              />
                            </td>
                            <td className={styles.mono}>{t.tripNumber}</td>
                            <td>
                              <span
                                className={`${styles.tag} ${t.runType === "Export" ? styles.tagExport : ""}`}
                              >
                                {t.runType || "—"}
                              </span>
                            </td>
                            <td>
                              <div className={styles.driverCell}>
                                <FontAwesomeIcon icon={faUser} />
                                <span>{t.driver?.name || "—"}</span>
                              </div>
                            </td>
                            <td>
                              {t.truck?.unitNumber || "—"}
                              {t.trailer?.unitNumber
                                ? ` + ${t.trailer.unitNumber}`
                                : ""}
                            </td>
                            <td className={styles.awbCell}>
                              <FontAwesomeIcon icon={faBarcode} />
                              {awbPreview}
                            </td>
                            <td>
                              {cargo.pieces} pcs · {fmtNum(cargo.weightLb)} lb
                            </td>
                            <td>
                              {shortDate(t.startTime)}
                              {timing.departDeltaMs != null &&
                                timing.departDeltaMs > 5 * 60000 && (
                                  <div className={styles.lateHint}>
                                    depart +
                                    {formatDurationMs(timing.departDeltaMs)}
                                  </div>
                                )}
                            </td>
                            <td>{shortDate(t.finishTime)}</td>
                            <td>
                              <strong>
                                {timing.actualDurationMs != null
                                  ? formatDurationMs(timing.actualDurationMs)
                                  : "—"}
                              </strong>
                              {timing.plannedWindowMs != null && (
                                <div className={styles.planHint}>
                                  plan{" "}
                                  {formatDurationMs(timing.plannedWindowMs)}
                                </div>
                              )}
                            </td>
                            <td>
                              {timing.resultClass === "onTime" ? (
                                <span className={styles.onTime}>On time</span>
                              ) : timing.resultClass === "late" ? (
                                <span className={styles.late}>
                                  {timing.result}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                          {open && (
                            <tr className={styles.detailRow}>
                              <td colSpan={11}>
                                <div className={styles.detailGrid}>
                                  <div className={styles.detailBlock}>
                                    <h4>
                                      <FontAwesomeIcon icon={faClock} /> Timing
                                      audit
                                    </h4>
                                    <ul>
                                      <li>
                                        Planned depart:{" "}
                                        <strong>
                                          {shortDate(t.plannedDepartureTime)}
                                        </strong>
                                      </li>
                                      <li>
                                        Actual depart:{" "}
                                        <strong>
                                          {shortDate(t.startTime)}
                                        </strong>
                                      </li>
                                      <li>
                                        Expected empty:{" "}
                                        <strong>
                                          {shortDate(t.expectedCompletionTime)}
                                        </strong>
                                      </li>
                                      <li>
                                        Actual empty:{" "}
                                        <strong>
                                          {shortDate(t.finishTime)}
                                        </strong>
                                      </li>
                                      <li>
                                        Actual duration:{" "}
                                        <strong>
                                          {timing.actualDurationMs != null
                                            ? formatDurationMs(
                                                timing.actualDurationMs,
                                              )
                                            : "—"}
                                        </strong>
                                      </li>
                                      <li>
                                        Planned window:{" "}
                                        <strong>
                                          {timing.plannedWindowMs != null
                                            ? formatDurationMs(
                                                timing.plannedWindowMs,
                                              )
                                            : "—"}
                                        </strong>
                                      </li>
                                    </ul>
                                  </div>

                                  <div className={styles.detailBlock}>
                                    <h4>
                                      <FontAwesomeIcon icon={faUser} /> Team
                                    </h4>
                                    <ul>
                                      <li>
                                        Driver:{" "}
                                        <strong>{t.driver?.name || "—"}</strong>
                                        {t.driver?.phone
                                          ? ` · ${t.driver.phone}`
                                          : ""}
                                      </li>
                                      <li>
                                        Employee ID:{" "}
                                        <strong>
                                          {t.driver?.employeeId || "—"}
                                        </strong>
                                      </li>
                                      <li>
                                        Power unit:{" "}
                                        <strong>
                                          {t.truck?.unitNumber || "—"}
                                        </strong>
                                      </li>
                                      <li>
                                        Trailer:{" "}
                                        <strong>
                                          {t.trailer?.unitNumber || "None"}
                                        </strong>
                                      </li>
                                      {t.notes && (
                                        <li>
                                          Notes: <em>{t.notes}</em>
                                        </li>
                                      )}
                                    </ul>
                                  </div>

                                  <div
                                    className={`${styles.detailBlock} ${styles.detailCargo}`}
                                  >
                                    <h4>
                                      <FontAwesomeIcon icon={faBoxesStacked} />{" "}
                                      Cargo on this run (
                                      {(t.shipments || []).length} permit
                                      {(t.shipments || []).length !== 1
                                        ? "s"
                                        : ""}
                                      )
                                    </h4>
                                    {(t.shipments || []).length === 0 ? (
                                      <p className={styles.empty}>
                                        No shipments linked — check assignment
                                        history.
                                      </p>
                                    ) : (
                                      <table className={styles.cargoTable}>
                                        <thead>
                                          <tr>
                                            <th>AWB</th>
                                            <th>Type</th>
                                            <th>Airline</th>
                                            <th>Warehouse</th>
                                            <th>Pieces</th>
                                            <th>Weight</th>
                                            <th>ORD / Door</th>
                                            <th>Status</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(t.shipments || []).map((s) => (
                                            <tr key={s.id}>
                                              <td className={styles.mono}>
                                                {awbLabel(s)}
                                              </td>
                                              <td>{s.type || "—"}</td>
                                              <td>
                                                {s.airline?.name || "—"}
                                                {s.airline?.code
                                                  ? ` (${s.airline.code})`
                                                  : ""}
                                              </td>
                                              <td>
                                                {s.warehouse?.name || "—"}
                                              </td>
                                              <td>
                                                <strong>
                                                  {s.pieces ?? "—"}
                                                </strong>
                                              </td>
                                              <td>
                                                {s.weight ?? "—"}{" "}
                                                {s.weightUnit || "lb"}
                                              </td>
                                              <td>
                                                {s.ordNumber || "—"}
                                                {s.doorNumber
                                                  ? ` · Door ${s.doorNumber}`
                                                  : ""}
                                              </td>
                                              <td>{s.status || "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot>
                                          <tr>
                                            <td colSpan={4}>
                                              <strong>Run totals</strong>
                                            </td>
                                            <td>
                                              <strong>{cargo.pieces}</strong>
                                            </td>
                                            <td>
                                              <strong>
                                                {fmtNum(cargo.weightLb)} lb
                                              </strong>
                                            </td>
                                            <td colSpan={2} />
                                          </tr>
                                        </tfoot>
                                      </table>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
