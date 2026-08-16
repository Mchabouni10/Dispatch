import React, { useState, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPencil, faPhone, faEnvelope, faIdCard, faStar,
  faTruck, faShieldHalved, faClock, faMapPin, faHeart,
  faAward, faUserCheck, faUserSlash, faPlane, faBan,
  faBell, faGraduationCap, faTimes, faImage, faFileImage,
  faPassport, faIdBadge, faNotesMedical, faExpand,
} from '@fortawesome/free-solid-svg-icons';
import { resolveUploadUrl } from '../../api/api.js';
import styles from './DriverDetailView.module.css';

const STATUS_ICONS = {
  Available: faUserCheck,
  'On Trip': faTruck,
  Break: faClock,
  Absent: faUserSlash,
  Vacation: faPlane,
  'Sick Leave': faBan,
  Training: faGraduationCap,
  'On Call': faBell,
  'Off Duty': faTimes,
  Terminated: faTimes,
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

function expiryMeta(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, tone: 'danger' };
  if (days === 0) return { label: 'Expires today', tone: 'warn' };
  if (days <= 30) return { label: `Expires in ${days}d`, tone: 'warn' };
  return { label: new Date(dateStr).toLocaleDateString(), tone: 'ok' };
}

function formatLeaveRange(start, end) {
  if (!start && !end) return null;
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const s = start ? new Date(start).toLocaleDateString(undefined, opts) : '?';
  const e = end ? new Date(end).toLocaleDateString(undefined, opts) : '?';
  return `${s} – ${e}`;
}

/**
 * Standalone driver detail view — gallery for identity & compliance docs,
 * structured sections. Used in list modal or full-page route.
 */
