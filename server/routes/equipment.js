const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET all equipment (includes assigned driver for Handoff / Equipment boards)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.type) filter.equipmentType = req.query.type;

    const equipment = await prisma.equipment.findMany({
      where: filter,
      orderBy: { unitNumber: 'asc' },
      include: {
        assignedDriver: {
          select: {
            id: true,
            name: true,
            photo: true,
            employeeId: true,
            status: true,
          },
        },
      },
    });
    res.json(equipment);
  } catch (err) {
    console.error('[GET /api/equipment] Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET single unit
router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.equipment.findUnique({
      where: { id: req.params.id },
      include: {
        assignedDriver: {
          select: {
            id: true,
            name: true,
            photo: true,
            employeeId: true,
            status: true,
          },
        },
      },
    });
    if (!item) return res.status(404).json({ message: 'Equipment not found' });
    res.json(item);
  } catch (err) {
    console.error('[GET /api/equipment/:id] Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// POST create unit
router.post('/', async (req, res) => {
  try {
    console.log('[POST /api/equipment] Received body:', JSON.stringify(req.body, null, 2));

    const cleanData = { ...req.body };
    Object.keys(cleanData).forEach((key) => {
      if (cleanData[key] === '' || cleanData[key] === null || cleanData[key] === undefined) {
        delete cleanData[key];
      }
    });

    console.log('[POST /api/equipment] Cleaned data:', JSON.stringify(cleanData, null, 2));

    const item = await prisma.equipment.create({
      data: cleanData,
    });
    console.log('[POST /api/equipment] Saved OK:', item.id);
    res.status(201).json(item);
  } catch (err) {
    console.error('[POST /api/equipment] Error:', err);

    if (err.code === 'P2002') {
      return res.status(400).json({
        message: 'Duplicate unit number. Please use a unique unit number.',
      });
    }

    res.status(400).json({ message: err.message });
  }
});

// PUT update unit
router.put('/:id', async (req, res) => {
  try {
    console.log('[PUT /api/equipment/:id] Received body:', JSON.stringify(req.body, null, 2));

    const update = { ...req.body };
    Object.keys(update).forEach((key) => {
      // Only drop '' and undefined (meaning "not provided"). An explicit `null`
      // is a deliberate clear-this-field signal (e.g. lease info when switching
      // back to Owned) and must be allowed through to Prisma.
      if (update[key] === '' || update[key] === undefined) {
        delete update[key];
      }
    });

    console.log('[PUT /api/equipment/:id] Cleaned update:', JSON.stringify(update, null, 2));

    const item = await prisma.equipment.update({
      where: { id: req.params.id },
      data: update,
    });

    res.json(item);
  } catch (err) {
    console.error('[PUT /api/equipment/:id] Error:', err);

    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    if (err.code === 'P2002') {
      return res.status(400).json({
        message: 'Duplicate unit number. Please use a unique unit number.',
      });
    }
    res.status(400).json({ message: err.message });
  }
});

// PATCH assign/release this unit on the Handoff Board
// (kept separate from PUT /:id, which strips null/empty values and so can never clear assignedDriverId)
router.patch('/:id/assign', async (req, res) => {
  try {
    const { driverId, release, cooldownMinutes } = req.body;

    let data;
    if (release) {
      // Sending a driver home: free the unit, but only after an optional cooldown window
      // (e.g. 60 min) so dispatch can see it's not really available yet.
      const minutes = Number.isFinite(Number(cooldownMinutes)) ? Number(cooldownMinutes) : 0;
      data = {
        assignedDriverId: null,
        availableAt: minutes > 0 ? new Date(Date.now() + minutes * 60 * 1000) : null,
      };
    } else {
      if (!driverId) {
        return res.status(400).json({ message: 'driverId is required to assign this unit' });
      }
      data = { assignedDriverId: driverId, availableAt: null };
    }

    const item = await prisma.equipment.update({
      where: { id: req.params.id },
      data,
      include: {
        assignedDriver: {
          select: {
            id: true,
            name: true,
            photo: true,
            employeeId: true,
            status: true,
          },
        },
      },
    });
    res.json(item);
  } catch (err) {
    console.error('[PATCH /api/equipment/:id/assign] Error:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    res.status(400).json({ message: err.message });
  }
});

// DELETE unit
router.delete('/:id', async (req, res) => {
  try {
    await prisma.equipment.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Equipment deleted successfully' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    console.error('[DELETE /api/equipment/:id] Error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
