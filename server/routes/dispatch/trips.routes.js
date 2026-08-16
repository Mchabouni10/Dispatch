const express = require('express');
const router = express.Router();
const {
  prisma,
  SHIPMENT_INCLUDE,
  TRIP_INCLUDE,
  enrichTripShipments,
  populateTrip,
  generateTripNumber
} = require('./dispatch.helpers');
const { checkoutEquipment, releaseTripCreatedCheckouts } = require('../../lib/equipmentHandoff');
const { checkEquipmentEligible } = require('./tripEligibility');
const { checkRunEligibility } = require('../../lib/dispatchEligibility');
const { emit } = require('../../lib/realtime');
const requirePermission = require('../../middleware/requirePermission');
router.use(requirePermission('dispatch', 'view'));

// GET all trips
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.runType) filter.runType = req.query.runType;

    const trips = await prisma.trip.findMany({
      where: filter,
      include: TRIP_INCLUDE,
      orderBy: { createdAt: 'desc' }
    });

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
      include: TRIP_INCLUDE
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
router.post('/', requirePermission('dispatch', 'full'), async (req, res) => {
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

    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    if (driver.status === 'On Trip') {
      return res.status(409).json({ message: `Driver ${driver.name} is already on a trip` });
    }

    const truckCheck = await checkEquipmentEligible(truckId, driverId, 'Truck');
    if (!truckCheck.ok) return res.status(truckCheck.status).json({ message: truckCheck.message });

    let trailerCheck = null;
    if (trailerId) {
      trailerCheck = await checkEquipmentEligible(trailerId, driverId, 'Trailer');
      if (!trailerCheck.ok) return res.status(trailerCheck.status).json({ message: trailerCheck.message });
    }

    // Check shipments
    let resolvedRunType = runType;
    let manifest = [];
    if (shipmentIds && shipmentIds.length > 0) {
      manifest = await prisma.shipment.findMany({
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

    if (resolvedRunType === 'Export' && doorNumber) {
      const door = String(doorNumber).trim();
      const doorNum = parseInt(door, 10);
      if (Number.isNaN(doorNum) || doorNum < 1 || doorNum > 30) {
        return res.status(400).json({ message: 'Door number must be between 1 and 30' });
      }
    }

    // ─── Driver/equipment/cargo compatibility ───
    // Availability was already checked above (checkEquipmentEligible); this
    // covers whether the driver is actually *allowed* to take this specific
    // truck/trailer/manifest combination — license class vs equipment type,
    // trailer eligibility, and hazmat/GDP certification vs the shipments on
    // the manifest. See lib/dispatchEligibility.js for the rules themselves.
    const eligibility = checkRunEligibility({
      driver,
      truck: truckCheck.unit,
      trailer: trailerCheck?.unit || null,
      shipments: manifest,
    });
    if (!eligibility.ok) {
      return res.status(409).json({ message: eligibility.errors.join(' — ') });
    }

    // ─── TRANSACTION WITH ATOMIC TRIP NUMBER GENERATION ───
    const trip = await prisma.$transaction(async (tx) => {
      const tripNumber = await generateTripNumber(tx);

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

      await tx.driver.update({
        where: { id: driverId },
        data: { status: 'On Trip' }
      });

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

      // ─── CHECKOUT THROUGH THE SHARED HANDOFF HELPER ───
      // Only if the unit ISN'T already assignedDriverId'd to this driver —
      // otherwise it's their existing morning handoff and re-checking it out
      // would create a duplicate active EquipmentHandoff row.
      if (truckCheck.unit.assignedDriverId !== driverId) {
        await checkoutEquipment(tx, {
          equipmentId: truckId,
          driverId,
          action: 'CHECKOUT',
          reason: 'DISPATCH',
          reasonNote: `Dispatched on ${tripNumber}`,
          tripId: createdTrip.id,
        });
      }
      if (trailerId && trailerCheck.unit.assignedDriverId !== driverId) {
        await checkoutEquipment(tx, {
          equipmentId: trailerId,
          driverId,
          action: 'CHECKOUT',
          reason: 'DISPATCH',
          reasonNote: `Dispatched on ${tripNumber}`,
          tripId: createdTrip.id,
        });
      }

      return createdTrip;
    });

    const populated = await populateTrip(trip);
    emit('trip:upsert', populated);
    res.status(201).json(populated);
  } catch (err) {
    console.error('[POST /api/dispatch]', err);
    res.status(400).json({ message: err.message });
  }
});

// PUT update trip
router.put('/:id', requirePermission('dispatch', 'full'), async (req, res) => {
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

    if (newDriverId && newDriverId !== oldDriverId) {
      const newDriver = await prisma.driver.findUnique({ where: { id: newDriverId } });
      if (!newDriver) return res.status(404).json({ message: 'New driver not found' });
      if (newDriver.status === 'On Trip') {
        return res.status(409).json({ message: `Driver ${newDriver.name} is already on another trip` });
      }
    }

    // Re-validate equipment eligibility if truck/trailer/driver is changing —
    // same assignedDriverId-aware check used on create, so an edit can't
    // reassign a trip onto a truck someone else currently holds either.
    const effectiveDriverId = newDriverId;
    let newTruckUnit = null;
    let newTrailerUnit = null;
    if (truckId !== undefined && truckId !== existingTrip.truckId) {
      const truckCheck = await checkEquipmentEligible(truckId, effectiveDriverId, 'Truck', tripId);
      if (!truckCheck.ok) return res.status(truckCheck.status).json({ message: truckCheck.message });
      newTruckUnit = truckCheck.unit;
    }
    if (trailerId !== undefined && trailerId && trailerId !== existingTrip.trailerId) {
      const trailerCheck = await checkEquipmentEligible(trailerId, effectiveDriverId, 'Trailer', tripId);
      if (!trailerCheck.ok) return res.status(trailerCheck.status).json({ message: trailerCheck.message });
      newTrailerUnit = trailerCheck.unit;
    }

    const oldShipmentIds = existingTrip.shipmentIds || [];
    const newShipmentIds = shipmentIds !== undefined ? shipmentIds : oldShipmentIds;
    const removedShipmentIds = oldShipmentIds.filter(id => !newShipmentIds.includes(id));
    const addedShipmentIds = newShipmentIds.filter(id => !oldShipmentIds.includes(id));

    // ─── Driver/equipment/cargo compatibility ───
    // Re-checked on every update against the EFFECTIVE (post-edit) driver,
    // truck, trailer, and manifest — not just whatever field changed. That
    // matters because e.g. adding a hazmat shipment to an already-assigned
    // trip is just as much a compatibility problem as changing the driver
    // would be, even though driverId/truckId/trailerId are all untouched.
    const effectiveTruckId = truckId !== undefined ? truckId : existingTrip.truckId;
    const effectiveTrailerId = trailerId !== undefined ? trailerId : existingTrip.trailerId;
    const [effectiveDriver, effectiveTruck, effectiveTrailer, effectiveShipments] = await Promise.all([
      effectiveDriverId ? prisma.driver.findUnique({ where: { id: effectiveDriverId } }) : null,
      newTruckUnit || (effectiveTruckId ? prisma.equipment.findUnique({ where: { id: effectiveTruckId } }) : null),
      newTrailerUnit || (effectiveTrailerId ? prisma.equipment.findUnique({ where: { id: effectiveTrailerId } }) : null),
      newShipmentIds.length > 0 ? prisma.shipment.findMany({ where: { id: { in: newShipmentIds } } }) : [],
    ]);
    const eligibility = checkRunEligibility({
      driver: effectiveDriver,
      truck: effectiveTruck,
      trailer: effectiveTrailer,
      shipments: effectiveShipments,
    });
    if (!eligibility.ok) {
      return res.status(409).json({ message: eligibility.errors.join(' — ') });
    }

    const updatedTrip = await prisma.$transaction(async (tx) => {
      if (newDriverId !== oldDriverId) {
        if (oldDriverId && existingTrip.status !== 'Completed') {
          await tx.driver.update({ where: { id: oldDriverId }, data: { status: 'Available' } });
        }
        if (newDriverId && existingTrip.status !== 'Completed') {
          await tx.driver.update({ where: { id: newDriverId }, data: { status: 'On Trip' } });
        }
      }

      if (removedShipmentIds.length > 0) {
        await tx.shipment.updateMany({
          where: { id: { in: removedShipmentIds } },
          data: { status: 'Pending', doorNumber: null }
        });
        await tx.tripShipmentSplit.deleteMany({
          where: { tripId, shipmentId: { in: removedShipmentIds } }
        });
      }

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

      // Swap equipment checkout if the truck/trailer actually changed
      if (newTruckUnit) {
        await releaseTripCreatedCheckouts(tx, { tripId, equipmentIds: [existingTrip.truckId] });
        if (newTruckUnit.assignedDriverId !== effectiveDriverId) {
          await checkoutEquipment(tx, {
            equipmentId: truckId,
            driverId: effectiveDriverId,
            action: 'CHECKOUT',
            reason: 'DISPATCH',
            reasonNote: `Reassigned on ${existingTrip.tripNumber}`,
            tripId,
          });
        }
      }
      if (newTrailerUnit) {
        await releaseTripCreatedCheckouts(tx, { tripId, equipmentIds: [existingTrip.trailerId] });
        if (newTrailerUnit.assignedDriverId !== effectiveDriverId) {
          await checkoutEquipment(tx, {
            equipmentId: trailerId,
            driverId: effectiveDriverId,
            action: 'CHECKOUT',
            reason: 'DISPATCH',
            reasonNote: `Reassigned on ${existingTrip.tripNumber}`,
            tripId,
          });
        }
      }

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
    emit('trip:upsert', populated);
    res.json(populated);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Trip not found' });
    }
    console.error('[PUT /api/dispatch/:id]', err);
    res.status(400).json({ message: err.message });
  }
});

// DELETE / Cancel trip
router.delete('/:id', requirePermission('dispatch', 'full'), async (req, res) => {
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

      // Release only the checkouts THIS trip created (tripId-linked) — a
      // driver's real morning handoff on the same truck/trailer is untouched.
      if (trip.status !== 'Completed') {
        await releaseTripCreatedCheckouts(tx, {
          tripId: trip.id,
          equipmentIds: [trip.truckId, trip.trailerId],
        });
      }

      if (trip.status !== 'Completed' && trip.shipmentIds && trip.shipmentIds.length > 0) {
        if (trip.parentTripId) {
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
              if (!childSplit) continue;

              const shipment = await tx.shipment.findUnique({ where: { id: shipmentId } });
              const parentSplit = await tx.tripShipmentSplit.findUnique({
                where: { tripId_shipmentId: { tripId: parent.id, shipmentId } }
              });

              const parentPieces = parentSplit ? parentSplit.pieces : shipment.pieces;
              const parentWeight = parentSplit ? parentSplit.weight : shipment.weight;
              const mergedPieces = parentPieces + childSplit.pieces;
              const mergedWeight = Math.round((parentWeight + childSplit.weight) * 100) / 100;

              if (mergedPieces >= shipment.pieces) {
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

    emit('trip:removed', trip.id);
    res.json({ message: 'Trip cancelled and deleted successfully' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Trip not found' });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
