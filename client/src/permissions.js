export const ROLE_HIERARCHY = ['SUPER_ADMIN', 'DIRECTOR', 'HR_MANAGER', 'FLEET_MANAGER', 'DISPATCHER', 'VIEWER'];

// Access levels: 'full' | 'operational' | 'view' | 'none'
// 'operational' (currently only drivers_hr / DISPATCHER) means: can see the
// module and take specific status/action-type writes, but cannot create,
// fully edit, or delete records. See lib/driverFieldAccess.js on the server
// for the field-level redaction that pairs with this.
const MATRIX = {
  drivers_hr: ['full', 'full', 'full', 'view', 'operational', 'view'],
  // 'operational' for DISPATCHER: can check availability, hand off keys, and
  // mark a unit out of service, but not create/edit/delete a unit or manage
  // its photos (that stays 'full'-only). See lib/permissions.js on the server.
  equipment: ['full', 'full', 'none', 'full', 'operational', 'view'],
  dispatch: ['full', 'full', 'none', 'view', 'full', 'view'],
  shipments: ['full', 'full', 'none', 'none', 'full', 'view'],
  users: ['full', 'full', 'none', 'none', 'none', 'none'],
  airlines: ['full', 'full', 'none', 'none', 'view', 'view'],
  warehouses: ['full', 'full', 'none', 'none', 'view', 'view'],
  analytics: ['full', 'full', 'view', 'view', 'view', 'view'],
  calendar: ['full', 'full', 'view', 'view', 'full', 'view'],
  handoff: ['full', 'full', 'none', 'full', 'full', 'view'],
  dashboard: ['full', 'full', 'view', 'view', 'view', 'view'],
};

export function getPermission(role, module) {
  const index = ROLE_HIERARCHY.indexOf(role);
  return index < 0 ? 'none' : (MATRIX[module]?.[index] || 'none');
}

export const canWrite = (role, module) => getPermission(role, module) === 'full';

// True for 'operational' or 'full' — use this to gate driver status/handoff
// actions (send home, start break, check in), which Dispatcher should be
// able to do even though canWrite() is false for them on drivers_hr.
export const canOperate = (role, module) => {
  const level = getPermission(role, module);
  return level === 'operational' || level === 'full';
};

// Driver fields hidden from any role below 'full' access on drivers_hr (i.e.
// 'view' and 'operational' — Fleet Manager, Viewer, and Dispatcher). Kept in
// sync with lib/driverFieldAccess.js on the server — the server never even
// sends these fields to those roles, so this list is mainly useful for
// building the driver card UI (e.g. skip rendering these inputs/rows) rather
// than for hiding data the server already redacted.
//
// licenseClass, hazmatCertified, and gdpTrained are deliberately NOT here —
// those are operational facts (which vehicles a driver is eligible for), not
// personal/HR data, and Dispatcher needs them to do their job.
export const DRIVER_HIDDEN_FIELDS_OPERATIONAL = [
  'payType', 'payRate', 'overtimeRate', 'bonusEligible', 'lastPayRaise', 'hireDate',
  'licenseNumber', 'licenseExpiration', 'licensePhoto', 'medicalCertExpiration', 'medicalCertPhoto',
  'dateOfBirth', 'address', 'gender',
  'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation',
  'medicalConditions',
];

