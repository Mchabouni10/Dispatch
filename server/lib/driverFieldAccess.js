// lib/driverFieldAccess.js
// ─── Field-level redaction for Driver records ────────────────────────────────
// getPermission(role, 'drivers_hr') tells you whether a role can read/write
// driver records at all, but it can't express "can read most fields, but not
// pay rate or license docs." This module adds that finer-grained layer on
// top, applied to any role whose access level is below 'full' — currently
// that's 'view' (FLEET_MANAGER, VIEWER) and 'operational' (DISPATCHER).
//
// Only 'full' access (SUPER_ADMIN, DIRECTOR, HR_MANAGER) sees every field
// unchanged — those are the roles actually responsible for driver HR data.

const { getPermission } = require('./permissions');

// Compensation — never shown to an 'operational'-level viewer.
const COMPENSATION_FIELDS = [
  'payType',
  'payRate',
  'overtimeRate',
  'bonusEligible',
  'lastPayRaise',
  'hireDate',
];

// License / personal documents — hidden from anyone below 'full' access.
// NOTE: licenseClass, hazmatCertified, and gdpTrained are deliberately NOT in
// this list — those are operational facts (which vehicles a driver is
// eligible for), not personal/HR data, and Dispatcher needs them to do their
// job. Only the identifying document details (number, expiration, scan) are
// treated as sensitive.
const LICENSE_AND_PERSONAL_FIELDS = [
  'licenseNumber',
  'licenseExpiration',
  'licensePhoto',
  'medicalCertExpiration',
  'medicalCertPhoto',
  'dateOfBirth',
  'address',
  'gender',
  'emergencyContactName',
  'emergencyContactPhone',
  'emergencyContactRelation',
  'medicalConditions',
];

const HIDDEN_FIELDS_FOR_OPERATIONAL = [
  ...COMPENSATION_FIELDS,
  ...LICENSE_AND_PERSONAL_FIELDS,
];

/**
 * Strip fields a role isn't allowed to see from a single driver record.
 * Safe to call for any role — redacts for any access level below 'full'
 * ('view' or 'operational'). Only 'full' access (Super Admin, Director, HR
 * Manager) sees compensation and personal-document fields unredacted; a
 * 'view'-tier role (Fleet Manager, Viewer) is not automatically HR-cleared
 * just because it can read the module.
 * @param {object} driver - a Prisma Driver record (or plain object)
 * @param {string} role
 * @returns {object} a shallow copy with hidden fields removed
 */
function sanitizeDriverForRole(driver, role) {
  if (!driver) return driver;
  if (getPermission(role, 'drivers_hr') === 'full') return driver;

  const sanitized = { ...driver };
  for (const field of HIDDEN_FIELDS_FOR_OPERATIONAL) {
    delete sanitized[field];
  }
  return sanitized;
}

/**
 * Same as sanitizeDriverForRole, mapped over a list.
 * @param {object[]} drivers
 * @param {string} role
 * @returns {object[]}
 */
function sanitizeDriversForRole(drivers, role) {
  if (!Array.isArray(drivers)) return drivers;
  if (getPermission(role, 'drivers_hr') === 'full') return drivers;
  return drivers.map((driver) => sanitizeDriverForRole(driver, role));
}

module.exports = {
  HIDDEN_FIELDS_FOR_OPERATIONAL,
  COMPENSATION_FIELDS,
  LICENSE_AND_PERSONAL_FIELDS,
  sanitizeDriverForRole,
  sanitizeDriversForRole,
};