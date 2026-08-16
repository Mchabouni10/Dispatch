// src/pages/Equipment/EquipmentDetailView.jsx
import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPencil,
  faTimes,
  faTruck,
  faTrailer,
  faSnowflake,
  faLink,
  faLinkSlash,
  faUser,
  faKey,
  faClock,
  faCircleCheck,
  faBan,
  faTriangleExclamation,
  faIdCard,
  faCalendarDays,
  faWeightHanging,
  faShieldHalved,
  faFileContract,
  faHandshake,
  faExpand,
  faBoxOpen,
} from "@fortawesome/free-solid-svg-icons";
import { resolveUploadUrl } from "../../api/api.js";
import styles from "./EquipmentDetailView.module.css";

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

function expiryLabel(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Due today";
  return `Due in ${days}d`;
}

function expiryTone(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return "";
  if (days < 0) return styles.toneDanger;
  if (days <= 30) return styles.toneWarn;
  return styles.toneOk;
}

function toDate(value) {
  return value ? String(value).slice(0, 10) : "—";
}

function minutesUntil(value) {
  if (!value) return null;
  return Math.round((new Date(value).getTime() - Date.now()) / 60000);
}

const TYPE_SHORT = {
  Tractor: "TR",
  "Straight Truck": "ST",
  "Cube Truck": "CB",
  "Sprinter Van": "SV",
  "Dry Van": "DV",
  Reefer: "RF",
  "Open Deck": "OD",
  "Flat Bed": "FB",
  "Low Boy": "LB",
  "Roller Bed": "RB",
};

/**
 * Detail panel for a single equipment unit.
 * Separated from the list (cards/table) like Warehouse / Airline / Driver detail.
 */
