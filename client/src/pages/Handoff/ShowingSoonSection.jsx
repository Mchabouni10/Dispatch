import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHourglassHalf,
  faKey,
  faPhone,
  faTruckFront,
  faTriangleExclamation,
  faVolumeHigh,
  faVolumeXmark,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import {
  initials,
  formatHour12,
  formatDuration,
  eligibleTypesFor,
} from "./handoffHelpers";
import styles from "./HandoffView.module.css";

const MUTE_KEY = "handoffShowingSoonMuted";
const COLLAPSE_THRESHOLD = 6;

// Short two-tone chime via the Web Audio API — no audio asset needed.
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1108].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
    setTimeout(() => ctx.close(), 700);
  } catch {
    // Audio isn't critical — fail silently (e.g. autoplay restrictions)
  }
}

/**
 * Compact strip showing drivers scheduled to start within the next 2 hours
 * who have not yet checked in. Color intensity reflects urgency.
 *
 * Also surfaces whether equipment is actually ready for each driver
 * (so dispatch can pre-stage a truck before they walk in), gives a
 * one-tap call action, and chimes once when a driver first crosses into
 * the "urgent" (≤30 min) window.
 */
export default function ShowingSoonSection({
  upcomingDrivers,
  busyId,
  onCheckIn,
  availableTrucks = [],
}) {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [expanded, setExpanded] = useState(false);
  const alertedRef = useRef(new Set());

  const toggleMuted = () => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  // Chime once per driver the first time they cross into the urgent
  // (<=30 min) window, so dispatch notices without staring at the screen.
  useEffect(() => {
    if (!upcomingDrivers) return;
    const stillPresent = new Set();
    let shouldChime = false;
    upcomingDrivers.forEach(({ driver, minsUntil }) => {
      if (minsUntil <= 30) {
        stillPresent.add(driver.id);
        if (!alertedRef.current.has(driver.id)) {
          shouldChime = true;
        }
      }
    });
    alertedRef.current = stillPresent;
    if (shouldChime && !muted) playChime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingDrivers]);

  if (!upcomingDrivers || upcomingDrivers.length === 0) return null;

  const visibleDrivers = expanded
    ? upcomingDrivers
    : upcomingDrivers.slice(0, COLLAPSE_THRESHOLD);
  const hiddenCount = upcomingDrivers.length - visibleDrivers.length;

  return (
    <div className={styles.showingSoonSection}>
      <div className={styles.showingSoonHeader}>
        <FontAwesomeIcon icon={faHourglassHalf} />
        <span>Showing Soon</span>
        <span className={styles.showingSoonCount}>
          {upcomingDrivers.length} driver
          {upcomingDrivers.length !== 1 ? "s" : ""} expected in next 2 hours
        </span>
        <button
          type="button"
          className={styles.showingSoonMuteBtn}
          onClick={toggleMuted}
          title={muted ? "Unmute arrival alerts" : "Mute arrival alerts"}
        >
          <FontAwesomeIcon icon={muted ? faVolumeXmark : faVolumeHigh} />
        </button>
      </div>
      <div className={styles.showingSoonList}>
        {visibleDrivers.map(({ driver, minsUntil }) => {
          const urgent = minsUntil <= 30;
          const soon = minsUntil <= 60;

          const eligible = eligibleTypesFor(driver);
          const truckReady =
            eligible.length === 0 ||
            availableTrucks.some((t) => eligible.includes(t.equipmentType));

          return (
            <div
              key={driver.id}
              className={`${styles.showingSoonCard} ${
                urgent
                  ? styles.showingSoonUrgent
                  : soon
                    ? styles.showingSoonNear
                    : ""
              }`}
            >
              <div className={styles.showingSoonTop}>
                {driver.photo ? (
                  <img
                    src={driver.photo}
                    alt={driver.name}
                    className={styles.showingSoonAvatar}
                  />
                ) : (
                  <div className={styles.showingSoonAvatarFallback}>
                    {initials(driver.name)}
                  </div>
                )}
                <div className={styles.showingSoonInfo}>
                  <div className={styles.showingSoonName}>{driver.name}</div>
                  <div className={styles.showingSoonMeta}>
                    Starts {formatHour12(driver.shiftStart)}
                    {driver.shiftEnd
                      ? ` – ${formatHour12(driver.shiftEnd)}`
                      : ""}
                  </div>
                </div>
                <div
                  className={`${styles.showingSoonBadge} ${
                    urgent
                      ? styles.badgeUrgent
                      : soon
                        ? styles.badgeNear
                        : styles.badgeLater
                  }`}
                >
                  in {formatDuration(minsUntil)}
                </div>
              </div>

              <div className={styles.showingSoonBottom}>
                <span
                  className={`${styles.equipReadyBadge} ${
                    truckReady ? styles.equipReady : styles.equipNotReady
                  }`}
                  title={
                    truckReady
                      ? "A matching truck is available"
                      : "No matching truck is free yet — check cooldown/swap board"
                  }
                >
                  <FontAwesomeIcon
                    icon={truckReady ? faTruckFront : faTriangleExclamation}
                  />
                  {truckReady ? "Truck ready" : "No truck free"}
                </span>

                <div className={styles.showingSoonActions}>
                  {driver.phone && (
                    <a
                      href={`tel:${driver.phone}`}
                      className={styles.showingSoonCallBtn}
                      title={`Call ${driver.name}`}
                    >
                      <FontAwesomeIcon icon={faPhone} />
                    </a>
                  )}
                  <button
                    className={styles.showingSoonCheckIn}
                    onClick={() => onCheckIn(driver)}
                    disabled={busyId === driver.id}
                    title="Check in now"
                  >
                    <FontAwesomeIcon icon={faKey} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          className={styles.showingSoonMoreBtn}
          onClick={() => setExpanded(true)}
        >
          Show {hiddenCount} more
          <FontAwesomeIcon icon={faChevronDown} />
        </button>
      )}
    </div>
  );
}