import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPencil, faLocationDot, faEnvelope, faDolly,
  faShieldHalved, faDoorOpen, faCircleCheck, faCircleXmark,
  faClock, faPhone, faNoteSticky, faWarehouse,
  faChevronLeft, faChevronRight, faXmark, faExpand,
} from '@fortawesome/free-solid-svg-icons';
import styles from './WarehouseDetailView.module.css';

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

const SECURITY_TYPES = [
  { key: 'open', label: 'Open Access', icon: faDoorOpen },
  { key: 'manned', label: 'Manned Gate', icon: faShieldHalved },
  { key: 'keypad', label: 'Keypad Gate', icon: faShieldHalved },
  { key: 'keycard', label: 'Keycard Gate', icon: faShieldHalved },
];

function formatDays(daysOpen = []) {
  if (daysOpen.length === 0) return 'Days not set';
  if (daysOpen.length === 7) return 'Every day';
  if (daysOpen.length === 5 && WEEKDAYS.every(d => daysOpen.includes(d))) return 'Weekdays';
  const indices = daysOpen.map(d => DAY_ORDER.indexOf(d)).sort((a, b) => a - b);
  const isContiguous = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
  if (isContiguous && indices.length > 1) {
    return `${DAYS[indices[0]].full}–${DAYS[indices[indices.length - 1]].full}`;
  }
  return indices.map(i => DAYS[i].full).join(', ');
}

function formatHours(w) {
  if (w.is24Hours) return '24/7';
  const days = formatDays(w.daysOpen);
  const time = w.openTime && w.closeTime ? `${w.openTime}–${w.closeTime}` : '';
  return [days, time].filter(Boolean).join(' • ');
}

function formatBay(w) {
  if (w.bayFrom == null && w.bayTo == null) return null;
  const label = w.bayType === 'parking' ? 'Spots' : 'Doors';
  if (w.bayFrom != null && w.bayTo != null) return `${label} ${w.bayFrom}–${w.bayTo}`;
  return `${label} ${w.bayFrom ?? w.bayTo}`;
}

function securityMeta(type) {
  return SECURITY_TYPES.find(s => s.key === type) || null;
}

/**
 * Standalone warehouse detail view — used inside the list page modal
 * or as a full-page route. Keeps presentation separate from list CRUD.
 */
