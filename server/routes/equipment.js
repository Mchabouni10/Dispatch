// routes/equipment.js
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { checkoutEquipment, releaseEquipment } = require('../lib/equipmentHandoff');

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

    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const activeHandoff = await prisma.equipmentHandoff.findFirst({
      where: { driverId, isActive: true, equipmentId: req.params.id },
    });
    if (!activeHandoff) {
      return res.status(400).json({
        message: 'Driver has no active handoff for this equipment',
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
        message: 'New equipment is already assigned to another driver',
      });
    }
    if (newEquipment.availableAt && new Date(newEquipment.availableAt) > new Date()) {
      return res.status(400).json({
        message: 'New equipment is in cooldown and not yet available',
      });
    }

    let newTrailer = null;
    if (trailerId) {
      newTrailer = await prisma.equipment.findUnique({ where: { id: trailerId } });
      if (!newTrailer) {
        return res.status(404).json({ message: 'Trailer not found' });
      }
      if (newTrailer.assignedDriverId && newTrailer.assignedDriverId !== driverId) {
        return res.status(400).json({
          message: 'Trailer is already assigned to another driver',
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Release the old truck (closes its handoff, clears assignment — no cooldown, it's an active swap not a shift end)
      await releaseEquipment(tx, {
        equipmentId: req.params.id,
        cooldownMinutes: 0,
        reason,
        reasonNote: reasonNote || 'Equipment swapped mid-shift',
      });

      // 2. Check out the new truck to the driver
      await checkoutEquipment(tx, {
        equipmentId: newEquipmentId,
        driverId,
        action: 'SWAP',
        reason,
        reasonNote: reasonNote || 'Equipment swapped mid-shift',
        dispatcherId,
        trailerId: trailerId || undefined,
        shiftStartTime: activeHandoff.shiftStartTime,
        shiftEndTime: activeHandoff.shiftEndTime,
      });

      // 3. Trailer swap, if a different trailer than what's currently held was provided
      if (trailerId && !(newTrailer && newTrailer.assignedDriverId === driverId)) {
        const oldTrailerHandoff = await tx.equipmentHandoff.findFirst({
          where: { driverId, trailerId: { not: null }, isActive: true },
        });
        if (oldTrailerHandoff && oldTrailerHandoff.trailerId) {
          await releaseEquipment(tx, {
            equipmentId: oldTrailerHandoff.trailerId,
            cooldownMinutes: 0,
            reason,
            reasonNote: reasonNote || 'Trailer swapped mid-shift',
          });
        }

        await checkoutEquipment(tx, {
          equipmentId: trailerId,
          driverId,
          action: 'SWAP',
          reason,
          reasonNote: reasonNote || 'Trailer swapped mid-shift',
          dispatcherId,
          shiftStartTime: activeHandoff.shiftStartTime,
          shiftEndTime: activeHandoff.shiftEndTime,
        });
      }

      return tx.equipment.findUnique({
        where: { id: newEquipmentId },
        include: {
          assignedDriver: {
            select: { id: true, name: true, photo: true, employeeId: true, status: true },
          },
        },
      });
    });

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
//
// NOTE: release now optionally accepts trailerId so end-of-shift can
// release the truck AND its paired trailer atomically — previously only
// req.params.id (the truck) was ever released, leaving trailers stuck
// "assigned" to off-duty drivers indefinitely.
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
      await prisma.$transaction(async (tx) => {
        // Capture the truck's current holder BEFORE releasing it — release
        // clears assignedDriverId, so this is the last point we can find
        // "their" trailer if the caller didn't pass trailerId explicitly.
        let trailerToRelease = trailerId;
        if (!trailerToRelease) {
          const truck = await tx.equipment.findUnique({ where: { id: req.params.id } });
          if (truck?.assignedDriverId) {
            const pairedTrailer = await tx.equipment.findFirst({
              where: { assignedDriverId: truck.assignedDriverId, category: 'Trailer' },
            });
            if (pairedTrailer) trailerToRelease = pairedTrailer.id;
          }
        }

        await releaseEquipment(tx, {
          equipmentId: req.params.id,
          cooldownMinutes: cooldownMinutes > 0 ? cooldownMinutes : 0,
          reason: reason || 'SHIFT_END',
          reasonNote: reasonNote || 'End of shift',
          odometerEnd: req.body.odometerEnd,
          fuelLevelEnd: req.body.fuelLevelEnd,
          postTripNotes: req.body.postTripNotes,
          damageDescription: req.body.damageDescription,
        });

        if (trailerToRelease) {
          await releaseEquipment(tx, {
            equipmentId: trailerToRelease,
            cooldownMinutes: cooldownMinutes > 0 ? cooldownMinutes : 0,
            reason: reason || 'SHIFT_END',
            reasonNote: reasonNote || 'End of shift (trailer released with truck)',
          });
        }
      });
    } else {
      // Checkout
      if (!driverId) {
        return res.status(400).json({ message: 'driverId is required' });
      }
      const driver = await prisma.driver.findUnique({ where: { id: driverId } });
      if (!driver) {
        return res.status(404).json({ message: 'Driver not found' });
      }
      const targetEquipment = await prisma.equipment.findUnique({ where: { id: req.params.id } });
      if (!targetEquipment) {
        return res.status(404).json({ message: 'Equipment not found' });
      }

      await prisma.$transaction(async (tx) => {
        // Guard against double-checkout: if this driver already holds a
        // DIFFERENT unit in the same category (e.g. already has a tractor
        // and is now being checked into another tractor), release the old
        // one first. Without this, the previous unit's assignedDriverId is
        // left dangling forever — the driver ends up "in use" on two units
        // at once, which the stuck-assignment check never catches because
        // the driver is still on shift and Available.
        const existingSameCategory = await tx.equipment.findFirst({
          where: {
            assignedDriverId: driverId,
            category: targetEquipment.category,
            id: { not: req.params.id },
          },
        });
        if (existingSameCategory) {
          await releaseEquipment(tx, {
            equipmentId: existingSameCategory.id,
            cooldownMinutes: 0,
            reason: reason || 'DISPATCH',
            reasonNote: 'Auto-released — driver checked into a different unit without a formal return',
          });
        }

        if (trailerId) {
          const existingTrailer = await tx.equipment.findFirst({
            where: {
              assignedDriverId: driverId,
              category: 'Trailer',
              id: { not: trailerId },
            },
          });
          if (existingTrailer) {
            await releaseEquipment(tx, {
              equipmentId: existingTrailer.id,
              cooldownMinutes: 0,
              reason: reason || 'DISPATCH',
              reasonNote: 'Auto-released — driver checked into a different trailer without a formal return',
            });
          }
        }

        await checkoutEquipment(tx, {
          equipmentId: req.params.id,
          driverId,
          action: action || 'CHECKOUT',
          reason: reason || 'SHIFT_START',
          reasonNote: reasonNote || '',
          dispatcherId,
          trailerId: trailerId || undefined,
          odometerStart,
          fuelLevelStart,
          shiftStartTime: driver.shiftStartTime || new Date(),
          shiftEndTime: driver.shiftEndTime || null,
          preTripCompleted: true,
        });

        if (trailerId) {
          await checkoutEquipment(tx, {
            equipmentId: trailerId,
            driverId,
            action: 'CHECKOUT',
            reason: reason || 'SHIFT_START',
            reasonNote: reasonNote || 'Trailer assigned with truck',
            dispatcherId,
          });
        }
      });
    }

    const item = await prisma.equipment.findUnique({
      where: { id: req.params.id },
      include: {
        assignedDriver: {
          select: { id: true, name: true, photo: true, employeeId: true, status: true },
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
          select: { id: true, name: true, photo: true, employeeId: true, status: true },
        },
        handoffs: {
          orderBy: { checkOutTime: 'desc' },
          take: 10,
          include: {
            driver: { select: { id: true, name: true, employeeId: true } },
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
    await prisma.equipment.delete({ where: { id: req.params.id } });
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
