import React from 'react';
import styles from './StatusBadge.module.css';

const STATUS_MAP = {
  // Green - success
  Available: 'success',
  Completed: 'success',
  // Orange - warning
  'On Trip': 'warning',
  'In Transit': 'warning',
  'In Use': 'warning',
  'En Route': 'warning',
  Assigned: 'warning',
  // Red - danger
  Absent: 'danger',
  Cancelled: 'danger',
  // Blue - info/accent
  Pending: 'info',
  Scheduled: 'info',
  Maintenance: 'purple',
};

export default function StatusBadge({ status }) {
  const variant = STATUS_MAP[status] || 'info';
  return (
    <span className={`${styles.badge} ${styles[variant]}`}>
      <span className={styles.dot} />
      {status}
    </span>
  );
}
