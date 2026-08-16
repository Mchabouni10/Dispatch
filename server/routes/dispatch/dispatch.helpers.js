//server/routes/dispatch/Dispatch.helpers.js
const fs = require('fs');
const path = require('path');
const prisma = require('../../lib/prisma');

const SHIPMENT_INCLUDE = {
  airline: {
    select: { id: true, name: true, code: true, awbPrefix: true }
  },
  warehouse: {
    select: { id: true, name: true }
  }
};

// Trip's POD/signature capture + any per-shipment exceptions logged at handoff
const HANDOFF_INCLUDE = {
  handoff: true,
  exceptions: {
    orderBy: { createdAt: 'desc' },
    include: {
      shipment: {
        select: { id: true, airwaybillNumber: true, ordNumber: true, type: true }
      }
    }
  }
};

// Reused by GET / and GET /:id so both endpoints populate the same trip shape.
const TRIP_INCLUDE = {
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
  },
  ...HANDOFF_INCLUDE
};

// Saves a "data:image/png;base64,...." string to disk under
// server/uploads/<folder>/<filename>.<ext> and returns the public URL path
// (e.g. "/uploads/pod/abc123-pod-172....jpg") to store on the record.
// Returns null if no image was given, so callers can just pass req.body.podImage
// straight through without an if-check.
function saveBase64Image(dataUrl, folder, filename) {
  if (!dataUrl) return null;
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const ext = match[1].split('/')[1];
  const buffer = Buffer.from(match[2], 'base64');
  const dir = path.join(__dirname, '..', '..', 'uploads', folder);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${filename}.${ext}`;
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return `/uploads/${folder}/${fileName}`;
}

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
    include: TRIP_INCLUDE
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

// ─── ATOMIC TRIP NUMBER GENERATOR ─────────────────────────────────
// Uses a dedicated TripSequence row that the DB locks during the upsert,
// guaranteeing two concurrent transactions can never get the same number.
//
// SELF-HEALING: the counter row can drift out of sync with what's actually
// in the Trip table (seed scripts, manual inserts, a reset counter, etc).
// So on every call we also check the highest tripNumber that actually
// exists for this year and take whichever is higher — this both fixes an
// already-drifted counter and stops it from happening again.
// ─── ATOMIC TRIP NUMBER GENERATOR ─────────────────────────────────
async function generateTripNumber(tx) {
  const year = new Date().getFullYear();
  const prefix = `TRIP-${year}-`;

  // Highest trip number that actually exists in the DB for this year
  const lastTrip = await tx.trip.findFirst({
    where: { tripNumber: { startsWith: prefix } },
    orderBy: { tripNumber: 'desc' },
    select: { tripNumber: true }
  });
  const highestExisting = lastTrip
    ? parseInt(lastTrip.tripNumber.slice(prefix.length), 10) || 0
    : 0;

  // Current counter value (creates the row with lastUsed 0 if it doesn't exist yet)
  const seq = await tx.tripSequence.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, lastUsed: 0 }
  });

  const nextNumber = Math.max(seq.lastUsed, highestExisting) + 1;

  // Sync the counter back up so it never drifts behind reality again
  await tx.tripSequence.update({
    where: { id: 1 },
    data: { lastUsed: nextNumber }
  });

  const num = String(nextNumber).padStart(4, '0');
  return `${prefix}${num}`;
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

module.exports = {
  prisma,
  SHIPMENT_INCLUDE,
  HANDOFF_INCLUDE,
  TRIP_INCLUDE,
  saveBase64Image,
  enrichTripShipments,
  populateTrip,
  generateTripNumber,
  equipmentIsBusy
};