const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

const SHIPMENT_INCLUDE = {
  airline: {
    select: { id: true, name: true, code: true, awbPrefix: true }
  },
  warehouse: {
    select: { id: true, name: true }
  }
};

// Attaches awbDisplay + this-trip's pieces/weight allocation to each shipment on a trip.
// If a shipment has no TripShipmentSplit row for this trip, it's assumed to carry the
// full pieces/weight of the Shipment record (i.e. it hasn't been split across trips).
function enrichTripShipments(shipments, splits) {
  const splitMap = new Map((splits || []).map(s => [s.shipmentId, s]));
  return (shipments || []).map(s => {
    const split = splitMap.get(s.id);
    return {
      ...s,
      awbDisplay:
        s.airline?.awbPrefix && s.airwaybillNumber
          ? `${s.airline.awbPrefix}-${s.airwaybillNumber}`
          : s.airwaybillNumber || null,
      allocation: split
        ? { pieces: split.pieces, weight: split.weight, isPartial: true }
        : { pieces: s.pieces, weight: s.weight, isPartial: false }
    };
  });
}

// Helper to populate trip relations (uses both relation + scalar shipmentIds as fallback)
async function populateTrip(trip) {
  if (!trip) return null;

  const populated = await prisma.trip.findUnique({
    where: { id: trip.id },
    include: {
      driver: {
        select: { id: true, name: true, phone: true, status: true }
      },
      truck: {
        select: { id: true, unitNumber: true, equipmentType: true, category: true, status: true }
      },
      trailer: {
        select: {
          id: true,
          unitNumber: true,
          equipmentType: true,
          category: true,
          status: true,
          capacityLbs: true
        }
      },
      shipments: { include: SHIPMENT_INCLUDE },
      shipmentSplits: true,
      parentTrip: {
        select: { id: true, tripNumber: true, status: true }
      },
      splitTrips: {
        select: {
          id: true,
          tripNumber: true,
          status: true,
          driver: { select: { id: true, name: true, phone: true } },
          truck: { select: { id: true, unitNumber: true } },
          trailer: { select: { id: true, unitNumber: true } }
        }
      }
    }
  });

  if (!populated) return null;

  // Fallback: if relation is empty but scalar shipmentIds has values, load them manually
  if (
    (!populated.shipments || populated.shipments.length === 0) &&
    populated.shipmentIds &&
    populated.shipmentIds.length > 0
  ) {
    populated.shipments = await prisma.shipment.findMany({
      where: { id: { in: populated.shipmentIds } },
      include: SHIPMENT_INCLUDE
    });
  }

  populated.shipments = enrichTripShipments(populated.shipments, populated.shipmentSplits);

  return populated;
}

async function generateTripNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.trip.count();
  const num = String(count + 1).padStart(4, '0');
  return `TRIP-${year}-${num}`;
}

async function equipmentIsBusy(equipmentId, excludeTripId) {
  const filter = {
    status: { in: ['Scheduled', 'En Route'] },
    OR: [{ truckId: equipmentId }, { trailerId: equipmentId }]
  };
  if (excludeTripId) {
    filter.id = { not: excludeTripId };
  }
  const conflict = await prisma.trip.findFirst({ where: filter });
  return !!conflict;
}

