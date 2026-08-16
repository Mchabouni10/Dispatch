// lib/permissions.js
// ─── Layer 2: Centralized permission matrix ──────────────────────────────────
// Maps (role, module) → access level: 'full' | 'operational' | 'view' | 'none'
//
// 'operational' is a new tier, currently only used for drivers_hr / DISPATCHER.
// It sits between 'view' and 'full':
//   - satisfies a 'view' requirement (can read the list/detail routes)
//   - does NOT satisfy a 'full' requirement (cannot PUT/DELETE/POST, cannot
//     upload license photos — i.e. cannot edit the driver card at all)
//   - DOES satisfy a dedicated 'operational' requirement, used only on the
//     status-change route, so Dispatcher can do handoff-board actions
//     (send home, start break, check in) without generic write access.
// Field-level redaction (hiding pay rate / license / personal docs) is
// handled separately in lib/driverFieldAccess.js — it's not expressible as
// a single access-level string.

const ROLE_HIERARCHY = ['SUPER_ADMIN', 'DIRECTOR', 'HR_MANAGER', 'FLEET_MANAGER', 'DISPATCHER', 'VIEWER'];

// Access levels: 'full' = read + write + delete, 'operational' = read + status-only actions,
// 'view' = read-only, 'none' = no access
const PERMISSION_MATRIX = {
  //                    SUPER_ADMIN  DIRECTOR  HR_MANAGER  FLEET_MANAGER  DISPATCHER     VIEWER
  drivers_hr:         ['full',      'full',   'full',     'view',        'operational', 'view'],
  // 'operational' for DISPATCHER: can check unit availability, hand off keys
  // (PATCH /:id/assign), and mark a unit out of service (PATCH /:id/status),
  // but cannot create/edit specs/delete a unit or manage its photos — that
  // stays 'full'-only (Super Admin, Director, Fleet Manager).
  equipment:          ['full',      'full',   'none',     'full',        'operational', 'view'],
  dispatch:           ['full',      'full',   'none',     'view',        'full',        'view'],
  shipments:          ['full',      'full',   'none',     'none',        'full',        'view'],
  users:              ['full',      'full',   'none',     'none',        'none',        'none'],
  airlines:           ['full',      'full',   'none',     'none',        'view',        'view'],
  warehouses:         ['full',      'full',   'none',     'none',        'view',        'view'],
  analytics:          ['full',      'full',   'view',     'view',        'view',        'view'],
  calendar:           ['full',      'full',   'view',     'view',        'full',        'view'],
  handoff:            ['full',      'full',   'none',     'full',        'full',        'view'],
  dashboard:          ['full',      'full',   'view',     'view',        'view',        'view'],
};

/**
 * Get the raw permission level for a given role and module.
 * @param {string} role   - One of the Role enum values
 * @param {string} module - One of the module keys (e.g. 'drivers_hr', 'equipment')
 * @returns {'full' | 'operational' | 'view' | 'none'}
 */
function getPermission(role, module) {
  const roleIndex = ROLE_HIERARCHY.indexOf(role);
  if (roleIndex === -1) return 'none';

  const modulePerms = PERMISSION_MATRIX[module];
  if (!modulePerms) return 'none';

  return modulePerms[roleIndex] || 'none';
}

/**
 * Does this role meet at least the given access requirement for this module?
 * Ordering: full > operational > view > none.
 * - requiredAccess 'view'         → satisfied by 'view', 'operational', or 'full'
 * - requiredAccess 'operational'  → satisfied by 'operational' or 'full'
 * - requiredAccess 'full'         → satisfied by 'full' only
 * @param {string} role
 * @param {string} module
 * @param {'view'|'operational'|'full'} requiredAccess
 * @returns {boolean}
 */
function hasAccess(role, module, requiredAccess) {
  const level = getPermission(role, module);
  if (level === 'none') return false;
  if (requiredAccess === 'view') return true; // any non-'none' level can read
  if (requiredAccess === 'operational') return level === 'operational' || level === 'full';
  if (requiredAccess === 'full') return level === 'full';
  return false;
}

/**
 * Check if a role is higher in the hierarchy than another.
 * Used for "can only manage roles below your level" logic.
 * @param {string} actorRole  - The role of the user performing the action
 * @param {string} targetRole - The role being assigned or managed
 * @returns {boolean}
 */
function isRoleAbove(actorRole, targetRole) {
  const actorIndex = ROLE_HIERARCHY.indexOf(actorRole);
  const targetIndex = ROLE_HIERARCHY.indexOf(targetRole);
  if (actorIndex === -1 || targetIndex === -1) return false;
  return actorIndex < targetIndex;
}

/**
 * Get all roles that a given role can assign to other users.
 * @param {string} actorRole
 * @returns {string[]}
 */
function getAssignableRoles(actorRole) {
  const actorIndex = ROLE_HIERARCHY.indexOf(actorRole);
  if (actorIndex === -1) return [];
  // SUPER_ADMIN can assign any role; others can only assign below their level
  if (actorRole === 'SUPER_ADMIN') return [...ROLE_HIERARCHY];
  return ROLE_HIERARCHY.slice(actorIndex + 1);
}

module.exports = {
  ROLE_HIERARCHY,
  PERMISSION_MATRIX,
  getPermission,
  hasAccess,
  isRoleAbove,
  getAssignableRoles,
};