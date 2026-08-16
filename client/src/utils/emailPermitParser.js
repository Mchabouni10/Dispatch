// client/src/utils/emailPermitParser.js
//
// Best-effort, label-based parser that pulls permit fields out of a pasted
// cargo email (airline/warehouse notification, ORD confirmation, etc).
// This is pattern matching, not AI — it looks for common label variants
// ("AWB:", "AWB #", "Air Waybill No.", "PCS", "Pieces", ...) and grabs the
// rest of that line. It is intentionally conservative: if nothing matches,
// the field is left blank rather than guessed, and every match is returned
// alongside the raw source line so the UI can show the user what triggered it.
//
// Shared by ImportsView and ExportsView — Import-only fields (ordNumber,
// lastFreeDay) and Export-only fields (flightDate) are filled in based on
// the `type` option; anything that doesn't map to a concrete form field is
// appended to `notes` so it isn't silently dropped.
//
// Each match also carries a `severity` ('critical' | 'tolerant' | undefined)
// pulled from the shared fieldSeverity config, so the review UI (and any
// future AI-based parser feeding the same shape) can flag missing critical
// fields without duplicating the "what matters" list.

import { matchEntity } from "./entityMatch.js";
import { IMPORT_FIELD_SEVERITY, EXPORT_FIELD_SEVERITY } from "./fieldSeverity.js";

function grabLine(text, labelPattern) {
  // Matches "<label><optional no/#/colon><rest of line>" and returns the
  // captured remainder, trimmed of trailing punctuation.
  const re = new RegExp(
    `(?:^|\\n)[ \\t]*(?:${labelPattern})[ \\t]*(?:no\\.?|number|num|#)?[ \\t]*[:#\\-][ \\t]*([^\\n\\r]+)`,
    "i"
  );
  const m = text.match(re);
  if (!m) return null;
  return m[1].trim().replace(/[.,;]+$/, "").trim();
}

function firstNumber(str) {
  if (!str) return null;
  const m = str.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? m[0] : null;
}

function detectWeightUnit(str) {
  if (!str) return null;
  if (/\bkgs?\b/i.test(str)) return "kg";
  if (/\blbs?\b/i.test(str)) return "lb";
  return null;
}

function tryParseDate(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/\b(local|lt|utc|zulu|z)\b/gi, "").trim();
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;
  return null;
}

