//src/pages/Dispatch/DispatchView.jsx
import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faBoxesStacked,
  faClock,
  faPlus,
  faTruck,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import {
  createTrip,
  deleteTrip,
  finishTrip,
  startTrip,
  updateTrip,
} from "../../api/api.js";
import useDispatchResources from "./hooks/useDispatchResources.js";
import { EMPTY_FORM } from "./utils/dispatchConstants.js";
import { cutoffState, toDatetimeLocal, awbLabel } from "./utils/dispatchHelpers.js";
import RunBoard from "./components/RunBoard/RunBoard.jsx";
import ReadyCargoPanel from "./components/ReadyCargoPanel/ReadyCargoPanel.jsx";
import BuildRunModal from "./components/BuildRunModal/BuildRunModal.jsx";
import HandoffModal from "./components/HandoffModal/HandoffModal.jsx";
import DeleteRunModal from "./components/DeleteRunModal/DeleteRunModal.jsx";
import AddBackupDriverModal from "./components/AddBackupDriverModal/AddBackupDriverModal.jsx";
import styles from "./DispatchView.module.css";

export default function DispatchView() {
  const {
    trips,
    drivers,
    equipment,
    airlines,
    loading,
    error,
    setError,
    load,
    availableShipments,
    availableDrivers,
    activeTrips,
    busyEquipmentIds,
    unitAssignedToDriver,
    trucks,
    trailers,
  } = useDispatchResources();

  /* ── Modal state ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [deleteConfirmTrip, setDeleteConfirmTrip] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [handoffTrip, setHandoffTrip] = useState(null);
  const [handoffTime, setHandoffTime] = useState("");
  const [handoffAction, setHandoffAction] = useState("available");
  const [handoffSaving, setHandoffSaving] = useState(false);
  const [handoffOutcomes, setHandoffOutcomes] = useState({});
  const [handoffReceivedBy, setHandoffReceivedBy] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");
  const [handoffPodImage, setHandoffPodImage] = useState("");
  const [handoffSignatureImage, setHandoffSignatureImage] = useState("");
  const [backupModalOpen, setBackupModalOpen] = useState(false);

  /* ── Derived counts ── */
  const importCount = availableShipments.filter((s) => s.type === "Import").length;
  const exportCount = availableShipments.filter((s) => s.type === "Export").length;

  /* ── Build / Edit Run ── */
  const openBuildRun = () => {
    setEditingTrip(null);
    setForm({ ...EMPTY_FORM, plannedDepartureTime: toDatetimeLocal(new Date()) });
    setError("");
    setModalOpen(true);
  };

  const openEditRun = (trip) => {
    setEditingTrip(trip);
    setForm({
      runType: trip.runType || "",
      driver: trip.driverId || trip.driver?.id || "",
      truck: trip.truckId || trip.truck?.id || "",
      trailer: trip.trailerId || trip.trailer?.id || "",
      shipments: (trip.shipments || []).map((s) => s.id),
      plannedDepartureTime: trip.plannedDepartureTime
        ? toDatetimeLocal(trip.plannedDepartureTime)
        : toDatetimeLocal(new Date()),
      expectedCompletionTime: trip.expectedCompletionTime
        ? toDatetimeLocal(trip.expectedCompletionTime)
        : "",
      notes: trip.notes || "",
      doorNumber: trip.shipments?.find((s) => s.doorNumber)?.doorNumber || "",
    });
    setError("");
    setModalOpen(true);
  };

  const submitTrip = async (event) => {
    event.preventDefault();
    if (!form.runType) return setError("Choose Import or Export for this run.");
    if (!form.shipments.length) return setError("Select at least one cargo shipment for this run.");
    if (!form.driver) return setError("Select a driver.");
    if (!form.truck) return setError("Select a power unit / truck.");
    if (form.runType === "Export" && !form.doorNumber)
      return setError("Select the warehouse door number (1–30) for this export.");

    setSaving(true);
    setError("");
    try {
      const payload = {
        driverId: form.driver,
        truckId: form.truck,
        trailerId: form.trailer || undefined,
        shipmentIds: form.shipments,
        runType: form.runType,
        plannedDepartureTime: form.plannedDepartureTime || undefined,
        expectedCompletionTime: form.expectedCompletionTime || undefined,
        notes: form.notes || "",
        doorNumber: form.runType === "Export" ? form.doorNumber : undefined,
      };
      if (editingTrip) {
        await updateTrip(editingTrip.id, payload);
      } else {
        await createTrip(payload);
      }
      setModalOpen(false);
      setEditingTrip(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete ── */
  const confirmDeleteRun = async () => {
    if (!deleteConfirmTrip) return;
    setDeleting(true);
    setError("");
    try {
      await deleteTrip(deleteConfirmTrip.id);
      setDeleteConfirmTrip(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  /* ── Start / Handoff ── */
  const startRun = async (trip) => {
    try {
      await startTrip(trip.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const openHandoff = (trip) => {
    setHandoffTrip(trip);
    setHandoffTime(toDatetimeLocal(new Date()));
    setHandoffAction("available");
    const defaultOutcomes = {};
    (trip.shipments || []).forEach((s) => {
      defaultOutcomes[s.id] = { outcome: "delivered" };
    });
    setHandoffOutcomes(defaultOutcomes);
    setHandoffReceivedBy("");
    setHandoffNotes("");
    setHandoffPodImage("");
    setHandoffSignatureImage("");
    setError("");
  };

  const confirmHandoff = async (event) => {
    event.preventDefault();
    if (!handoffTrip) return;
    setHandoffSaving(true);
    setError("");
    try {
      const outcomes = Object.entries(handoffOutcomes).map(([shipmentId, o]) => ({
        shipmentId,
        outcome: o.outcome,
        piecesAffected: o.piecesAffected,
        reason: o.reason,
        canReschedule: o.canReschedule,
      }));
      await finishTrip(handoffTrip.id, {
        finishTime: handoffTime,
        postTripAction: handoffAction,
        cooldownMinutes: handoffAction === "send_home" ? 60 : undefined,
        receivedByName: handoffReceivedBy || undefined,
        notes: handoffNotes || undefined,
        podImage: handoffPodImage || undefined,
        signatureImage: handoffSignatureImage || undefined,
        outcomes,
      });
      setHandoffTrip(null);
      setHandoffAction("available");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setHandoffSaving(false);
    }
  };

  /* ── Backup modal labels (reuse from BuildRunModal context) ── */
  function driverOptionLabel(d) {
    const parts = [d.name];
    if (d.phone) parts.push(d.phone);
    return parts.join(" · ");
  }

  function truckOptionLabel(t) {
    return [t.unitNumber, t.equipmentType || t.category].filter(Boolean).join(" · ");
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            <FontAwesomeIcon icon={faBolt} /> Ground-to-air control tower
          </div>
          <h1>Air Cargo Dispatch</h1>
          <p>
            Connect every truck movement to a warehouse handoff and airline
            commitment.
          </p>
        </div>
        <button className={styles.primaryButton} onClick={openBuildRun}>
          <FontAwesomeIcon icon={faPlus} /> Build a run
        </button>
      </div>

      {error && !modalOpen && !handoffTrip && (
        <div className={styles.error}>{error}</div>
      )}

      {/* ── Overview metrics ── */}
      <section className={styles.overview}>
        <div className={styles.metric}>
          <FontAwesomeIcon icon={faTruck} />
          <div>
            <strong>{activeTrips.length}</strong>
            <span>active ground runs</span>
          </div>
        </div>
        <div className={styles.metric}>
          <FontAwesomeIcon icon={faBoxesStacked} />
          <div>
            <strong>{availableShipments.length}</strong>
            <span>cargo ready to assign</span>
          </div>
        </div>
        <div className={styles.metric}>
          <FontAwesomeIcon icon={faUser} />
          <div>
            <strong>{availableDrivers.length}</strong>
            <span>drivers available</span>
          </div>
        </div>
        <div className={styles.metric}>
          <FontAwesomeIcon icon={faClock} />
          <div>
            <strong>
              {availableShipments.filter((s) => cutoffState(s)?.urgent).length}
            </strong>
            <span>cutoff-sensitive exports</span>
          </div>
        </div>
      </section>

      {/* ── Main layout ── */}
      <div className={styles.layout}>
        <section className={styles.board}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Run board</h2>
              <span>Live truck movements and their cargo handoffs</span>
            </div>
            <span className={styles.count}>{activeTrips.length} open</span>
          </div>
          <RunBoard
            activeTrips={activeTrips}
            loading={loading}
            onEdit={openEditRun}
            onDelete={setDeleteConfirmTrip}
            onStart={startRun}
            onHandoff={openHandoff}
          />
        </section>

        <aside className={styles.readyPanel}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Ready cargo</h2>
              <span>Unassigned shipments</span>
            </div>
          </div>
          <ReadyCargoPanel availableShipments={availableShipments} />
        </aside>
      </div>

      {/* ── Modals ── */}
      <BuildRunModal
        open={modalOpen}
        editingTrip={editingTrip}
        form={form}
        setForm={setForm}
        error={error}
        saving={saving}
        drivers={drivers}
        availableDrivers={availableDrivers}
        equipment={equipment}
        airlines={airlines}
        unitAssignedToDriver={unitAssignedToDriver}
        busyEquipmentIds={busyEquipmentIds}
        trucks={trucks}
        trailers={trailers}
        availableShipments={availableShipments}
        importCount={importCount}
        exportCount={exportCount}
        onClose={() => setModalOpen(false)}
        onSubmit={submitTrip}
        onOpenBackup={() => setBackupModalOpen(true)}
      />

      {editingTrip && (
        <AddBackupDriverModal
          open={backupModalOpen}
          parentTrip={editingTrip}
          manifestShipments={editingTrip.shipments || []}
          awbLabel={awbLabel}
          unitAssignedToDriver={unitAssignedToDriver}
          driverOptions={availableDrivers.filter(
            (d) => d.id !== (editingTrip.driverId || editingTrip.driver?.id),
          )}
          driverOptionLabel={driverOptionLabel}
          truckOptions={trucks.filter(
            (t) => t.id !== (editingTrip.truckId || editingTrip.truck?.id),
          )}
          truckOptionLabel={truckOptionLabel}
          trailerOptions={trailers.filter(
            (t) => t.id !== (editingTrip.trailerId || editingTrip.trailer?.id),
          )}
          onClose={() => setBackupModalOpen(false)}
          onSaved={async () => {
            setBackupModalOpen(false);
            setModalOpen(false);
            setEditingTrip(null);
            setForm(EMPTY_FORM);
            await load();
          }}
        />
      )}

      <HandoffModal
        handoffTrip={handoffTrip}
        handoffTime={handoffTime}
        setHandoffTime={setHandoffTime}
        handoffAction={handoffAction}
        setHandoffAction={setHandoffAction}
        handoffSaving={handoffSaving}
        error={error}
        equipment={equipment}
        outcomes={handoffOutcomes}
        setOutcomes={setHandoffOutcomes}
        receivedByName={handoffReceivedBy}
        setReceivedByName={setHandoffReceivedBy}
        notes={handoffNotes}
        setNotes={setHandoffNotes}
        podImage={handoffPodImage}
        setPodImage={setHandoffPodImage}
        signatureImage={handoffSignatureImage}
        setSignatureImage={setHandoffSignatureImage}
        onClose={() => {
          setHandoffTrip(null);
          setHandoffAction("available");
        }}
        onSubmit={confirmHandoff}
      />

      <DeleteRunModal
        trip={deleteConfirmTrip}
        deleting={deleting}
        error={error}
        onClose={() => setDeleteConfirmTrip(null)}
        onConfirm={confirmDeleteRun}
      />
    </div>
  );
}

