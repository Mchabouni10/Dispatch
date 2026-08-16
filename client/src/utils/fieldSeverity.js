// client/src/utils/fieldSeverity.js
//
// Single source of truth for "how important is this field on a permit".
// Used by BOTH the email parser (emailPermitParser.js) and the Imports/
// Exports forms, so a field can never be "critical" in one place and
// "tolerant" in another — they'd drift apart the moment someone edited
// one without the other.
//
//   'critical'  — permit is not valid without it (AWB, pieces, weight,
//                 airline, warehouse, ORD #). Flagged red, blocks Save.
//   'tolerant'  — nice to have (flight number, station). Flagged amber
//                 if missing, never blocks Save.
//   (unlisted)  — not tracked; no flag either way (fees, notes, etc).

export const IMPORT_FIELD_SEVERITY = {
  airline: "critical",
  warehouse: "critical",
  airwaybillNumber: "critical",
  ordNumber: "critical",
  pieces: "critical",
  weight: "critical",
  station: "tolerant",
  flightNumber: "tolerant",
};

export const EXPORT_FIELD_SEVERITY = {
  airline: "critical",
  warehouse: "critical",
  airwaybillNumber: "critical",
  pieces: "critical",
  weight: "critical",
  flightDate: "critical", // handleSubmit already hard-blocks on this — keep them in sync
  pmcCount: "tolerant",
};

// Human-readable labels for error messages / summaries.
export const FIELD_LABELS = {
  airline: "Airline",
  warehouse: "Warehouse",
  airwaybillNumber: "AWB Number",
  ordNumber: "ORD Number",
  pieces: "Pieces",
  weight: "Weight",
  station: "Station",
  flightNumber: "Flight Number",
  flightDate: "Flight Date",
  pmcCount: "PMC Count",
};

/**
 * @param {*} value - current form value for the field
 * @param {'critical'|'tolerant'|undefined} severity
 * @returns {'ok'|'missing-critical'|'missing-tolerant'}
 */
export function getFieldStatus(value, severity) {
  const empty = value === null || value === undefined || value === "";
  if (!empty || !severity) return "ok";
  return severity === "critical" ? "missing-critical" : "missing-tolerant";
}

/**
 * Returns the list of critical fields (by key) that are currently empty
 * in `form`, given a severity map. Used to gate the Save button and to
 * build a clear error message — replaces scattered `if (!payload.x) throw`
 * checks with one shared check.
 */
export function getMissingCriticalFields(form, severityMap) {
  return Object.keys(severityMap).filter(
    (key) => severityMap[key] === "critical" && (form[key] === null || form[key] === undefined || form[key] === "")
  );
}

export function hasCriticalMissing(form, severityMap) {
  return getMissingCriticalFields(form, severityMap).length > 0;
}

/** Builds a "Enter the AWB Number, Weight" style message for the form error banner. */
export function describeMissingCritical(form, severityMap, labels = FIELD_LABELS) {
  const missing = getMissingCriticalFields(form, severityMap);
  if (!missing.length) return "";
  const names = missing.map((k) => labels[k] || k);
  return `Missing required field${names.length > 1 ? "s" : ""}: ${names.join(", ")}`;
}