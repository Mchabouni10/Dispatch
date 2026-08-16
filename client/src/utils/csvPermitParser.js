// client/src/utils/csvPermitParser.js
//
// Turns rows from a dispatch/recovery-log CSV (like the GEANTOS DISPATCH
// export) into shipment objects shaped for the Import form / createShipment
// API — the same shape emailPermitParser.js already produces for pasted
// emails, so CSV rows and pasted emails end up on identical rails and the
// same review UI (match list, critical/tolerant flags) can show both.
//
// Only columns that map to a real ImportsView field (or a CevaTemplate
// print-only field) are used. Everything else in the source file — RCVD,
// PAYMENT, DRIVER, DISPATCHER INITIALS — has no home in the current schema
// and is intentionally dropped, not guessed at.
//
// Column -> field cheat sheet:
//   STATUS          -> always imports as "Pending" (the sheet's DISPATCHED/
//                       DELIVERED TO CEVA/etc. describe recovery progress,
//                       not permit status) — kept as a note for reference;
//                       SHORTAGE/SHORT still sets a shortageNote, REJECTED
//                       still gets flagged in notes
//   AWB             -> airwaybillNumber
//   ORG             -> originCity
//   Pcs             -> pieces
//   Wgt             -> weight (unit defaults to "lb" — file has no unit column)
//   GROUND HANDLER  -> airline, as a fallback only (see AWB note below)
//   PICK UP NOTES   -> folded into notes
//   PMC             -> pmcCount (parsed) + the raw PMC/ULD string folded
//                       into notes when there's an actual count
//   FLIGHT          -> flightNumber
//   FLIGHT ETA      -> flightEta — saved on the shipment record itself
//                       (the Import form/API now has a real flightEta
//                       field) so it survives the CSV import and shows up
//                       on both the digital (CevaTemplate) and physical
//                       (generatePermitPdf) permit automatically. Also
//                       mirrored onto permitOverrides.eta for any caller
//                       that still wants a permit-only override.
//   READY TIME      -> pickupReadyAt ("Airline Cargo Available")
//   LAST FREE DAY   -> lastFreeDay
//   PTT CUT IN      -> ordNumber — values are "CVA########", which is the
//                       ORD Number format your form asks for, just filed
//                       under an unexpected header in this export
//   NOTES TO DISPATCHER -> folded into notes
//   PAYMENT, RCVD, DRIVER, DISPATCHER INITIALS -> ignored, no schema match
//
// Airline: the first three digits of the AWB are the airline's own unique
// prefix, so that's the primary way to resolve GROUND HANDLER -> airline —
// look up whichever airline record has that awbPrefix. GROUND HANDLER text
// (fuzzy-matched via matchEntity) is only a fallback for the rare row whose
// prefix isn't in your airlines table yet.
//
// warehouse: this file is CEVA's own dispatch log, so every row is destined
// for CEVA Logistics — the caller passes `defaultWarehouseId` (looked up
// from the real warehouses list) and every row gets it.

import { matchEntity } from "./entityMatch.js";
import { IMPORT_FIELD_SEVERITY } from "./fieldSeverity.js";

function norm(v) {
  return (v ?? "").toString().trim();
}

// Handles "08/12/26 9:25", "8/8/26 19:00", "08/13/26 11;00" (stray ';'
// instead of ':' — shows up twice in the sample file), and "ARRIVED"
// (not a date at all — some rows use it in place of an ETA).
function parseUsDateTime(raw) {
  const cleaned = norm(raw).replace(";", ":");
  if (!cleaned || /^arrived$/i.test(cleaned)) return null;
  const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let [, mo, da, yr, hh, mi] = m;
  yr = yr.length === 2 ? `20${yr}` : yr;
  const d = new Date(Number(yr), Number(mo) - 1, Number(da), Number(hh), Number(mi));
  return isNaN(d.getTime()) ? null : d;
}

function parsePmc(raw) {
  const val = norm(raw);
  if (!val || /^loose$/i.test(val)) return { count: 0, raw: "" };
  // "PMC58898-2C-4//PMC57435-2C-12//..." -> count the "//"-separated ids
  const parts = val.split("//").map((p) => p.trim()).filter(Boolean);
  return { count: parts.length, raw: val };
}

