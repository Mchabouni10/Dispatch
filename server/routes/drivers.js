// routes/drivers.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const prisma = require('../lib/prisma');

// Photo upload setup (profile + license scan share the same folder)
const uploadDir = path.join(__dirname, '..', 'uploads', 'drivers');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const kind = req.path.includes('license-photo') ? 'license' : 'photo';
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
    res.json(drivers);
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
    res.json(driver);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create driver
router.post('/', async (req, res) => {
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
router.put('/:id', async (req, res) => {
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

// POST upload driver profile photo
router.post('/:id/photo', upload.single('photo'), async (req, res) => {
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

// POST upload scanned driver license
router.post('/:id/license-photo', upload.single('licensePhoto'), async (req, res) => {
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

// PATCH update status only
// Also doubles as the Handoff Board's status transition endpoint (check-in / break / send home),
// which is why it accepts the optional timestamp fields below alongside the original status/leave logic.
router.patch('/:id/status', async (req, res) => {
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
    res.json(driver);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Driver not found' });
    }
    res.status(400).json({ message: err.message });
  }
});

// GET available drivers for dispatch
// Includes Available / On Call, plus Break drivers whose breakUntil has passed
// (soft-available so dispatch is not blocked waiting for a manual Handoff click).
router.get('/available', async (req, res) => {
  try {
    const { vehicleType, hazmat } = req.query;

    const extras = {
      ...(hazmat === 'true' ? { hazmatCertified: true } : {}),
      ...(vehicleType && vehicleType !== 'any'
        ? { vehicleTypes: { has: vehicleType } }
        : {}),
    };

    const drivers = await prisma.driver.findMany({
      where: {
        AND: [
          extras,
          {
            OR: [
              { status: { in: ['Available', 'On Call'] } },
              {
                status: 'Break',
                breakUntil: { lte: new Date() },
              },
            ],
          },
        ],
      },
      orderBy: { performanceRating: 'desc' },
    });
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE driver
router.delete('/:id', async (req, res) => {
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