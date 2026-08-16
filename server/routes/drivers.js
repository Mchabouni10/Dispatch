// routes/drivers.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const prisma = require('../lib/prisma');
const { emit } = require('../lib/realtime');
const requirePermission = require('../middleware/requirePermission');
const { sanitizeDriverForRole, sanitizeDriversForRole } = require('../lib/driverFieldAccess');

// Realtime broadcasts (see emit('driver:upsert', ...) below) go to every
// socket in the 'dashboard' room at once — there's no per-listener role to
// sanitize against like there is on a REST response. So these always use
// the strictest tier ('VIEWER', same redaction as 'operational') regardless
// of who triggered the update. Roles with full HR access already get the
// unredacted record back from the REST call itself (res.json(driver)/
// sanitizeDriverForRole(driver, req.user.role)); they just won't see pay
// rate/license/medical fields update live in *other* users' changes without
// a refresh. That's an acceptable tradeoff for not leaking HR data broadly.

// 'view' here also admits the new 'operational' tier (Dispatcher), so they can
// load driver lists/cards for handoff-board actions. Field-level redaction of
// pay rate / license / personal docs happens per-response below, not here.
router.use(requirePermission('drivers_hr', 'view'));

// Photo upload setup (profile + license scan share the same folder)
const uploadDir = path.join(__dirname, '..', 'uploads', 'drivers');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    let kind = 'photo';
    if (req.path.includes('license-photo')) kind = 'license';
    else if (req.path.includes('medical-photo')) kind = 'medical';
    else if (req.path.includes('airport-badge-photo')) kind = 'badge';
    else if (req.path.includes('passport-photo')) kind = 'passport';
    cb(null, `${req.params.id}-${kind}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG, PNG or WEBP images are allowed'));
  }
});

const LEAVE_STATUSES = ['Vacation', 'Sick Leave', 'Absent', 'Training'];

function parseDateValue(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);

  const raw = String(value).trim();
  if (!raw) return undefined;

  const normalized = raw.includes('T') || raw.includes(' ') || raw.includes('Z')
    ? raw
    : `${raw}T00:00:00.000Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }

  return parsed;
}

