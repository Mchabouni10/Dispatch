// client/src/pages/Exports/Templates/Ceva_Export_Template.jsx
//
// Print-only replica of CEVA's paper "AIRLINE TRANSFER MANIFEST" form.
// This is rendered off-screen and handed to react-to-print by ExportsView.jsx —
// it is not meant to be shown in normal app UI, only captured as a print/PDF.
//
// Props:
//   movementOrderNumber : string  — printed in the "Movement Order #" blank
//   transferTo          : string  — airline code circled at the top of the form
//   transferredBy        : string  — trucking company name in the signature block
//   shipments            : Array<{
//                            mawbNumber, dest, pieces, weight,
//                            lockout, remarks, loose, uld, dg
//                          }>
//   printedAt            : Date   — stamped at the bottom of the manifest table
//
import React from 'react';
import cevaLogo from '../../../../images/CEVA-Logo.png'; // adjust path if your folder structure differs
import styles from './Ceva_Export_Template.module.css';

const MIN_ROWS = 7; // the paper form always shows 7 numbered rows, blank ones included

function formatPrintedDate(d) {
  if (!d) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPrintedTime(d) {
  if (!d) return '';
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export default function CevaExportTemplate({
  movementOrderNumber = '',
  transferTo = '',
  transferredBy = '',
  shipments = [],
  printedAt = new Date(),
}) {
  const rows = [...shipments];
  while (rows.length < MIN_ROWS) rows.push({});

  return (
    <div className={styles.sheet}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <img src={cevaLogo} alt="CEVA" className={styles.logo} />
        <h1 className={styles.title}>Airline Transfer Manifest</h1>
        <div className={styles.movementOrder}>
          <span>Movement Order #</span>
          <span className={styles.blankLine}>{movementOrderNumber}</span>
        </div>
      </div>

      <div className={styles.transferToRow}>
        <span className={styles.transferToLabel}>Transfer To</span>
        <span className={styles.transferToValue}>{transferTo}</span>
      </div>

      {/* ── Shipment table ── */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colNum}>#</th>
            <th className={styles.colMawb}>MAWB Number</th>
            <th className={styles.colDest}>Dest</th>
            <th className={styles.colPieces}>Pieces</th>
            <th className={styles.colWeight}>Weight</th>
            <th className={styles.colLockout}>Lockout Date/Time</th>
            <th className={styles.colRemarks}>Remarks</th>
            <th className={styles.colLoose}>Loose</th>
            <th className={styles.colUld}>ULD</th>
            <th className={styles.colDg}>DG</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className={styles.colNum}>{i + 1}</td>
              <td className={styles.mono}>{r.mawbNumber || ''}</td>
              <td>{r.dest || ''}</td>
              <td>{r.pieces || ''}</td>
              <td>{r.weight || ''}</td>
              <td>{r.lockout || ''}</td>
              <td className={styles.remarksCell}>{r.remarks || ''}</td>
              <td>{r.loose || ''}</td>
              <td>{r.uld || ''}</td>
              <td>{r.dg || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Check-in / check-out block ── */}
      <table className={styles.checkTable}>
        <tbody>
          <tr>
            <td className={styles.checkParty}>CEVA</td>
            <td className={styles.checkLabel}>Check In Time:</td>
            <td className={styles.checkBlank} />
            <td className={styles.checkLabel}>Driver Initials:</td>
            <td className={styles.checkBlank} />
            <td className={styles.checkLabel}>CEVA Initials:</td>
            <td className={styles.checkBlank} />
          </tr>
          <tr>
            <td className={styles.checkParty}>CEVA</td>
            <td className={styles.checkLabel}>Check out Time:</td>
            <td className={styles.checkBlank} />
            <td className={styles.checkLabel}>Driver Initials:</td>
            <td className={styles.checkBlank} />
            <td className={styles.checkLabel}>CEVA Initials:</td>
            <td className={styles.checkBlank} />
          </tr>
          <tr>
            <td className={styles.checkParty}>Carrier</td>
            <td className={styles.checkLabel}>Check In Time:</td>
            <td className={styles.checkBlank} colSpan={5} />
          </tr>
          <tr>
            <td className={styles.checkParty}>Carrier</td>
            <td className={styles.checkLabel}>Check out Time:</td>
            <td className={styles.checkBlank} colSpan={5} />
          </tr>
          <tr>
            <td colSpan={7} className={styles.printedStamp}>
              <div>{formatPrintedDate(printedAt)}</div>
              <div>{formatPrintedTime(printedAt)}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Signature block ── */}
      <div className={styles.signatureGrid}>
        <div className={styles.signatureCol}>
          <p className={styles.signatureIntro}>
            Transferred by {transferredBy}
            <br />
            <span className={styles.signatureSub}>(Transferring Carrier)</span>
          </p>
          <div className={styles.signatureLine} />
          <div className={styles.signatureFieldRow}>
            <span>By:</span>
            <span className={styles.fillLine} />
          </div>
          <div className={styles.signatureSubLabel}>(Signature)</div>
          <div className={styles.signatureFieldRow}>
            <span>Time:</span>
            <span className={styles.fillLine} />
            <span>Date:</span>
            <span className={styles.fillLine} />
          </div>
        </div>

        <div className={styles.signatureCol}>
          <p className={styles.signatureIntro}>
            Above Shipment(s) Received in Full and Apparent Good Order and
            Condition except as Noted in &ldquo;Remarks&rdquo; Column.
          </p>
          <div className={styles.signatureFieldRow}>
            <span>Received by:</span>
            <span className={styles.fillLine} />
          </div>
          <div className={styles.signatureSubLabel}>(Name of Receiving Carrier)</div>
          <div className={styles.signatureFieldRow}>
            <span>By:</span>
            <span className={styles.fillLine} />
          </div>
          <div className={styles.signatureSubLabel}>(Signature)</div>
          <div className={styles.signatureFieldRow}>
            <span>Time:</span>
            <span className={styles.fillLine} />
            <span>Date:</span>
            <span className={styles.fillLine} />
          </div>
        </div>
      </div>

      <div className={styles.footer}>Version: 07/01/20</div>
    </div>
  );
}