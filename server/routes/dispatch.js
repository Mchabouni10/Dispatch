const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

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
      shipments: {
        include: {
          airline: {
            select: { id: true, name: true, code: true, awbPrefix: true }
          },
          warehouse: {
            select: { id: true, name: true }
          }
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
    const shipments = await prisma.shipment.findMany({
      where: { id: { in: populated.shipmentIds } },
      include: {
        airline: {
          select: { id: true, name: true, code: true, awbPrefix: true }
        },
        warehouse: {
          select: { id: true, name: true }
        }
      }
    });
    populated.shipments = shipments;
  }

  // Enrich AWB display for each shipment
  if (populated.shipments) {
    populated.shipments = populated.shipments.map(s => ({
      ...s,
      awbDisplay:
        s.airline?.awbPrefix && s.airwaybillNumber
          ? `${s.airline.awbPrefix}-${s.airwaybillNumber}`
          : s.airwaybillNumber || null
    }));
  }

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
        shipments: {
          include: {
            airline: {
              select: { id: true, name: true, code: true, awbPrefix: true }
            },
            warehouse: {
              select: { id: true, name: true }
            }
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
            include: {
              airline: {
                select: { id: true, name: true, code: true, awbPrefix: true }
              },
              warehouse: {
                select: { id: true, name: true }
              }
            }
          });
        }
        if (trip.shipments) {
          trip.shipments = trip.shipments.map(s => ({
            ...s,
            awbDisplay:
              s.airline?.awbPrefix && s.airwaybillNumber
                ? `${s.airline.awbPrefix}-${s.airwaybillNumber}`
                : s.airwaybillNumber || null
          }));
        }
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
        shipments: {
          include: {
            airline: {
              select: { id: true, name: true, code: true, awbPrefix: true }
            },
            warehouse: {
              select: { id: true, name: true }
            }
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
        include: {
          airline: {
            select: { id: true, name: true, code: true, awbPrefix: true }
          },
          warehouse: {
            select: { id: true, name: true }
          }
        }
      });
    }
    if (trip.shipments) {
      trip.shipments = trip.shipments.map(s => ({
        ...s,
        awbDisplay:
          s.airline?.awbPrefix && s.airwaybillNumber
            ? `${s.airline.awbPrefix}-${s.airwaybillNumber}`
            : s.airwaybillNumber || null
      }));
    }

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
        await tx.shipment.updateMany({
          where: { id: { in: trip.shipmentIds } },
          data: { status: 'Pending', doorNumber: null }
        });
      }

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
