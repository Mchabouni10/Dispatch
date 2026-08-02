import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faUserPlus,
  faTriangleExclamation,
  faLayerGroup,
  faArrowRightArrowLeft,
  faScissors,
  faLock,
} from "@fortawesome/free-solid-svg-icons";
import Modal from "../../components/Modal/Modal.jsx";
import { createTripBackup } from "../../api/api.js";
import styles from "./DispatchView.module.css";

/**
 * Row state per shipment while building the backup:
 *   mode: "none"  -> not going to the backup, stays entirely on the parent run
 *   mode: "move"  -> whole AWB moves to the backup
 *   mode: "split" -> only `pieces` of it moves to the backup, remainder stays on parent
 */
function initialSelections(manifestShipments) {
  const map = {};
  manifestShipments.forEach((s) => {
    map[s.id] = { mode: "none", pieces: "" };
  });
  return map;
}

/**
 * What the PARENT trip currently holds for this AWB.
 * A shipment only has a `TripShipmentSplit` row once it's been divided across
 * more than one trip - if this AWB was never split, the parent holds the
 * shipment's full pieces/weight. `parentTrip.shipmentSplits` is the source of
 * truth for anything already carved off (e.g. an earlier backup run).
 */
function heldOnParent(shipment, parentTrip) {
  const split = (parentTrip?.shipmentSplits || []).find(
    (sp) => sp.shipmentId === shipment.id,
  );
  if (split) {
    return {
      pieces: split.pieces,
      weight: split.weight,
      isPartial: split.pieces < shipment.pieces,
    };
  }
  return { pieces: shipment.pieces, weight: shipment.weight, isPartial: false };
}

function fallbackAwbLabel(shipment) {
  if (shipment?.awbDisplay) return shipment.awbDisplay;
  const prefix = shipment?.airline?.awbPrefix;
  const num = shipment?.airwaybillNumber;
  if (prefix && num) return `${prefix}-${num}`;
  if (num) return num;
  return "AWB pending";
}

