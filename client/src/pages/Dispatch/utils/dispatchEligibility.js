
//src/pages/Dispatch/utils/dispatchEligibility.js
// ─── Dispatch eligibility engine (frontend mirror) ─────────────────────────
// Same three rule sets as server/server/lib/dispatchEligibility.js:
//   1. License class vs. equipment type
//   2. Trailer eligibility (only a Tractor pulls a trailer)
//   3. Shipment certifications (hazmat / GDP)
//
// This copy exists purely for UX — filtering BuildRunModal's dropdowns down
// to eligible options as the dispatcher picks a driver/truck/manifest, so
// they never have to submit and get bounced back with an error. The server
// copy is what's actually enforced (routes/dispatch/trips.routes.js and
// trip-backups.routes.js); if these two files ever disagree, the server
// wins and the dispatcher sees a late error instead of an early one. Keep
// them in sync when the rules change.
// ────────────────────────────────────────────────────────────────────────

const LICENSE_CLASS_RANK = { C: 1, B: 2, A: 3 };

export function licenseRank(licenseClass) {
  return LICENSE_CLASS_RANK[String(licenseClass || "").toUpperCase()] || 0;
}

const EQUIPMENT_MIN_CLASS = [
  { match: /tractor/i, minClass: "A" },
  { match: /straight/i, minClass: "B" },
  { match: /cube/i, minClass: "B" },
  { match: /sprinter|van/i, minClass: "C" },
];
const DEFAULT_MIN_CLASS = "A";

export function equipmentMinClass(equipment) {
  const type = String(equipment?.equipmentType || equipment?.category || "");
  const rule = EQUIPMENT_MIN_CLASS.find((r) => r.match.test(type));
  return rule ? rule.minClass : DEFAULT_MIN_CLASS;
}

export function isTractor(equipment) {
  return /tractor/i.test(String(equipment?.equipmentType || ""));
}

// ─── Rule 1 ──────────────────────────────────────────────────────────────
export function isDriverLicensedForEquipment(driver, equipment) {
  if (!driver || !equipment) return true;
  return licenseRank(driver.licenseClass) >= licenseRank(equipmentMinClass(equipment));
}

// ─── Rule 2 ──────────────────────────────────────────────────────────────
export function isTrailerPairingValid(driver, truck) {
  if (!truck) return false;
  if (!isTractor(truck)) return false;
  if (driver && driver.trailerEligible === false) return false;
  return true;
}

// ─── Rule 3 ──────────────────────────────────────────────────────────────
export function getRequiredCertifications(shipments) {
  const list = shipments || [];
  return {
    hazmat: list.some((s) => s.isHazmat),
    gdp: list.some((s) => s.isGDP),
  };
}

export function isDriverCertifiedForShipments(driver, shipments) {
  if (!driver) return true;
  const required = getRequiredCertifications(shipments);
  if (required.hazmat && !driver.hazmatCertified) return false;
  if (required.gdp && !driver.gdpTrained) return false;
  return true;
}

// Human-readable reason a driver is filtered out, for the "N drivers hidden
// because…" hint text — null if the driver is fully eligible.
export function driverIneligibleReason(driver, { shipments, truck } = {}) {
  const required = getRequiredCertifications(shipments);
  if (required.hazmat && !driver.hazmatCertified) return "not hazmat-certified";
  if (required.gdp && !driver.gdpTrained) return "not GDP-trained";
  if (truck && !isDriverLicensedForEquipment(driver, truck)) {
    return `license class ${driver.licenseClass || "?"} isn't rated for a ${truck.equipmentType || "this unit"}`;
  }
  return null;
}