function normalizeDriverPayload(data) {
  const normalized = { ...data };

  // shiftStart / shiftEnd are plain "HH:00" strings (whole hours only), not dates.
  for (const field of ['shiftStart', 'shiftEnd']) {
    if (field in normalized && normalized[field]) {
      const match = /^([01]\d|2[0-3]):00$/.exec(String(normalized[field]).trim());
      if (!match) {
        throw new Error(`${field} must be a whole hour in HH:00 format`);
      }
    }
  }

  for (const field of [
    'dateOfBirth',
    'leaveStart',
    'leaveEnd',
    'licenseExpiration',
    'medicalCertExpiration',
    'hireDate',
    'lastPayRaise',
  ]) {
    if (field in normalized) {
      normalized[field] = parseDateValue(normalized[field]);
    }
  }

  if ('daysOff' in normalized && typeof normalized.daysOff === 'string') {
    normalized.daysOff = normalized.daysOff
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return normalized;
}

function validateDriverPayload(data, { partial = false } = {}) {
  const errors = [];

  const requireText = (field, label) => {
    if (partial && !(field in data)) return;
    const val = data[field];
    if (val === undefined || val === null || String(val).trim() === '') {
      errors.push(`${label} is required`);
    }
  };

  requireText('name', 'Name');
  requireText('phone', 'Phone number');
  requireText('email', 'Email');
  requireText('schedule', 'Working days / schedule');
  requireText('shiftStart', 'Shift start time');
  requireText('shiftEnd', 'Shift end time');
  requireText('licenseNumber', 'Driver license number');
  requireText('licenseExpiration', 'Driver license expiration date');

  if (!partial || 'daysOff' in data) {
    if (!Array.isArray(data.daysOff) || data.daysOff.length === 0) {
      errors.push('At least one day off is required');
    }
  }

  const vehicleTypes = Array.isArray(data.vehicleTypes)
    ? data.vehicleTypes
    : String(data.vehicleTypes || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  // A DOT medical card is required for CDL license classes (A/B) and for anyone driving a tractor.
  const requiresMedical =
    ['A', 'B'].includes(data.licenseClass) || vehicleTypes.includes('Tractor');
  if (requiresMedical && (!partial || 'medicalCertExpiration' in data)) {
    const medicalValue = data.medicalCertExpiration;
    if (
      medicalValue === undefined ||
      medicalValue === null ||
      String(medicalValue).trim() === ''
    ) {
      errors.push(
        'DOT medical card expiration is required for CDL (Class A/B) or tractor drivers',
      );
    }
  }

  // Leave date range required (and must be valid) when status is leave-related
  const status = data.status;
  const isLeaveStatus = LEAVE_STATUSES.includes(status);
  if (
    isLeaveStatus &&
    (!partial || 'leaveStart' in data || 'leaveEnd' in data || 'status' in data)
  ) {
    if (!data.leaveStart) errors.push('Leave start date is required for this status');
    if (!data.leaveEnd) errors.push('Leave end date is required for this status');
    if (data.leaveStart && data.leaveEnd) {
      const start = new Date(data.leaveStart);
      const end = new Date(data.leaveEnd);
      if (end < start) {
        errors.push('Leave end date must be on or after the start date');
      }
    }
  }

  return errors;
}

// GET all drivers with filtering
router.get('/', async (req, res) => {
  try {
    const { status, vehicleType, hazmat, search } = req.query;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (hazmat === 'true') filter.hazmatCertified = true;
    if (vehicleType && vehicleType !== 'all') {
      filter.vehicleTypes = { has: vehicleType };
    }

    const drivers = await prisma.driver.findMany({
      where: filter,
      orderBy: { name: 'asc' },
    });
    res.json(sanitizeDriversForRole(drivers, req.user.role));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET single driver
router.get('/:id', async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { id: req.params.id },
    });
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    res.json(sanitizeDriverForRole(driver, req.user.role));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET driver's complete equipment history
// Supports optional date-range filtering for safety/compliance lookups:
//   ?days=30                       → handoffs checked out in the last 30 days
//   ?startDate=...&endDate=...     → explicit range (either can be used alone)
// Without any of these, the full history is returned (previous behavior).
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100, includeActive = true, days, startDate, endDate } = req.query;

    const driver = await prisma.driver.findUnique({
      where: { id },
    });

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Build the checkOutTime range filter, if any range params were sent.
    let checkOutTime;
    if (days) {
      const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
      checkOutTime = { gte: since };
    } else if (startDate || endDate) {
      checkOutTime = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      };
    }

    const baseWhere = {
      driverId: id,
      ...(checkOutTime ? { checkOutTime } : {}),
    };

    const handoffs = await prisma.equipmentHandoff.findMany({
      where: {
        ...baseWhere,
        ...(includeActive === 'false' ? { isActive: false } : {}),
      },
      orderBy: { checkOutTime: 'desc' },
      take: parseInt(limit),
      include: {
        equipment: true,
        replacedEquipment: true,
        trailer: true,
        dispatcher: {
          select: { name: true, employeeId: true },
        },
      },
    });

    // Summary stats scoped to the same range so the numbers shown next to
    // the list always match what's actually in the list.
    const totalHandoffs = await prisma.equipmentHandoff.count({
      where: baseWhere,
    });

    const activeHandoffs = await prisma.equipmentHandoff.count({
      where: { ...baseWhere, isActive: true },
    });

    const uniqueEquipment = await prisma.equipmentHandoff.groupBy({
      by: ['equipmentId'],
      where: baseWhere,
      _count: true,
    });

    const uniqueTrailers = await prisma.equipmentHandoff.groupBy({
      by: ['trailerId'],
      where: {
        ...baseWhere,
        trailerId: { not: null },
      },
      _count: true,
    });

    res.json({
      driver: {
        id: driver.id,
        name: driver.name,
        employeeId: driver.employeeId,
        photo: driver.photo,
      },
      range: checkOutTime
        ? { days: days ? parseInt(days) : null, startDate: startDate || null, endDate: endDate || null }
        : null,
      summary: {
        totalHandoffs,
        activeHandoffs,
        uniqueEquipmentDriven: uniqueEquipment.length,
        uniqueTrailersUsed: uniqueTrailers.length,
      },
      history: handoffs,
    });
  } catch (err) {
    console.error('[GET /api/drivers/:id/history] Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// POST create driver
router.post('/', requirePermission('drivers_hr', 'full'), async (req, res) => {
  try {
    const data = normalizeDriverPayload({ ...req.body });

    const errors = validateDriverPayload(data);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join(', ') });
    }

    // Auto-generate an employee ID if one wasn't provided
    if (!data.employeeId || String(data.employeeId).trim() === '') {
      const count = await prisma.driver.count();
      data.employeeId = `EMP-${String(count + 1).padStart(4, '0')}`;
    }

    // Clear leave dates when status is not leave-related
    if (!LEAVE_STATUSES.includes(data.status)) {
      data.leaveStart = null;
      data.leaveEnd = null;
    }

    const driver = await prisma.driver.create({
      data,
    });
    emit('driver:upsert', sanitizeDriverForRole(driver, 'VIEWER'));
    res.status(201).json(driver);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({
        message: 'That Employee ID is already in use. Please use a unique value.',
      });
    }
    res.status(400).json({ message: err.message });
  }
});

