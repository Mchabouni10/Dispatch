const { hasAccess } = require('../lib/permissions');

/**
 * Middleware factory to enforce Role-Based Access Control (RBAC).
 *
 * @param {string} module - The name of the module (e.g. 'drivers_hr', 'equipment')
 * @param {'view' | 'operational' | 'full'} requiredAccess
 *   - 'view'        → any access level except 'none' passes
 *   - 'operational' → 'operational' or 'full' passes (e.g. driver status/handoff actions)
 *   - 'full'        → only 'full' passes (create/edit/delete)
 * @returns {import('express').RequestHandler}
 */
module.exports = function requirePermission(module, requiredAccess) {
  return function (req, res, next) {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!hasAccess(req.user.role, module, requiredAccess)) {
      const message =
        requiredAccess === 'view'
          ? 'You do not have permission to access this resource.'
          : 'You do not have permission to modify this resource.';
      return res.status(403).json({ message });
    }

    next();
  };
};