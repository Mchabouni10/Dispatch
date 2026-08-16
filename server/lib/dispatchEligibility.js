//server/lib/dispatchEligibility.js
// ─── Dispatch eligibility engine ───────────────────────────────────────────
// Single source of truth for "can THIS driver legally/safely take THIS
// equipment on a run carrying THESE shipments". Three independent rule sets,
// all composed by checkRunEligibility() at the bottom:
//
//   1. License class vs. equipment type  — a driver can't be put behind
//      equipment their license class doesn't cover (e.g. a Class B /
//      straight-truck driver cannot take a Tractor).
//   2. Trailer eligibility                — only a Tractor pulls a trailer,
//      and only if the driver is trailerEligible.
//   3. Shipment certifications            — hazmat cargo needs a
//      hazmatCertified driver, GDP (temperature-controlled) cargo needs a
//      gdpTrained driver.
//
// This file is mirrored on the frontend at
// src/pages/Dispatch/utils/dispatchEligibility.js for live filtering/
// autocomplete in BuildRunModal. That copy is for UX only — THIS file is
// the one that's actually enforced, in routes/dispatch/trips.routes.js via
// tripEligibility.js. If you change a rule here, change it there too, or
// the UI and the server will disagree about what's allowed.
// ────────────────────────────────────────────────────────────────────────

// Higher rank = qualifies for more. A driver with a given class can drive
// anything at or below their rank (a Class A can drive a Straight Truck;
// a Class B/straight-truck-only driver cannot drive a Tractor).
const LICENSE_CLASS_RANK = { C: 1, B: 2, A: 3 };

function licenseRank(licenseClass) {
  return LICENSE_CLASS_RANK[String(licenseClass || '').toUpperCase()] || 0;
}

// Minimum license class required to operate each power-unit type. Matched
// by substring against Equipment.equipmentType, same style as isPowerUnit()/
// isTrailer() in the frontend's dispatchHelpers.js, so seed/real data typed
// as "Tractor", "Straight Truck", "Cube Truck", "Sprinter Van", etc. all
// resolve without an exact-string dependency.
const EQUIPMENT_MIN_CLASS = [
  { match: /tractor/i, minClass: 'A' },
  { match: /straight/i, minClass: 'B' },
  { match: /cube/i, minClass: 'B' },
  { match: /sprinter|van/i, minClass: 'C' },
];

// Unknown power-unit types default to the strictest requirement (A) rather
// than the loosest — an unrecognized equipmentType should never silently
// become driveable by everyone.
const DEFAULT_MIN_CLASS = 'A';

function equipmentMinClass(equipment) {
  const type = String(equipment?.equipmentType || equipment?.category || '');
  const rule = EQUIPMENT_MIN_CLASS.find((r) => r.match.test(type));
  return rule ? rule.minClass : DEFAULT_MIN_CLASS;
}

function isTractor(equipment) {
  return /tractor/i.test(String(equipment?.equipmentType || ''));
}

// ─── Rule 1: license class vs equipment type ───────────────────────────────
function checkDriverLicensedForEquipment(driver, equipment) {
  if (!driver || !equipment) return { ok: true }; // nothing to check yet
  const required = equipmentMinClass(equipment);
  if (licenseRank(driver.licenseClass) < licenseRank(required)) {
    return {
      ok: false,
      message: `${driver.name} holds a Class ${driver.licenseClass || '?'} license, which isn't rated to drive a ${equipment.equipmentType || 'this equipment type'} (requires Class ${required} or higher)`,
    };
  }
  return { ok: true };
}

// ─── Rule 2: trailer eligibility ───────────────────────────────────────────
function checkTrailerEligible(driver, truck, trailer) {
  if (!trailer) return { ok: true }; // no trailer on this run — fine
  if (!truck || !isTractor(truck)) {
    return {
      ok: false,
      message: `A trailer can only be pulled behind a Tractor — ${truck?.unitNumber || 'the selected truck'} is a ${truck?.equipmentType || 'non-tractor power unit'}`,
    };
  }
  if (driver && driver.trailerEligible === false) {
    return {
      ok: false,
      message: `${driver.name} is not marked trailer-eligible and cannot pull ${trailer.unitNumber || 'this trailer'}`,
    };
  }
  return { ok: true };
}

// ─── Rule 3: shipment certifications ───────────────────────────────────────
function getRequiredCertifications(shipments) {
  const list = shipments || [];
  return {
    hazmat: list.some((s) => s.isHazmat),
    gdp: list.some((s) => s.isGDP),
  };
}

function checkDriverCertifiedForShipments(driver, shipments) {
  if (!driver) return { ok: true };
  const required = getRequiredCertifications(shipments);
  const reasons = [];
  if (required.hazmat && !driver.hazmatCertified) {
    reasons.push(`${driver.name} is not hazmat-certified but this run carries a hazmat permit`);
  }
  if (required.gdp && !driver.gdpTrained) {
    reasons.push(`${driver.name} is not GDP-trained but this run carries a GDP (temperature-controlled) permit`);
  }
  return { ok: reasons.length === 0, reasons };
}

// ─── Composite check — call this from the route handlers ──────────────────
// Returns { ok, errors: string[] } covering all three rule sets at once, so
// a single failed create/update request surfaces every problem together
// instead of one round-trip per rule.
function checkRunEligibility({ driver, truck, trailer, shipments }) {
  const errors = [];

  const licenseCheck = checkDriverLicensedForEquipment(driver, truck);
  if (!licenseCheck.ok) errors.push(licenseCheck.message);

  const trailerCheck = checkTrailerEligible(driver, truck, trailer);
  if (!trailerCheck.ok) errors.push(trailerCheck.message);

  const certCheck = checkDriverCertifiedForShipments(driver, shipments);
  if (!certCheck.ok) errors.push(...certCheck.reasons);

  return { ok: errors.length === 0, errors };
}

module.exports = {
  LICENSE_CLASS_RANK,
  licenseRank,
  equipmentMinClass,
  isTractor,
  getRequiredCertifications,
  checkDriverLicensedForEquipment,
  checkTrailerEligible,
  checkDriverCertifiedForShipments,
  checkRunEligibility,
};












