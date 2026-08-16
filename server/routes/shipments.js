// backend/routes/shipments.js
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const requirePermission = require('../middleware/requirePermission');
router.use(requirePermission('shipments', 'view'));

// Helper: Get airline details
async function getAirlineDetails(airlineId) {
  const airline = await prisma.airline.findUnique({
    where: { id: airlineId },
    select: { awbPrefix: true, defaultCutoffHours: true }
  });
  return airline;
}

// Helper: Normalize AWB with airline prefix
function normalizeAwb(airlinePrefix, awbNumber) {
  if (!awbNumber) return null;
  let clean = String(awbNumber).replace(/-/g, '').trim();
  if (airlinePrefix && clean.startsWith(airlinePrefix)) {
    clean = clean.substring(airlinePrefix.length);
  }
  return clean || null;
}

const shipmentDateFields = [
  'lastFreeDay',
  'flightDate',
  'flightEta',
  'lockoutTime',
  'pickupReadyAt',
  'deliveryAppointmentAt'
];

// Only these are real writable Shipment columns. Frontend edit forms are often built
// by spreading a previously-fetched (GET-enriched) shipment into form state, which can
// smuggle in id/createdAt/updatedAt, computed display fields (awbDisplay, storageFeeTotal),
// or nested relation objects (airline, warehouse) — none of which Prisma will accept in
// a create/update `data` payload. Stripping to this whitelist makes that impossible,
// independent of whatever the client happens to send.
const SHIPMENT_WRITABLE_FIELDS = [
  'type', 'status', 'pieces', 'weight', 'weightUnit', 'notes',
  'airwaybillNumber', 'pmcCount',
  'ordNumber', 'originCity', 'flightNumber', 'lastFreeDay', 'storageFeePerDay', 'storageFeeDaysOver',
  'storageFeePaid', 'terminalFee', 'terminalFeePaid', 'isGDP', 'gdpTemperatureRange',
  'isHazmat', 'hazmatClass',
  'flightDate', 'flightEta', 'lockoutTime', 'trailerNumber', 'doorNumber', 'truckType',
  'pickupReadyAt', 'deliveryAppointmentAt',
  'airlineId', 'warehouseId',
];

function sanitizeShipmentInput(body) {
  const clean = {};
  for (const key of SHIPMENT_WRITABLE_FIELDS) {
    if (body[key] !== undefined) clean[key] = body[key];
  }
  return clean;
}

// Convert scalar foreign-key ids into relation connect objects so the same
// payload works whether the generated Prisma client expects scalar fields
// or nested relation inputs.
function mapRelationIdsToConnect(data) {
  const copy = { ...data };
  if (copy.airlineId !== undefined) {
    copy.airline = { connect: { id: copy.airlineId } };
    delete copy.airlineId;
  }
  if (copy.warehouseId !== undefined) {
    copy.warehouse = { connect: { id: copy.warehouseId } };
    delete copy.warehouseId;
  }
  return copy;
}

function normalizeShipmentDates(data) {
  for (const field of shipmentDateFields) {
    if (data[field] === '' || data[field] === undefined || data[field] === null) {
      data[field] = null;
      continue;
    }

    const value = data[field] instanceof Date ? data[field] : new Date(data[field]);
    if (Number.isNaN(value.getTime())) {
      const error = new Error(`Invalid ${field}; expected an ISO-8601 date or datetime`);
      error.statusCode = 400;
      throw error;
    }
    data[field] = value;
  }
  return data;
}

/**
 * Automated storage-fee days-over calculation.
 * Days accrue from the calendar day AFTER lastFreeDay through today (inclusive).
 * Returns 0 when lastFreeDay is missing or still in the future.
 */