// AWB prefixes are always the 3 digits before the dash, e.g.
// "016-11831363" -> "016", "001-27400262-B" -> "001".
function extractAwbPrefix(awb) {
  const m = norm(awb).match(/^(\d{3})/);
  return m ? m[1] : null;
}

function matchAirlineByAwbPrefix(airlines, prefix) {
  if (!prefix) return null;
  return airlines.find((a) => norm(a.awbPrefix) === prefix) || null;
}

/**
 * @param {object} row - one CSV row, keyed by exact header name (STATUS,
 *   AWB, ORG, Pcs, Wgt, GROUND HANDLER, PICK UP NOTES, PMC, FLIGHT,
 *   FLIGHT ETA, READY TIME, LAST FREE DAY, PTT CUT IN, NOTES TO DISPATCHER
 *   — everything else is ignored).
 * @param {object} opts
 * @param {Array}  opts.airlines - full airlines list, for GROUND HANDLER match
 * @param {string} opts.defaultWarehouseId - applied to every row (see note above)
 * @returns {{fields, matches, matchedCount, totalFields, missingCriticalCount, permitOverrides}}
 */
export function parseCsvRow(row, { airlines = [], defaultWarehouseId = "" } = {}) {
  const fields = { type: "Import", weightUnit: "kg" };
  const matches = [];
  const noteLines = [];

  const record = (key, label, value, raw) => {
    const severity = IMPORT_FIELD_SEVERITY[key];
    if (value === null || value === undefined || value === "") {
      matches.push({ key, label, matched: false, severity });
      return;
    }
    matches.push({ key, label, matched: true, value, raw: raw ?? value, severity });
  };

  // ── AWB ──────────────────────────────────────────────────────────
  const awb = norm(row.AWB);
  if (awb) fields.airwaybillNumber = awb;
  record("airwaybillNumber", "AWB", awb || null);

  // ── ORD Number (filed under "PTT CUT IN" in this export) ──────────
  const ord = norm(row["PTT CUT IN"]);
  if (ord) fields.ordNumber = ord;
  record("ordNumber", "ORD Number", ord || null, ord ? `from "PTT CUT IN" column` : undefined);

  // ── Origin ──────────────────────────────────────────────────────
  const org = norm(row.ORG);
  if (org) fields.originCity = org;

  // ── Pieces / Weight ─────────────────────────────────────────────
  const pieces = norm(row.Pcs);
  const weight = norm(row.Wgt);
  if (pieces) fields.pieces = pieces;
  if (weight) fields.weight = weight;
  record("pieces", "Pieces", pieces || null);
  record("weight", "Weight", weight ? `${weight} kg` : null);

  // ── Airline (primary: AWB prefix, fallback: GROUND HANDLER text) ──
  const groundHandler = norm(row["GROUND HANDLER"]);
  const awbPrefix = extractAwbPrefix(awb);
  let airlineMatch = matchAirlineByAwbPrefix(airlines, awbPrefix);
  if (!airlineMatch) airlineMatch = matchEntity(airlines, groundHandler, groundHandler);
  if (airlineMatch) fields.airline = airlineMatch.id;
  record(
    "airline",
    "Airline",
    airlineMatch ? airlineMatch.name : null,
    awbPrefix ? `AWB prefix ${awbPrefix}` : groundHandler || undefined
  );
  if (!airlineMatch && awbPrefix) {
    noteLines.push(`AWB prefix ${awbPrefix} (${groundHandler || "no ground handler listed"}) — no matching airline on file`);
  }

  // ── Warehouse (can't be derived from the file — see header note) ──
  if (defaultWarehouseId) fields.warehouse = defaultWarehouseId;
  record("warehouse", "Warehouse", defaultWarehouseId ? "Default warehouse" : null);

  // ── Flight ──────────────────────────────────────────────────────
  const flight = norm(row.FLIGHT);
  if (flight) fields.flightNumber = flight.toUpperCase();
  record("flightNumber", "Flight Number", flight || null);

  // ── Flight ETA -> flightEta (saved on the shipment itself, so it's
  // available for both the digital and physical permit without the user
  // having to re-enter it) ───────────────────────────────────────────
  const eta = parseUsDateTime(row["FLIGHT ETA"]);
  if (eta) fields.flightEta = eta.toISOString();

  // ── Ready time -> pickupReadyAt ────────────────────────────────
  const readyDate = parseUsDateTime(row["READY TIME"]);
  if (readyDate) fields.pickupReadyAt = readyDate.toISOString();

  // ── Last free day ───────────────────────────────────────────────
  const lfd = parseUsDateTime(row["LAST FREE DAY"]);
  if (lfd) fields.lastFreeDay = lfd.toISOString().slice(0, 10);

  // ── Status — every imported row starts as Pending regardless of what
  // the sheet says (DISPATCHED, DELIVERED TO CEVA, etc. describe recovery
  // progress, not permit status); the original value is kept in notes for
  // reference and shortage/rejection still get flagged.
  const rawStatus = norm(row.STATUS);
  fields.status = "Pending";
  let shortageNote = "";
  if (/^SHORT(AGE)?$/i.test(rawStatus)) {
    shortageNote = `Shortage reported (source status: "${rawStatus}")`;
  } else if (/^REJECTED$/i.test(rawStatus)) {
    noteLines.push("Rejected by warehouse (source status: REJECTED)");
  }
  if (rawStatus) noteLines.push(`Sheet status: ${rawStatus}`);

  // ── PMC / ULD ───────────────────────────────────────────────────
  const pmc = parsePmc(row.PMC);
  fields.pmcCount = pmc.count;
  if (pmc.raw) noteLines.push(`PMC/ULD numbers: ${pmc.raw}`);

  // ── Free-text notes columns ─────────────────────────────────────
  const pickupNotes = norm(row["PICK UP NOTES"]);
  const dispatcherNotes = norm(row["NOTES TO DISPATCHER"]);
  if (pickupNotes) noteLines.push(pickupNotes);
  if (dispatcherNotes) noteLines.push(dispatcherNotes);

  if (noteLines.length) fields.notes = noteLines.join(" · ");

  const matchedCount = matches.filter((m) => m.matched).length;
  const missingCritical = matches.filter((m) => !m.matched && m.severity === "critical");

  return {
    fields,
    matches,
    matchedCount,
    totalFields: matches.length,
    missingCriticalCount: missingCritical.length,
    // Extra data CevaTemplate can use when printing this row, but that
    // never gets POSTed as part of the shipment record.
    permitOverrides: { eta: eta ? eta.toISOString() : "", shortageNote },
  };
}

