// client/src/components/EmailPasteModal/EmailPasteModal.jsx
import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faCircleXmark,
  faTriangleExclamation,
  faEnvelopeOpenText,
  faRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import Modal from "../Modal/Modal.jsx";
import { parsePermitEmail } from "../../utils/emailPermitParser.js";
import styles from "./EmailPasteModal.module.css";

/**
 * Shared "Paste Email" flow for Imports and Exports.
 *
 * Usage:
 *   <EmailPasteModal
 *     isOpen={emailModalOpen}
 *     onClose={() => setEmailModalOpen(false)}
 *     type="Import"                 // or "Export"
 *     airlines={airlines}
 *     warehouses={warehouses}
 *     formStyles={styles}           // the view's own *.module.css (buttons/inputs)
 *     onUseDetails={(fields) => { ... prefill form, open the real modal ... }}
 *   />
 */
export default function EmailPasteModal({
  isOpen,
  onClose,
  type = "Import",
  airlines = [],
  warehouses = [],
  formStyles,
  onUseDetails,
}) {
  const [emailText, setEmailText] = useState("");
  const [result, setResult] = useState(null); // { fields, matches }

  const reset = () => {
    setEmailText("");
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleParse = () => {
    if (!emailText.trim()) return;
    setResult(parsePermitEmail(emailText, { airlines, warehouses, type }));
  };

  const handleUseDetails = () => {
    if (!result) return;
    onUseDetails(result.fields);
    reset();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Paste ${type} Email`}
      size="lg"
    >
      <div className={styles.wrap}>
        {!result && (
          <>
            <p className={styles.hint}>
              Paste the airline or warehouse email below. We'll pull out the AWB,
              pieces, weight, ORD/ref number, airline, warehouse, and flight/ETA
              time and prefill the {type.toLowerCase()} form — you'll still get a
              chance to review everything before saving.
            </p>
            <textarea
              className={styles.textarea}
              rows={14}
              placeholder="Paste the full email text here…"
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              autoFocus
            />
            <div className={formStyles.formActions}>
              <button type="button" className={formStyles.cancelBtn} onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className={formStyles.saveBtn}
                onClick={handleParse}
                disabled={!emailText.trim()}
              >
                <FontAwesomeIcon icon={faEnvelopeOpenText} /> Parse Email
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <p className={styles.hint}>
              Found {result.matchedCount} of {result.totalFields} fields. Double-check
              anything marked as not found, then use these details to open the form.
            </p>
            {result.missingCriticalCount > 0 && (
              <div className={styles.warningBanner}>
                <FontAwesomeIcon icon={faTriangleExclamation} />
                {result.missingCriticalCount} required field
                {result.missingCriticalCount > 1 ? "s" : ""} not found — you'll need to
                fill {result.missingCriticalCount > 1 ? "these" : "this"} in before the
                permit can be saved.
              </div>
            )}
            <ul className={styles.matchList}>
              {result.matches.map((m) => {
                const criticalMiss = !m.matched && m.severity === "critical";
                return (
                  <li
                    key={m.key}
                    className={`${styles.matchItem} ${
                      m.matched ? styles.matched : styles.unmatched
                    } ${criticalMiss ? styles.unmatchedCritical : ""}`}
                  >
                    <FontAwesomeIcon
                      icon={
                        m.matched
                          ? faCircleCheck
                          : criticalMiss
                          ? faTriangleExclamation
                          : faCircleXmark
                      }
                      className={styles.matchIcon}
                    />
                    <span className={styles.matchLabel}>
                      {m.label}
                      {criticalMiss && <span className={styles.criticalTag}>Required</span>}
                    </span>
                    <span className={styles.matchValue}>
                      {m.matched ? m.value : "Not found — enter manually"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className={formStyles.formActions}>
              <button type="button" className={formStyles.cancelBtn} onClick={reset}>
                <FontAwesomeIcon icon={faRotateLeft} /> Try Different Email
              </button>
              <button type="button" className={formStyles.saveBtn} onClick={handleUseDetails}>
                Use These Details
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}