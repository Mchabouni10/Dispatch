//server/lib/equipmentHandoff.js
//
// Every place in the app that hands a truck/trailer to a driver, or takes it
// back, goes through these two functions. Nothing else should write
// Equipment.assignedDriverId or Equipment.availableAt directly, and nothing
// else should create/close an EquipmentHandoff row directly. That's what
// makes EquipmentHandoff + assignedDriverId a real single source of truth
// instead of three subsystems each keeping their own notion of "who has
// this truck."
//
// Both functions must be called from inside an existing prisma.$transaction
// — they don't open their own, so callers control the atomicity boundary
// (e.g. "create the trip AND checkout the truck, or neither").

/**
 * Checks a piece of equipment out to a driver.
 *   - sets Equipment.assignedDriverId, clears Equipment.availableAt
 *   - creates an active EquipmentHandoff row
 *
 * Callers: Handoff-board check-in, /swap (new unit side), Dispatch trip /
 * backup creation when the truck/trailer has no current holder.
 *
 * Does NOT check eligibility (in-service, not already assigned, etc.) —
 * callers are expected to validate before calling this, since the right
 * error message/status code differs by caller.
 */
async function checkoutEquipment(tx, {
  equipmentId,
  driverId,
  action = 'CHECKOUT',
  reason = 'DISPATCH',
  reasonNote,
  dispatcherId,
  tripId,
  trailerId,
  odometerStart,
  fuelLevelStart,
  shiftStartTime,
  shiftEndTime,
  preTripCompleted,
  preTripNotes,
}) {
  await tx.equipment.update({
    where: { id: equipmentId },
    data: { assignedDriverId: driverId, availableAt: null },
  });

  return tx.equipmentHandoff.create({
    data: {
      driverId,
      equipmentId,
      action,
      reason,
      reasonNote: reasonNote || '',
      checkOutTime: new Date(),
      isActive: true,
      ...(dispatcherId && { dispatcherId }),
      ...(tripId && { tripId }),
      ...(trailerId && { trailerId }),
      ...(odometerStart && { odometerStart: parseInt(odometerStart) }),
      ...(fuelLevelStart && { fuelLevelStart }),
      ...(shiftStartTime && { shiftStartTime }),
      ...(shiftEndTime && { shiftEndTime }),
      ...(preTripCompleted && { preTripCompleted: true }),
      ...(preTripNotes && { preTripNotes }),
    },
  });
}

/**
 * Releases a piece of equipment from whoever currently holds it.
 *   - clears Equipment.assignedDriverId
 *   - applies an optional cooldown window before it's available again
 *   - closes the active EquipmentHandoff row (isActive:false, returnTime set)
 *
 * Safe to call even if the equipment isn't currently assigned / has no
 * active handoff row — it just becomes a no-op on the handoff side while
 * still clearing assignedDriverId (defensive: never leaves a unit stuck
 * "assigned" because its handoff row was already closed some other way).
 *
 * Callers: Handoff-board release, /swap (old unit side), Dispatch trip
 * finish (send_home) and trip cancel.
 */
async function releaseEquipment(tx, {
  equipmentId,
  cooldownMinutes = 0,
  reason = 'SHIFT_END',
  reasonNote,
  returnLocation,
  odometerEnd,
  fuelLevelEnd,
  postTripNotes,
  postTripCompleted,
  damageDescription,
  returnedBy,
}) {
  const activeHandoff = await tx.equipmentHandoff.findFirst({
    where: { equipmentId, isActive: true },
    orderBy: { checkOutTime: 'desc' },
  });

  await tx.equipment.update({
    where: { id: equipmentId },
    data: {
      assignedDriverId: null,
      availableAt: cooldownMinutes > 0
        ? new Date(Date.now() + cooldownMinutes * 60 * 1000)
        : null,
    },
  });

  if (activeHandoff) {
    await tx.equipmentHandoff.update({
      where: { id: activeHandoff.id },
      data: {
        isActive: false,
        returnTime: new Date(),
        action: 'RETURN',
        reason,
        reasonNote: reasonNote || 'Released',
        ...(returnLocation && { returnLocation }),
        ...(odometerEnd && { odometerEnd: parseInt(odometerEnd) }),
        ...(fuelLevelEnd && { fuelLevelEnd }),
        ...(postTripNotes && { postTripNotes, postTripCompleted: true }),
        ...(postTripCompleted && { postTripCompleted: true }),
        ...(damageDescription && { damageReported: true, damageDescription }),
        ...(returnedBy && { returnedBy }),
      },
    });
  }

  return activeHandoff;
}

/**
 * Releases only the EquipmentHandoff row(s) that a specific trip created
 * (tripId matches), for the given equipment ids. Used on trip cancel: a
 * driver's pre-existing morning handoff (tripId: null) must NOT be released
 * just because a trip that used the same truck got cancelled, but a
 * checkout that Dispatch created for this trip specifically should be.
 */
async function releaseTripCreatedCheckouts(tx, { tripId, equipmentIds }) {
  const ids = (equipmentIds || []).filter(Boolean);
  if (!tripId || ids.length === 0) return [];

  const tripHandoffs = await tx.equipmentHandoff.findMany({
    where: { tripId, equipmentId: { in: ids }, isActive: true },
  });

  const released = [];
  for (const handoff of tripHandoffs) {
    released.push(
      await releaseEquipment(tx, {
        equipmentId: handoff.equipmentId,
        cooldownMinutes: 0,
        reason: 'DISPATCH',
        reasonNote: 'Trip cancelled — dispatch checkout released',
      }),
    );
  }
  return released;
}

module.exports = { checkoutEquipment, releaseEquipment, releaseTripCreatedCheckouts };