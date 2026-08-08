import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import styles from "./DateTimePicker.module.css";

/**
 * Tiny inline icons so this component has zero extra dependencies —
 * no need to install react-icons or any other icon package.
 */
function FiCalendar(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function FiChevronLeft(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function FiChevronRight(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/**
 * DateTimePicker
 * Drop-in replacement for <input type="datetime-local"> that matches the
 * app's dark/light theme instead of falling back to the browser's native
 * (unstylable) calendar UI.
 *
 * Props:
 *  - value:     Date | null
 *  - onChange:  (date: Date) => void
 *  - dateOnly?: boolean   When true, hides the time-of-day column entirely —
 *               use for fields like expiration/due dates where a time of
 *               day is meaningless (e.g. registration, insurance, lease
 *               end dates). Selecting a day always commits midnight.
 *  - placeholder?: string
 *  - disabled?: boolean
 */

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = [
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

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Converts a Date to a local-time ISO-ish string (no timezone suffix),
 * e.g. "2026-08-05T06:46" or, with dateOnly, "2026-08-05".
 *
 * Use this instead of `date.toISOString()` when storing form state that
 * will be fed back into <DateTimePicker value={...} />. `toISOString()`
 * converts to UTC first, and once the trailing "Z" gets sliced off (e.g.
 * `.toISOString().slice(0, 16)`), the string silently becomes a UTC value
 * with no marker saying so. When that string is later re-parsed via
 * `new Date(str)`, a date-time string with no timezone offset is parsed as
 * LOCAL time (and a date-only string as UTC midnight) — so the value comes
 * back shifted by your timezone offset, which looks like the date/time
 * "changing itself" when you re-open the picker.
 */
export function toLocalISO(date, { dateOnly = false } = {}) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  if (dateOnly) return `${y}-${m}-${d}`;
  const h = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
}

// Accepts a Date, an ISO/date-like string, or null/undefined and always
// returns either a valid Date or null. Keeps the component usable whether
// the parent's form state stores dates as strings (e.g. straight from an
// API response or an <input> value) or as Date objects.
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    // A bare "YYYY-MM-DD" string (e.g. from `someIsoString.slice(0, 10)`)
    // is parsed as UTC midnight by `new Date()` per spec, which then
    // renders as the previous day once read back with local getters
    // (getDate/getMonth) in any timezone behind UTC. Parse the components
    // directly as LOCAL midnight instead, since that's what every caller
    // actually means by a date-only value.
    const dateOnlyMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, y, m, d] = dateOnlyMatch;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function formatDisplay(date, { dateOnly = false } = {}) {
  if (!date) return "";
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const yyyy = date.getFullYear();
  if (dateOnly) return `${mm}/${dd}/${yyyy}`;
  let h = date.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const min = pad2(date.getMinutes());
  return `${mm}/${dd}/${yyyy}, ${pad2(h)}:${min} ${ampm}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildCalendarGrid(viewDate) {
  const first = startOfMonth(viewDate);
  const startDay = first.getDay(); // 0 = Sun
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startDay);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function isSameDay(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function DateTimePicker({
  value,
  onChange,
  dateOnly = false,
  placeholder = dateOnly ? "Select date" : "Select date & time",
  disabled = false,
}) {
  const dateValue = toDate(value);

  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(dateValue || new Date());
  // Authoritative "working" date for the duration of an edit session.
  // Hour/minute/am-pm clicks build off THIS instead of re-deriving from the
  // `value` prop each time — otherwise two fast clicks in a row (e.g. hour
  // then minute) can each read a stale `value` before the parent's state
  // update from the first click has round-tripped back down, silently
  // reverting or recombining with an outdated base date/time.
  const [draftDate, setDraftDate] = useState(dateValue || new Date());
  const [draftHour, setDraftHour] = useState(() => {
    const h = (dateValue || new Date()).getHours();
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12;
  });
  const [draftMinute, setDraftMinute] = useState(
    (dateValue || new Date()).getMinutes(),
  );
  const [draftAmPm, setDraftAmPm] = useState(
    (dateValue || new Date()).getHours() >= 12 ? "PM" : "AM",
  );

  // Keep draft hour/minute/am-pm in sync if the parent updates `value`
  // externally (e.g. resetting the form, loading a different record).
  useEffect(() => {
    const d = toDate(value);
    if (!d) return;
    setViewDate(d);
    setDraftDate(d);
    const h12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
    setDraftHour(h12);
    setDraftMinute(d.getMinutes());
    setDraftAmPm(d.getHours() >= 12 ? "PM" : "AM");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);

  // Screen-space coordinates for the portal-rendered panel. Kept off-screen
  // until the first real measurement lands, so there's no flash at (0,0).
  const [coords, setCoords] = useState({ top: -9999, left: -9999 });

  const today = useMemo(() => new Date(), []);
  const cells = useMemo(() => buildCalendarGrid(viewDate), [viewDate]);

  useEffect(() => {
    function handleClickOutside(e) {
      const insideTrigger =
        wrapRef.current && wrapRef.current.contains(e.target);
      const insidePanel =
        panelRef.current && panelRef.current.contains(e.target);
      if (!insideTrigger && !insidePanel) {
        setIsOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Positions the panel against the trigger using real viewport coordinates
  // (position: fixed), then clamps it inside the viewport on every axis.
  // Because the panel portals to document.body, this is immune to any
  // ancestor's overflow:hidden/auto — e.g. a modal's scrollable body, which
  // is what was clipping it before.
  function computePosition() {
    const trigger = wrapRef.current;
    if (!trigger) return null;

    const margin = 12;
    const triggerRect = trigger.getBoundingClientRect();
    const panel = panelRef.current;
    const panelWidth = panel ? panel.offsetWidth : trigger.offsetWidth;
    const panelHeight = panel ? panel.offsetHeight : 320;

    let left = triggerRect.left;
    if (left + panelWidth > window.innerWidth - margin) {
      left = window.innerWidth - margin - panelWidth;
    }
    if (left < margin) left = margin;

    let top = triggerRect.bottom + 8;
    if (top + panelHeight > window.innerHeight - margin) {
      const flippedTop = triggerRect.top - panelHeight - 8;
      top = flippedTop > margin ? flippedTop : margin;
    }

    return { top, left };
  }

  useLayoutEffect(() => {
    if (!isOpen) return;
    const pos = computePosition();
    if (pos) setCoords(pos);
  }, [isOpen, viewDate]);

  useEffect(() => {
    if (!isOpen) return;
    function reposition() {
      const pos = computePosition();
      if (pos) setCoords(pos);
    }
    // capture:true so this also fires for scroll on the modal's own
    // scrollable body, not just the window.
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    // scroll active hour/minute into view when opening
    requestAnimationFrame(() => {
      hourListRef.current
        ?.querySelector(`[data-active="true"]`)
        ?.scrollIntoView({ block: "center" });
      minuteListRef.current
        ?.querySelector(`[data-active="true"]`)
        ?.scrollIntoView({ block: "center" });
    });
  }, [isOpen]);

  function commit(nextDate, hour12, minute, ampm) {
    const result = new Date(nextDate);
    if (dateOnly) {
      result.setHours(0, 0, 0, 0);
    } else {
      let h = hour12 % 12;
      if (ampm === "PM") h += 12;
      result.setHours(h, minute, 0, 0);
    }
    // Update our own base immediately — don't wait for the parent to hand
    // `value` back down before the next click reads it.
    setDraftDate(result);
    onChange?.(result);
  }

  function handleDayClick(day) {
    commit(day, draftHour, draftMinute, draftAmPm);
  }

  function handleHourClick(h) {
    setDraftHour(h);
    commit(draftDate, h, draftMinute, draftAmPm);
  }

  function handleMinuteClick(m) {
    setDraftMinute(m);
    commit(draftDate, draftHour, m, draftAmPm);
  }

  function handleAmPmClick(ap) {
    setDraftAmPm(ap);
    commit(draftDate, draftHour, draftMinute, ap);
  }

  function handleToday() {
    const now = new Date();
    setViewDate(now);
    const h12 = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12;
    const ap = now.getHours() >= 12 ? "PM" : "AM";
    setDraftHour(h12);
    setDraftMinute(now.getMinutes());
    setDraftAmPm(ap);
    commit(now, h12, now.getMinutes(), ap);
  }

  const showTimeSide = !dateOnly;

  function handleClear() {
    const now = new Date();
    setDraftDate(now);
    onChange?.(null);
    setIsOpen(false);
  }

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        disabled={disabled}
        onClick={() => setIsOpen((o) => !o)}
      >
        <span
          className={
            dateValue ? styles.triggerValue : styles.triggerPlaceholder
          }
        >
          {dateValue ? formatDisplay(dateValue, { dateOnly }) : placeholder}
        </span>
        <FiCalendar className={styles.triggerIcon} />
      </button>

      {isOpen &&
        createPortal(
          <div
            className={styles.panel}
            ref={panelRef}
            style={{ position: "fixed", top: coords.top, left: coords.left }}
          >
            <div className={styles.panelBody}>
              {/* Calendar side */}
              <div
                className={[
                  styles.calendarSide,
                  dateOnly ? styles.calendarSideOnly : "",
                ].join(" ")}
              >
                <div className={styles.monthRow}>
                  <span className={styles.monthLabel}>
                    {MONTH_LABELS[viewDate.getMonth()]} {viewDate.getFullYear()}
                  </span>
                  <div className={styles.monthNav}>
                    <button
                      type="button"
                      className={styles.navBtn}
                      onClick={() =>
                        setViewDate(
                          new Date(
                            viewDate.getFullYear(),
                            viewDate.getMonth() - 1,
                            1,
                          ),
                        )
                      }
                      aria-label="Previous month"
                    >
                      <FiChevronLeft />
                    </button>
                    <button
                      type="button"
                      className={styles.navBtn}
                      onClick={() =>
                        setViewDate(
                          new Date(
                            viewDate.getFullYear(),
                            viewDate.getMonth() + 1,
                            1,
                          ),
                        )
                      }
                      aria-label="Next month"
                    >
                      <FiChevronRight />
                    </button>
                  </div>
                </div>

                <div className={styles.dayLabelRow}>
                  {DAY_LABELS.map((d, i) => (
                    <span key={i} className={styles.dayLabel}>
                      {d}
                    </span>
                  ))}
                </div>

                <div className={styles.dayGrid}>
                  {cells.map((day, i) => {
                    const outsideMonth = day.getMonth() !== viewDate.getMonth();
                    const selected = isSameDay(day, dateValue);
                    const isToday = isSameDay(day, today);
                    return (
                      <button
                        type="button"
                        key={i}
                        className={[
                          styles.dayCell,
                          outsideMonth ? styles.dayCellMuted : "",
                          selected ? styles.dayCellSelected : "",
                          isToday && !selected ? styles.dayCellToday : "",
                        ].join(" ")}
                        onClick={() => handleDayClick(day)}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time side — omitted entirely in dateOnly mode */}
              {showTimeSide && (
                <div className={styles.timeSide}>
                  <div className={styles.timeCol} ref={hourListRef}>
                    {hours.map((h) => (
                      <button
                        type="button"
                        key={h}
                        data-active={h === draftHour}
                        className={[
                          styles.timeCell,
                          h === draftHour ? styles.timeCellActive : "",
                        ].join(" ")}
                        onClick={() => handleHourClick(h)}
                      >
                        {pad2(h)}
                      </button>
                    ))}
                  </div>
                  <div className={styles.timeCol} ref={minuteListRef}>
                    {minutes.map((m) => (
                      <button
                        type="button"
                        key={m}
                        data-active={m === draftMinute}
                        className={[
                          styles.timeCell,
                          m === draftMinute ? styles.timeCellActive : "",
                        ].join(" ")}
                        onClick={() => handleMinuteClick(m)}
                      >
                        {pad2(m)}
                      </button>
                    ))}
                  </div>
                  <div className={styles.ampmCol}>
                    {["AM", "PM"].map((ap) => (
                      <button
                        type="button"
                        key={ap}
                        className={[
                          styles.ampmCell,
                          ap === draftAmPm ? styles.ampmCellActive : "",
                        ].join(" ")}
                        onClick={() => handleAmPmClick(ap)}
                      >
                        {ap}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.panelFooter}>
              <button
                type="button"
                className={styles.clearBtn}
                onClick={handleClear}
              >
                Clear
              </button>
              <button
                type="button"
                className={styles.todayBtn}
                onClick={handleToday}
              >
                Today
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