export function parsePermitEmail(rawText, { airlines = [], warehouses = [], type = "Import" } = {}) {
  const text = (rawText || "").replace(/\r\n/g, "\n");
  const matches = [];
  const fields = {};
  const noteLines = [];

  const severityMap = type === "Export" ? EXPORT_FIELD_SEVERITY : IMPORT_FIELD_SEVERITY;

  const record = (key, label, value, raw) => {
    const severity = severityMap[key]; // undefined for fields we don't track severity for (ref, flight/eta text, etc.)
    if (value === null || value === undefined || value === "") {
      matches.push({ key, label, matched: false, severity });
      return;
    }
    matches.push({ key, label, matched: true, value, raw: raw ?? value, severity });
  };

  // ── AWB ──────────────────────────────────────────────────────────
  let awb = grabLine(text, "M?AWB|AIR\\s*WAY\\s*BILL|AIRWAYBILL");
  if (awb) awb = awb.replace(/\s+/g, "").trim();
  if (!awb) {
    const bare = text.match(/\b(\d{3}-\d{7,8})\b/);
    if (bare) awb = bare[1];
  }
  if (awb) fields.airwaybillNumber = awb;
  record("airwaybillNumber", "AWB", awb);

  // ── ORD number (Import only — used for the ordNumber form field) ──
  let ord = grabLine(text, "ORD(?:ER)?");
  record("ordNumber", "ORD Number", ord);

  // ── Reference number (generic REF:) ────────────────────────────
  let ref = grabLine(text, "REF(?:ERENCE)?");
  record("ref", "Reference", ref);

  // ── Pieces ──────────────────────────────────────────────────────
  let piecesRaw = grabLine(text, "PCS|PIECES|PC|QTY|NO\\.?\\s*OF\\s*PIECES");
  let pieces = firstNumber(piecesRaw);
  let weightRaw = grabLine(text, "WT|WEIGHT|GROSS\\s*WT|GR\\.?WT");
  let weight = firstNumber(weightRaw);
  let weightUnit = detectWeightUnit(weightRaw);

  if (!pieces || !weight) {
    // Fallback: combined "12 PCS / 450 KGS" style line
    const combined = text.match(/(\d+)\s*PCS?\b[^\n\d]{0,10}([\d,.]+)\s*(KGS?|LBS?)\b/i);
    if (combined) {
      pieces = pieces || combined[1];
      weight = weight || combined[2].replace(/,/g, "");
      weightUnit = weightUnit || detectWeightUnit(combined[3]);
    }
  }
  if (pieces) fields.pieces = pieces;
  if (weight) fields.weight = weight;
  fields.weightUnit = weightUnit || "lb";
  record("pieces", "Pieces", pieces, piecesRaw);
  record("weight", "Weight", weight ? `${weight} ${fields.weightUnit}` : null, weightRaw);

  // ── Airline ─────────────────────────────────────────────────────
  const airlineLine = grabLine(text, "AIRLINE|CARRIER");
  const airlineMatch = matchEntity(airlines, airlineLine, text);
  if (airlineMatch) fields.airline = airlineMatch.id;
  record("airline", "Airline", airlineMatch ? airlineMatch.name : null, airlineLine || undefined);

  // ── Warehouse ───────────────────────────────────────────────────
  const warehouseLine = grabLine(text, "WAREHOUSE|WH|DELIVER\\s*TO|DESTINATION\\s*WAREHOUSE|LOCATION");
  const warehouseMatch = matchEntity(warehouses, warehouseLine, text);
  if (warehouseMatch) fields.warehouse = warehouseMatch.id;
  record("warehouse", "Warehouse", warehouseMatch ? warehouseMatch.name : null, warehouseLine || undefined);

  // ── Flight / ETA ────────────────────────────────────────────────
  // Note: this line usually contains an ETA/date, not a flight *number*
  // (e.g. "AA91/08") — so for Import we track it under a display-only
  // "flight" key rather than the form's flightNumber field, to avoid
  // conflating two different fields under one severity label. Export's
  // flightDate *is* a real form field, so that one keeps its real key.
  const flightRaw = grabLine(text, "FLIGHT(?:\\s*DATE)?|FLT|ETA|ETD");
  const flightDate = tryParseDate(flightRaw);
  record(
    type === "Export" ? "flightDate" : "flight",
    type === "Export" ? "Flight Date" : "ETA",
    flightRaw || null
  );

  if (type === "Export") {
    if (flightDate) fields.flightDate = flightDate.toISOString().slice(0, 16);
    else if (flightRaw) noteLines.push(`Flight/ETA from email (please verify): ${flightRaw}`);
  } else {
    if (flightDate) fields.pickupReadyAt = flightDate.toISOString();
    else if (flightRaw) noteLines.push(`ETA from email (please verify): ${flightRaw}`);
  }

  // ── ORD / REF reconciliation ───────────────────────────────────
  if (type === "Import") {
    if (ord) fields.ordNumber = ord;
    else if (ref) fields.ordNumber = ref; // best guess when only "REF" was labeled
    if (ref && ord) noteLines.push(`Ref from email: ${ref}`);
  } else {
    // Export form has no ordNumber field — fold ORD/REF into notes
    if (ord) noteLines.push(`ORD from email: ${ord}`);
    if (ref) noteLines.push(`Ref from email: ${ref}`);
  }

  if (noteLines.length) fields.notes = noteLines.join(" · ");

  const matchedCount = matches.filter((m) => m.matched).length;
  const missingCritical = matches.filter((m) => !m.matched && m.severity === "critical");

  return {
    fields,
    matches,
    matchedCount,
    totalFields: matches.length,
    missingCriticalCount: missingCritical.length,
  };
}