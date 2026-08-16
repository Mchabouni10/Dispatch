import React from "react";
import styles from "./Ceva-template.module.css";
// TODO: fix this path to point at your actual logo file.
// Your terminal showed it living at `client/images/CEVA-Logo.png` — adjust the
// number of "../" hops based on where this component file sits relative to that folder.
import cevaLogo from "../../../../images/CEVA-Logo.png";

/**
 * Renders the CBP "Application and Permit to Transfer Containerized Cargo
 * from Pier/Terminal to a Container Station" form, styled to match CEVA's
 * printed copy.
 *
 * Everything printed on the original form is data-driven via props so this
 * can later be wired up to your shipment schema. Fields that are normally
 * hand-annotated after printing (dates/times stamped in pen, bond numbers,
 * signatures) are rendered as blank fillable lines unless a value is passed.
 *
 * Props:
 *  - shipment: your shipment record (pieces, weight, mawb, etc.)
 *  - airline: the arriving carrier { name }
 *  - warehouse: full warehouse record (preferred over shipment.warehouse,
 *      which is often a partial relation with only id/name)
 *  - permit: overrides/extra fields specific to this permit document
 *      {
 *        fromFacility: { name, address, cityZip, country },
 *        toFacility:   { name, address, cityZip, country },
 *        districtDirector, irsNo, firmsNo,
 *        containerMark, piecesTypes,
 *        arrivalAirline, flightNumber, eta, originCity, mawb,
 *        iitBondNo, ourRef, approvalDate,
 *        controlNo,            // hand-stamped permit/control number (top-right, above ORD block)
 *        shortageNote,         // e.g. "Shortage -12" — discrepancy annotation
 *        deliveryConfirmationNote, // e.g. "This shipment has been delivered on Aug 6th at 11:46"
 *        deliveryConfirmedBy,  // initials/name signing off the delivery note above
 *        transferRows: [{ truckNo, containerNo, date, releasingInspector, truckman, receivingOfficer }]
 *      }
 *
 * ourRef: if not supplied via permit.ourRef, it's auto-generated with
 * generateOurRef() below. Confirm the TB.../C... format matches what your
 * ops team actually uses — this is a best guess based on the sample form.
 */
