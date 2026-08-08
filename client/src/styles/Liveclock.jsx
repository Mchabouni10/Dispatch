import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import styles from "../styles/shared.module.css"; // adjust path per page's folder depth

/**
 * Shared header clock. Used by DashboardView, HandoffView, and any other
 * page that needs a live time/date readout. Ticks internally, so no parent
 * state or interval is needed — just drop <LiveClock /> in the header.
 *
 * Styling lives in shared.module.css (.liveClock, .clockIcon, .clockText,
 * .clockTime, .clockDate) so every page looks identical. Edit styles there,
 * not in a page-level module.css.
 */
export default function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.liveClock}>
      <FontAwesomeIcon icon={faClock} className={styles.clockIcon} />
      <div className={styles.clockText}>
        <span className={styles.clockTime}>
          {now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
        <span className={styles.clockDate}>
          {now.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </div>
  );
}