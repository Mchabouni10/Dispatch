//src/pages/Dispatch/components/DeleteRunModal/DeleteRunModal.jsx
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import Modal from "../../../../components/Modal/Modal.jsx";
import styles from "./DeleteRunModal.module.css";

export default function DeleteRunModal({ trip, deleting, error, onClose, onConfirm }) {
  if (!trip) return null;

  return (
    <Modal isOpen onClose={onClose} title="Cancel & Delete Run" size="md">
      <div className={styles.deleteConfirmContent}>
        <div className={styles.deleteWarningHeader}>
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>Are you sure you want to cancel this run?</span>
        </div>
        <p>
          Deleting <strong>{trip.tripNumber}</strong> will:
        </p>
        <ul>
          <li>
            Release driver{" "}
            <strong>{trip.driver?.name || "assigned driver"}</strong> back to{" "}
            <em>Available</em> status.
          </li>
          <li>
            Revert{" "}
            <strong>{(trip.shipments || []).length} cargo permit(s)</strong>{" "}
            back to <em>Pending</em> status.
          </li>
        </ul>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.confirmButtons}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={deleting}
          >
            Keep Run
          </button>
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Cancel & Delete Run"}
          </button>
        </div>
      </div>
    </Modal>
  );
}