// PUT update driver
// Requires 'full' — a Dispatcher (operational) is intentionally blocked here,
// so the driver card as a whole (including daysOff) stays read-only for them.
router.put('/:id', requirePermission('drivers_hr', 'full'), async (req, res) => {
  try {
    const data = normalizeDriverPayload(req.body);
    const errors = validateDriverPayload(data, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join(', ') });
    }

    // Clear leave dates when status is not leave-related
    if ('status' in data && !LEAVE_STATUSES.includes(data.status)) {
      data.leaveStart = null;
      data.leaveEnd = null;
    }

    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data,
    });
    emit('driver:upsert', sanitizeDriverForRole(driver, 'VIEWER'));
    res.json(driver);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Driver not found' });
    }
    if (err.code === 'P2002') {
      return res.status(400).json({
        message: 'That Employee ID is already in use. Please use a unique value.',
      });
    }
    res.status(400).json({ message: err.message });
  }
});

// POST upload driver profile photo — requires 'full', not exposed to Dispatcher.
router.post('/:id/photo', requirePermission('drivers_hr', 'full'), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No photo uploaded' });

    const existing = await prisma.driver.findUnique({
      where: { id: req.params.id },
    });

    if (existing?.photo) {
      const oldPath = path.join(__dirname, '..', existing.photo);
      fs.unlink(oldPath, () => {});
    }

    const photoPath = `/uploads/drivers/${req.file.filename}`;
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: { photo: photoPath },
    });

    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    res.json(driver);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Driver not found' });
    }
    res.status(400).json({ message: err.message });
  }
});

// POST upload scanned driver license — requires 'full'; a license scan is exactly
// the kind of "personal doc" a Dispatcher should never see or overwrite.
router.post('/:id/license-photo', requirePermission('drivers_hr', 'full'), upload.single('licensePhoto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No license scan uploaded' });

    const existing = await prisma.driver.findUnique({
      where: { id: req.params.id },
    });

    if (existing?.licensePhoto) {
      const oldPath = path.join(__dirname, '..', existing.licensePhoto);
      fs.unlink(oldPath, () => {});
    }

    const licensePath = `/uploads/drivers/${req.file.filename}`;
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: { licensePhoto: licensePath },
    });

    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    res.json(driver);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Driver not found' });
    }
    res.status(400).json({ message: err.message });
  }
});

/**
 * Shared helper for optional compliance document photos.
 * field: Prisma column name on Driver
 * formField: multer field name
 */
async function uploadDriverDocPhoto(req, res, { field, formField, label }) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: `No ${label} uploaded` });
    }

    const existing = await prisma.driver.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return res.status(404).json({ message: 'Driver not found' });

    if (existing[field]) {
      const oldPath = path.join(__dirname, '..', existing[field]);
      fs.unlink(oldPath, () => {});
    }

    const filePath = `/uploads/drivers/${req.file.filename}`;
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: { [field]: filePath },
    });
    res.json(driver);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Driver not found' });
    }
    res.status(400).json({ message: err.message });
  }
}

