// client/src/components/CsvImportModal/CsvImportModal.jsx
import React, { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faTriangleExclamation,
  faFileCsv,
  faRotateLeft,
  faSpinner,
  faForward,
  faArrowLeft,
} from "@fortawesome/free-solid-svg-icons";
import Modal from "../Modal/Modal.jsx";
import DateTimePicker, { toLocalISO } from "../../styles/Datetimepicker.jsx";
import { createShipment } from "../../api/api.js";
import {
  parseCsvText,
  parseCsvPermits,
  buildShipmentPayload,
} from "../../utils/csvPermitParser.js";
import {
  IMPORT_FIELD_SEVERITY,
  getFieldStatus,
  describeMissingCritical,
} from "../../utils/fieldSeverity.js";
import styles from "./CsvImportModal.module.css";

const STATUS_OPTIONS = [
  "Pending",
  "Assigned",
  "In Transit",
  "Completed",
  "Cancelled",
];

/**
 * Bulk "Import CSV" flow for Imports — the CSV counterpart to
 * EmailPasteModal, but stepped: a dispatch log can have 60+ rows and most
 * need at least a glance (unmatched airline, missing warehouse, etc.), so
 * this walks one row at a time instead of dumping everything into one
 * giant table. Each row gets a small editable form pre-filled from the
 * CSV — fix anything flagged, then Create & Next moves on.
 *
 *   <CsvImportModal
 *     isOpen={csvModalOpen}
 *     onClose={() => setCsvModalOpen(false)}
 *     airlines={airlines}
 *     warehouses={warehouses}
 *     formStyles={styles}          // the view's own *.module.css (buttons)
 *     onImported={() => load()}    // refresh the shipment list
 *   />
 */
