import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faClock,
  faLocationDot,
  faPlaneArrival,
  faPlaneDeparture,
} from "@fortawesome/free-solid-svg-icons";
import { cutoffState } from "../../utils/dispatchHelpers.js";
import styles from "./ShipmentLane.module.css";

export default function ShipmentLane({ shipment, compact = false }) {
  const isImport = shipment.type === "Import";
  const cutoff = cutoffState(shipment);

  return (
    <div className={`${styles.lane} ${compact ? styles.laneCompact : ""}`}>
      <div className={styles.lanePoint}>
        <FontAwesomeIcon icon={isImport ? faPlaneArrival : faLocationDot} />
        <span>
          {isImport
            ? `${shipment.airline?.code || "Airline"} cargo terminal`
            : shipment.warehouse?.name || "Origin warehouse"}
        </span>
      </div>
      <div className={styles.laneLine}>
        <FontAwesomeIcon icon={faChevronRight} />
      </div>
      <div className={styles.lanePoint}>
        <FontAwesomeIcon icon={isImport ? faLocationDot : faPlaneDeparture} />
        <span>
          {isImport
            ? shipment.warehouse?.name || "Destination warehouse"
            : `${shipment.airline?.code || "Airline"} cargo terminal`}
        </span>
      </div>
      {cutoff && (
        <span
          className={`${styles.cutoff} ${cutoff.urgent ? styles.cutoffUrgent : ""}`}
        >
          <FontAwesomeIcon icon={faClock} /> {cutoff.label}
        </span>
      )}
    </div>
  );
}