export default function EquipmentDetailView({
  item,
  assignedDriver,
  onClose,
  onEdit,
}) {
  const [lightbox, setLightbox] = useState(null);

  const images = useMemo(() => {
    if (!item?.images?.length) return [];
    return item.images.map((p) => resolveUploadUrl(p)).filter(Boolean);
  }, [item]);

  if (!item) return null;

  const isTrailer = item.category === "Trailer";
  const isHandedOff = !!item.assignedDriverId;
  const cooldownLeft =
    item.availableAt && new Date(item.availableAt).getTime() > Date.now()
      ? minutesUntil(item.availableAt)
      : null;
  const isCooling = cooldownLeft != null && cooldownLeft > 0;
  const isAvailable =
    item.status === "In Service" && !isHandedOff && !isCooling;

  const compliance = [
    { key: "reg", label: "Registration", date: item.registrationExpiration },
    { key: "ins", label: "Insurance", date: item.insuranceExpiration },
    { key: "ifta", label: "IFTA / IRP", date: item.iftaIrpExpiration },
    { key: "maint", label: "Maintenance", date: item.nextMaintenanceDue },
  ].filter((c) => c.date);

  return (
    <div className={styles.panel}>
      {/* Hero */}
      <div className={styles.hero}>
        <div
          className={`${styles.heroIcon} ${
            isTrailer ? styles.iconTrailer : styles.iconPower
          } ${item.equipmentType === "Reefer" ? styles.iconReefer : ""}`}
        >
          <FontAwesomeIcon icon={isTrailer ? faTrailer : faTruck} />
          {TYPE_SHORT[item.equipmentType] && (
            <span className={styles.typeBadge}>{TYPE_SHORT[item.equipmentType]}</span>
          )}
          {item.equipmentType === "Reefer" && (
            <span className={styles.coldBadge}>
              <FontAwesomeIcon icon={faSnowflake} />
            </span>
          )}
        </div>

        <div className={styles.heroText}>
          <h2 className={styles.unitNumber}>{item.unitNumber}</h2>
          <p className={styles.unitSub}>
            {item.equipmentType}
            {item.modelDetails ? ` · ${item.modelDetails}` : ""}
            {item.year ? ` · ${item.year}` : ""}
          </p>
          <div className={styles.pillRow}>
            <span
              className={`${styles.statusPill} ${
                item.status === "In Service" ? styles.statusIn : styles.statusOut
              }`}
            >
              {item.status === "In Service" ? (
                <FontAwesomeIcon icon={faCircleCheck} />
              ) : (
                <FontAwesomeIcon icon={faBan} />
              )}
              {item.status}
            </span>
            {isAvailable && (
              <span className={styles.availPill}>
                <FontAwesomeIcon icon={faCircleCheck} /> Available
              </span>
            )}
            {isHandedOff && (
              <span className={styles.handedPill}>
                <FontAwesomeIcon icon={faKey} /> Handed off
              </span>
            )}
            {isCooling && (
              <span className={styles.coolPill}>
                <FontAwesomeIcon icon={faClock} /> Cooling · {cooldownLeft}m
              </span>
            )}
            {!isTrailer && (
              <span className={styles.metaPill}>
                <FontAwesomeIcon
                  icon={item.equipmentType === "Tractor" ? faLink : faLinkSlash}
                />
                {item.equipmentType === "Tractor" ? "Pulls trailer" : "Self-contained"}
              </span>
            )}
          </div>
        </div>

        <div className={styles.heroActions}>
          {onEdit && (
            <button type="button" className={styles.editBtn} onClick={() => onEdit(item)}>
              <FontAwesomeIcon icon={faPencil} /> Edit
            </button>
          )}
          {onClose && (
            <button type="button" className={styles.closeBtn} onClick={onClose} title="Close">
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>
      </div>

      {/* Photo gallery */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FontAwesomeIcon icon={faBoxOpen} /> Photos
        </h3>
        {images.length === 0 ? (
          <p className={styles.emptyHint}>No photos uploaded yet.</p>
        ) : (
          <div className={styles.gallery}>
            {images.map((src, i) => (
              <button
                type="button"
                key={`${src}-${i}`}
                className={styles.thumb}
                onClick={() => setLightbox(src)}
                title="View full size"
              >
                <img src={src} alt={`${item.unitNumber} photo ${i + 1}`} />
                <span className={styles.thumbZoom}>
                  <FontAwesomeIcon icon={faExpand} />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Identity */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FontAwesomeIcon icon={faIdCard} /> Unit details
        </h3>
        <div className={styles.grid}>
          <div className={styles.item}>
            <span className={styles.label}>License plate</span>
            <span className={styles.value}>{item.licensePlate || "—"}</span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>VIN</span>
            <span className={styles.valueMono}>{item.vin || "—"}</span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>Year</span>
            <span className={styles.value}>{item.year || "—"}</span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>Category</span>
            <span className={styles.value}>{item.category}</span>
          </div>
          {isTrailer && (
            <>
              <div className={styles.item}>
                <span className={styles.label}>Capacity</span>
                <span className={styles.value}>
                  {item.capacityLbs
                    ? `${item.capacityLbs.toLocaleString()} lb`
                    : "—"}
                </span>
              </div>
              <div className={styles.item}>
                <span className={styles.label}>Pallet positions</span>
                <span className={styles.value}>
                  {item.palletPositions ?? "—"}
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Assignment */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FontAwesomeIcon icon={faKey} /> Assignment
        </h3>
        {isHandedOff ? (
          <div className={styles.handoffBox}>
            <FontAwesomeIcon icon={faUser} />
            <div>
              <strong>
                {assignedDriver?.name || item.assignedDriver?.name || "Driver assigned"}
              </strong>
              <div className={styles.handoffMeta}>
                {(assignedDriver?.employeeId || item.assignedDriver?.employeeId) && (
                  <span>
                    #
                    {assignedDriver?.employeeId || item.assignedDriver?.employeeId}
                  </span>
                )}
                {(assignedDriver?.status || item.assignedDriver?.status) && (
                  <span>
                    · {assignedDriver?.status || item.assignedDriver?.status}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : isCooling ? (
          <p className={styles.coolText}>
            <FontAwesomeIcon icon={faClock} /> Cooling down
            {cooldownLeft != null && cooldownLeft > 0
              ? ` · ${cooldownLeft} min left`
              : " · available soon"}
          </p>
        ) : item.status === "In Service" ? (
          <p className={styles.availText}>
            <FontAwesomeIcon icon={faCircleCheck} /> Available for handoff
          </p>
        ) : (
          <p className={styles.oosText}>
            <FontAwesomeIcon icon={faTriangleExclamation} /> Out of service
            {item.outOfServiceReason ? ` — ${item.outOfServiceReason}` : ""}
          </p>
        )}
      </section>

      {/* Compliance */}
      {compliance.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <FontAwesomeIcon icon={faCalendarDays} /> Compliance
          </h3>
          <div className={styles.grid}>
            {compliance.map((c) => (
              <div key={c.key} className={styles.item}>
                <span className={styles.label}>{c.label}</span>
                <span className={`${styles.value} ${expiryTone(c.date)}`}>
                  {toDate(c.date)}
                  {expiryLabel(c.date) ? ` · ${expiryLabel(c.date)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Insurance */}
      {(item.insuranceProvider || item.insurancePolicyNumber) && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <FontAwesomeIcon icon={faShieldHalved} /> Insurance
          </h3>
          <div className={styles.grid}>
            <div className={styles.item}>
              <span className={styles.label}>Provider</span>
              <span className={styles.value}>{item.insuranceProvider || "—"}</span>
            </div>
            <div className={styles.item}>
              <span className={styles.label}>Policy</span>
              <span className={styles.value}>{item.insurancePolicyNumber || "—"}</span>
            </div>
          </div>
        </section>
      )}

      {/* Ownership */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FontAwesomeIcon icon={faFileContract} /> Ownership
        </h3>
        <div className={styles.grid}>
          <div className={styles.item}>
            <span className={styles.label}>Type</span>
            <span className={styles.value}>
              <FontAwesomeIcon
                icon={item.ownershipType !== "Owned" ? faHandshake : faFileContract}
                style={{ marginRight: 6, opacity: 0.7 }}
              />
              {item.ownershipType || "Owned"}
            </span>
          </div>
          {item.ownershipType !== "Owned" && (
            <>
              <div className={styles.item}>
                <span className={styles.label}>
                  {item.ownershipType === "Leased" ? "Lessor" : "Lender"}
                </span>
                <span className={styles.value}>{item.leaseCompany || "—"}</span>
              </div>
              <div className={styles.item}>
                <span className={styles.label}>
                  {item.ownershipType === "Leased" ? "Lease end" : "Payoff"}
                </span>
                <span className={styles.value}>{toDate(item.leaseEndDate)}</span>
              </div>
              <div className={styles.item}>
                <span className={styles.label}>Monthly</span>
                <span className={styles.value}>
                  {item.monthlyPaymentAmount != null
                    ? `$${Number(item.monthlyPaymentAmount).toLocaleString()}`
                    : "—"}
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Notes */}
      {item.notes && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Notes</h3>
          <p className={styles.notes}>{item.notes}</p>
        </section>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className={styles.lightbox}
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={() => setLightbox(null)}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
          <img
            src={lightbox}
            alt="Equipment full size"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
