import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFlagCheckered,
  faTriangleExclamation,
  faTruck,
} from "@fortawesome/free-solid-svg-icons";
import { shortTime, formatDuration } from "../../utils/dispatchHelpers.js";
import styles from "./RunTimeline.module.css";

export default function RunTimeline({ trip }) {
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
            {(phase === "waiting" || phase === "overdue" || phase === "late") && (
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
              <em className={styles.actualNote}>actual {shortTime(finishAt)}</em>
            )}
          </div>
          <span className={styles.endpointDot} data-tone="end" />
        </div>
      </div>

      {/* The road */}
      <div className={styles.roadWrap}>
        <div className={`${styles.track} ${trackClass}`}>
          <div className={styles.roadDashes} aria-hidden />
          <div
            className={styles.trackFill}
            style={{ width: `${displayPct * 100}%` }}
          />
          <div className={styles.goalMark} title="Expected completion" />

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

      {/* Bottom meta */}
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