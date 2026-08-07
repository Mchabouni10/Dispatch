const express = require('express');
const router = express.Router();
const {
  prisma,
  populateTrip,
  generateTripNumber
} = require('./dispatch.helpers');
const { checkoutEquipment } = require('../../lib/equipmentHandoff');
const { checkEquipmentEligible } = require('./tripEligibility');

// POST add a backup driver/truck to an existing run
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

    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) return res.status(404).json({ message: 'Backup driver not found' });
    if (driver.status === 'On Trip') {
      return res.status(409).json({ message: `Driver ${driver.name} is already on a trip` });
    }

    // Same assignedDriverId-aware eligibility check as primary trip creation —
    // a backup truck already checked out to a different driver is blocked.
    const truckCheck = await checkEquipmentEligible(truckId, driverId, 'Truck');
    if (!truckCheck.ok) return res.status(truckCheck.status).json({ message: truckCheck.message });

    let trailerCheck = null;
    if (trailerId) {
      trailerCheck = await checkEquipmentEligible(trailerId, driverId, 'Trailer');
      if (!trailerCheck.ok) return res.status(trailerCheck.status).json({ message: trailerCheck.message });
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

    // ─── TRANSACTION WITH ATOMIC TRIP NUMBER GENERATION ───
    const backupTrip = await prisma.$transaction(async (tx) => {
      const tripNumber = await generateTripNumber(tx);

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
          parentRemoveIds.push(a.shipmentId);
          childShipmentIds.push(a.shipmentId);
        } else {
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

      // ─── CHECKOUT THROUGH THE SHARED HANDOFF HELPER ───
      if (truckCheck.unit.assignedDriverId !== driverId) {
        await checkoutEquipment(tx, {
          equipmentId: truckId,
          driverId,
          action: 'CHECKOUT',
          reason: 'DISPATCH',
          reasonNote: `Backup for ${parentTrip.tripNumber}`,
          tripId: createdBackup.id,
        });
      }
      if (trailerId && trailerCheck.unit.assignedDriverId !== driverId) {
        await checkoutEquipment(tx, {
          equipmentId: trailerId,
          driverId,
          action: 'CHECKOUT',
          reason: 'DISPATCH',
          reasonNote: `Backup for ${parentTrip.tripNumber}`,
          tripId: createdBackup.id,
        });
      }

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

module.exports = router;