/**
 * Parses every row. `rows` should already be objects keyed by header
 * (see parseCsvText below, or Papa.parse(text, { header: true }) if you'd
 * rather use a library — this file has no dependency on one).
 */
export function parseCsvPermits(rows, opts) {
  return rows
    .filter((r) => norm(r.AWB)) // skip stray blank lines
    .map((row) => ({ row, ...parseCsvRow(row, opts) }));
}

/**
 * Minimal CSV-text -> array-of-objects parser (handles quoted fields with
 * embedded commas, e.g. "COMPLETE, PER BETA." in NOTES TO DISPATCHER).
 * No dependency needed for a file this size; swap for papaparse if you'd
 * rather standardize on that.
 */
export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  const clean = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field || row.length) pushRow();

  const [header, ...dataRows] = rows.filter((r) => r.some((cell) => cell !== ""));
  if (!header) return [];
  return dataRows.map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i] ?? ""; });
    return obj;
  });
}

/**
 * Builds the same createShipment/updateShipment payload shape ImportsView's
 * own handleSubmit produces, so a CSV-imported row and a hand-typed row are
 * indistinguishable to the API.
 */
export function buildShipmentPayload(fields) {
  const { airline, warehouse, ...rest } = fields;
  return {
    ...rest,
    type: "Import",
    airlineId: airline || null,
    warehouseId: warehouse || null,
    airwaybillNumber: (fields.airwaybillNumber || "").trim(),
    ordNumber: (fields.ordNumber || "").trim(),
    originCity: (fields.originCity || "").trim(),
    flightNumber: (fields.flightNumber || "").trim(),
    pieces: Number(fields.pieces) || 0,
    weight: Number(fields.weight) || 0,
    weightUnit: fields.weightUnit || "kg",
    storageFeePerDay: Number(fields.storageFeePerDay) || 0,
    terminalFee: Number(fields.terminalFee) || 0,
    pmcCount: Number(fields.pmcCount) || 0,
    isGDP: fields.isGDP || false,
  };
}