export function generateOurRef(shipment) {
  if (!shipment) return "";
  const seed =
    shipment.id || shipment.ordNumber || shipment.airwaybillNumber || "";
  // Deterministic-ish 8-digit numeric strings derived from the seed so the
  // same shipment always gets the same ref if regenerated.
  let hash = 0;
  for (let i = 0; i < String(seed).length; i++) {
    hash = (hash * 31 + String(seed).charCodeAt(i)) >>> 0;
  }
  const part1 = String(hash % 100000000).padStart(8, "0");
  const part2 = String((hash * 7 + 13) % 100000000).padStart(8, "0");
  return `TB${part1} - C${part2}`;
}
export default function CevaTemplate({
  shipment,
  airline,
  warehouse,
  permit = {},
}) {
  const formatDate = (date) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const formatTime = (date) => {
    if (!date) return "";
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Pull an address line out of a warehouse/facility record regardless of
  // which field naming convention it uses.
  const pickAddressLine = (w) => {
    if (!w) return "";
    if (w.address) return w.address;
    if (w.streetAddress) return w.streetAddress;
    if (w.addressLine1 || w.line1) {
      return [w.addressLine1 || w.line1, w.addressLine2 || w.line2]
        .filter(Boolean)
        .join(", ");
    }
    if (w.street) return w.street;
    if (w.addr) return w.addr;
    return "";
  };
  const pickCityZip = (w) => {
    if (!w) return "";
    if (w.cityZip) return w.cityZip;
    if (w.cityStateZip) return w.cityStateZip;
    const cityState = [w.city, w.state || w.region].filter(Boolean).join(", ");
    const zip = w.zip || w.postalCode || w.zipCode || w.postal || "";
    return [cityState, zip].filter(Boolean).join(" ");
  };

  // Split a single-line terminal address like
  // "609 S Access Rd, Chicago, IL 60666" into street + city/state/zip.
  const splitTerminalAddress = (raw) => {
    if (!raw || typeof raw !== "string") return { address: "", cityZip: "" };
    const trimmed = raw.trim();
    const comma = trimmed.indexOf(",");
    if (comma === -1) return { address: trimmed, cityZip: "" };
    return {
      address: trimmed.slice(0, comma).trim(),
      cityZip: trimmed.slice(comma + 1).trim(),
    };
  };

  // "From Pier/Terminal" = the arriving airline's cargo terminal.
  // Built from the airline record (name + terminalAddress). Falls back to
  // a blank name if no airline is set so the form still prints cleanly.
  const fromFacility =
    permit.fromFacility ||
    (() => {
      if (airline?.name || airline?.terminalAddress) {
        const parts = splitTerminalAddress(airline.terminalAddress || "");
        const nameParts = [airline.name];
        if (airline.code) nameParts.push(`(${airline.code})`);
        return {
          name: nameParts.filter(Boolean).join(" ").toUpperCase(),
          address: parts.address,
          cityZip: parts.cityZip,
          country: airline.country || "United States",
        };
      }
      return {
        name: "",
        address: "",
        cityZip: "",
        country: "United States",
      };
    })();

  // "To Pier/Terminal" is the destination warehouse. Prefer the explicit
  // warehouse prop (full record from getWarehouses) over shipment.warehouse
  // which is often a stripped relation with only id + name.
  const destWarehouse = warehouse || shipment?.warehouse;
  const toFacility =
    permit.toFacility ||
    (destWarehouse
      ? {
          name: (destWarehouse.name || "").toUpperCase(),
          address: pickAddressLine(destWarehouse),
          cityZip: pickCityZip(destWarehouse),
          country: destWarehouse.country || "United States",
        }
      : {
          name: "CEVA AIR & OCEAN USA INC.",
          address: "2050 CORNELL AVE",
          cityZip: "MELROSE PARK 60160",
          country: "United States",
        });

  let ordNumber = permit.ordNumber || shipment?.ordNumber || "";
  if (ordNumber) {
    ordNumber = ordNumber.replace(/^CVA/i, "");
  }

  const districtDirector = permit.districtDirector || "CHICAGO, IL";
  const irsNo = permit.irsNo || "13-2635593CH";
  const firmsNo = permit.firmsNo || "HBB6";

  const containerMark = permit.containerMark || shipment?.containerMark || "";

  // Weight comes in as a single number + unit ('lb' or 'kg'); show both so
  // nobody has to do the conversion by hand.
  const LB_PER_KG = 2.20462;
  const fmtNum = (n) =>
    n === null || n === undefined || n === ""
      ? ""
      : Math.round(n).toLocaleString("en-US");
  let weightDisplay = "";
  if (shipment?.weight != null) {
    const isKg = shipment?.weightUnit === "kg";
    const weightLb = isKg ? shipment.weight * LB_PER_KG : shipment.weight;
    const weightKg = isKg ? shipment.weight : shipment.weight / LB_PER_KG;
    weightDisplay = `${fmtNum(weightLb)} lb / ${fmtNum(weightKg)} kg`;
  }

  const piecesTypes =
    permit.piecesTypes ||
    (shipment?.pieces != null || weightDisplay
      ? `${shipment?.pieces ?? ""} ${shipment?.pieceType || "PCS"}   ${weightDisplay}`.trim()
      : "");

  // Airline name + IATA code, e.g. "American Airlines Cargo (AA)"
  const arrivalAirline =
    permit.arrivalAirline ||
    (airline?.name
      ? `${airline.name}${airline?.code ? ` (${airline.code})` : ""}`
      : "");

  const flightNumber = permit.flightNumber || shipment?.flightNumber || "";
  const eta = permit.eta || shipment?.flightEta || shipment?.eta;
  const originCity = permit.originCity || shipment?.originCity || "";

  // MAWB must include the airline's AWB prefix, not just the trailing digits
  // (e.g. "001-00998899", not just "00998899").
  const mawb =
    permit.mawb ||
    (() => {
      const prefix = airline?.awbPrefix;
      const num = shipment?.airwaybillNumber;
      if (prefix && num) return `${prefix}-${num}`;
      return num || "";
    })();

  const iitBondNo = permit.iitBondNo || "";
  const ourRef = permit.ourRef || generateOurRef(shipment);
  const approvalDate = permit.approvalDate || "";

  // Fields that are hand-annotated on the physical copy but weren't
  // previously represented on the digital permit at all.
  const controlNo = permit.controlNo || shipment?.controlNo || "";
  const shortageNote = permit.shortageNote || shipment?.shortageNote || "";
  const deliveryConfirmationNote =
    permit.deliveryConfirmationNote || shipment?.deliveryConfirmationNote || "";
  const deliveryConfirmedBy =
    permit.deliveryConfirmedBy || shipment?.deliveryConfirmedBy || "";

  // Special-handling stamps — cold chain (GDP) and hazmat both need to be
  // impossible to miss at a glance, the way they'd be flagged on the
  // physical folder in real life.
  const isGDP = permit.isGDP ?? shipment?.isGDP ?? false;
  const gdpTemperatureRange =
    permit.gdpTemperatureRange || shipment?.gdpTemperatureRange || "2°C – 8°C";
  const isHazmat = permit.isHazmat ?? shipment?.isHazmat ?? false;
  const hazmatClass = permit.hazmatClass || shipment?.hazmatClass || "";

  const rows =
    permit.transferRows && permit.transferRows.length > 0
      ? permit.transferRows
      : [{}, {}, {}];

  return (
    <div className={styles.page}>
      {shortageNote && (
        <div className={styles.shortageNote}>{shortageNote}</div>
      )}
      {controlNo && <div className={styles.controlNoBadge}>{controlNo}</div>}

      {/* Cold-chain / hazmat banners — full-width so they read like a real
          flag on the folder, not a decorative badge. Only render when the
          shipment is flagged, so a normal permit prints exactly as before. */}
      {(isGDP || isHazmat) && (
        <div className={styles.specialHandlingRow}>
          {isGDP && (
            <div className={styles.gdpStamp}>
              <svg
                viewBox="0 0 24 24"
                className={styles.stampIcon}
                aria-hidden="true"
              >
                <g
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  fill="none"
                >
                  <line x1="12" y1="2" x2="12" y2="22" />
                  <line x1="4.2" y1="7" x2="19.8" y2="17" />
                  <line x1="4.2" y1="17" x2="19.8" y2="7" />
                  <line x1="12" y1="6" x2="9.5" y2="4" />
                  <line x1="12" y1="6" x2="14.5" y2="4" />
                  <line x1="12" y1="18" x2="9.5" y2="20" />
                  <line x1="12" y1="18" x2="14.5" y2="20" />
                  <line x1="7" y1="9.3" x2="4.3" y2="9.9" />
                  <line x1="7" y1="9.3" x2="6" y2="6.7" />
                  <line x1="17" y1="14.7" x2="19.7" y2="14.1" />
                  <line x1="17" y1="14.7" x2="18" y2="17.3" />
                  <line x1="7" y1="14.7" x2="4.3" y2="14.1" />
                  <line x1="7" y1="14.7" x2="6" y2="17.3" />
                  <line x1="17" y1="9.3" x2="19.7" y2="9.9" />
                  <line x1="17" y1="9.3" x2="18" y2="6.7" />
                </g>
              </svg>
              <div className={styles.stampText}>
                <span className={styles.stampTitle}>
                  Cold Chain &mdash; Temperature Controlled
                </span>
                <span className={styles.stampSub}>{gdpTemperatureRange}</span>
              </div>
            </div>
          )}
          {isHazmat && (
            <div className={styles.hazmatStamp}>
              <svg
                viewBox="0 0 24 24"
                className={styles.stampIcon}
                aria-hidden="true"
              >
                <rect
                  x="4.5"
                  y="4.5"
                  width="15"
                  height="15"
                  rx="1.5"
                  transform="rotate(45 12 12)"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <line
                  x1="12"
                  y1="7.5"
                  x2="12"
                  y2="13.8"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="16.6" r="1.15" fill="currentColor" />
              </svg>
              <div className={styles.stampText}>
                <span className={styles.stampTitle}>
                  Dangerous Goods &mdash; Hazmat
                </span>
                <span className={styles.stampSub}>
                  {hazmatClass || "Hazardous Material"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.logoBlock}>
          <img src={cevaLogo} alt="CEVA Logistics" className={styles.logoImg} />
        </div>
        <div className={styles.agencyBlock}>
          <div className={styles.agencyDept}>
            Department of Homeland Security
          </div>
          <div className={styles.agencyName}>
            U.S. Customs and Border Protection
          </div>
        </div>
        <div className={styles.ordBlock}>
          <div className={styles.ordLabel}>ORD No.</div>
          <div className={styles.ordValue}>{ordNumber || "\u00A0"}</div>
        </div>
      </div>

      <div className={styles.titleBlock}>
        <div className={styles.titleMain}>
          APPLICATION AND PERMIT TO TRANSFER CONTAINERIZED CARGO
          <br />
          FROM PIER/TERMINAL TO A CONTAINER STATION
        </div>
        <div className={styles.districtLine}>
          District Director&nbsp;&nbsp;&nbsp;&nbsp;{districtDirector}
        </div>
        <div className={styles.applicationLine}>
          Application is made to transfer the following listed containers and
          their contents from:
        </div>
      </div>

      {/* From / To pier */}
      <div className={styles.twoCol}>
        <div>
          <div className={styles.colLabel}>From Pier/Terminal</div>
          <div className={styles.addressBlock}>
            <div>{fromFacility.name}</div>
            <div>{fromFacility.address}</div>
            <div>{fromFacility.cityZip}</div>
            <div>{fromFacility.country}</div>
          </div>
        </div>
        <div>
          <div className={styles.colLabel}>To Pier/terminal</div>
          <div className={styles.addressBlock}>
            <div>{toFacility.name}</div>
            <div>{toFacility.address}</div>
            <div>{toFacility.cityZip}</div>
            <div>{toFacility.country}</div>
          </div>
        </div>
      </div>

      {/* Container marks / pieces & types */}
      <div className={styles.twoCol}>
        <div>
          <div className={styles.colLabel}>Container Marks &amp; Numbers:</div>
          <div className={styles.marksSubLabel}>Container #</div>
          <div className={styles.marksValue}>{containerMark || "\u00A0"}</div>
        </div>
        <div>
          <div className={styles.colLabel}>Pieces &amp; Types</div>
          <div className={styles.piecesValue}>{piecesTypes || "\u00A0"}</div>
        </div>
      </div>

      {/* Arrival line */}
      <div className={styles.arrivalLine}>
        The above container(s) arrived on the{" "}
        <span className={styles.fillSpan}>{arrivalAirline}</span> FLT#:{" "}
        <span className={styles.fillSpan}>{flightNumber}</span> ETA:{" "}
        <span className={styles.fillSpan}>
          {eta ? `${formatDate(eta)} ${formatTime(eta)}` : ""}
        </span>
      </div>

      <div className={styles.originMawbRow}>
        <div>
          From: <span className={styles.fillSpan}>{originCity}</span>
        </div>
        <div>
          MAWB: <span className={styles.fillSpan}>{mawb}</span>
        </div>
      </div>

      <div className={styles.iitLine}>
        are entered as INSTRUMENTS OF INTERNATIONAL TRAFFIC under IIT Bond No.{" "}
        <span className={styles.fillSpanLong}>{iitBondNo}</span>
      </div>

      <div className={styles.manifestRow}>
        <div className={styles.manifestText}>
          As abstract of the vessels manifest covering the containers by B/L
          No., Marks, Numbers, Contents, Consignee, etc, is attached to each
          copy of this document.
        </div>
        <div className={styles.weConcur}>We Concur:</div>
      </div>

      {deliveryConfirmationNote && (
        <div className={styles.deliveryNote}>
          {deliveryConfirmationNote}
          {deliveryConfirmedBy ? ` — ${deliveryConfirmedBy}` : ""}
        </div>
      )}

      {/* Signature lines */}
      <div className={styles.sigRow}>
        <div className={styles.sigBlock}>
          <div className={styles.sigLine} />
          <div className={styles.sigLabel}>
            (Signature of Authorized Agent of Container Station)
          </div>
        </div>
        <div className={styles.sigBlock}>
          <div className={styles.sigLine} />
          <div className={styles.sigLabel}>
            (Signature of Agnt. Of Imp. Carrier)
          </div>
        </div>
      </div>

      <div className={styles.idRow}>
        <div>
          IRS No. <strong>{irsNo}</strong>
        </div>
        <div>
          Our Ref. #: <span className={styles.fillSpan}>{ourRef}</span>
        </div>
      </div>

      <div className={styles.firmsRow}>
        Firms No. <strong>{firmsNo}</strong>
      </div>

      {/* Customs approval */}
      <div className={styles.approvalRow}>
        <div className={styles.approvalLeft}>
          <div className={styles.approvalIntro}>Above request approved:</div>
          <div className={styles.approvalLine} />
          <div className={styles.approvalLabel}>
            (Signature of Customs Officer)
          </div>
        </div>
        <div className={styles.approvalRight}>
          <div className={styles.approvalDateValue}>
            {approvalDate ? formatDate(approvalDate) : "\u00A0"}
          </div>
          <div className={styles.approvalLine} />
          <div className={styles.approvalLabel}>(Date)</div>
        </div>
      </div>

      {/* Transfer record */}
      <div className={styles.transferHeader}>TRANSFER RECORD</div>
      <div className={styles.transferSubRow}>
        <div>Delivered to as noted:</div>
        <div>in apparent good order except</div>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Truck No.</th>
            <th>Container No.</th>
            <th>Date</th>
            <th>Releasing Inspector</th>
            <th>Truckman</th>
            <th>Receiving Officer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>{row.truckNo || ""}</td>
              <td>{row.containerNo || ""}</td>
              <td>{row.date ? formatDate(row.date) : ""}</td>
              <td>{row.releasingInspector || ""}</td>
              <td>{row.truckman || ""}</td>
              <td>{row.receivingOfficer || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.submitNote}>(SUBMIT IN DUPLICATE)</div>
    </div>
  );
}