// GET all trips
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.runType) filter.runType = req.query.runType;

    const trips = await prisma.trip.findMany({
      where: filter,
      include: {
        driver: {
          select: { id: true, name: true, phone: true, status: true }
        },
        truck: {
          select: { id: true, unitNumber: true, equipmentType: true, category: true, status: true }
        },
        trailer: {
          select: {
            id: true,
            unitNumber: true,
            equipmentType: true,
            category: true,
            status: true,
            capacityLbs: true
          }
        },
        shipments: { include: SHIPMENT_INCLUDE },
        shipmentSplits: true,
        parentTrip: {
          select: { id: true, tripNumber: true, status: true }
        },
        splitTrips: {
          select: {
            id: true,
            tripNumber: true,
            status: true,
            driver: { select: { id: true, name: true, phone: true } },
            truck: { select: { id: true, unitNumber: true } },
            trailer: { select: { id: true, unitNumber: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Enrich + fallback for any trips that only have scalar shipmentIds
    const enriched = await Promise.all(
      trips.map(async (trip) => {
        if (
          (!trip.shipments || trip.shipments.length === 0) &&
          trip.shipmentIds &&
          trip.shipmentIds.length > 0
        ) {
          trip.shipments = await prisma.shipment.findMany({
            where: { id: { in: trip.shipmentIds } },
            include: SHIPMENT_INCLUDE
          });
        }
        trip.shipments = enrichTripShipments(trip.shipments, trip.shipmentSplits);
        return trip;
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET single trip
router.get('/:id', async (req, res) => {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.id },
      include: {
        driver: {
          select: { id: true, name: true, phone: true, status: true }
        },
        truck: {
          select: { id: true, unitNumber: true, equipmentType: true, category: true, status: true }
        },
        trailer: {
          select: {
            id: true,
            unitNumber: true,
            equipmentType: true,
            category: true,
            status: true,
            capacityLbs: true
          }
        },
        shipments: { include: SHIPMENT_INCLUDE },
        shipmentSplits: true,
        parentTrip: {
          select: { id: true, tripNumber: true, status: true }
        },
        splitTrips: {
          select: {
            id: true,
            tripNumber: true,
            status: true,
            driver: { select: { id: true, name: true, phone: true } },
            truck: { select: { id: true, unitNumber: true } },
            trailer: { select: { id: true, unitNumber: true } }
          }
        }
      }
    });
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    if (
      (!trip.shipments || trip.shipments.length === 0) &&
      trip.shipmentIds &&
      trip.shipmentIds.length > 0
    ) {
      trip.shipments = await prisma.shipment.findMany({
        where: { id: { in: trip.shipmentIds } },
        include: SHIPMENT_INCLUDE
      });
    }
    trip.shipments = enrichTripShipments(trip.shipments, trip.shipmentSplits);

    res.json(trip);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create trip
router.post('/', async (req, res) => {
  try {
    const {
      driverId,
      truckId,
      trailerId,
      shipmentIds,
      notes,
      runType,
      plannedDepartureTime,
      expectedCompletionTime,
      doorNumber
    } = req.body;

    if (!driverId) return res.status(400).json({ message: 'Driver is required' });
    if (!truckId) return res.status(400).json({ message: 'Truck / power unit is required' });

    // Check driver availability
    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    if (driver.status === 'On Trip') {
      return res.status(409).json({ message: `Driver ${driver.name} is already on a trip` });
    }

    // Check truck
    const truck = await prisma.equipment.findUnique({ where: { id: truckId } });
    if (!truck) return res.status(404).json({ message: 'Truck not found' });
    if (truck.status === 'Out of Service') {
      return res.status(409).json({ message: `Truck ${truck.unitNumber} is out of service` });
    }
    if (await equipmentIsBusy(truckId)) {
      return res
        .status(409)
        .json({ message: `Truck ${truck.unitNumber} is already committed to another active run` });
    }

    // Check trailer (optional)
    if (trailerId) {
      const trailer = await prisma.equipment.findUnique({ where: { id: trailerId } });
      if (!trailer) return res.status(404).json({ message: 'Trailer not found' });
      if (trailer.status === 'Out of Service') {
        return res
          .status(409)
          .json({ message: `Trailer ${trailer.unitNumber} is out of service` });
      }
      if (await equipmentIsBusy(trailerId)) {
        return res
          .status(409)
          .json({ message: `Trailer ${trailer.unitNumber} is already committed to another active run` });
      }
    }

    // Check shipments
    let resolvedRunType = runType;
    if (shipmentIds && shipmentIds.length > 0) {
      const manifest = await prisma.shipment.findMany({
        where: { id: { in: shipmentIds } }
      });

      if (manifest.length !== shipmentIds.length) {
        return res.status(404).json({ message: 'One or more cargo shipments could not be found' });
      }

      const unavailable = manifest.find(s => s.status !== 'Pending');
      if (unavailable) {
        return res.status(409).json({
          message: `AWB ${unavailable.airwaybillNumber || 'unknown'} is already ${unavailable.status.toLowerCase()} and cannot be assigned again`
        });
      }

      const types = new Set(manifest.map(s => s.type));
      if (types.size > 1) {
        return res.status(400).json({ message: 'A single run cannot mix Import and Export cargo' });
      }

      const manifestType = [...types][0];
      if (resolvedRunType && resolvedRunType !== manifestType) {
        return res.status(400).json({
          message: `Selected run type is ${resolvedRunType} but the manifest is all ${manifestType}`
        });
      }
      resolvedRunType = manifestType;
    }

    // Export runs should have a door number (1–30)
    if (resolvedRunType === 'Export' && doorNumber) {
      const door = String(doorNumber).trim();
      const doorNum = parseInt(door, 10);
      if (Number.isNaN(doorNum) || doorNum < 1 || doorNum > 30) {
        return res.status(400).json({ message: 'Door number must be between 1 and 30' });
      }
    }

    const tripNumber = await generateTripNumber();

    const trip = await prisma.$transaction(async (tx) => {
      const createdTrip = await tx.trip.create({
        data: {
          tripNumber,
          runType: resolvedRunType,
          driverId,
          truckId,
          trailerId: trailerId || undefined,
          shipmentIds: shipmentIds || [],
          ...(shipmentIds && shipmentIds.length > 0
            ? { shipments: { connect: shipmentIds.map(id => ({ id })) } }
            : {}),
          plannedDepartureTime: plannedDepartureTime ? new Date(plannedDepartureTime) : undefined,
          expectedCompletionTime: expectedCompletionTime
            ? new Date(expectedCompletionTime)
            : undefined,
          notes: notes || '',
          status: 'Scheduled'
        }
      });

      // Update driver status
      await tx.driver.update({
        where: { id: driverId },
        data: { status: 'On Trip' }
      });

      // Update shipment statuses (+ door number for exports)
      if (shipmentIds && shipmentIds.length > 0) {
        const shipmentUpdate = { status: 'Assigned' };
        if (resolvedRunType === 'Export' && doorNumber) {
          shipmentUpdate.doorNumber = String(doorNumber);
        }
        await tx.shipment.updateMany({
          where: { id: { in: shipmentIds } },
          data: shipmentUpdate
        });
      }

      return createdTrip;
    });

    const populated = await populateTrip(trip);
    res.status(201).json(populated);
  } catch (err) {
    console.error('[POST /api/dispatch]', err);
    res.status(400).json({ message: err.message });
  }
});

// POST add a backup driver/truck to an existing run
//
// Body:
//   driverId, truckId, trailerId  — same shape as POST /  (the backup crew)
//   plannedDepartureTime, expectedCompletionTime, notes — optional, defaults to parent's
//   allocations: [{ shipmentId, mode: 'move' | 'split', pieces, weight }]
//     - 'move'  → the whole AWB leaves the parent run and goes to the backup, whole.
//     - 'split' → only `pieces` (and proportional/explicit `weight`) leave the parent;
//                 the rest of that AWB stays on the parent run.
//
// Creates a new child Trip linked to the parent via parentTripId, and returns
// both the updated parent and the newly created backup trip.
router.post('/:id/backups', async (req, res) => {
  try {
    const parentId = req.params.id;
    const parentTrip = await prisma.trip.findUnique({ where: { id: parentId } });
    if (!parentTrip) return res.status(404).json({ message: 'Trip not found' });
    if (!['Scheduled', 'En Route'].includes(parentTrip.status)) {
      return res
        .status(400)
        .json({ message: 'Backups can only be added to a Scheduled or En Route run' });
    }

    const {
      driverId,
      truckId,
      trailerId,
      allocations,
      plannedDepartureTime,
      expectedCompletionTime,
      notes
    } = req.body;

    if (!driverId) return res.status(400).json({ message: 'Backup driver is required' });
    if (!truckId) return res.status(400).json({ message: 'Backup power unit is required' });
    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res
        .status(400)
        .json({ message: 'Select at least one cargo permit to move to the backup' });
    }

    // Driver availability
    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) return res.status(404).json({ message: 'Backup driver not found' });
    if (driver.status === 'On Trip') {
      return res.status(409).json({ message: `Driver ${driver.name} is already on a trip` });
    }

    // Truck availability
    const truck = await prisma.equipment.findUnique({ where: { id: truckId } });
    if (!truck) return res.status(404).json({ message: 'Backup truck not found' });
    if (truck.status === 'Out of Service') {
      return res.status(409).json({ message: `Truck ${truck.unitNumber} is out of service` });
    }
    if (await equipmentIsBusy(truckId)) {
      return res
        .status(409)
        .json({ message: `Truck ${truck.unitNumber} is already committed to another active run` });
    }

    // Trailer availability (optional)
    if (trailerId) {
      const trailer = await prisma.equipment.findUnique({ where: { id: trailerId } });
      if (!trailer) return res.status(404).json({ message: 'Backup trailer not found' });
      if (trailer.status === 'Out of Service') {
        return res
          .status(409)
          .json({ message: `Trailer ${trailer.unitNumber} is out of service` });
      }
      if (await equipmentIsBusy(trailerId)) {
        return res
          .status(409)
          .json({ message: `Trailer ${trailer.unitNumber} is already committed to another active run` });
      }
    }

    const parentShipmentIds = parentTrip.shipmentIds || [];
    for (const a of allocations) {
      if (!a?.shipmentId || !parentShipmentIds.includes(a.shipmentId)) {
        return res
          .status(400)
          .json({ message: `Permit ${a?.shipmentId || ''} is not on this run` });
      }
      if (a.mode === 'split' && (!Number.isFinite(Number(a.pieces)) || Number(a.pieces) <= 0)) {
        return res
          .status(400)
          .json({ message: 'Split quantity must be a positive number of pieces' });
      }
      if (a.mode !== 'move' && a.mode !== 'split') {
        return res.status(400).json({ message: `Unknown allocation mode "${a.mode}"` });
      }
    }

    const tripNumber = await generateTripNumber();

    const backupTrip = await prisma.$transaction(async (tx) => {
      const existingParentSplits = await tx.tripShipmentSplit.findMany({
        where: { tripId: parentId, shipmentId: { in: allocations.map(a => a.shipmentId) } }
      });
      const parentSplitMap = new Map(existingParentSplits.map(s => [s.shipmentId, s]));

      const childShipmentIds = [];
      const childSplitRows = [];
      const parentRemoveIds = [];
      const parentSplitUpdates = [];

      for (const a of allocations) {
        const shipment = await tx.shipment.findUnique({ where: { id: a.shipmentId } });
        if (!shipment) throw new Error(`Cargo permit ${a.shipmentId} not found`);

        const existingParentSplit = parentSplitMap.get(a.shipmentId);
        const parentHeldPieces = existingParentSplit ? existingParentSplit.pieces : shipment.pieces;
        const parentHeldWeight = existingParentSplit ? existingParentSplit.weight : shipment.weight;

        if (a.mode === 'move') {
          // Whole AWB leaves the parent run and goes to the backup, intact.
          parentRemoveIds.push(a.shipmentId);
          childShipmentIds.push(a.shipmentId);
        } else {
          // Partial split — subtract the requested pieces/weight from what the parent
          // currently holds; the remainder stays on the parent run.
          const reqPieces = Number(a.pieces);
          const reqWeight =
            Number.isFinite(Number(a.weight)) && Number(a.weight) > 0
              ? Number(a.weight)
              : Math.round((reqPieces / parentHeldPieces) * parentHeldWeight * 100) / 100;

          if (reqPieces >= parentHeldPieces) {
            throw new Error(
              `Cannot split ${reqPieces} pcs off ${shipment.airwaybillNumber || 'this AWB'} — only ${parentHeldPieces} pcs remain on the parent run. Use "move whole permit" instead.`
            );
          }

          const remainingPieces = parentHeldPieces - reqPieces;
          const remainingWeight = Math.max(0, Math.round((parentHeldWeight - reqWeight) * 100) / 100);

          parentSplitUpdates.push({
            shipmentId: a.shipmentId,
            pieces: remainingPieces,
            weight: remainingWeight
          });

          childShipmentIds.push(a.shipmentId);
          childSplitRows.push({ shipmentId: a.shipmentId, pieces: reqPieces, weight: reqWeight });
        }
      }

      const createdBackup = await tx.trip.create({
        data: {
          tripNumber,
          runType: parentTrip.runType,
          driverId,
          truckId,
          trailerId: trailerId || undefined,
          parentTripId: parentId,
          shipmentIds: childShipmentIds,
          shipments: { connect: childShipmentIds.map(id => ({ id })) },
          plannedDepartureTime: plannedDepartureTime
            ? new Date(plannedDepartureTime)
            : parentTrip.plannedDepartureTime,
          expectedCompletionTime: expectedCompletionTime
            ? new Date(expectedCompletionTime)
            : parentTrip.expectedCompletionTime,
          notes: notes || `Backup for ${parentTrip.tripNumber}`,
          status: 'Scheduled'
        }
      });

      for (const row of childSplitRows) {
        await tx.tripShipmentSplit.upsert({
          where: { tripId_shipmentId: { tripId: createdBackup.id, shipmentId: row.shipmentId } },
          create: { tripId: createdBackup.id, shipmentId: row.shipmentId, pieces: row.pieces, weight: row.weight },
          update: { pieces: row.pieces, weight: row.weight }
        });
      }

      for (const update of parentSplitUpdates) {
        await tx.tripShipmentSplit.upsert({
          where: { tripId_shipmentId: { tripId: parentId, shipmentId: update.shipmentId } },
          create: { tripId: parentId, shipmentId: update.shipmentId, pieces: update.pieces, weight: update.weight },
          update: { pieces: update.pieces, weight: update.weight }
        });
      }

      if (parentRemoveIds.length > 0) {
        const newParentShipmentIds = parentShipmentIds.filter(id => !parentRemoveIds.includes(id));
        await tx.trip.update({
          where: { id: parentId },
          data: {
            shipmentIds: newParentShipmentIds,
            shipments: { disconnect: parentRemoveIds.map(id => ({ id })) }
          }
        });
        await tx.tripShipmentSplit.deleteMany({
          where: { tripId: parentId, shipmentId: { in: parentRemoveIds } }
        });
      }

      await tx.driver.update({ where: { id: driverId }, data: { status: 'On Trip' } });

      const targetStatus = parentTrip.status === 'En Route' ? 'In Transit' : 'Assigned';
      await tx.shipment.updateMany({
        where: { id: { in: allocations.map(a => a.shipmentId) } },
        data: { status: targetStatus }
      });

      return createdBackup;
    });

    const populatedParent = await populateTrip({ id: parentId });
    const populatedBackup = await populateTrip(backupTrip);

    res.status(201).json({ parentTrip: populatedParent, backupTrip: populatedBackup });
  } catch (err) {
    console.error('[POST /api/dispatch/:id/backups]', err);
    res.status(400).json({ message: err.message });
  }
});

// PUT update trip
router.put('/:id', async (req, res) => {
  try {
    const tripId = req.params.id;
    const existingTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { shipments: true }
    });

    if (!existingTrip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const {
      driverId,
      truckId,
      trailerId,
      shipmentIds,
      notes,
      runType,
      plannedDepartureTime,
      expectedCompletionTime,
      doorNumber
    } = req.body;

    const oldDriverId = existingTrip.driverId;
    const newDriverId = driverId !== undefined ? driverId : oldDriverId;

    // Check driver if changed
    if (newDriverId && newDriverId !== oldDriverId) {
      const newDriver = await prisma.driver.findUnique({ where: { id: newDriverId } });
      if (!newDriver) return res.status(404).json({ message: 'New driver not found' });
      if (newDriver.status === 'On Trip') {
        return res.status(409).json({ message: `Driver ${newDriver.name} is already on another trip` });
      }
    }

    const oldShipmentIds = existingTrip.shipmentIds || [];
    const newShipmentIds = shipmentIds !== undefined ? shipmentIds : oldShipmentIds;

    const removedShipmentIds = oldShipmentIds.filter(id => !newShipmentIds.includes(id));
    const addedShipmentIds = newShipmentIds.filter(id => !oldShipmentIds.includes(id));

    const updatedTrip = await prisma.$transaction(async (tx) => {
      // Driver status changes
      if (newDriverId !== oldDriverId) {
        if (oldDriverId && existingTrip.status !== 'Completed') {
          await tx.driver.update({
            where: { id: oldDriverId },
            data: { status: 'Available' }
          });
        }
        if (newDriverId && existingTrip.status !== 'Completed') {
          await tx.driver.update({
            where: { id: newDriverId },
            data: { status: 'On Trip' }
          });
        }
      }

      // Shipment status changes: removed shipments -> Pending
      if (removedShipmentIds.length > 0) {
        await tx.shipment.updateMany({
          where: { id: { in: removedShipmentIds } },
          data: { status: 'Pending', doorNumber: null }
        });
        // A removed shipment is no longer on this trip at all, so any partial
        // allocation record for it here is stale — drop it. (If it's still
        // split onto a backup trip, that side is untouched by this edit.)
        await tx.tripShipmentSplit.deleteMany({
          where: { tripId, shipmentId: { in: removedShipmentIds } }
        });
      }

      // Shipment status changes: added shipments -> Assigned / In Transit
      if (addedShipmentIds.length > 0) {
        const targetStatus = existingTrip.status === 'En Route' ? 'In Transit' : 'Assigned';
        const shipmentUpdate = { status: targetStatus };
        if ((runType || existingTrip.runType) === 'Export' && doorNumber) {
          shipmentUpdate.doorNumber = String(doorNumber);
        }
        await tx.shipment.updateMany({
          where: { id: { in: addedShipmentIds } },
          data: shipmentUpdate
        });
      }

      // Update the Trip record
      const updateData = {
        ...(driverId !== undefined ? { driverId } : {}),
        ...(truckId !== undefined ? { truckId } : {}),
        ...(trailerId !== undefined ? { trailerId: trailerId || null } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(runType !== undefined ? { runType } : {}),
        ...(plannedDepartureTime !== undefined ? { plannedDepartureTime: plannedDepartureTime ? new Date(plannedDepartureTime) : null } : {}),
        ...(expectedCompletionTime !== undefined ? { expectedCompletionTime: expectedCompletionTime ? new Date(expectedCompletionTime) : null } : {}),
        shipmentIds: newShipmentIds,
        shipments: {
          set: newShipmentIds.map(id => ({ id }))
        }
      };

      return tx.trip.update({
        where: { id: tripId },
        data: updateData
      });
    });

    const populated = await populateTrip(updatedTrip);
    res.json(populated);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Trip not found' });
    }
    console.error('[PUT /api/dispatch/:id]', err);
    res.status(400).json({ message: err.message });
  }
});

// PATCH start trip
router.patch('/:id/start', async (req, res) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    if (trip.status !== 'Scheduled') {
      return res.status(400).json({ message: 'Trip is not in Scheduled status' });
    }

    const startTime = req.body.startTime ? new Date(req.body.startTime) : new Date();

    const updatedTrip = await prisma.$transaction(async (tx) => {
      const result = await tx.trip.update({
        where: { id: req.params.id },
        data: {
          startTime,
          status: 'En Route'
        }
      });

      if (trip.shipmentIds && trip.shipmentIds.length > 0) {
        await tx.shipment.updateMany({
          where: { id: { in: trip.shipmentIds } },
          data: { status: 'In Transit' }
        });
      }

      return result;
    });

    const populated = await populateTrip(updatedTrip);
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH finish trip
router.patch('/:id/finish', async (req, res) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    if (trip.status !== 'En Route') {
      return res.status(400).json({ message: 'Trip is not En Route' });
    }

    const finishTime = req.body.finishTime ? new Date(req.body.finishTime) : new Date();

    const updatedTrip = await prisma.$transaction(async (tx) => {
      const result = await tx.trip.update({
        where: { id: req.params.id },
        data: {
          finishTime,
          status: 'Completed'
        }
      });

      if (trip.driverId) {
        await tx.driver.update({
          where: { id: trip.driverId },
          data: { status: 'Available' }
        });
      }

      if (trip.shipmentIds && trip.shipmentIds.length > 0) {
        await tx.shipment.updateMany({
          where: { id: { in: trip.shipmentIds } },
          data: { status: 'Completed' }
        });
      }

      return result;
    });

    const populated = await populateTrip(updatedTrip);
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE / Cancel trip
router.delete('/:id', async (req, res) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    await prisma.$transaction(async (tx) => {
      if (trip.status !== 'Completed' && trip.driverId) {
        await tx.driver.update({
          where: { id: trip.driverId },
          data: { status: 'Available' }
        });
      }

      if (trip.status !== 'Completed' && trip.shipmentIds && trip.shipmentIds.length > 0) {
        if (trip.parentTripId) {
          // This is a backup trip being cancelled — its cargo already has a
          // home (the parent run), so merge it back instead of dropping to
          // Pending. This is the "backup fell through, original truck takes
          // it all after all" case.
          const parent = await tx.trip.findUnique({ where: { id: trip.parentTripId } });
          if (parent) {
            const childSplits = await tx.tripShipmentSplit.findMany({
              where: { tripId: trip.id }
            });
            const childSplitMap = new Map(childSplits.map(s => [s.shipmentId, s]));

            const mergedShipmentIds = Array.from(
              new Set([...(parent.shipmentIds || []), ...trip.shipmentIds])
            );
            await tx.trip.update({
              where: { id: parent.id },
              data: {
                shipmentIds: mergedShipmentIds,
                shipments: { connect: trip.shipmentIds.map(id => ({ id })) }
              }
            });

            for (const shipmentId of trip.shipmentIds) {
              const childSplit = childSplitMap.get(shipmentId);
              if (!childSplit) continue; // was a full "move" — parent didn't hold any of it

              const shipment = await tx.shipment.findUnique({ where: { id: shipmentId } });
              const parentSplit = await tx.tripShipmentSplit.findUnique({
                where: { tripId_shipmentId: { tripId: parent.id, shipmentId } }
              });
              const parentPieces = parentSplit ? parentSplit.pieces : shipment.pieces;
              const parentWeight = parentSplit ? parentSplit.weight : shipment.weight;
              const mergedPieces = parentPieces + childSplit.pieces;
              const mergedWeight = Math.round((parentWeight + childSplit.weight) * 100) / 100;

              if (mergedPieces >= shipment.pieces) {
                // Fully reunited on the parent — no partial record needed anymore.
                await tx.tripShipmentSplit.deleteMany({
                  where: { tripId: parent.id, shipmentId }
                });
              } else {
                await tx.tripShipmentSplit.upsert({
                  where: { tripId_shipmentId: { tripId: parent.id, shipmentId } },
                  create: { tripId: parent.id, shipmentId, pieces: mergedPieces, weight: mergedWeight },
                  update: { pieces: mergedPieces, weight: mergedWeight }
                });
              }
            }
          } else {
            // Parent no longer exists — fall back to releasing cargo to Pending
            await tx.shipment.updateMany({
              where: { id: { in: trip.shipmentIds } },
              data: { status: 'Pending', doorNumber: null }
            });
          }
        } else {
          await tx.shipment.updateMany({
            where: { id: { in: trip.shipmentIds } },
            data: { status: 'Pending', doorNumber: null }
          });
        }
      }

      await tx.tripShipmentSplit.deleteMany({ where: { tripId: trip.id } });
      await tx.trip.delete({ where: { id: req.params.id } });
    });

    res.json({ message: 'Trip cancelled and deleted successfully' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Trip not found' });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
