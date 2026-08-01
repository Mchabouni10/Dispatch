const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

const VALID_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

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
router.post('/', async (req, res) => {
  try {
    const warehouse = await prisma.warehouse.create({
      data: normalizeHours(req.body)
    });
    res.status(201).json(warehouse);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update warehouse
router.put('/:id', async (req, res) => {
  try {
    const warehouse = await prisma.warehouse.update({
      where: { id: req.params.id },
      data: normalizeHours(req.body)
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
router.delete('/:id', async (req, res) => {
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
