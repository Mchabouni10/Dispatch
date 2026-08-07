import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faCheck,
  faLocationDot,
  faPen,
  faPlaneArrival,
  faPlaneDeparture,
  faRoute,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import StatusBadge from "../../../../components/StatusBadge/StatusBadge.jsx";
import RunTimeline from "../RunTimeline/RunTimeline.jsx";
import ShipmentLane from "../ShipmentLane/ShipmentLane.jsx";
import {
  awbLabel,
  tripAllocation,
  shortDate,
} from "../../utils/dispatchHelpers.js";
import styles from "./RunBoard.module.css";

export default function RunBoard({
  activeTrips,
  loading,
  onEdit,
  onDelete,
  onStart,
  onHandoff,
}) {
  if (loading) {
    return <div className={styles.empty}>Loading dispatch board…</div>;
  }

  if (activeTrips.length === 0) {
    return (
      <div className={styles.empty}>
        <FontAwesomeIcon icon={faRoute} />
        <strong>No active runs yet</strong>
        <span>
          Build a run from ready cargo to connect the warehouse and airline
          sides.
        </span>
      </div>
    );
  }

  return (
    <div className={styles.tripList}>
      {activeTrips.map((trip) => (
        <article key={trip.id} className={styles.tripCard}>
          {/* ── Card header ── */}
          <div className={styles.tripTop}>
            <div>
              <div className={styles.tripNumber}>
                {trip.tripNumber}{" "}
                {trip.runType && (
                  <span
                    className={`${styles.runTypeTag} ${
                      trip.runType === "Export" ? styles.runTypeExport : ""
                    }`}
                  >
                    {trip.runType}
                  </span>
                )}
              </div>
              <div className={styles.tripMeta}>
                {trip.driver?.name || "—"} · {trip.truck?.unitNumber || "—"}
                {trip.trailer ? ` + ${trip.trailer.unitNumber}` : ""}
              </div>
            </div>
            <div className={styles.tripActions}>
              <button
                type="button"
                className={styles.actionIconButton}
                title="Edit run"
                onClick={() => onEdit(trip)}
              >
                <FontAwesomeIcon icon={faPen} />
              </button>
              <button
                type="button"
                className={`${styles.actionIconButton} ${styles.dangerIcon}`}
                title="Cancel / Delete run"
                onClick={() => onDelete(trip)}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
              <StatusBadge status={trip.status} />
            </div>
          </div>

          {/* ── Route flow ── */}
          <div className={styles.tripRouteFlow}>
            <span className={styles.routePoint}>
              <FontAwesomeIcon
                icon={
                  trip.runType === "Export" ? faLocationDot : faPlaneArrival
                }
              />
              {trip.runType === "Export"
                ? trip.shipments?.[0]?.warehouse?.name || "Origin Warehouse"
                : trip.shipments?.[0]?.airline?.name
                  ? `${trip.shipments[0].airline.name} Cargo Terminal`
                  : "Air Cargo Terminal"}
            </span>
            <span className={styles.routeConnector}>
              <FontAwesomeIcon icon={faChevronRight} />
            </span>
            <span className={styles.routePoint}>
              <FontAwesomeIcon
                icon={
                  trip.runType === "Export" ? faPlaneDeparture : faLocationDot
                }
              />
              {trip.runType === "Export"
                ? trip.shipments?.[0]?.airline?.name
                  ? `${trip.shipments[0].airline.name} Cargo Terminal${
                      trip.shipments?.[0]?.doorNumber
                        ? ` (Door ${trip.shipments[0].doorNumber})`
                        : ""
                    }`
                  : `Airline Terminal${
                      trip.shipments?.[0]?.doorNumber
                        ? ` (Door ${trip.shipments[0].doorNumber})`
                        : ""
                    }`
                : trip.shipments?.[0]?.warehouse?.name ||
                  "Destination Warehouse"}
            </span>
          </div>

          {/* ── Timeline ── */}
          <RunTimeline trip={trip} />

          {/* ── Manifest ── */}
          <div className={styles.manifest}>
            {(trip.shipments || []).map((shipment) => {
              const alloc = tripAllocation(shipment, trip);
              return (
                <div key={shipment.id} className={styles.manifestRow}>
                  <div>
                    <span className={styles.direction}>{shipment.type}</span>
                    <strong>{awbLabel(shipment)}</strong>
                    <span>
                      {alloc.pieces} pcs · {alloc.weight}{" "}
                      {shipment.weightUnit || "lb"}
                      {alloc.isPartial ? ` · of ${shipment.pieces} total` : ""}
                      {shipment.airline?.name
                        ? ` · ${shipment.airline.name}`
                        : ""}
                      {shipment.doorNumber
                        ? ` · Door ${shipment.doorNumber}`
                        : ""}
                    </span>
                  </div>
                  <ShipmentLane shipment={shipment} compact />
                </div>
              );
            })}
            {(!trip.shipments || trip.shipments.length === 0) && (
              <div className={styles.manifestRow}>
                <div>
                  <span className={styles.direction}>—</span>
                  <strong>No shipments linked</strong>
                  <span>Check shipmentIds / relation</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className={styles.tripFooter}>
            <span>
              {trip.status === "En Route"
                ? `Departed ${shortDate(trip.startTime)}`
                : "Scheduled — driver has not departed"}
            </span>
            {trip.status === "Scheduled" ? (
              <button onClick={() => onStart(trip)}>
                Start run <FontAwesomeIcon icon={faChevronRight} />
              </button>
            ) : (
              <button
                className={styles.complete}
                onClick={() => onHandoff(trip)}
              >
                <FontAwesomeIcon icon={faCheck} /> Confirm handoff
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}