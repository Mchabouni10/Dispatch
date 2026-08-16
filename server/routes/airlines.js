// backend/routes/airlines.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const requirePermission = require('../middleware/requirePermission');
router.use(requirePermission('airlines', 'view'));

// Storage for airline logos
const logoDir = path.join(__dirname, '..', 'uploads', 'airlines');
fs.mkdirSync(logoDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPG, WEBP or SVG images are allowed'));
  }
});

/** Only fields the Airline model accepts (avoids Prisma errors from form junk). */
function pickAirlineData(body = {}) {
  const data = {};
  const str = (v) => (v == null ? v : String(v));
  const bool = (v) => Boolean(v);
  const int = (v) => (v === '' || v == null ? undefined : Number(v));

  if (body.name !== undefined) data.name = str(body.name);
  if (body.code !== undefined) data.code = str(body.code).toUpperCase();
  if (body.awbPrefix !== undefined) data.awbPrefix = str(body.awbPrefix);
  if (body.terminalAddress !== undefined) data.terminalAddress = body.terminalAddress ? str(body.terminalAddress) : null;
  if (body.contactPhone !== undefined) data.contactPhone = body.contactPhone ? str(body.contactPhone) : null;
  if (body.openTime !== undefined) data.openTime = body.openTime ? str(body.openTime) : null;
  if (body.closeTime !== undefined) data.closeTime = body.closeTime ? str(body.closeTime) : null;
  if (body.open24h !== undefined) data.open24h = bool(body.open24h);
  if (body.daysOpen !== undefined) {
    data.daysOpen = Array.isArray(body.daysOpen)
      ? body.daysOpen.map(String)
      : [];
  }
  if (body.defaultCutoffHours !== undefined) {
    const n = int(body.defaultCutoffHours);
    if (n != null && !Number.isNaN(n)) data.defaultCutoffHours = n;
  }
  if (body.notes !== undefined) data.notes = body.notes ? str(body.notes) : null;
  // logoUrl is set only via POST /:id/logo — never from the JSON form body
  return data;
}

// GET all airlines
router.get('/', async (req, res) => {
  try {
    const airlines = await prisma.airline.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(airlines);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET single airline
router.get('/:id', async (req, res) => {
  try {
    const airline = await prisma.airline.findUnique({
      where: { id: req.params.id }
    });
    if (!airline) return res.status(404).json({ message: 'Airline not found' });
    res.json(airline);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create airline
router.post('/', requirePermission('airlines', 'full'), async (req, res) => {
  try {
    const data = pickAirlineData(req.body);

    if (data.awbPrefix) {
      const existing = await prisma.airline.findUnique({
        where: { awbPrefix: data.awbPrefix }
      });
      if (existing) {
        return res.status(400).json({
          message: `AWB prefix "${data.awbPrefix}" is already used by another airline`
        });
      }
    }

    const airline = await prisma.airline.create({ data });
    res.status(201).json(airline);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({
        message: `AWB prefix "${req.body.awbPrefix}" is already used by another airline`
      });
    }
    res.status(400).json({ message: err.message });
  }
});

// PUT update airline
router.put('/:id', requirePermission('airlines', 'full'), async (req, res) => {
  try {
    const data = pickAirlineData(req.body);

    if (data.awbPrefix) {
      const existing = await prisma.airline.findFirst({
        where: {
          awbPrefix: data.awbPrefix,
          NOT: { id: req.params.id }
        }
      });
      if (existing) {
        return res.status(400).json({
          message: `AWB prefix "${data.awbPrefix}" is already used by another airline`
        });
      }
    }

    const airline = await prisma.airline.update({
      where: { id: req.params.id },
      data
    });
    res.json(airline);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Airline not found' });
    }
    if (err.code === 'P2002') {
      return res.status(400).json({
        message: `AWB prefix "${req.body.awbPrefix}" is already used by another airline`
      });
    }
    res.status(400).json({ message: err.message });
  }
});

// POST upload logo
router.post('/:id/logo', requirePermission('airlines', 'full'), upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const logoUrl = `/uploads/airlines/${req.file.filename}`;
    const airline = await prisma.airline.update({
      where: { id: req.params.id },
      data: { logoUrl }
    });

    if (!airline) return res.status(404).json({ message: 'Airline not found' });
    res.json(airline);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Airline not found' });
    }
    res.status(400).json({ message: err.message });
  }
});

// DELETE airline
router.delete('/:id', requirePermission('airlines', 'full'), async (req, res) => {
  try {
    await prisma.airline.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Airline deleted successfully' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Airline not found' });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