// Optional document scans — all require 'full' (not Dispatcher).
router.post(
  '/:id/medical-photo',
  requirePermission('drivers_hr', 'full'),
  upload.single('medicalPhoto'),
  (req, res) =>
    uploadDriverDocPhoto(req, res, {
      field: 'medicalCertPhoto',
      formField: 'medicalPhoto',
      label: 'medical card scan',
    }),
);

router.post(
  '/:id/airport-badge-photo',
  requirePermission('drivers_hr', 'full'),
  upload.single('airportBadgePhoto'),
  (req, res) =>
    uploadDriverDocPhoto(req, res, {
      field: 'airportBadgePhoto',
      formField: 'airportBadgePhoto',
      label: 'airport badge scan',
    }),
);

router.post(
  '/:id/passport-photo',
  requirePermission('drivers_hr', 'full'),
  upload.single('passportPhoto'),
  (req, res) =>
    uploadDriverDocPhoto(req, res, {
      field: 'passportPhoto',
      formField: 'passportPhoto',
      label: 'passport scan',
    }),
);

// PATCH update status only
// Also doubles as the Handoff Board's status transition endpoint (check-in / break / send home).
// Requires only 'operational' access — this is the one write action a Dispatcher
// IS allowed to take on a driver record, since it's how they run the handoff
// board (send home, start break, check in) without generic edit rights.
router.patch('/:id/status', requirePermission('drivers_hr', 'operational'), async (req, res) => {
  try {
    const {
      status,
      statusReason,
      leaveStart,
      leaveEnd,
      // Handoff Board timestamps — all optional, only applied when the caller sends them.
      lastCheckin,
      shiftStartTime,
      shiftEndTime,
      breakUntil,
    } = req.body;
    const data = { status, statusReason };

    if (LEAVE_STATUSES.includes(status)) {
      if (leaveStart !== undefined) data.leaveStart = parseDateValue(leaveStart);
      if (leaveEnd !== undefined) data.leaveEnd = parseDateValue(leaveEnd);
    } else {
      data.leaveStart = null;
      data.leaveEnd = null;
    }

    if (lastCheckin !== undefined) data.lastCheckin = parseDateValue(lastCheckin);
    if (shiftStartTime !== undefined) data.shiftStartTime = parseDateValue(shiftStartTime);
    if (shiftEndTime !== undefined) data.shiftEndTime = parseDateValue(shiftEndTime);

    // breakUntil only makes sense while actually on break — clear it for any other status
    // so a stale countdown never lingers once the driver moves on.
    if (status === 'Break') {
      if (breakUntil !== undefined) {
        data.breakUntil = parseDateValue(breakUntil);
        data.lastBreakTime = new Date();
      }
    } else {
      data.breakUntil = null;
    }

    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data,
    });
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    emit('driver:upsert', sanitizeDriverForRole(driver, 'VIEWER'));
    res.json(sanitizeDriverForRole(driver, req.user.role));
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Driver not found' });
    }
    res.status(400).json({ message: err.message });
  }
});

// NOTE: a GET /available route used to live here (Available/On Call, plus
// Break drivers whose breakUntil has passed). It was removed — it sat below
// GET /:id, so Express always matched /available as id="available" first and
// it 404'd on every call. It was also never called from the client: dispatch
// computes the same "available" set client-side via isDispatchEligible in
// useDispatchResources.js. Removed rather than fixed to avoid keeping two
// copies of the same "what counts as available" business rule that could
// drift apart. If a server-side available-drivers endpoint is needed later,
// re-add it ABOVE the GET /:id route (or under a non-colliding path) and
// point the client at it instead of duplicating the filter.

// DELETE driver — requires 'full', not exposed to Dispatcher.
router.delete('/:id', requirePermission('drivers_hr', 'full'), async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { id: req.params.id },
    });

    if (driver?.photo) {
      const photoPath = path.join(__dirname, '..', driver.photo);
      fs.unlink(photoPath, () => {});
    }
    if (driver?.licensePhoto) {
      const licensePath = path.join(__dirname, '..', driver.licensePhoto);
      fs.unlink(licensePath, () => {});
    }

    await prisma.driver.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Driver deleted successfully' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Driver not found' });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
module.exports.normalizeDriverPayload = normalizeDriverPayload;
module.exports.validateDriverPayload = validateDriverPayload;







