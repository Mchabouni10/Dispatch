import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPencil, faMapMarkerAlt, faClock, faTag, faPhone,
  faInfinity, faDoorOpen, faDoorClosed, faPlane,
  faNoteSticky, faImage, faHourglassHalf,
} from '@fortawesome/free-solid-svg-icons';
import { resolveUploadUrl } from '../../api/api.js';
import styles from './AirlineDetailView.module.css';

const DAYS = [
  { key: 'MON', label: 'M', full: 'Mon' },
  { key: 'TUE', label: 'T', full: 'Tue' },
  { key: 'WED', label: 'W', full: 'Wed' },
  { key: 'THU', label: 'T', full: 'Thu' },
  { key: 'FRI', label: 'F', full: 'Fri' },
  { key: 'SAT', label: 'S', full: 'Sat' },
  { key: 'SUN', label: 'S', full: 'Sun' },
];
const DAY_ORDER = DAYS.map(d => d.key);
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

const formatTime12h = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
};

function formatDays(daysOpen = []) {
  if (!daysOpen?.length) return 'Days not set';
  if (daysOpen.length === 7) return 'Every day';
  if (daysOpen.length === 5 && WEEKDAYS.every(d => daysOpen.includes(d))) return 'Weekdays';
  const indices = daysOpen.map(d => DAY_ORDER.indexOf(d)).filter(i => i >= 0).sort((a, b) => a - b);
  const isContiguous = indices.length > 1 && indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
  if (isContiguous) {
    return `${DAYS[indices[0]].full}–${DAYS[indices[indices.length - 1]].full}`;
  }
  return indices.map(i => DAYS[i].full).join(', ');
}

function formatHours(a) {
  if (a.open24h) return '24/7';
  const days = formatDays(a.daysOpen);
  const time =
    a.openTime && a.closeTime
      ? `${formatTime12h(a.openTime)}–${formatTime12h(a.closeTime)}`
      : '';
  return [days, time].filter(Boolean).join(' • ');
}

const isOpenNow = (airline) => {
  if (airline.open24h) return true;
  if (!airline.openTime || !airline.closeTime) return false;

  // If days are set, require today to be open
  if (airline.daysOpen?.length) {
    const dayKey = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date().getDay()];
    if (!airline.daysOpen.includes(dayKey)) return false;
  }

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = airline.openTime.split(':').map(Number);
  const [ch, cm] = airline.closeTime.split(':').map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  if (openMin === closeMin) return true;
  if (openMin < closeMin) return nowMin >= openMin && nowMin < closeMin;
  return nowMin >= openMin || nowMin < closeMin;
};

/**
 * Standalone airline detail view — used inside the list modal
 * or as a full-page route. Keeps presentation separate from list CRUD.
 */
export default function AirlineDetailView({
  airline,
  onClose,
  onEdit,
  hideActions = false,
}) {
  if (!airline) return null;

  const open = isOpenNow(airline);
  const logoSrc = airline.logoUrl ? resolveUploadUrl(airline.logoUrl) : null;

  return (
    <div className={styles.detail}>
      {/* Hero */}
      <div className={styles.hero}>
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={`${airline.name} logo`}
            className={styles.heroLogo}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className={styles.heroCode}>{airline.code}</div>
        )}
        <div className={styles.heroText}>
          <h2 className={styles.title}>{airline.name}</h2>
          <div className={styles.heroMeta}>
            <span className={styles.codeChip}>{airline.code}</span>
            <span className={styles.awbChip}>
              <FontAwesomeIcon icon={faTag} /> AWB {airline.awbPrefix}-
            </span>
          </div>
        </div>
      </div>

      {/* Live status + quick pills */}
      <div className={styles.pills}>
        {airline.open24h ? (
          <span className={`${styles.pill} ${styles.pill24}`}>
            <FontAwesomeIcon icon={faInfinity} /> Open 24 hours
          </span>
        ) : (
          <span className={`${styles.pill} ${open ? styles.pillOpen : styles.pillClosed}`}>
            <span className={`${styles.statusDot} ${open ? styles.statusDotOpen : styles.statusDotClosed}`} />
            <FontAwesomeIcon icon={open ? faDoorOpen : faDoorClosed} />
            {open ? 'Open now' : 'Closed now'}
          </span>
        )}
        {airline.defaultCutoffHours != null && (
          <span className={styles.pill}>
            <FontAwesomeIcon icon={faHourglassHalf} />
            Cutoff {airline.defaultCutoffHours}h before flight
          </span>
        )}
      </div>

      {/* Location & contact */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FontAwesomeIcon icon={faMapMarkerAlt} /> Terminal &amp; contact
        </h3>
        <div className={styles.infoGrid}>
          {airline.terminalAddress && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Terminal address</span>
              <span className={styles.infoValue}>{airline.terminalAddress}</span>
            </div>
          )}
          {airline.contactPhone && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>
                <FontAwesomeIcon icon={faPhone} /> Phone
              </span>
              <span className={styles.infoValue}>{airline.contactPhone}</span>
            </div>
          )}
          {!airline.terminalAddress && !airline.contactPhone && (
            <p className={styles.emptyHint}>No terminal or contact details on file.</p>
          )}
        </div>
      </section>

      {/* Hours */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FontAwesomeIcon icon={faClock} /> Operating hours
        </h3>
        <div className={styles.hoursBlock}>
          <span className={styles.hoursMain}>{formatHours(airline)}</span>
          {!airline.open24h && (airline.daysOpen?.length > 0) && (
            <div className={styles.dayStrip}>
              {DAYS.map(d => (
                <span
                  key={d.key}
                  className={`${styles.dayChip} ${
                    airline.daysOpen.includes(d.key) ? styles.dayChipOn : ''
                  }`}
                  title={d.full}
                >
                  {d.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Operations */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FontAwesomeIcon icon={faPlane} /> Cargo operations
        </h3>
        <div className={styles.flagGrid}>
          <div className={styles.flag}>
            <FontAwesomeIcon icon={faTag} className={styles.flagAccent} />
            <div>
              <span className={styles.infoLabel}>AWB prefix</span>
              <span className={styles.infoValue}>{airline.awbPrefix}-</span>
            </div>
          </div>
          <div className={styles.flag}>
            <FontAwesomeIcon icon={faHourglassHalf} className={styles.flagAccent} />
            <div>
              <span className={styles.infoLabel}>Export cutoff</span>
              <span className={styles.infoValue}>
                {airline.defaultCutoffHours} hour{airline.defaultCutoffHours === 1 ? '' : 's'} before flight
              </span>
            </div>
          </div>
          <div className={styles.flag}>
            <FontAwesomeIcon
              icon={airline.open24h || open ? faDoorOpen : faDoorClosed}
              className={airline.open24h || open ? styles.flagYes : styles.flagNo}
            />
            <div>
              <span className={styles.infoLabel}>Status</span>
              <span className={styles.infoValue}>
                {airline.open24h ? 'Always open' : open ? 'Open now' : 'Closed now'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Notes */}
      {airline.notes ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <FontAwesomeIcon icon={faNoteSticky} /> Notes
          </h3>
          <p className={styles.notes}>{airline.notes}</p>
        </section>
      ) : null}

      {!hideActions && (
        <div className={styles.actions}>
          {onClose && (
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Close
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              className={styles.saveBtn}
              onClick={() => onEdit(airline)}
            >
              <FontAwesomeIcon icon={faPencil} /> Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