function computeStorageFeeDaysOver(lastFreeDay) {
  if (!lastFreeDay) return 0;
  const lfd = new Date(lastFreeDay);
  if (Number.isNaN(lfd.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  lfd.setHours(0, 0, 0, 0);
  if (today <= lfd) return 0;
  return Math.ceil((today.getTime() - lfd.getTime()) / (1000 * 3600 * 24));
}

/**
 * Apply automated storage fee fields onto a shipment (or create/update payload).
 * - Recalculates storageFeeDaysOver from lastFreeDay
 * - Ensures numeric defaults for rate / days
 * - Adds storageFeeTotal = rate × days (display-only; not a DB column)
 */
function applyStorageFeeCalculation(shipmentOrData, { includeTotal = true } = {}) {
  const out = { ...shipmentOrData };
  if (out.type === 'Import' || out.lastFreeDay) {
    out.storageFeeDaysOver = computeStorageFeeDaysOver(out.lastFreeDay);
  }
  if (out.storageFeeDaysOver == null || out.storageFeeDaysOver === '') {
    out.storageFeeDaysOver = 0;
  }
  if (out.storageFeePerDay == null || out.storageFeePerDay === '') {
    out.storageFeePerDay = 0;
  }
  if (includeTotal) {
    out.storageFeeTotal =
      (Number(out.storageFeePerDay) || 0) * (Number(out.storageFeeDaysOver) || 0);
  }
  return out;
}

// GET all shipments with advanced filtering
router.get('/', async (req, res) => {
  try {
    const { type, status, airlineId, warehouseId, search, groupId } = req.query;
    
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (airlineId) filter.airlineId = airlineId;
    if (warehouseId) filter.warehouseId = warehouseId;
    
    // Search across multiple fields
    if (search) {
      const searchTerm = search.trim();
      filter.OR = [
        { airwaybillNumber: { contains: searchTerm, mode: 'insensitive' } },
        { ordNumber: { contains: searchTerm, mode: 'insensitive' } },
        { trailerNumber: { contains: searchTerm, mode: 'insensitive' } },
        { notes: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }
    
    // If grouping, get shipments in group
    if (groupId) {
      const groupShipments = await prisma.shipmentGroupShipment.findMany({
        where: { shipmentGroupId: groupId },
        select: { shipmentId: true }
      });
      filter.id = { in: groupShipments.map(gs => gs.shipmentId) };
    }
    
    const shipments = await prisma.shipment.findMany({
      where: filter,
      include: {
        airline: {
          select: { id: true, name: true, code: true, awbPrefix: true, defaultCutoffHours: true, terminalAddress: true }
        },
        warehouse: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Live storage-fee calculation + display fields (days-over always current)
    const enriched = shipments.map((s) => {
      const withFees = applyStorageFeeCalculation(s);
      return {
        ...withFees,
        awbDisplay:
          s.airline?.awbPrefix && s.airwaybillNumber
            ? `${s.airline.awbPrefix}-${s.airwaybillNumber}`
            : s.airwaybillNumber,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('Error fetching shipments:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET single shipment
router.get('/:id', async (req, res) => {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: req.params.id },
      include: {
        airline: {
          select: { id: true, name: true, code: true, awbPrefix: true, defaultCutoffHours: true, terminalAddress: true }
        },
        warehouse: {
          select: { id: true, name: true }
        }
      }
    });
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    const withFees = applyStorageFeeCalculation(shipment);
    const enriched = {
      ...withFees,
      awbDisplay:
        shipment.airline?.awbPrefix && shipment.airwaybillNumber
          ? `${shipment.airline.awbPrefix}-${shipment.airwaybillNumber}`
          : shipment.airwaybillNumber,
    };

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create shipment
router.post('/', requirePermission('shipments', 'full'), async (req, res) => {
  try {
    const data = sanitizeShipmentInput(req.body);
    normalizeShipmentDates(data);
    if (data.type === 'Export') data.doorNumber = null;
    
    // Handle AWB with airline prefix for BOTH import and export
    if (data.airlineId && data.airwaybillNumber) {
      const airline = await getAirlineDetails(data.airlineId);
      if (airline && airline.awbPrefix) {
        data.airwaybillNumber = normalizeAwb(airline.awbPrefix, data.airwaybillNumber);
      }
    }
    
    // Calculate lockout time for exports
    if (data.type === 'Export' && data.flightDate && data.airlineId) {
      const airline = await getAirlineDetails(data.airlineId);
      if (airline) {
        const flightDate = new Date(data.flightDate);
        data.lockoutTime = new Date(flightDate.getTime() - (airline.defaultCutoffHours * 3600000));
      }
    }

    // Automated storage fee days-over (and numeric defaults)
    Object.assign(data, applyStorageFeeCalculation(data, { includeTotal: false }));

    // Ensure default values
    if (!data.weightUnit) data.weightUnit = 'lb';
    if (!data.terminalFee) data.terminalFee = 0;
    if (!data.pmcCount) data.pmcCount = 0;
    if (!data.isGDP) data.isGDP = false;

    const createData = {
      ...data,
      // Ensure null values for optional fields
      airwaybillNumber: data.airwaybillNumber || null,
      ordNumber: data.ordNumber || null,
      originCity: data.originCity || null,
      flightNumber: data.flightNumber || null,
      trailerNumber: data.trailerNumber || null,
      doorNumber: data.doorNumber || null,
      truckType: data.truckType || null,
      gdpTemperatureRange: data.gdpTemperatureRange || null
    };
    // storageFeeTotal is computed-only — never write it to Prisma
    delete createData.storageFeeTotal;

    const shipment = await prisma.shipment.create({
      data: mapRelationIdsToConnect(createData),
      include: {
        airline: {
          select: { id: true, name: true, code: true, awbPrefix: true, defaultCutoffHours: true, terminalAddress: true }
        },
        warehouse: {
          select: { id: true, name: true }
        }
      }
    });

    const enriched = applyStorageFeeCalculation({
      ...shipment,
      awbDisplay:
        shipment.airline?.awbPrefix && shipment.airwaybillNumber
          ? `${shipment.airline.awbPrefix}-${shipment.airwaybillNumber}`
          : shipment.airwaybillNumber,
    });

    res.status(201).json(enriched);
  } catch (err) {
    console.error('Error creating shipment:', err);
    res.status(400).json({ message: err.message });
  }
});

// PUT update shipment
router.put('/:id', requirePermission('shipments', 'full'), async (req, res) => {
  try {
    const data = sanitizeShipmentInput(req.body);
    normalizeShipmentDates(data);
    const shipmentId = req.params.id;
    
    // Get existing shipment for type + lastFreeDay (needed for fee recalculation)
    const existing = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { type: true, lastFreeDay: true, storageFeePerDay: true }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    if (existing.type === 'Export') data.doorNumber = null;

    // Handle AWB with airline prefix for BOTH import and export
    if (data.airlineId && data.airwaybillNumber) {
      const airline = await getAirlineDetails(data.airlineId);
      if (airline && airline.awbPrefix) {
        data.airwaybillNumber = normalizeAwb(airline.awbPrefix, data.airwaybillNumber);
      }
    }

    // Calculate lockout time for exports
    if (existing.type === 'Export' && data.flightDate && data.airlineId) {
      const airline = await getAirlineDetails(data.airlineId);
      if (airline) {
        const flightDate = new Date(data.flightDate);
        data.lockoutTime = new Date(flightDate.getTime() - (airline.defaultCutoffHours * 3600000));
      }
    }

    // Automated storage fee: always refresh days-over from LFD (payload or existing)
    const feeSource = {
      type: data.type || existing.type,
      lastFreeDay:
        data.lastFreeDay !== undefined ? data.lastFreeDay : existing.lastFreeDay,
      storageFeePerDay:
        data.storageFeePerDay !== undefined
          ? data.storageFeePerDay
          : existing.storageFeePerDay,
    };
    const feeFields = applyStorageFeeCalculation(feeSource, { includeTotal: false });
    data.storageFeeDaysOver = feeFields.storageFeeDaysOver;
    if (data.storageFeePerDay === undefined) {
      data.storageFeePerDay = feeFields.storageFeePerDay;
    }
    delete data.storageFeeTotal;

    // Ensure default values
    if (!data.terminalFee && data.terminalFee !== 0) data.terminalFee = 0;
    if (!data.pmcCount && data.pmcCount !== 0) data.pmcCount = 0;
    if (data.isGDP === undefined) data.isGDP = false;

    const shipment = await prisma.shipment.update({
      where: { id: shipmentId },
      data: mapRelationIdsToConnect(data),
      include: {
        airline: {
          select: { id: true, name: true, code: true, awbPrefix: true, defaultCutoffHours: true, terminalAddress: true }
        },
        warehouse: {
          select: { id: true, name: true }
        }
      }
    });

    const enriched = applyStorageFeeCalculation({
      ...shipment,
      awbDisplay:
        shipment.airline?.awbPrefix && shipment.airwaybillNumber
          ? `${shipment.airline.awbPrefix}-${shipment.airwaybillNumber}`
          : shipment.airwaybillNumber,
    });

    res.json(enriched);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    console.error('Error updating shipment:', err);
    res.status(400).json({ message: err.message });
  }
});

// DELETE shipment
router.delete('/:id', requirePermission('shipments', 'full'), async (req, res) => {
  try {
    await prisma.shipment.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Shipment deleted successfully' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    res.status(500).json({ message: err.message });
  }
});

// BULK create shipments (for grouped truck loads)
//
// Wrapped in a single prisma.$transaction so this is genuinely all-or-nothing.
// Previously this looped and awaited each prisma.shipment.create() outside any
// transaction — if shipment #5 of an 8-piece truck load failed validation
// (bad date, duplicate AWB, whatever), shipments #1-4 were already committed
// with no way to roll them back or even detect the group was incomplete from
// the response. Now either the whole group + all its shipments land together,
// or nothing does and the client gets a clean error to retry.
//
// Also caches airline lookups by airlineId instead of querying per shipment —
// a bulk load is almost always all one airline, so this was hitting the DB
// twice per shipment (once for AWB prefix, once for export lockout time) for
// what's usually the exact same row every time.
router.post('/bulk', requirePermission('shipments', 'full'), async (req, res) => {
  try {
    const { shipments, groupName, truckType, trailerNumber, doorNumber } = req.body;

    if (!shipments || !shipments.length) {
      return res.status(400).json({ message: 'No shipments provided' });
    }

    const airlineCache = new Map(); // airlineId -> { awbPrefix, defaultCutoffHours } | null
    async function getAirlineCached(airlineId) {
      if (!airlineId) return null;
      if (airlineCache.has(airlineId)) return airlineCache.get(airlineId);
      const airline = await getAirlineDetails(airlineId);
      airlineCache.set(airlineId, airline);
      return airline;
    }

    const { group, created } = await prisma.$transaction(async (tx) => {
      const group = await tx.shipmentGroup.create({
        data: {
          name: groupName || `TRUCK-${Date.now()}`,
          type: shipments[0].type,
          truckType,
          trailerNumber,
          doorNumber
        }
      });

      const created = [];
      for (const shipmentData of shipments) {
        const data = sanitizeShipmentInput(shipmentData);
        normalizeShipmentDates(data);
        if (data.type === 'Export') data.doorNumber = null;

        // Handle AWB with airline prefix for BOTH import and export
        if (data.airlineId && data.airwaybillNumber) {
          const airline = await getAirlineCached(data.airlineId);
          if (airline && airline.awbPrefix) {
            data.airwaybillNumber = normalizeAwb(airline.awbPrefix, data.airwaybillNumber);
          }
        }

        // Calculate lockout time for exports
        if (data.type === 'Export' && data.flightDate && data.airlineId) {
          const airline = await getAirlineCached(data.airlineId);
          if (airline) {
            const flightDate = new Date(data.flightDate);
            data.lockoutTime = new Date(flightDate.getTime() - (airline.defaultCutoffHours * 3600000));
          }
        }

        // Automated storage fee days-over
        Object.assign(data, applyStorageFeeCalculation(data, { includeTotal: false }));

        // Ensure default values
        if (!data.weightUnit) data.weightUnit = 'lb';
        if (!data.terminalFee) data.terminalFee = 0;
        if (!data.pmcCount) data.pmcCount = 0;
        if (!data.isGDP) data.isGDP = false;

        const createData = {
          ...data,
          airwaybillNumber: data.airwaybillNumber || null,
          ordNumber: data.ordNumber || null,
          trailerNumber: data.trailerNumber || null,
          doorNumber: data.doorNumber || null,
          truckType: data.truckType || null,
          gdpTemperatureRange: data.gdpTemperatureRange || null
        };
        delete createData.storageFeeTotal;

        const createdShipment = await tx.shipment.create({
          data: mapRelationIdsToConnect(createData),
          include: {
            airline: true,
            warehouse: true
          }
        });

        // Link to group
        await tx.shipmentGroupShipment.create({
          data: {
            shipmentId: createdShipment.id,
            shipmentGroupId: group.id
          }
        });

        created.push(applyStorageFeeCalculation(createdShipment));
      }

      return { group, created };
    });

    res.status(201).json({
      message: `Created ${created.length} shipments in group ${group.name}`,
      group,
      shipments: created
    });
  } catch (err) {
    console.error('Error creating bulk shipments:', err);
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

