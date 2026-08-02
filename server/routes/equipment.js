// routes/equipment.js
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// ──────────────────────────────────────────────────────────────
// 1. GET all equipment
// ──────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────
// 2. POST create unit
// ──────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const cleanData = { ...req.body };
    Object.keys(cleanData).forEach((key) => {
      if (cleanData[key] === '' || cleanData[key] === null || cleanData[key] === undefined) {
        delete cleanData[key];
      }
    });

    const item = await prisma.equipment.create({
      data: cleanData,
    });
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

// ──────────────────────────────────────────────────────────────
// 3. GET equipment history for a specific driver
// ──────────────────────────────────────────────────────────────
router.get('/history/driver/:driverId', async (req, res) => {
  try {
    const { driverId } = req.params;
    const { limit = 50, includeActive = true } = req.query;

    const handoffs = await prisma.equipmentHandoff.findMany({
      where: {
        driverId,
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

    res.json(handoffs);
  } catch (err) {
    console.error('[GET /api/equipment/history/driver/:driverId] Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// 4. GET equipment history for a specific equipment unit
// ──────────────────────────────────────────────────────────────
router.get('/history/equipment/:equipmentId', async (req, res) => {
  try {
    const { equipmentId } = req.params;
    const { limit = 50 } = req.query;

    const handoffs = await prisma.equipmentHandoff.findMany({
      where: {
        OR: [
          { equipmentId },
          { replacedEquipmentId: equipmentId },
          { trailerId: equipmentId },
        ],
      },
      orderBy: { checkOutTime: 'desc' },
      take: parseInt(limit),
      include: {
        driver: {
          select: { name: true, employeeId: true, photo: true },
        },
        equipment: true,
        trailer: true,
        dispatcher: {
          select: { name: true, employeeId: true },
        },
      },
    });

    res.json(handoffs);
  } catch (err) {
    console.error('[GET /api/equipment/history/equipment/:equipmentId] Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// 5. POST swap equipment mid-shift
// ──────────────────────────────────────────────────────────────
router.post('/:id/swap', async (req, res) => {
  console.log('[POST /api/equipment/:id/swap] Called with ID:', req.params.id);
  console.log('[POST /api/equipment/:id/swap] Body:', JSON.stringify(req.body, null, 2));

  try {
    const { 
      driverId, 
      newEquipmentId,
      trailerId,
      reason = 'DRIVER_REQUEST',
      reasonNote,
      dispatcherId,
    } = req.body;

    if (!driverId) {
      return res.status(400).json({ message: 'driverId is required' });
    }

    if (!newEquipmentId) {
      return res.status(400).json({ message: 'newEquipmentId is required' });
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const activeHandoff = await prisma.equipmentHandoff.findFirst({
      where: {
        driverId,
        isActive: true,
        equipmentId: req.params.id,
      },
    });

    if (!activeHandoff) {
      return res.status(400).json({ 
        message: 'Driver has no active handoff for this equipment' 
      });
    }

    const newEquipment = await prisma.equipment.findUnique({
      where: { id: newEquipmentId },
    });

    if (!newEquipment) {
      return res.status(404).json({ message: 'New equipment not found' });
    }

    if (newEquipment.assignedDriverId) {
      return res.status(400).json({ 
        message: 'New equipment is already assigned to another driver' 
      });
    }

    if (newEquipment.availableAt && new Date(newEquipment.availableAt) > new Date()) {
      return res.status(400).json({ 
        message: 'New equipment is in cooldown and not yet available' 
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Return old equipment
      await tx.equipment.update({
        where: { id: req.params.id },
        data: { assignedDriverId: null },
      });

      // 2. Close old handoff with SWAP action
      await tx.equipmentHandoff.update({
        where: { id: activeHandoff.id },
        data: {
          isActive: false,
          returnTime: new Date(),
          action: 'SWAP',
          reason: reason,
          reasonNote: reasonNote || 'Equipment swapped mid-shift',
          replacedEquipmentId: newEquipmentId,
        },
      });

      // 3. Assign new equipment
      await tx.equipment.update({
        where: { id: newEquipmentId },
        data: { 
          assignedDriverId: driverId,
          availableAt: null,
        },
      });

      // 4. Create new handoff
      await tx.equipmentHandoff.create({
        data: {
          driverId,
          equipmentId: newEquipmentId,
          action: 'SWAP',
          reason: reason,
          reasonNote: reasonNote || 'Equipment swapped mid-shift',
          checkOutTime: new Date(),
          isActive: true,
          dispatcherId: dispatcherId || null,
          ...(trailerId && { trailerId }),
          replacedEquipmentId: req.params.id,
          shiftStartTime: activeHandoff.shiftStartTime,
          shiftEndTime: activeHandoff.shiftEndTime,
        },
      });

      // 5. Handle trailer if provided
      if (trailerId) {
        const oldTrailerHandoff = await tx.equipmentHandoff.findFirst({
          where: {
            driverId,
            trailerId: { not: null },
            isActive: true,
          },
        });

        if (oldTrailerHandoff) {
          await tx.equipmentHandoff.update({
            where: { id: oldTrailerHandoff.id },
            data: {
              isActive: false,
              returnTime: new Date(),
            },
          });
        }

        await tx.equipment.update({
          where: { id: trailerId },
          data: { assignedDriverId: driverId },
        });

        await tx.equipmentHandoff.create({
          data: {
            driverId,
            equipmentId: trailerId,
            action: 'SWAP',
            reason: reason,
            reasonNote: reasonNote || 'Trailer swapped mid-shift',
            checkOutTime: new Date(),
            isActive: true,
            dispatcherId: dispatcherId || null,
            shiftStartTime: activeHandoff.shiftStartTime,
            shiftEndTime: activeHandoff.shiftEndTime,
          },
        });
      }

      return await tx.equipment.findUnique({
        where: { id: newEquipmentId },
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
    });

    console.log('[POST /api/equipment/:id/swap] Swap completed successfully');
    res.json(result);
  } catch (err) {
    console.error('[POST /api/equipment/:id/swap] Error:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    res.status(500).json({ message: err.message || 'Failed to swap equipment' });
  }
});

// ──────────────────────────────────────────────────────────────
// 6. PATCH assign/release with full history logging
// ──────────────────────────────────────────────────────────────
router.patch('/:id/assign', async (req, res) => {
  try {
    const { 
      driverId, 
      release, 
      cooldownMinutes,
      action = 'CHECKOUT',
      reason = 'SHIFT_START',
      reasonNote,
      dispatcherId,
      trailerId,
      odometerStart,
      fuelLevelStart,
    } = req.body;

    if (release) {
      // Find active handoff (may not exist for older assignments made before handoff logging)
      const activeHandoff = await prisma.equipmentHandoff.findFirst({
        where: {
          equipmentId: req.params.id,
          isActive: true,
        },
        orderBy: { checkOutTime: 'desc' },
      });

      // Always clear the assignment on the equipment
      await prisma.equipment.update({
        where: { id: req.params.id },
        data: {
          assignedDriverId: null,
          availableAt: cooldownMinutes > 0
            ? new Date(Date.now() + cooldownMinutes * 60 * 1000)
            : null,
        },
      });

      // Close handoff only if one exists — do NOT error when missing
      if (activeHandoff) {
        await prisma.equipmentHandoff.update({
          where: { id: activeHandoff.id },
          data: {
            isActive: false,
            returnTime: new Date(),
            action: 'RETURN',
            reason: reason || 'SHIFT_END',
            reasonNote: reasonNote || 'End of shift',
            ...(req.body.odometerEnd && { odometerEnd: parseInt(req.body.odometerEnd) }),
            ...(req.body.fuelLevelEnd && { fuelLevelEnd: req.body.fuelLevelEnd }),
            ...(req.body.postTripNotes && {
              postTripNotes: req.body.postTripNotes,
              postTripCompleted: true,
            }),
            ...(req.body.damageDescription && {
              damageReported: true,
              damageDescription: req.body.damageDescription,
            }),
          },
        });
      }

    } else {
      // Checkout
      if (!driverId) {
        return res.status(400).json({ message: 'driverId is required' });
      }

      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
      });

      if (!driver) {
        return res.status(404).json({ message: 'Driver not found' });
      }

      // Update equipment
      await prisma.equipment.update({
        where: { id: req.params.id },
        data: { 
          assignedDriverId: driverId, 
          availableAt: null,
        },
      });

      // Create handoff
      await prisma.equipmentHandoff.create({
        data: {
          driverId,
          equipmentId: req.params.id,
          action: action || 'CHECKOUT',
          reason: reason || 'SHIFT_START',
          reasonNote: reasonNote || '',
          checkOutTime: new Date(),
          isActive: true,
          ...(dispatcherId && { dispatcherId }),
          ...(trailerId && { trailerId }),
          ...(odometerStart && { odometerStart: parseInt(odometerStart) }),
          ...(fuelLevelStart && { fuelLevelStart }),
          shiftStartTime: driver.shiftStartTime || new Date(),
          shiftEndTime: driver.shiftEndTime || null,
        },
      });

      // Handle trailer
      if (trailerId) {
        await prisma.equipment.update({
          where: { id: trailerId },
          data: { assignedDriverId: driverId },
        });

        await prisma.equipmentHandoff.create({
          data: {
            driverId,
            equipmentId: trailerId,
            action: 'CHECKOUT',
            reason: reason || 'SHIFT_START',
            reasonNote: reasonNote || 'Trailer assigned with truck',
            checkOutTime: new Date(),
            isActive: true,
            ...(dispatcherId && { dispatcherId }),
          },
        });
      }
    }

    // Get updated equipment
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

    res.json(item);
  } catch (err) {
    console.error('[PATCH /api/equipment/:id/assign] Error:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    res.status(400).json({ message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// 7. GET single unit
// ──────────────────────────────────────────────────────────────
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
        handoffs: {
          orderBy: { checkOutTime: 'desc' },
          take: 10,
          include: {
            driver: {
              select: {
                id: true,
                name: true,
                employeeId: true,
              },
            },
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

// ──────────────────────────────────────────────────────────────
// 8. PUT update unit
// ──────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const update = { ...req.body };
    Object.keys(update).forEach((key) => {
      if (update[key] === '' || update[key] === undefined) {
        delete update[key];
      }
    });

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

// ──────────────────────────────────────────────────────────────
// 9. DELETE unit
// ──────────────────────────────────────────────────────────────
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
