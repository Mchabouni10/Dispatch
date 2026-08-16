const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const requirePermission = require('../middleware/requirePermission');
router.use(requirePermission('warehouses', 'view'));

const VALID_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const VALID_BAY_TYPES = ['dock', 'parking'];
const VALID_SECURITY_TYPES = ['open', 'manned', 'keypad', 'keycard'];
const MAX_IMAGES = 8;

// Keeps hours data internally consistent regardless of what the client sends:
// - is24Hours warehouses don't need day/time fields cluttering the record
// - daysOpen is filtered to known day codes and de-duplicated
function normalizeHours(body) {
  const data = { ...body };
  if (data.is24Hours) {
    data.daysOpen = VALID_DAYS.slice();
    data.openTime = null;
    data.closeTime = null;
  } else if (Array.isArray(data.daysOpen)) {
    data.daysOpen = [...new Set(data.daysOpen.filter(d => VALID_DAYS.includes(d)))];
  }
  return data;
}

// Same idea, but for the "site details" fields added alongside hours:
// - images capped so a client can't push an unbounded array into the DB
// - bayFrom/bayTo coerced to ints (or null) and always kept in ascending order
// - securityType/bayType constrained to known values
function normalizeSiteDetails(body) {
  const data = { ...body };

  data.images = Array.isArray(data.images)
    ? data.images.filter(img => typeof img === 'string' && img.trim().length > 0).slice(0, MAX_IMAGES)
    : [];

  data.bayType = VALID_BAY_TYPES.includes(data.bayType) ? data.bayType : null;

  const toIntOrNull = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  };
  data.bayFrom = toIntOrNull(data.bayFrom);
  data.bayTo = toIntOrNull(data.bayTo);
  if (data.bayFrom !== null && data.bayTo !== null && data.bayFrom > data.bayTo) {
    [data.bayFrom, data.bayTo] = [data.bayTo, data.bayFrom];
  }

  data.securityType = VALID_SECURITY_TYPES.includes(data.securityType) ? data.securityType : null;
  data.appointmentRequired = !!data.appointmentRequired;
  data.forkliftAvailable = !!data.forkliftAvailable;

  return data;
}

function normalizeWarehouse(body) {
  return normalizeSiteDetails(normalizeHours(body));
}

// GET all warehouses
router.get('/', async (req, res) => {
  try {
    const warehouses = await prisma.warehouse.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(warehouses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET single warehouse
router.get('/:id', async (req, res) => {
  try {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: req.params.id }
    });
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
    res.json(warehouse);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create warehouse
router.post('/', requirePermission('warehouses', 'full'), async (req, res) => {
  try {
    const warehouse = await prisma.warehouse.create({
      data: normalizeWarehouse(req.body)
    });
    res.status(201).json(warehouse);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update warehouse
router.put('/:id', requirePermission('warehouses', 'full'), async (req, res) => {
  try {
    const warehouse = await prisma.warehouse.update({
      where: { id: req.params.id },
      data: normalizeWarehouse(req.body)
    });
    res.json(warehouse);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Warehouse not found' });
    }
    res.status(400).json({ message: err.message });
  }
});

// DELETE warehouse
router.delete('/:id', requirePermission('warehouses', 'full'), async (req, res) => {
  try {
    await prisma.warehouse.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Warehouse deleted successfully' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Warehouse not found' });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