export default function DriverDetailView({
  driver,
  onClose,
  onEdit,
  hideActions = false,
  /** When false, hide sensitive docs (pay, license scans) for limited roles */
  showSensitive = true,
}) {
  const [lightbox, setLightbox] = useState(null);

  const docs = useMemo(() => {
    if (!driver) return [];
    const items = [];
    if (driver.photo) {
      items.push({ key: 'photo', label: 'Profile photo', src: resolveUploadUrl(driver.photo), icon: faImage });
    }
    if (showSensitive && driver.licensePhoto) {
      items.push({ key: 'license', label: 'Driver license', src: resolveUploadUrl(driver.licensePhoto), icon: faIdCard });
    }
    if (showSensitive && driver.medicalCertPhoto) {
      items.push({ key: 'medical', label: 'DOT medical card', src: resolveUploadUrl(driver.medicalCertPhoto), icon: faNotesMedical });
    }
    if (showSensitive && driver.airportBadgePhoto) {
      items.push({ key: 'badge', label: 'Airport badge', src: resolveUploadUrl(driver.airportBadgePhoto), icon: faIdBadge });
    }
    if (showSensitive && driver.passportPhoto) {
      items.push({ key: 'passport', label: 'Passport', src: resolveUploadUrl(driver.passportPhoto), icon: faPassport });
    }
    return items;
  }, [driver, showSensitive]);

  if (!driver) return null;

  const statusClass = (driver.status || 'Unknown').replace(/ /g, '_');
  const statusIcon = STATUS_ICONS[driver.status] || faUserCheck;
  const licenseExp = expiryMeta(driver.licenseExpiration);
  const medicalExp = expiryMeta(driver.medicalCertExpiration);
  const leaveRange = formatLeaveRange(driver.leaveStart, driver.leaveEnd);

  return (
    <div className={styles.detail}>
      {/* Hero */}
      <div className={styles.hero}>
        {driver.photo ? (
          <button
            type="button"
            className={styles.heroAvatarBtn}
            onClick={() => setLightbox({ src: resolveUploadUrl(driver.photo), label: 'Profile photo' })}
            title="View photo"
          >
            <img
              src={resolveUploadUrl(driver.photo)}
              alt={driver.name}
              className={styles.heroAvatar}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </button>
        ) : (
          <div className={styles.heroAvatarFallback}>
            {(driver.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className={styles.heroText}>
          <h2 className={styles.title}>
            {driver.name}
            {driver.performanceRating >= 4 && (
              <FontAwesomeIcon icon={faStar} className={styles.star} />
            )}
          </h2>
          <div className={styles.heroMeta}>
            <span className={`${styles.statusPill} ${styles[`status_${statusClass}`]}`}>
              <FontAwesomeIcon icon={statusIcon} />
              {driver.status}
            </span>
            <span className={styles.idChip}>#{driver.employeeId}</span>
            {driver.employmentStatus && driver.employmentStatus !== 'Active' && (
              <span className={styles.mutedChip}>{driver.employmentStatus}</span>
            )}
          </div>
        </div>
      </div>

      {/* Document gallery */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FontAwesomeIcon icon={faFileImage} /> Documents
        </h3>
        {docs.length === 0 ? (
          <p className={styles.emptyHint}>No document images on file yet.</p>
        ) : (
          <div className={styles.gallery}>
            {docs.map((d) => (
              <button
                type="button"
                key={d.key}
                className={styles.galleryCard}
                onClick={() => setLightbox({ src: d.src, label: d.label })}
              >
                <div className={styles.galleryThumb}>
                  <img src={d.src} alt={d.label} loading="lazy" />
                  <span className={styles.galleryExpand}>
                    <FontAwesomeIcon icon={faExpand} />
                  </span>
                </div>
                <span className={styles.galleryLabel}>
                  <FontAwesomeIcon icon={d.icon} />
                  {d.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Contact */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FontAwesomeIcon icon={faPhone} /> Contact
        </h3>
        <div className={styles.infoGrid}>
          {driver.phone && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Phone</span>
              <span className={styles.infoValue}>{driver.phone}</span>
            </div>
          )}
          {driver.email && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>
                <FontAwesomeIcon icon={faEnvelope} /> Email
              </span>
              <a className={styles.infoLink} href={`mailto:${driver.email}`}>{driver.email}</a>
            </div>
          )}
          {driver.address && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>
                <FontAwesomeIcon icon={faMapPin} /> Address
              </span>
              <span className={styles.infoValue}>{driver.address}</span>
            </div>
          )}
          {driver.currentLocation && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Current location</span>
              <span className={styles.infoValue}>{driver.currentLocation}</span>
            </div>
          )}
        </div>
      </section>

      {/* Schedule */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FontAwesomeIcon icon={faClock} /> Schedule
        </h3>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Schedule</span>
            <span className={styles.infoValue}>{driver.schedule || '—'}</span>
          </div>
          {(driver.shiftStart || driver.shiftEnd) && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Shift</span>
              <span className={styles.infoValue}>
                {driver.shiftStart || '?'} – {driver.shiftEnd || '?'}
              </span>
            </div>
          )}
          {driver.daysOff?.length > 0 && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Days off</span>
              <span className={styles.infoValue}>{driver.daysOff.join(', ')}</span>
            </div>
          )}
          {leaveRange && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Leave range</span>
              <span className={styles.infoValue}>{leaveRange}</span>
            </div>
          )}
          {driver.statusReason && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Status reason</span>
              <span className={styles.infoValue}>{driver.statusReason}</span>
            </div>
          )}
        </div>
      </section>

      {/* Compliance */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FontAwesomeIcon icon={faShieldHalved} /> License & compliance
        </h3>
        <div className={styles.flagGrid}>
          <div className={styles.flag}>
            <FontAwesomeIcon icon={faIdCard} className={styles.flagAccent} />
            <div>
              <span className={styles.infoLabel}>License</span>
              <span className={styles.infoValue}>
                Class {driver.licenseClass || '—'}
                {showSensitive && driver.licenseNumber ? ` · ${driver.licenseNumber}` : ''}
              </span>
              {licenseExp && (
                <span className={`${styles.expTag} ${styles[`exp_${licenseExp.tone}`]}`}>
                  {licenseExp.label}
                </span>
              )}
            </div>
          </div>
          <div className={styles.flag}>
            <FontAwesomeIcon icon={faNotesMedical} className={styles.flagAccent} />
            <div>
              <span className={styles.infoLabel}>DOT medical</span>
              <span className={styles.infoValue}>
                {driver.medicalCertExpiration
                  ? new Date(driver.medicalCertExpiration).toLocaleDateString()
                  : 'Not on file'}
              </span>
              {medicalExp && (
                <span className={`${styles.expTag} ${styles[`exp_${medicalExp.tone}`]}`}>
                  {medicalExp.label}
                </span>
              )}
            </div>
          </div>
          {driver.hazmatCertified && (
            <div className={styles.flag}>
              <span className={`${styles.certBadge} ${styles.certHazmat}`}>Hazmat</span>
              <div>
                <span className={styles.infoLabel}>Certification</span>
                <span className={styles.infoValue}>Hazmat certified</span>
              </div>
            </div>
          )}
          {driver.trailerEligible && (
            <div className={styles.flag}>
              <span className={`${styles.certBadge} ${styles.certTrailer}`}>Trailer</span>
              <div>
                <span className={styles.infoLabel}>Eligibility</span>
                <span className={styles.infoValue}>Trailer eligible</span>
              </div>
            </div>
          )}
          {driver.gdpTrained && (
            <div className={styles.flag}>
              <span className={`${styles.certBadge} ${styles.certGdp}`}>GDP</span>
              <div>
                <span className={styles.infoLabel}>Training</span>
                <span className={styles.infoValue}>GDP trained</span>
              </div>
            </div>
          )}
          {driver.vehicleTypes?.length > 0 && (
            <div className={styles.flag}>
              <FontAwesomeIcon icon={faTruck} className={styles.flagAccent} />
              <div>
                <span className={styles.infoLabel}>Vehicle types</span>
                <span className={styles.infoValue}>{driver.vehicleTypes.join(', ')}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Performance */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FontAwesomeIcon icon={faAward} /> Performance
        </h3>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Rating</span>
            <span className={styles.infoValue}>{driver.performanceRating ?? '—'} / 5</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Trips</span>
            <span className={styles.infoValue}>{driver.totalTripsCompleted ?? 0}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>On-time</span>
            <span className={styles.infoValue}>{driver.onTimeDeliveryRate ?? '—'}%</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Safety</span>
            <span className={styles.infoValue}>{driver.safetyScore ?? '—'}</span>
          </div>
        </div>
      </section>

      {/* Emergency */}
      {(driver.emergencyContactName || driver.emergencyContactPhone) && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <FontAwesomeIcon icon={faHeart} /> Emergency contact
          </h3>
          <div className={styles.infoGrid}>
            {driver.emergencyContactName && (
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Name</span>
                <span className={styles.infoValue}>{driver.emergencyContactName}</span>
              </div>
            )}
            {driver.emergencyContactPhone && (
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Phone</span>
                <span className={styles.infoValue}>{driver.emergencyContactPhone}</span>
              </div>
            )}
            {driver.emergencyContactRelation && (
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Relation</span>
                <span className={styles.infoValue}>{driver.emergencyContactRelation}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {driver.notes && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Notes</h3>
          <p className={styles.notes}>{driver.notes}</p>
        </section>
      )}

      {!hideActions && (
        <div className={styles.actions}>
          {onClose && (
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Close
            </button>
          )}
          {onEdit && (
            <button type="button" className={styles.saveBtn} onClick={() => onEdit(driver)}>
              <FontAwesomeIcon icon={faPencil} /> Edit
            </button>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.label}
          onClick={() => setLightbox(null)}
        >
          <div className={styles.lightboxInner} onClick={(e) => e.stopPropagation()}>
            <div className={styles.lightboxHeader}>
              <span>{lightbox.label}</span>
              <button type="button" className={styles.lightboxClose} onClick={() => setLightbox(null)}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <img src={lightbox.src} alt={lightbox.label} className={styles.lightboxImg} />
          </div>
        </div>
      )}
    </div>
  );
}
