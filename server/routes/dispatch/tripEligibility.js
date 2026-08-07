const { prisma, equipmentIsBusy } = require('./dispatch.helpers');

// Single eligibility check shared by trip create/update AND backup creation:
// a unit is available to a driver if it's in service, not in cooldown, not
// committed to another active Trip, and — the key fix — not currently
// checked out to a DIFFERENT driver on the Handoff board.
// Equipment.assignedDriverId is the authority here; a unit already assigned
// to THIS driver is always fine (it's their existing morning handoff).
async function checkEquipmentEligible(equipmentId, driverId, kind, excludeTripId) {
  const unit = await prisma.equipment.findUnique({ where: { id: equipmentId } });
  if (!unit) return { ok: false, status: 404, message: `${kind} not found` };
  if (unit.status === 'Out of Service') {
    return { ok: false, status: 409, message: `${kind} ${unit.unitNumber} is out of service` };
  }
  if (unit.assignedDriverId && unit.assignedDriverId !== driverId) {
    return {
      ok: false,
      status: 409,
      message: `${kind} ${unit.unitNumber} is currently checked out to another driver on the Handoff board`
    };
  }
  if (unit.availableAt && new Date(unit.availableAt).getTime() > Date.now()) {
    return { ok: false, status: 409, message: `${kind} ${unit.unitNumber} is in cooldown and not yet available` };
  }
  if (await equipmentIsBusy(equipmentId, excludeTripId)) {
    return { ok: false, status: 409, message: `${kind} ${unit.unitNumber} is already committed to another active run` };
  }
  return { ok: true, unit };
}

module.exports = { checkEquipmentEligible };