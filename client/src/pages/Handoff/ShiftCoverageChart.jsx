import React, { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartColumn,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { initials, formatHour12 } from "./handoffHelpers";
import styles from "./ShiftCoverageChart.module.css";


const HOUR_KEYS = Array.from({ length: 24 }, (_, i) => i);

function hourOf(hhmm) {
  if (!hhmm) return null;
  const h = Number(String(hhmm).split(":")[0]);
  return Number.isNaN(h) ? null : h;
}

// Turns a start/end hour pair into 1 or 2 segments (2 when the shift
// crosses midnight, e.g. 22:00 -> 06:00).
function segmentsFor(startHour, endHour) {
  if (startHour == null || endHour == null) return [];
  if (endHour === startHour) return [{ start: 0, end: 24 }]; // full 24h shift
  if (endHour > startHour) return [{ start: startHour, end: endHour }];
  return [
    { start: startHour, end: 24 },
    { start: 0, end: endHour },
  ];
}

const ACTIVE_STATUSES = ["Available", "Break", "On Call"];

export default function ShiftCoverageChart({ drivers, now }) {
  const { hourly, rows, gaps, peak } = useMemo(() => {
    const hourly = new Array(24).fill(0);
    const rows = [];

    (drivers || []).forEach((driver) => {
      const startHour = hourOf(driver.shiftStart);
      const endHour = hourOf(driver.shiftEnd);
      if (startHour == null || endHour == null) return;

      const segments = segmentsFor(startHour, endHour);
      segments.forEach(({ start, end }) => {
        for (let h = start; h < end; h++) hourly[h] += 1;
      });

      rows.push({ driver, segments, startHour });
    });

    rows.sort((a, b) => a.startHour - b.startHour);

    // Find contiguous stretches of hours with zero coverage
    const gaps = [];
    let gapStart = null;
    for (let h = 0; h < 24; h++) {
      if (hourly[h] === 0) {
        if (gapStart === null) gapStart = h;
      } else if (gapStart !== null) {
        gaps.push({ start: gapStart, end: h });
        gapStart = null;
      }
    }
    if (gapStart !== null) gaps.push({ start: gapStart, end: 24 });

    const peak = Math.max(1, ...hourly);

    return { hourly, rows, gaps, peak };
  }, [drivers]);

  if (rows.length === 0) return null;

  const nowPct = now ? ((now.getHours() + now.getMinutes() / 60) / 24) * 100 : null;
  const label = (h) => formatHour12(`${String(h % 24).padStart(2, "0")}:00`);

  return (
    <div className={styles.coverageSection}>
      <div className={styles.coverageHeader}>
        <FontAwesomeIcon icon={faChartColumn} />
        <span>24-Hour Coverage</span>
        <span className={styles.coverageSub}>
          {rows.length} driver{rows.length !== 1 ? "s" : ""} scheduled today
        </span>
        {gaps.length > 0 && (
          <span className={styles.coverageGapBadge}>
            <FontAwesomeIcon icon={faTriangleExclamation} />
            {gaps.length} gap{gaps.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Hourly headcount bars */}
      <div className={styles.coverageChart}>
        {nowPct != null && (
          <div className={styles.coverageNowLine} style={{ left: `${nowPct}%` }} />
        )}
        {HOUR_KEYS.map((h) => {
          const count = hourly[h];
          return (
            <div key={h} className={styles.coverageBarCol}>
              <div className={styles.coverageBarTrack}>
                <div
                  className={`${styles.coverageBar} ${
                    count === 0 ? styles.coverageBarEmpty : ""
                  }`}
                  style={{ height: `${Math.max((count / peak) * 100, count > 0 ? 8 : 0)}%` }}
                  title={`${count} driver${count !== 1 ? "s" : ""} at ${label(h)}`}
                >
                  {count > 0 && (
                    <span className={styles.coverageBarValue}>{count}</span>
                  )}
                </div>
              </div>
              {h % 3 === 0 && (
                <span className={styles.coverageAxisLabel}>{label(h)}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Gap callouts */}
      {gaps.length > 0 && (
        <div className={styles.coverageGapList}>
          {gaps.map((g, i) => (
            <div key={i} className={styles.coverageGapItem}>
              <FontAwesomeIcon icon={faTriangleExclamation} />
              No drivers scheduled {label(g.start)} – {label(g.end)}
            </div>
          ))}
        </div>
      )}

      {/* Per-driver timeline rows */}
      <div className={styles.coverageGantt}>
        {rows.map(({ driver, segments }) => {
          const active = ACTIVE_STATUSES.includes(driver.status);
          return (
            <div key={driver.id} className={styles.coverageRow}>
              <div className={styles.coverageRowLabel}>
                {driver.photo ? (
                  <img
                    src={driver.photo}
                    alt={driver.name}
                    className={styles.coverageAvatar}
                  />
                ) : (
                  <div className={styles.coverageAvatarFallback}>
                    {initials(driver.name)}
                  </div>
                )}
                <span className={styles.coverageRowName}>{driver.name}</span>
              </div>
              <div className={styles.coverageRowTrack}>
                {segments.map((seg, i) => (
                  <div
                    key={i}
                    className={`${styles.coverageRowBar} ${
                      active
                        ? styles.coverageRowBarActive
                        : styles.coverageRowBarPending
                    }`}
                    style={{
                      left: `${(seg.start / 24) * 100}%`,
                      width: `${((seg.end - seg.start) / 24) * 100}%`,
                    }}
                    title={`${driver.name}: ${formatHour12(driver.shiftStart)} – ${formatHour12(
                      driver.shiftEnd,
                    )}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}