const express = require('express');
const router = express.Router();
const { prisma, saveBase64Image, populateTrip } = require('./dispatch.helpers');
const { releaseEquipment } = require('../../lib/equipmentHandoff');

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
//
// Body shape:
// {
//   finishTime: "2026-08-04T10:30",       // optional, defaults to now
//   receivedByName: "J. Smith",           // optional, who signed
//   notes: "",                            // optional, trip-level note
//   podImage: "data:image/jpeg;base64,...",       // optional
//   signatureImage: "data:image/png;base64,...",  // optional
//   outcomes: [                           // optional — one entry per shipment
//     { shipmentId, outcome: "delivered" },
//     { shipmentId, outcome: "short", piecesAffected: 3, reason: "Left at ramp" },
//     { shipmentId, outcome: "rejected", reason: "Missing DG stickers", canReschedule: true }
//   ]
// }
//
// Any shipment on the trip that ISN'T in `outcomes` is treated as "delivered" —
// this keeps the endpoint backward compatible if it's ever called without the
// new reconciliation UI.
router.patch('/:id/finish', async (req, res) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    if (trip.status !== 'En Route') {
      return res.status(400).json({ message: 'Trip is not En Route' });
    }

    const {
      finishTime: finishTimeInput,
      receivedByName,
      notes,
      podImage,
      signatureImage,
      outcomes,
      postTripAction,
      cooldownMinutes
    } = req.body;

    const finishTime = finishTimeInput ? new Date(finishTimeInput) : new Date();
    const outcomeList = Array.isArray(outcomes) ? outcomes : [];
    const outcomeMap = new Map(outcomeList.map(o => [o.shipmentId, o]));
    const shipmentIds = trip.shipmentIds || [];

    // Save images to disk BEFORE the transaction — file I/O doesn't belong inside a DB tx.
    const podImageUrl = saveBase64Image(podImage, 'pod', `${trip.id}-pod-${Date.now()}`);
    const signatureImageUrl = saveBase64Image(signatureImage, 'signatures', `${trip.id}-sig-${Date.now()}`);

    const updatedTrip = await prisma.$transaction(async (tx) => {
      for (const shipmentId of shipmentIds) {
        const outcome = outcomeMap.get(shipmentId) || { outcome: 'delivered' };
        const shipment = await tx.shipment.findUnique({ where: { id: shipmentId } });
        if (!shipment) continue;

        if (outcome.outcome === 'short') {
          const missing = Math.max(0, Number(outcome.piecesAffected) || 0);
          const delivered = Math.max(0, shipment.pieces - missing);

          const deliveredWeight = shipment.pieces > 0
            ? Math.round((delivered / shipment.pieces) * shipment.weight * 100) / 100
            : 0;
          const missingWeight = shipment.pieces > 0
            ? Math.round((missing / shipment.pieces) * shipment.weight * 100) / 100
            : 0;

          await tx.shipment.update({
            where: { id: shipmentId },
            data: {
              status: 'Completed',
              pieces: delivered,
              weight: deliveredWeight
            }
          });

          if (missing > 0) {
            if (delivered > 0) {
              await tx.tripShipmentSplit.upsert({
                where: { tripId_shipmentId: { tripId: trip.id, shipmentId } },
                update: { pieces: delivered, weight: deliveredWeight },
                create: { tripId: trip.id, shipmentId, pieces: delivered, weight: deliveredWeight }
              });
            }

            let shortOrdNumber = null;
            if (shipment.ordNumber) {
              const existingShort = await tx.shipment.findFirst({
                where: {
                  parentShipmentId: shipment.id,
                  ordNumber: { startsWith: `${shipment.ordNumber}-SHORT` }
                },
                orderBy: { ordNumber: 'desc' }
              });

              if (existingShort) {
                const match = existingShort.ordNumber.match(/-SHORT-(\d+)$/);
                if (match) {
                  const nextNum = parseInt(match[1]) + 1;
                  shortOrdNumber = `${shipment.ordNumber}-SHORT-${nextNum}`;
                } else {
                  shortOrdNumber = `${shipment.ordNumber}-SHORT-1`;
                }
              } else {
                shortOrdNumber = `${shipment.ordNumber}-SHORT`;
              }
            }

            await tx.shipment.create({
              data: {
                type: shipment.type,
                status: 'Pending',
                pieces: missing,
                weight: missingWeight,
                weightUnit: shipment.weightUnit,
                airwaybillNumber: shipment.airwaybillNumber,
                ordNumber: shortOrdNumber,
                airlineId: shipment.airlineId,
                warehouseId: shipment.warehouseId,
                parentShipmentId: shipment.id,
                notes: `Split from ${shipment.ordNumber || shipment.airwaybillNumber || shipment.id}: ${missing} pcs short on trip ${trip.tripNumber}`,
                pmcCount: shipment.pmcCount || 0,
                isGDP: shipment.isGDP || false,
                gdpTemperatureRange: shipment.gdpTemperatureRange || null,
                lastFreeDay: shipment.lastFreeDay || null,
                storageFeePerDay: shipment.storageFeePerDay || 0,
                storageFeeDaysOver: 0,
                storageFeePaid: false,
                terminalFee: shipment.terminalFee || 0,
                terminalFeePaid: false,
                flightDate: shipment.flightDate || null,
                lockoutTime: shipment.lockoutTime || null,
                trailerNumber: shipment.trailerNumber || null,
                doorNumber: shipment.doorNumber || null,
                truckType: shipment.truckType || null,
                pickupReadyAt: shipment.pickupReadyAt || null,
                deliveryAppointmentAt: shipment.deliveryAppointmentAt || null
              }
            });
          }

          await tx.shipmentException.create({
            data: {
              tripId: trip.id,
              shipmentId: shipment.id,
              type: 'SHORT',
              piecesAffected: missing,
              reason: outcome.reason || null
            }
          });
        } else if (outcome.outcome === 'rejected') {
          const canReschedule = !!outcome.canReschedule;

          await tx.shipment.update({
            where: { id: shipmentId },
            data: {
              status: canReschedule ? 'Pending' : 'Rejected',
              doorNumber: canReschedule ? null : shipment.doorNumber
            }
          });

          await tx.shipmentException.create({
            data: {
              tripId: trip.id,
              shipmentId: shipment.id,
              type: 'REJECTED',
              reason: outcome.reason || null,
              resolution: canReschedule ? 'RESCHEDULED' : null
            }
          });
        } else {
          await tx.shipment.update({
            where: { id: shipmentId },
            data: { status: 'Completed' }
          });
        }
      }

      if (podImageUrl || signatureImageUrl || receivedByName || notes) {
        await tx.tripHandoff.upsert({
          where: { tripId: trip.id },
          update: { finishTime, podImageUrl, signatureImageUrl, receivedByName, notes },
          create: { tripId: trip.id, finishTime, podImageUrl, signatureImageUrl, receivedByName, notes }
        });
      }

      const result = await tx.trip.update({
        where: { id: req.params.id },
        data: {
          finishTime,
          status: 'Completed'
        }
      });

      // ─── EQUIPMENT RELEASE THROUGH THE SHARED HANDOFF HELPER ───
      // releaseEquipment() clears assignedDriverId AND closes the matching
      // active EquipmentHandoff row — previously this block only wrote
      // Equipment.assignedDriverId directly, so the original handoff row
      // (created at morning check-in, or now at dispatch checkout) never
      // got closed and stayed "active" forever even after the unit freed up.
      if (trip.driverId) {
        if (postTripAction === 'send_home') {
          await tx.driver.update({
            where: { id: trip.driverId },
            data: { status: 'Off Duty' }
          });

          const minutes = Number(cooldownMinutes) > 0 ? Number(cooldownMinutes) : 60;
          for (const equipmentId of [trip.truckId, trip.trailerId].filter(Boolean)) {
            const unit = await tx.equipment.findUnique({ where: { id: equipmentId } });
            if (unit && unit.assignedDriverId === trip.driverId) {
              await releaseEquipment(tx, {
                equipmentId,
                cooldownMinutes: minutes,
                reason: 'SHIFT_END',
                reasonNote: `Sent home after ${trip.tripNumber}`,
              });
            }
          }
        } else if (postTripAction === 'break') {
          await tx.driver.update({
            where: { id: trip.driverId },
            data: { status: 'Break', breakUntil: new Date(Date.now() + 30 * 60000) }
          });
        } else {
          await tx.driver.update({
            where: { id: trip.driverId },
            data: { status: 'Available' }
          });
        }
      }

      return result;
    });

    const populated = await populateTrip(updatedTrip);
    res.json(populated);
  } catch (err) {
    console.error('[PATCH /api/dispatch/:id/finish]', err);
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;