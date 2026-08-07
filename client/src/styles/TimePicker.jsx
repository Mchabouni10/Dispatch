import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './TimePicker.module.css';

/**
 * Tiny clock icon — zero extra dependencies, matches DateTimePicker style.
 */
function FiClock(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Parse "HH:mm" (24h) → { hour12, minute, ampm } or null */
function parseHHMM(v) {
  if (!v || typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, minute: min, ampm, hour24: h };
}

/** { hour12, minute, ampm } → "HH:mm" */
function toHHMM(hour12, minute, ampm) {
  let h = hour12 % 12;
  if (ampm === 'PM') h += 12;
  return `${pad2(h)}:${pad2(minute)}`;
}

function formatDisplay(hhmm) {
  const p = parseHHMM(hhmm);
  if (!p) return '';
  return `${pad2(p.hour12)}:${pad2(p.minute)} ${p.ampm}`;
}

/**
 * TimePicker
 * Drop-in themed replacement for <input type="time">.
 * Matches DateTimePicker's time side so the whole app stays consistent.
 *
 * Props:
 *  - value:       string | null   "HH:mm" (24h) e.g. "08:00"
 *  - onChange:    (hhmm: string | null) => void
 *  - placeholder?: string
 *  - disabled?:   boolean
 */
export default function TimePicker({
  value,
  onChange,
  placeholder = 'Select time',
  disabled = false,
}) {
  const parsed = parseHHMM(value);

  const [isOpen, setIsOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(() => parsed?.hour12 ?? 8);
  const [draftMinute, setDraftMinute] = useState(() => parsed?.minute ?? 0);
  const [draftAmPm, setDraftAmPm] = useState(() => parsed?.ampm ?? 'AM');

  // Keep drafts in sync when parent updates value externally
  useEffect(() => {
    const p = parseHHMM(value);
    if (!p) return;
    setDraftHour(p.hour12);
    setDraftMinute(p.minute);
    setDraftAmPm(p.ampm);
  }, [value]);

  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);
  const [coords, setCoords] = useState({ top: -9999, left: -9999 });

  useEffect(() => {
    function handleClickOutside(e) {
      const insideTrigger = wrapRef.current && wrapRef.current.contains(e.target);
      const insidePanel = panelRef.current && panelRef.current.contains(e.target);
      if (!insideTrigger && !insidePanel) setIsOpen(false);
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  function computePosition() {
    const trigger = wrapRef.current;
    if (!trigger) return null;
    const margin = 12;
    const triggerRect = trigger.getBoundingClientRect();
    const panel = panelRef.current;
    const panelWidth = panel ? panel.offsetWidth : 180;
    const panelHeight = panel ? panel.offsetHeight : 280;

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
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function reposition() {
      const pos = computePosition();
      if (pos) setCoords(pos);
    }
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      hourListRef.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: 'center' });
      minuteListRef.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: 'center' });
    });
  }, [isOpen]);

  function commit(hour12, minute, ampm) {
    onChange?.(toHHMM(hour12, minute, ampm));
  }

  function handleHourClick(h) {
    setDraftHour(h);
    commit(h, draftMinute, draftAmPm);
  }

  function handleMinuteClick(m) {
    setDraftMinute(m);
    commit(draftHour, m, draftAmPm);
  }

  function handleAmPmClick(ap) {
    setDraftAmPm(ap);
    commit(draftHour, draftMinute, ap);
  }

  function handleNow() {
    const now = new Date();
    const h24 = now.getHours();
    const min = now.getMinutes();
    const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const ap = h24 >= 12 ? 'PM' : 'AM';
    setDraftHour(hour12);
    setDraftMinute(min);
    setDraftAmPm(ap);
    commit(hour12, min, ap);
  }

  function handleClear() {
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
        <span className={parsed ? styles.triggerValue : styles.triggerPlaceholder}>
          {parsed ? formatDisplay(value) : placeholder}
        </span>
        <FiClock className={styles.triggerIcon} />
      </button>

      {isOpen && createPortal(
        <div
          className={styles.panel}
          ref={panelRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left }}
        >
          <div className={styles.timeSide}>
            <div className={styles.timeCol} ref={hourListRef}>
              {hours.map((h) => (
                <button
                  type="button"
                  key={h}
                  data-active={h === draftHour}
                  className={[styles.timeCell, h === draftHour ? styles.timeCellActive : ''].join(' ')}
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
                  className={[styles.timeCell, m === draftMinute ? styles.timeCellActive : ''].join(' ')}
                  onClick={() => handleMinuteClick(m)}
                >
                  {pad2(m)}
                </button>
              ))}
            </div>
            <div className={styles.ampmCol}>
              {['AM', 'PM'].map((ap) => (
                <button
                  type="button"
                  key={ap}
                  className={[styles.ampmCell, ap === draftAmPm ? styles.ampmCellActive : ''].join(' ')}
                  onClick={() => handleAmPmClick(ap)}
                >
                  {ap}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.panelFooter}>
            <button type="button" className={styles.clearBtn} onClick={handleClear}>
              Clear
            </button>
            <button type="button" className={styles.nowBtn} onClick={handleNow}>
              Now
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