export default function WarehouseDetailView({
  warehouse,
  onClose,
  onEdit,
  /** When true, omit the bottom action bar (useful if parent already has chrome). */
  hideActions = false,
}) {
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const images = warehouse?.images || [];
  const hasImages = images.length > 0;

  const showPrev = useCallback((e) => {
    e?.stopPropagation();
    setActiveImage(i => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const showNext = useCallback((e) => {
    e?.stopPropagation();
    setActiveImage(i => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      else if (e.key === 'ArrowLeft') showPrev();
      else if (e.key === 'ArrowRight') showNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, showPrev, showNext]);

  if (!warehouse) return null;

  const security = securityMeta(warehouse.securityType);
  const bay = formatBay(warehouse);

  const stats = [
    {
      icon: faClock,
      label: 'Hours',
      value: formatHours(warehouse),
      tone: warehouse.is24Hours ? 'accent' : 'default',
    },
    security && { icon: security.icon, label: 'Gate security', value: security.label, tone: 'default' },
    bay && {
      icon: faDolly,
      label: warehouse.bayType === 'parking' ? 'Parking' : 'Dock doors',
      value: bay,
      tone: 'default',
    },
    {
      icon: warehouse.appointmentRequired ? faCircleCheck : faCircleXmark,
      label: 'Appointment',
      value: warehouse.appointmentRequired ? 'Required' : 'Not required',
      tone: warehouse.appointmentRequired ? 'warn' : 'muted',
    },
    {
      icon: warehouse.forkliftAvailable ? faCircleCheck : faCircleXmark,
      label: 'Forklift',
      value: warehouse.forkliftAvailable ? 'On site' : 'Not available',
      tone: warehouse.forkliftAvailable ? 'ok' : 'muted',
    },
  ].filter(Boolean);

  return (
    <div className={styles.detail}>
      {/* Hero gallery */}
      <div className={styles.hero}>
        {hasImages ? (
          <>
            <button
              type="button"
              className={styles.heroFrame}
              onClick={() => setLightboxOpen(true)}
              aria-label="Expand photo"
            >
              <img
                src={images[activeImage]}
                alt={`${warehouse.name} photo ${activeImage + 1}`}
                className={styles.heroImage}
              />
              <span className={styles.heroExpandHint}>
                <FontAwesomeIcon icon={faExpand} /> View full size
              </span>
              {images.length > 1 && (
                <span className={styles.heroCount}>{activeImage + 1} / {images.length}</span>
              )}
            </button>

            {images.length > 1 && (
              <>
                <button type="button" className={`${styles.heroNav} ${styles.heroNavPrev}`} onClick={showPrev} aria-label="Previous photo">
                  <FontAwesomeIcon icon={faChevronLeft} />
                </button>
                <button type="button" className={`${styles.heroNav} ${styles.heroNavNext}`} onClick={showNext} aria-label="Next photo">
                  <FontAwesomeIcon icon={faChevronRight} />
                </button>
                <div className={styles.thumbStrip}>
                  {images.map((src, i) => (
                    <button
                      type="button"
                      key={i}
                      className={`${styles.thumbBtn} ${i === activeImage ? styles.thumbBtnActive : ''}`}
                      onClick={() => setActiveImage(i)}
                      aria-label={`Show photo ${i + 1}`}
                    >
                      <img src={src} alt="" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className={styles.heroEmpty}>
            <FontAwesomeIcon icon={faWarehouse} />
            <span>No photos attached</span>
          </div>
        )}
      </div>

      {/* Title */}
      <div className={styles.titleBlock}>
        <h2 className={styles.title}>{warehouse.name}</h2>
        {warehouse.address && (
          <div className={styles.subtitle}>
            <FontAwesomeIcon icon={faLocationDot} />
            <span>{warehouse.address}</span>
          </div>
        )}
      </div>

      {/* At-a-glance stats */}
      <div className={styles.statStrip}>
        {stats.map((s, i) => (
          <div key={i} className={`${styles.statCard} ${styles[`stat_${s.tone}`]}`}>
            <FontAwesomeIcon icon={s.icon} className={styles.statIcon} />
            <div className={styles.statText}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={styles.statValue}>{s.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Two-column detail */}
      <div className={styles.columns}>
        <section className={styles.card}>
          <h3 className={styles.sectionTitle}>
            <FontAwesomeIcon icon={faPhone} /> Contact
          </h3>
          {warehouse.contactPhone || warehouse.contactEmail ? (
            <div className={styles.infoList}>
              {warehouse.contactPhone && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Phone</span>
                  <span className={styles.infoValue}>{warehouse.contactPhone}</span>
                </div>
              )}
              {warehouse.contactEmail && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>
                    <FontAwesomeIcon icon={faEnvelope} /> Email
                  </span>
                  <a className={styles.infoValueLink} href={`mailto:${warehouse.contactEmail}`}>
                    {warehouse.contactEmail}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <p className={styles.emptyHint}>No contact details on file.</p>
          )}
        </section>

        <section className={styles.card}>
          <h3 className={styles.sectionTitle}>
            <FontAwesomeIcon icon={faClock} /> Operating hours
          </h3>
          <span className={styles.hoursMain}>{formatHours(warehouse)}</span>
          {!warehouse.is24Hours && warehouse.daysOpen?.length > 0 && (
            <div className={styles.dayStrip}>
              {DAYS.map(d => (
                <span
                  key={d.key}
                  className={`${styles.dayChip} ${
                    warehouse.daysOpen.includes(d.key) ? styles.dayChipOn : ''
                  }`}
                  title={d.full}
                >
                  {d.label}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Notes */}
      {warehouse.notes ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <FontAwesomeIcon icon={faNoteSticky} /> Notes
          </h3>
          <p className={styles.notes}>{warehouse.notes}</p>
        </section>
      ) : null}

      {/* Actions */}
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
              onClick={() => onEdit(warehouse)}
            >
              <FontAwesomeIcon icon={faPencil} /> Edit
            </button>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && hasImages && (
        <div
          className={styles.lightbox}
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${warehouse.name} photo viewer`}
        >
          <button type="button" className={styles.lightboxClose} onClick={() => setLightboxOpen(false)} aria-label="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
          <img
            src={images[activeImage]}
            alt={`${warehouse.name} photo ${activeImage + 1}`}
            className={styles.lightboxImage}
            onClick={e => e.stopPropagation()}
          />
          {images.length > 1 && (
            <>
              <button type="button" className={`${styles.lightboxNav} ${styles.lightboxNavPrev}`} onClick={showPrev} aria-label="Previous photo">
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>
              <button type="button" className={`${styles.lightboxNav} ${styles.lightboxNavNext}`} onClick={showNext} aria-label="Next photo">
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
              <span className={styles.lightboxCount}>{activeImage + 1} / {images.length}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