export default function AddBackupDriverModal({
  open,
  parentTrip,
  manifestShipments,
  awbLabel,
  driverOptions,
  driverOptionLabel,
  unitAssignedToDriver,
  truckOptions,
  truckOptionLabel,
  trailerOptions,
  onClose,
  onSaved,
}) {
  const getAwbLabel = awbLabel || fallbackAwbLabel;

  const [driver, setDriver] = useState("");
  const [truck, setTruck] = useState("");
  const [truckAutoPicked, setTruckAutoPicked] = useState(false);
  const [trailer, setTrailer] = useState("");
  const [notes, setNotes] = useState("");
  const [selections, setSelections] = useState(() =>
    initialSelections(manifestShipments),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setDriver("");
    setTruck("");
    setTruckAutoPicked(false);
    setTrailer("");
    setNotes("");
    setSelections(initialSelections(manifestShipments));
    setError("");
  };

  const close = () => {
    reset();
    onClose();
  };

  // Picking a driver auto-fills their morning-handoff truck when it's free -
  // mirrors the same behavior as the main "build run" form, so dispatchers
  // don't have to remember which unit is already checked out to who.
  const pickDriver = (driverId) => {
    setDriver(driverId);
    if (!driverId) {
      setTruck("");
      setTruckAutoPicked(false);
      return;
    }
    const unit = unitAssignedToDriver?.[driverId];
    const isFree = unit && truckOptions.some((t) => t.id === unit.id);
    if (isFree) {
      setTruck(unit.id);
      setTruckAutoPicked(true);
    } else {
      setTruckAutoPicked(false);
    }
  };

  const pickTruck = (truckId) => {
    setTruck(truckId);
    setTruckAutoPicked(false);
  };

  const setMode = (shipmentId, mode) =>
    setSelections((cur) => ({
      ...cur,
      [shipmentId]: {
        ...cur[shipmentId],
        mode,
        pieces: mode === "split" ? cur[shipmentId].pieces : "",
      },
    }));

  const setPieces = (shipmentId, pieces) =>
    setSelections((cur) => ({
      ...cur,
      [shipmentId]: { ...cur[shipmentId], pieces },
    }));

  // Summary of what this backup is actually going to carry - computed live
  // so the dispatcher can see the total load before saving.
  const summary = useMemo(() => {
    let awbCount = 0;
    let pieces = 0;
    let weight = 0;
    let weightUnit = "lb";
    for (const s of manifestShipments) {
      const sel = selections[s.id];
      if (!sel || sel.mode === "none") continue;
      const held = heldOnParent(s, parentTrip);
      weightUnit = s.weightUnit || weightUnit;
      awbCount += 1;
      if (sel.mode === "move") {
        pieces += held.pieces;
        weight += held.weight;
      } else {
        const pcs = Number(sel.pieces);
        if (Number.isFinite(pcs) && pcs > 0 && held.pieces > 0) {
          pieces += pcs;
          weight += Math.round((pcs / held.pieces) * held.weight * 100) / 100;
        }
      }
    }
    return { awbCount, pieces, weight: Math.round(weight * 100) / 100, weightUnit };
  }, [selections, manifestShipments, parentTrip]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (!driver) return setError("Select a backup driver.");
    if (!truck) return setError("Select a backup power unit / truck.");

    const allocations = [];
    for (const s of manifestShipments) {
      const sel = selections[s.id];
      if (!sel || sel.mode === "none") continue;

      if (sel.mode === "move") {
        allocations.push({ shipmentId: s.id, mode: "move" });
        continue;
      }

      // split
      const held = heldOnParent(s, parentTrip);
      const pcs = Number(sel.pieces);
      if (!Number.isFinite(pcs) || pcs <= 0) {
        return setError(`Enter a valid piece count to split off ${getAwbLabel(s)}.`);
      }
      if (pcs >= held.pieces) {
        return setError(
          `${getAwbLabel(s)} only has ${held.pieces} pcs left on the parent run - use "Move whole permit" to send all of it, not a split.`,
        );
      }
      const proportionalWeight =
        held.pieces > 0 ? Math.round((pcs / held.pieces) * held.weight * 100) / 100 : 0;
      allocations.push({
        shipmentId: s.id,
        mode: "split",
        pieces: pcs,
        weight: proportionalWeight,
      });
    }

    if (allocations.length === 0) {
      return setError("Select at least one cargo permit for the backup to take.");
    }

    setSaving(true);
    try {
      await createTripBackup(parentTrip.id, {
        driverId: driver,
        truckId: truck,
        trailerId: trailer || undefined,
        notes,
        allocations,
        plannedDepartureTime: parentTrip.plannedDepartureTime || undefined,
        expectedCompletionTime: parentTrip.expectedCompletionTime || undefined,
      });
      reset();
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title={`Add Backup Driver${parentTrip?.tripNumber ? ` - ${parentTrip.tripNumber}` : ""}`}
      size="lg"
    >
      <form className={styles.form} onSubmit={submit}>
        <p className={styles.formIntro}>
          Freight doesn't fit on one trailer, or one driver can't take every
          permit? Bring in a second crew and decide, permit by permit,
          whether it moves over whole or only part of it splits off.
        </p>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.formGrid}>
          <label>
            Backup driver
            <select required value={driver} onChange={(e) => pickDriver(e.target.value)}>
              <option value="">Select driver</option>
              {driverOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {driverOptionLabel(d)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Backup power unit / Truck
            <select required value={truck} onChange={(e) => pickTruck(e.target.value)}>
              <option value="">
                {truckOptions.length === 0 ? "No available power units" : "Select in-service power unit"}
              </option>
              {truckOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {truckOptionLabel(t)}
                </option>
              ))}
            </select>
            {truckAutoPicked && (
              <span className={styles.fieldHintGood}>
                <FontAwesomeIcon icon={faLock} /> Auto-selected - this driver's
                own checked-out unit. Change it above if that's not right.
              </span>
            )}
          </label>

          <label>
            Backup trailer <span>(optional)</span>
            <select value={trailer} onChange={(e) => setTrailer(e.target.value)}>
              <option value="">No trailer</option>
              {trailerOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.unitNumber} · {t.equipmentType || t.category}
                  {t.capacityLbs ? ` · ${t.capacityLbs.toLocaleString()} lb` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            Dispatcher notes
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={`Backup for ${parentTrip?.tripNumber || "this run"}`}
            />
          </label>
        </div>

        <div className={styles.manifestPicker}>
          <div className={styles.pickerTitle}>
            Assign cargo to backup <span>{summary.awbCount} selected</span>
          </div>

          {manifestShipments.length === 0 ? (
            <p className={styles.noCargo}>No cargo on this run to reassign.</p>
          ) : (
            manifestShipments.map((s) => {
              const held = heldOnParent(s, parentTrip);
              const sel = selections[s.id] || { mode: "none", pieces: "" };
              const canSplit = held.pieces > 1;
              const remaining = Math.max(0, held.pieces - Number(sel.pieces || 0));

              return (
                <div
                  key={s.id}
                  className={`${styles.pickRow} ${sel.mode !== "none" ? styles.picked : ""}`}
                >
                  <div>
                    <div className={styles.manifestRowHead}>
                      <strong>{getAwbLabel(s)}</strong>
                      <span className={styles.manifestRowType}>{s.type}</span>
                    </div>
                    <span>
                      {s.airline?.name || "Airline -"} · {held.pieces} pcs / {held.weight}{" "}
                      {s.weightUnit || "lb"} currently on the parent run
                      {held.isPartial ? " (already split earlier)" : ""}
                    </span>

                    <div className={styles.modeToggle}>
                      <button
                        type="button"
                        className={`${styles.modeBtn} ${sel.mode === "none" ? styles.modeBtnSelected : ""}`}
                        onClick={() => setMode(s.id, "none")}
                      >
                        Keep on parent
                      </button>
                      <button
                        type="button"
                        className={`${styles.modeBtn} ${styles.modeBtnMove} ${sel.mode === "move" ? styles.modeBtnSelected : ""}`}
                        onClick={() => setMode(s.id, "move")}
                      >
                        <FontAwesomeIcon icon={faArrowRightArrowLeft} /> Move whole permit
                      </button>
                      {canSplit && (
                        <button
                          type="button"
                          className={`${styles.modeBtn} ${styles.modeBtnSplit} ${sel.mode === "split" ? styles.modeBtnSelected : ""}`}
                          onClick={() => setMode(s.id, "split")}
                        >
                          <FontAwesomeIcon icon={faScissors} /> Split pieces
                        </button>
                      )}
                    </div>

                    {sel.mode === "split" && (
                      <div className={styles.splitRow}>
                        <label>
                          Pieces to backup
                          <input
                            type="number"
                            min={1}
                            max={held.pieces - 1}
                            value={sel.pieces}
                            onChange={(e) => setPieces(s.id, e.target.value)}
                          />
                        </label>
                        <span className={styles.fieldHint}>
                          of {held.pieces} pcs - <strong>{remaining} pcs</strong> stay
                          on the parent run
                        </span>
                      </div>
                    )}
                  </div>
                  {sel.mode !== "none" && (
                    <span className={styles.checkbox}>
                      <FontAwesomeIcon icon={faCheck} />
                    </span>
                  )}
                </div>
              );
            })
          )}

          {summary.awbCount > 0 && (
            <div className={styles.manifestSummaryBar}>
              <FontAwesomeIcon icon={faLayerGroup} />
              <span>
                Backup will carry <strong>{summary.awbCount}</strong> AWB
                {summary.awbCount === 1 ? "" : "s"} · <strong>{summary.pieces}</strong>{" "}
                pcs · <strong>{summary.weight}</strong> {summary.weightUnit}
              </span>
            </div>
          )}
        </div>

        {summary.awbCount > 0 && !driver && (
          <div className={styles.handoffWarn}>
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <span>Select a backup driver and truck before saving.</span>
          </div>
        )}

        <div className={styles.formActions}>
          <button type="button" className={styles.cancel} onClick={close}>
            Cancel
          </button>
          <button className={styles.primaryButton} disabled={saving}>
            <FontAwesomeIcon icon={faUserPlus} />{" "}
            {saving ? "Adding backup..." : "Add backup driver"}
          </button>
        </div>
      </form>
    </Modal>
  );
}