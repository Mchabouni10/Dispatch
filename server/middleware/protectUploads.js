// middleware/protectUploads.js
//
// ─── Auth gate for /uploads ──────────────────────────────────────────────────
// Previously `/uploads` was served with plain `express.static`, mounted
// BEFORE requireAuth even runs — meaning anyone with a URL (from a browser
// network tab, a shared screenshot, browser history sync, a referrer header,
// etc.) had permanent, unauthenticated access to every uploaded file,
// forever. That folder holds driver profile photos, but also license scans,
// DOT medical cards, passport scans, and airport badge photos — exactly the
// documents lib/driverFieldAccess.js goes to such trouble to redact
// everywhere else in the app. This middleware closes that gap:
//
//   1. Requires a valid session (same token check as requireAuth) before any
//      file under /uploads is served at all.
//   2. For driver documents specifically, re-applies the SAME field-visibility
//      rule used on the JSON driver endpoints: license / medical / passport /
//      badge scans are personal documents, visible only to roles with 'full'
//      access to drivers_hr (SUPER_ADMIN, DIRECTOR, HR_MANAGER). Dispatcher
//      (operational) and Fleet Manager/Viewer (view) can still load the
//      ordinary profile photo (needed for the Handoff Board / equipment
//      cards / driver lists they're already allowed to see), but not the
//      identifying documents.
//   3. Equipment photos aren't personal/HR data, so any authenticated user
//      with at least 'view' on the equipment module can load those — this
//      mirrors the existing REST behavior (GET /api/equipment is 'view'-gated
//      for everyone with any equipment access at all).
//
// This intentionally duplicates a small amount of role logic from
// lib/driverFieldAccess.js / lib/permissions.js rather than trying to share
// code with the JSON routes, because this middleware is working with a raw
// filename on disk, not a Prisma record — there's no "field" to redact, only
// a yes/no on whether this file may be served at all.

const { verifyToken, publicUser } = require('../lib/auth');
const { getPermission } = require('../lib/permissions');
const prisma = require('../lib/prisma');

// Matches the `kind` tokens written into the filename by the multer storage
// config in routes/drivers.js: `${req.params.id}-${kind}-${Date.now()}${ext}`
const SENSITIVE_DRIVER_DOC_MARKERS = ['-license-', '-medical-', '-badge-', '-passport-'];

function isSensitiveDriverDoc(filename) {
  return SENSITIVE_DRIVER_DOC_MARKERS.some((marker) => filename.includes(marker));
}

module.exports = async function protectUploads(req, res, next) {
  // req.path is relative to the /uploads mount point, e.g. "/drivers/xyz-license-123.jpg"
  const segments = req.path.split('/').filter(Boolean);
  const [folder, filename] = segments;

  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    // Images loaded via a plain <img src> tag can't set an Authorization
    // header, so the client also appends ?token=... for uploads specifically
    // (see resolveUploadUrl in src/api/api.js). Bearer header wins if both
    // are present.
    : (typeof req.query.token === 'string' ? req.query.token : null);

  const tokenData = verifyToken(token);
  if (!tokenData) {
    return res.status(401).json({ message: 'Please sign in to view this file.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: tokenData.sub } });
    if (!user) return res.status(401).json({ message: 'Your session is no longer valid' });
    if (user.mustChangePassword) {
      return res.status(403).json({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must set a new password before continuing.',
      });
    }

    req.user = publicUser(user);

    if (folder === 'drivers' && filename && isSensitiveDriverDoc(filename)) {
      if (getPermission(req.user.role, 'drivers_hr') !== 'full') {
        return res.status(403).json({
          message: 'You do not have permission to view this document.',
        });
      }
    }

    // Non-sensitive driver files (plain profile photo) just need the caller
    // to be logged in and have at least 'view' on drivers_hr — true for
    // every role in the current permission matrix, but checked explicitly
    // rather than assumed, in case that ever changes.
    if (folder === 'drivers' && getPermission(req.user.role, 'drivers_hr') === 'none') {
      return res.status(403).json({ message: 'You do not have permission to view this file.' });
    }

    if (folder === 'equipment' && getPermission(req.user.role, 'equipment') === 'none') {
      return res.status(403).json({ message: 'You do not have permission to view this file.' });
    }

    next();
  } catch (error) {
    next(error);
  }
};