import React from "react";
import ShipmentLane from "../ShipmentLane/ShipmentLane.jsx";
import { awbLabel } from "../../utils/dispatchHelpers.js";
import styles from "./ReadyCargoPanel.module.css";

export default function ReadyCargoPanel({ availableShipments }) {
  if (availableShipments.length === 0) {
    return <p className={styles.noCargo}>All cargo is assigned to a run.</p>;
  }

  return (
    <>
      {availableShipments.slice(0, 6).map((shipment) => (
        <div key={shipment.id} className={styles.readyItem}>
          <div className={styles.readyTop}>
            <span
              className={`${styles.direction} ${
                shipment.type === "Export" ? styles.export : ""
              }`}
            >
              {shipment.type}
            </span>
            <strong>{awbLabel(shipment)}</strong>
          </div>
          <span>
            {shipment.airline?.name || "—"} · {shipment.pieces} pcs
            {shipment.doorNumber ? ` · Door ${shipment.doorNumber}` : ""}
          </span>
          <ShipmentLane shipment={shipment} compact />
        </div>
      ))}
      {availableShipments.length > 6 && (
        <p className={styles.more}>
          +{availableShipments.length - 6} more ready shipments
        </p>
      )}
    </>
  );
}