export default function CsvImportModal({
  isOpen,
  onClose,
  airlines = [],
  warehouses = [],
  formStyles,
  onImported,
}) {
  const [csvText, setCsvText] = useState("");
  const [defaultWarehouseId, setDefaultWarehouseId] = useState("");
  const [rows, setRows] = useState(null); // parsed rows, pre-review
  const [index, setIndex] = useState(0); // which row we're on
  const [rowForm, setRowForm] = useState(null); // editable copy of rows[index].fields
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState("");
  const [createdCount, setCreatedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef(null);

  // This file is always CEVA's own dispatch log, so default to whichever
  // warehouse record is CEVA Logistics — still overridable via the dropdown
  // below in case there's more than one CEVA location on file.
  useEffect(() => {
    if (isOpen && warehouses.length && !defaultWarehouseId) {
      const ceva = warehouses.find((w) => /ceva/i.test(w.name || ""));
      if (ceva) setDefaultWarehouseId(ceva.id);
    }
  }, [isOpen, warehouses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the current row's fields into the editable form whenever we move.
  useEffect(() => {
    if (rows && rows[index]) {
      setRowForm({ ...rows[index].fields });
      setRowError("");
    }
  }, [rows, index]);

  const reset = () => {
    setCsvText("");
    setRows(null);
    setIndex(0);
    setRowForm(null);
    setSaving(false);
    setRowError("");
    setCreatedCount(0);
    setSkippedCount(0);
    setDone(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    e.target.value = "";
  };

  const handleParse = () => {
    if (!csvText.trim()) return;
    const parsedRows = parseCsvText(csvText);
    const results = parseCsvPermits(parsedRows, {
      airlines,
      defaultWarehouseId,
    });
    setRows(results);
    setIndex(0);
    setCreatedCount(0);
    setSkippedCount(0);
    setDone(false);
  };

  const updateField = (key, value) =>
    setRowForm((f) => ({ ...f, [key]: value }));

  const advance = () => {
    if (index + 1 >= rows.length) setDone(true);
    else setIndex((i) => i + 1);
  };

  const handleSkip = () => {
    setSkippedCount((c) => c + 1);
    advance();
  };

  const handleCreate = async () => {
    const missingMsg = describeMissingCritical(rowForm, IMPORT_FIELD_SEVERITY);
    if (missingMsg) {
      setRowError(missingMsg);
      return;
    }
    setSaving(true);
    setRowError("");
    try {
      await createShipment(buildShipmentPayload(rowForm));
      setCreatedCount((c) => c + 1);
      advance();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  const handleFinishNow = () => {
    const remaining = rows.length - index;
    setSkippedCount((c) => c + remaining);
    setDone(true);
  };

  const current = rows && rows[index];
  const fieldClass = (key) => {
    if (!rowForm) return styles.fieldGroup;
    const status = getFieldStatus(rowForm[key], IMPORT_FIELD_SEVERITY[key]);
    if (status === "missing-critical")
      return `${styles.fieldGroup} ${styles.fieldGroupCritical}`;
    if (status === "missing-tolerant")
      return `${styles.fieldGroup} ${styles.fieldGroupTolerant}`;
    return styles.fieldGroup;
  };

  useEffect(() => {
    if (done && (createdCount || skippedCount)) onImported?.();
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import CSV" size="lg">
      <div className={styles.wrap}>
        {!rows && (
          <>
            <p className={styles.hint}>
              Upload or paste a dispatch/recovery-log CSV (AWB, ORG, Pcs, Wgt,
              GROUND HANDLER, FLIGHT, READY TIME, LAST FREE DAY, PTT CUT IN…).
              You'll review and create permits one at a time — columns that
              don't map to a permit field (payment method, driver, dispatcher
              initials) are ignored.
            </p>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>
                Destination Warehouse (applied to every row) *
              </label>
              <select
                className={styles.input}
                value={defaultWarehouseId}
                onChange={(e) => setDefaultWarehouseId(e.target.value)}
              >
                <option value="">Select Warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <small className={styles.hint}>
                This log is always destined for CEVA Logistics, so it's
                pre-selected — change it here if that's ever not the case.
              </small>
            </div>

            <button
              type="button"
              className={formStyles.cancelBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              <FontAwesomeIcon icon={faFileCsv} /> Choose CSV File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />

            <textarea
              className={styles.textarea}
              rows={10}
              placeholder="…or paste the raw CSV text here"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />

            <div className={formStyles.formActions}>
              <button
                type="button"
                className={formStyles.cancelBtn}
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className={formStyles.saveBtn}
                onClick={handleParse}
                disabled={!csvText.trim()}
              >
                <FontAwesomeIcon icon={faFileCsv} /> Start Review
              </button>
            </div>
          </>
        )}

        {rows && !done && current && rowForm && (
          <>
            <div className={styles.progressRow}>
              <span className={styles.progressLabel}>
                Row {index + 1} of {rows.length}
              </span>
              <span className={styles.progressStats}>
                {createdCount} created · {skippedCount} skipped
              </span>
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${(index / rows.length) * 100}%` }}
              />
            </div>

            {rowError && <div className={styles.warningBanner}>{rowError}</div>}

            <div className={styles.rowGrid}>
              <div className={fieldClass("airwaybillNumber")}>
                <label className={styles.label}>AWB *</label>
                <input
                  className={styles.input}
                  value={rowForm.airwaybillNumber || ""}
                  onChange={(e) =>
                    updateField("airwaybillNumber", e.target.value)
                  }
                />
              </div>
              <div className={fieldClass("ordNumber")}>
                <label className={styles.label}>ORD Number *</label>
                <input
                  className={styles.input}
                  value={rowForm.ordNumber || ""}
                  onChange={(e) => updateField("ordNumber", e.target.value)}
                />
              </div>
              <div className={fieldClass("airline")}>
                <label className={styles.label}>Airline *</label>
                <select
                  className={styles.input}
                  value={rowForm.airline || ""}
                  onChange={(e) => updateField("airline", e.target.value)}
                >
                  <option value="">Select Airline…</option>
                  {airlines.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
                {!rowForm.airline && (
                  <small className={styles.hint}>
                    From file: {current.row["GROUND HANDLER"] || "—"} (AWB
                    prefix {(current.row.AWB || "").slice(0, 3)})
                  </small>
                )}
              </div>
              <div className={fieldClass("warehouse")}>
                <label className={styles.label}>Warehouse *</label>
                <select
                  className={styles.input}
                  value={rowForm.warehouse || ""}
                  onChange={(e) => updateField("warehouse", e.target.value)}
                >
                  <option value="">Select Warehouse…</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={fieldClass("pieces")}>
                <label className={styles.label}>Pieces *</label>
                <input
                  className={styles.input}
                  type="number"
                  value={rowForm.pieces || ""}
                  onChange={(e) => updateField("pieces", e.target.value)}
                />
              </div>
              <div className={fieldClass("weight")}>
                <label className={styles.label}>Weight *</label>
                <div className={styles.weightRow}>
                  <input
                    className={styles.input}
                    type="number"
                    value={rowForm.weight || ""}
                    onChange={(e) => updateField("weight", e.target.value)}
                  />
                  <select
                    className={styles.unitSelect}
                    value={rowForm.weightUnit || "lb"}
                    onChange={(e) => updateField("weightUnit", e.target.value)}
                  >
                    <option value="lb">lb</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Origin</label>
                <input
                  className={styles.input}
                  value={rowForm.originCity || ""}
                  onChange={(e) => updateField("originCity", e.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Flight Number</label>
                <input
                  className={styles.input}
                  value={rowForm.flightNumber || ""}
                  onChange={(e) =>
                    updateField("flightNumber", e.target.value.toUpperCase())
                  }
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Flight ETA</label>
                <DateTimePicker
                  value={rowForm.flightEta || ""}
                  onChange={(date) =>
                    updateField("flightEta", date ? toLocalISO(date) : "")
                  }
                />
                {!rowForm.flightEta && current.row["FLIGHT ETA"] && (
                  <small className={styles.hint}>
                    From file: {current.row["FLIGHT ETA"]} — couldn't be parsed,
                    enter it manually.
                  </small>
                )}
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Last Free Day</label>
                <input
                  className={styles.input}
                  type="date"
                  value={rowForm.lastFreeDay || ""}
                  onChange={(e) => updateField("lastFreeDay", e.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>PMC Count</label>
                <input
                  className={styles.input}
                  type="number"
                  value={rowForm.pmcCount ?? 0}
                  onChange={(e) => updateField("pmcCount", e.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Status</label>
                <select
                  className={styles.input}
                  value={rowForm.status || "Pending"}
                  onChange={(e) => updateField("status", e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`${styles.fieldGroup} ${styles.fullWidth}`}>
                <label className={styles.label}>Notes</label>
                <textarea
                  className={styles.notesInput}
                  rows={2}
                  value={rowForm.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                />
              </div>
            </div>

            <div className={formStyles.formActions}>
              <button
                type="button"
                className={formStyles.cancelBtn}
                onClick={handleBack}
                disabled={index === 0}
              >
                <FontAwesomeIcon icon={faArrowLeft} /> Back
              </button>
              <button
                type="button"
                className={formStyles.cancelBtn}
                onClick={handleSkip}
                disabled={saving}
              >
                <FontAwesomeIcon icon={faForward} /> Skip
              </button>
              <button
                type="button"
                className={formStyles.cancelBtn}
                onClick={handleFinishNow}
                disabled={saving}
              >
                Finish Now
              </button>
              <button
                type="button"
                className={formStyles.saveBtn}
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin /> Creating…
                  </>
                ) : (
                  "Create & Next"
                )}
              </button>
            </div>
          </>
        )}

        {rows && done && (
          <>
            <div className={styles.doneBanner}>
              <FontAwesomeIcon icon={faCircleCheck} />
              Done — {createdCount} permit{createdCount !== 1 ? "s" : ""}{" "}
              created, {skippedCount} skipped.
            </div>
            <div className={formStyles.formActions}>
              <button
                type="button"
                className={formStyles.cancelBtn}
                onClick={reset}
              >
                <FontAwesomeIcon icon={faRotateLeft} /> Import Another File
              </button>
              <button
                type="button"
                className={formStyles.saveBtn}
                onClick={handleClose}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
