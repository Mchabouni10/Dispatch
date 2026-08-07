//src/pages/Dispatch/components/HandoffModal/HandoffModal.jsx
import React, { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxOpen,
  faCamera,
  faFileImage,
  faHouse,
  faRotateLeft,
  faTriangleExclamation,
  faTruck,
  faUser,
  faUserClock,
} from "@fortawesome/free-solid-svg-icons";
import Modal from "../../../../components/Modal/Modal.jsx";
import { awbLabel } from "../../utils/dispatchHelpers.js";
import DateTimePicker, { toLocalISO } from "../../../../styles/Datetimepicker.jsx";
import SignaturePad from "./SignaturePad.jsx";
import formStyles from "../../shared/FormControls.module.css";
import styles from "./HandoffModal.module.css";

const REJECTION_REASONS = [
  "Missing labels/stickers",
  "DG documentation",
  "Damaged packaging",
  "Overweight",
  "Wrong booking",
  "Other",
];

export default function HandoffModal({
  handoffTrip,
  handoffTime,
  setHandoffTime,
  handoffAction,
  setHandoffAction,
  handoffSaving,
  error,
  equipment,
  outcomes,
  setOutcomes,
  receivedByName,
  setReceivedByName,
  notes,
  setNotes,
  podImage,
  setPodImage,
  signatureImage,
  setSignatureImage,
  onClose,
  onSubmit,
}) {
  const handoffEquipmentStatus = useMemo(() => {
    if (!handoffTrip?.driverId && !handoffTrip?.driver?.id) {
      return { hasMorningHandoff: false, units: [] };
    }
    const driverId = handoffTrip.driverId || handoffTrip.driver?.id;
    const units = [];
    const truck = handoffTrip.truckId
      ? equipment.find((e) => e.id === handoffTrip.truckId) || handoffTrip.truck
      : handoffTrip.truck;
    const trailer = handoffTrip.trailerId
      ? equipment.find((e) => e.id === handoffTrip.trailerId) ||
        handoffTrip.trailer
      : handoffTrip.trailer;
    if (truck) {
      units.push({
        kind: "truck",
        unitNumber: truck.unitNumber,
        assignedToDriver: truck.assignedDriverId === driverId,
      });
    }
    if (trailer) {
      units.push({
        kind: "trailer",
        unitNumber: trailer.unitNumber,
        assignedToDriver: trailer.assignedDriverId === driverId,
      });
    }
    const hasMorningHandoff = units.some((u) => u.assignedToDriver);
    return { hasMorningHandoff, units, driverId };
  }, [handoffTrip, equipment]);

  if (!handoffTrip) return null;

  // Merges a partial change into one shipment's outcome, keeping the rest.
  const setOutcome = (shipmentId, patch) => {
    setOutcomes((prev) => ({
      ...prev,
      [shipmentId]: { ...prev[shipmentId], ...patch },
    }));
  };

  const handlePodFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPodImage(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <Modal
      isOpen={!!handoffTrip}
      onClose={onClose}
      title={`Confirm Handoff${
        handoffTrip?.tripNumber ? ` — ${handoffTrip.tripNumber}` : ""
      }`}
      size="md"
    >
      <form className={formStyles.form} onSubmit={onSubmit}>
        <p className={formStyles.formIntro}>
          Record when the truck was reported empty, then choose what the driver
          does next. Equipment stays with them unless you send them home.
        </p>
        {error && <div className={formStyles.error}>{error}</div>}

        <div className={formStyles.formGrid}>
          <label>
            Time reported empty
            <DateTimePicker
              value={handoffTime}
              onChange={(date) => setHandoffTime(date ? toLocalISO(date) : "")}
            />
          </label>
        </div>

        {(handoffTrip?.driver || handoffTrip?.truck) && (
          <div className={styles.handoffContext}>
            {handoffTrip.driver?.name && (
              <span>
                <FontAwesomeIcon icon={faUser} /> {handoffTrip.driver.name}
              </span>
            )}
            {handoffTrip.truck?.unitNumber && (
              <span>
                <FontAwesomeIcon icon={faTruck} />{" "}
                {handoffTrip.truck.unitNumber}
                {handoffTrip.trailer?.unitNumber
                  ? ` + ${handoffTrip.trailer.unitNumber}`
                  : ""}
              </span>
            )}
          </div>
        )}

        {handoffTrip?.shipments?.length > 0 && (
          <div className={styles.reconcileSection}>
            <div className={styles.reconcileHeading}>
              <FontAwesomeIcon icon={faBoxOpen} /> Cargo reconciliation
            </div>
            {handoffTrip.shipments.map((shipment) => {
              const outcome = outcomes[shipment.id]?.outcome || "delivered";
              const isImport = handoffTrip.runType === "Import";
              const isExport = handoffTrip.runType === "Export";
              return (
                <div key={shipment.id} className={styles.reconcileRow}>
                  <div className={styles.reconcileLabel}>
                    <span>{awbLabel(shipment)}</span>
                    <span className={styles.reconcilePieces}>
                      {shipment.pieces} pcs
                    </span>
                  </div>

                  <div className={styles.reconcilePills}>
                    <button
                      type="button"
                      className={`${styles.pill} ${
                        outcome === "delivered" ? styles.pillSelected : ""
                      }`}
                      onClick={() => setOutcome(shipment.id, { outcome: "delivered" })}
                    >
                      Delivered
                    </button>
                    {isImport && (
                      <button
                        type="button"
                        className={`${styles.pill} ${styles.pillWarn} ${
                          outcome === "short" ? styles.pillSelected : ""
                        }`}
                        onClick={() =>
                          setOutcome(shipment.id, {
                            outcome: "short",
                            piecesAffected: outcomes[shipment.id]?.piecesAffected ?? 1,
                          })
                        }
                      >
                        Short
                      </button>
                    )}
                    {isExport && (
                      <button
                        type="button"
                        className={`${styles.pill} ${styles.pillDanger} ${
                          outcome === "rejected" ? styles.pillSelected : ""
                        }`}
                        onClick={() =>
                          setOutcome(shipment.id, {
                            outcome: "rejected",
                            reason: outcomes[shipment.id]?.reason || "",
                          })
                        }
                      >
                        Rejected
                      </button>
                    )}
                  </div>

                  {outcome === "short" && (
                    <div className={styles.reconcileDetail}>
                      <label>
                        Pieces missing
                        <input
                          type="number"
                          min="1"
                          max={shipment.pieces}
                          value={outcomes[shipment.id]?.piecesAffected ?? 1}
                          onChange={(e) =>
                            setOutcome(shipment.id, {
                              outcome: "short",
                              piecesAffected: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Reason (optional)
                        <input
                          type="text"
                          placeholder="e.g. left at ramp, still in ULD"
                          value={outcomes[shipment.id]?.reason || ""}
                          onChange={(e) =>
                            setOutcome(shipment.id, {
                              outcome: "short",
                              reason: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  )}

                  {outcome === "rejected" && (
                    <div className={styles.reconcileDetail}>
                      <label>
                        Reason
                        <select
                          value={outcomes[shipment.id]?.reason || ""}
                          onChange={(e) =>
                            setOutcome(shipment.id, {
                              outcome: "rejected",
                              reason: e.target.value,
                            })
                          }
                        >
                          <option value="">Select a reason…</option>
                          {REJECTION_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.reconcileCheckbox}>
                        <input
                          type="checkbox"
                          checked={!!outcomes[shipment.id]?.canReschedule}
                          onChange={(e) =>
                            setOutcome(shipment.id, {
                              outcome: "rejected",
                              canReschedule: e.target.checked,
                            })
                          }
                        />
                        Can be fixed and re-delivered today
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.podSection}>
          <div className={styles.reconcileHeading}>
            <FontAwesomeIcon icon={faFileImage} /> Proof of delivery
          </div>
          <div className={formStyles.formGrid}>
            <label>
              Received by
              <input
                type="text"
                placeholder="Name on the dock"
                value={receivedByName}
                onChange={(e) => setReceivedByName(e.target.value)}
              />
            </label>
          </div>

          <label className={styles.podUpload}>
            <FontAwesomeIcon icon={faCamera} />{" "}
            {podImage ? "Replace POD photo" : "Upload POD photo"}
            <input type="file" accept="image/*" onChange={handlePodFile} hidden />
          </label>
          {podImage && (
            <img src={podImage} alt="POD preview" className={styles.podPreview} />
          )}

          <div className={styles.signatureLabel}>Driver signature</div>
          <SignaturePad onChange={setSignatureImage} />

          <label className={styles.podNotes}>
            Notes (optional)
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else worth flagging about this handoff"
            />
          </label>
        </div>

        <div className={styles.handoffActionList}>
          <button
            type="button"
            className={`${styles.handoffOption} ${
              handoffAction === "available"
                ? styles.handoffOptionSelected
                : ""
            }`}
            onClick={() => setHandoffAction("available")}
          >
            <FontAwesomeIcon icon={faRotateLeft} />
            <div>
              <div className={styles.handoffOptionTitle}>
                Ready for next run
              </div>
              <div className={styles.handoffOptionSub}>
                Driver becomes Available. Truck
                {handoffTrip?.trailer ? " and trailer stay" : " stays"}{" "}
                assigned for the rest of the shift.
              </div>
            </div>
          </button>

          <button
            type="button"
            className={`${styles.handoffOption} ${
              handoffAction === "break" ? styles.handoffOptionSelected : ""
            }`}
            onClick={() => setHandoffAction("break")}
          >
            <FontAwesomeIcon icon={faUserClock} />
            <div>
              <div className={styles.handoffOptionTitle}>30-minute break</div>
              <div className={styles.handoffOptionSub}>
                Driver is on Break and hidden from new dispatches until the
                break ends. Equipment stays with them.
              </div>
            </div>
          </button>

          <button
            type="button"
            className={`${styles.handoffOption} ${styles.handoffOptionDanger} ${
              handoffAction === "send_home"
                ? styles.handoffOptionSelected
                : ""
            }`}
            onClick={() => setHandoffAction("send_home")}
          >
            <FontAwesomeIcon icon={faHouse} />
            <div>
              <div className={styles.handoffOptionTitle}>Send home</div>
              <div className={styles.handoffOptionSub}>
                Driver goes Off Duty.{" "}
                {handoffEquipmentStatus.hasMorningHandoff ? (
                  <>
                    {handoffEquipmentStatus.units
                      .filter((u) => u.assignedToDriver)
                      .map((u) => u.unitNumber)
                      .join(" + ")}{" "}
                    will release after a 1-hour cooldown.
                  </>
                ) : (
                  <>
                    No morning handoff found on these units — only driver
                    status changes to Off Duty (nothing to release).
                  </>
                )}
              </div>
            </div>
          </button>
        </div>

        {handoffAction === "send_home" &&
          !handoffEquipmentStatus.hasMorningHandoff && (
            <div className={formStyles.handoffWarn}>
              <FontAwesomeIcon icon={faTriangleExclamation} />
              <span>
                This driver does not currently hold the trip truck
                {handoffTrip?.trailer ? "/trailer" : ""} via the Handoff Board.
                Sending home will set them Off Duty but will not free equipment
                for another driver.
              </span>
            </div>
          )}

        <div className={formStyles.formActions}>
          <button
            type="button"
            className={formStyles.cancel}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className={formStyles.primaryButton} disabled={handoffSaving}>
            {handoffSaving
              ? "Saving…"
              : handoffAction === "send_home"
                ? "Confirm & send home"
                : handoffAction === "break"
                  ? "Confirm & start break"
                  : "Confirm handoff"}
          </button>
        </div>
      </form>
    </Modal>
  );
}