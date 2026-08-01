/**
 * Full database rebuild seed — O’Hare air-cargo ops
 *
 * From server root (with DATABASE_URL set):
 *   node prisma/seed-full.js
 *
 * Wipes trips, shipments, groups, equipment, drivers, airlines, warehouses
 * then rebuilds a rich demo set for Handoff, Dispatch, Analytics, and Equipment.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── helpers ───────────────────────────────────────────────────────────────
function daysFromNow(n, hour = 12, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(randInt(0, copy.length - 1), 1)[0]);
  }
  return out;
}
function pad(n, w = 3) {
  return String(n).padStart(w, '0');
}
function randomAwb8() {
  return String(randInt(10000000, 99999999));
}
function isoHour(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

// ─── WAREHOUSES (ORD / Chicago cargo belt) ─────────────────────────────────
const WAREHOUSES = [
  { name: 'CES — Cargo Expeditors South', address: '1133 N Thomas Dr, Bensenville, IL 60106', contactPhone: '630-555-0101', is24Hours: true, daysOpen: ['MON','TUE','WED','THU','FRI','SAT','SUN'], openTime: null, closeTime: null, notes: 'Primary import staging near ORD T5' },
  { name: 'Panalpina / DSV Bensenville', address: '1000 Tower Rd, Bensenville, IL 60106', contactPhone: '630-555-0102', is24Hours: false, daysOpen: ['MON','TUE','WED','THU','FRI','SAT'], openTime: '06:00', closeTime: '22:00', notes: 'Export consolidations' },
  { name: 'Kintetsu World Express ORD', address: '1171 N Thomas Dr, Bensenville, IL 60106', contactPhone: '630-555-0103', is24Hours: false, daysOpen: ['MON','TUE','WED','THU','FRI'], openTime: '07:00', closeTime: '19:00', notes: null },
  { name: 'Nippon Express Chicago', address: '2200 Busse Rd, Elk Grove Village, IL 60007', contactPhone: '847-555-0104', is24Hours: true, daysOpen: ['MON','TUE','WED','THU','FRI','SAT','SUN'], openTime: null, closeTime: null, notes: 'GDP cold chain capable' },
  { name: 'Yusen Logistics Elk Grove', address: '2300 Estes Ave, Elk Grove Village, IL 60007', contactPhone: '847-555-0105', is24Hours: false, daysOpen: ['MON','TUE','WED','THU','FRI','SAT'], openTime: '05:00', closeTime: '21:00', notes: null },
  { name: 'DB Schenker ORD Gateway', address: '950 Mitel Dr, Wood Dale, IL 60191', contactPhone: '630-555-0106', is24Hours: true, daysOpen: ['MON','TUE','WED','THU','FRI','SAT','SUN'], openTime: null, closeTime: null, notes: 'High-volume import releases' },
  { name: 'Expeditors Chicago', address: '800 Morse Ave, Elk Grove Village, IL 60007', contactPhone: '847-555-0107', is24Hours: false, daysOpen: ['MON','TUE','WED','THU','FRI'], openTime: '06:00', closeTime: '18:00', notes: null },
  { name: 'Hellmann Worldwide Logistics', address: '1355 Greenleaf Ave, Elk Grove Village, IL 60007', contactPhone: '847-555-0108', is24Hours: false, daysOpen: ['MON','TUE','WED','THU','FRI','SAT'], openTime: '07:00', closeTime: '20:00', notes: null },
  { name: 'UPS Supply Chain — ORD', address: '1400 N Rohlwing Rd, Itasca, IL 60143', contactPhone: '630-555-0109', is24Hours: true, daysOpen: ['MON','TUE','WED','THU','FRI','SAT','SUN'], openTime: null, closeTime: null, notes: 'Express and general cargo' },
  { name: 'FedEx Trade Networks ORD', address: '1100 Busse Rd, Elk Grove Village, IL 60007', contactPhone: '847-555-0110', is24Hours: true, daysOpen: ['MON','TUE','WED','THU','FRI','SAT','SUN'], openTime: null, closeTime: null, notes: null },
  { name: 'Ceva Logistics Wood Dale', address: '701 N Rohlwing Rd, Itasca, IL 60143', contactPhone: '630-555-0111', is24Hours: false, daysOpen: ['MON','TUE','WED','THU','FRI'], openTime: '06:00', closeTime: '22:00', notes: null },
  { name: 'Agility Logistics ORD', address: '501 Arthur Ave, Elk Grove Village, IL 60007', contactPhone: '847-555-0112', is24Hours: false, daysOpen: ['MON','TUE','WED','THU','FRI','SAT'], openTime: '05:30', closeTime: '21:30', notes: 'Pharma / GDP preferred' },
];

// ─── AIRLINES (real IATA numeric AWB prefixes where known) ─────────────────
// awbPrefix must be unique; code is IATA 2-letter where standard.
const AIRLINES = [
  { code: 'LH', name: 'Lufthansa Cargo', awbPrefix: '020', defaultCutoffHours: 4, open24h: true },
  { code: 'AF', name: 'Air France Cargo', awbPrefix: '057', defaultCutoffHours: 4, open24h: true },
  { code: 'KL', name: 'KLM Cargo', awbPrefix: '074', defaultCutoffHours: 4, open24h: true },
  { code: 'BA', name: 'British Airways World Cargo', awbPrefix: '125', defaultCutoffHours: 5, open24h: false, openTime: '05:00', closeTime: '23:00' },
  { code: 'UA', name: 'United Cargo', awbPrefix: '016', defaultCutoffHours: 3, open24h: true },
  { code: 'AA', name: 'American Airlines Cargo', awbPrefix: '001', defaultCutoffHours: 3, open24h: true },
  { code: 'DL', name: 'Delta Cargo', awbPrefix: '006', defaultCutoffHours: 3, open24h: true },
  { code: 'AC', name: 'Air Canada Cargo', awbPrefix: '014', defaultCutoffHours: 4, open24h: true },
  { code: 'EK', name: 'Emirates SkyCargo', awbPrefix: '176', defaultCutoffHours: 5, open24h: true },
  { code: 'QR', name: 'Qatar Airways Cargo', awbPrefix: '157', defaultCutoffHours: 5, open24h: true },
  { code: 'SQ', name: 'Singapore Airlines Cargo', awbPrefix: '618', defaultCutoffHours: 5, open24h: true },
  { code: 'CX', name: 'Cathay Pacific Cargo', awbPrefix: '160', defaultCutoffHours: 5, open24h: true },
  { code: 'KE', name: 'Korean Air Cargo', awbPrefix: '180', defaultCutoffHours: 4, open24h: true },
  { code: 'OZ', name: 'Asiana Cargo', awbPrefix: '988', defaultCutoffHours: 4, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'NH', name: 'ANA Cargo', awbPrefix: '205', defaultCutoffHours: 4, open24h: true },
  { code: 'JL', name: 'JAL Cargo', awbPrefix: '131', defaultCutoffHours: 4, open24h: true },
  { code: 'CI', name: 'China Airlines Cargo', awbPrefix: '297', defaultCutoffHours: 4, open24h: true },
  { code: 'BR', name: 'EVA Air Cargo', awbPrefix: '695', defaultCutoffHours: 4, open24h: true },
  { code: 'CZ', name: 'China Southern Cargo', awbPrefix: '784', defaultCutoffHours: 5, open24h: true },
  { code: 'MU', name: 'China Eastern Cargo', awbPrefix: '781', defaultCutoffHours: 5, open24h: true },
  { code: 'CA', name: 'Air China Cargo', awbPrefix: '999', defaultCutoffHours: 5, open24h: true },
  { code: 'TK', name: 'Turkish Cargo', awbPrefix: '235', defaultCutoffHours: 4, open24h: true },
  { code: 'EY', name: 'Etihad Cargo', awbPrefix: '607', defaultCutoffHours: 5, open24h: true },
  { code: 'SV', name: 'Saudia Cargo', awbPrefix: '065', defaultCutoffHours: 5, open24h: true },
  { code: 'QF', name: 'Qantas Freight', awbPrefix: '081', defaultCutoffHours: 6, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'NZ', name: 'Air New Zealand Cargo', awbPrefix: '086', defaultCutoffHours: 6, open24h: false, openTime: '06:00', closeTime: '21:00' },
  { code: 'LX', name: 'SWISS WorldCargo', awbPrefix: '085', defaultCutoffHours: 4, open24h: true },
  { code: 'OS', name: 'Austrian Cargo', awbPrefix: '257', defaultCutoffHours: 4, open24h: false, openTime: '05:00', closeTime: '23:00' },
  { code: 'SK', name: 'SAS Cargo', awbPrefix: '117', defaultCutoffHours: 4, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'AY', name: 'Finnair Cargo', awbPrefix: '105', defaultCutoffHours: 4, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'IB', name: 'Iberia Cargo', awbPrefix: '075', defaultCutoffHours: 4, open24h: false, openTime: '06:00', closeTime: '23:00' },
  { code: 'TP', name: 'TAP Air Portugal Cargo', awbPrefix: '047', defaultCutoffHours: 4, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'AZ', name: 'ITA Airways Cargo', awbPrefix: '055', defaultCutoffHours: 4, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'SN', name: 'Brussels Airlines Cargo', awbPrefix: '082', defaultCutoffHours: 4, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'LO', name: 'LOT Cargo', awbPrefix: '080', defaultCutoffHours: 4, open24h: false, openTime: '05:00', closeTime: '21:00' },
  { code: 'OK', name: 'Czech Airlines Cargo', awbPrefix: '064', defaultCutoffHours: 4, open24h: false, openTime: '06:00', closeTime: '20:00' },
  { code: 'SU', name: 'Aeroflot Cargo', awbPrefix: '555', defaultCutoffHours: 5, open24h: true },
  { code: 'EKX', name: 'Emirates Pharma', awbPrefix: '177', defaultCutoffHours: 6, open24h: true, notes: 'GDP / temperature-controlled lane' },
  { code: '5X', name: 'UPS Airlines', awbPrefix: '406', defaultCutoffHours: 2, open24h: true },
  { code: 'FX', name: 'FedEx Express', awbPrefix: '023', defaultCutoffHours: 2, open24h: true },
  { code: 'PO', name: 'Polar Air Cargo', awbPrefix: '403', defaultCutoffHours: 4, open24h: true },
  { code: '5Y', name: 'Atlas Air', awbPrefix: '369', defaultCutoffHours: 4, open24h: true },
  { code: 'CK', name: 'China Cargo Airlines', awbPrefix: '112', defaultCutoffHours: 5, open24h: true },
  { code: 'CV', name: 'Cargolux', awbPrefix: '172', defaultCutoffHours: 5, open24h: true },
  { code: 'QY', name: 'European Air Transport', awbPrefix: '615', defaultCutoffHours: 3, open24h: true },
  { code: 'RU', name: 'AirBridgeCargo', awbPrefix: '580', defaultCutoffHours: 5, open24h: true },
  { code: 'KZ', name: 'Nippon Cargo Airlines', awbPrefix: '933', defaultCutoffHours: 4, open24h: true },
  { code: 'RH', name: 'Hong Kong Air Cargo', awbPrefix: '851', defaultCutoffHours: 5, open24h: true },
  { code: 'M8', name: 'Transmile Air', awbPrefix: '860', defaultCutoffHours: 5, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: '7L', name: 'Silk Way West', awbPrefix: '501', defaultCutoffHours: 5, open24h: true },
  { code: 'MB', name: 'MNG Airlines', awbPrefix: '716', defaultCutoffHours: 4, open24h: true },
  { code: 'QT', name: 'Avianca Cargo', awbPrefix: '729', defaultCutoffHours: 4, open24h: false, openTime: '05:00', closeTime: '23:00' },
  { code: 'LA', name: 'LATAM Cargo', awbPrefix: '045', defaultCutoffHours: 4, open24h: true },
  { code: 'CM', name: 'Copa Airlines Cargo', awbPrefix: '230', defaultCutoffHours: 4, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'AM', name: 'Aeroméxico Cargo', awbPrefix: '139', defaultCutoffHours: 3, open24h: true },
  { code: 'AV', name: 'Avianca', awbPrefix: '134', defaultCutoffHours: 4, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'G3', name: 'GOL Logística', awbPrefix: '127', defaultCutoffHours: 4, open24h: false, openTime: '06:00', closeTime: '21:00' },
  { code: 'JJ', name: 'LATAM Brasil Cargo', awbPrefix: '957', defaultCutoffHours: 4, open24h: true },
  { code: 'AR', name: 'Aerolíneas Argentinas Cargo', awbPrefix: '044', defaultCutoffHours: 5, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'ET', name: 'Ethiopian Cargo', awbPrefix: '071', defaultCutoffHours: 5, open24h: true },
  { code: 'MS', name: 'EgyptAir Cargo', awbPrefix: '077', defaultCutoffHours: 5, open24h: true },
  { code: 'KQ', name: 'Kenya Airways Cargo', awbPrefix: '706', defaultCutoffHours: 5, open24h: false, openTime: '05:00', closeTime: '23:00' },
  { code: 'SA', name: 'South African Airways Cargo', awbPrefix: '083', defaultCutoffHours: 6, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'AT', name: 'Royal Air Maroc Cargo', awbPrefix: '147', defaultCutoffHours: 5, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'HU', name: 'Hainan Airlines Cargo', awbPrefix: '880', defaultCutoffHours: 5, open24h: true },
  { code: 'MF', name: 'XiamenAir Cargo', awbPrefix: '731', defaultCutoffHours: 5, open24h: true },
  { code: 'FM', name: 'Shanghai Airlines Cargo', awbPrefix: '774', defaultCutoffHours: 5, open24h: true },
  { code: '3U', name: 'Sichuan Airlines Cargo', awbPrefix: '876', defaultCutoffHours: 5, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'HO', name: 'Juneyao Air Cargo', awbPrefix: '018', defaultCutoffHours: 5, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'LD', name: 'AHK Air Hong Kong', awbPrefix: '288', defaultCutoffHours: 4, open24h: true },
  { code: 'HX', name: 'Hong Kong Airlines Cargo', awbPrefix: '851', defaultCutoffHours: 5, open24h: true },
  { code: 'TG', name: 'Thai Airways Cargo', awbPrefix: '217', defaultCutoffHours: 5, open24h: true },
  { code: 'VN', name: 'Vietnam Airlines Cargo', awbPrefix: '738', defaultCutoffHours: 5, open24h: false, openTime: '05:00', closeTime: '23:00' },
  { code: 'MH', name: 'Malaysia Airlines Cargo', awbPrefix: '232', defaultCutoffHours: 5, open24h: true },
  { code: 'GA', name: 'Garuda Indonesia Cargo', awbPrefix: '126', defaultCutoffHours: 5, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'PR', name: 'Philippine Airlines Cargo', awbPrefix: '079', defaultCutoffHours: 5, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'BI', name: 'Royal Brunei Cargo', awbPrefix: '672', defaultCutoffHours: 6, open24h: false, openTime: '06:00', closeTime: '21:00' },
  { code: 'UL', name: 'SriLankan Cargo', awbPrefix: '603', defaultCutoffHours: 5, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'AI', name: 'Air India Cargo', awbPrefix: '098', defaultCutoffHours: 5, open24h: true },
  { code: '6E', name: 'IndiGo Cargo', awbPrefix: '312', defaultCutoffHours: 4, open24h: false, openTime: '05:00', closeTime: '23:00' },
  { code: 'WY', name: 'Oman Air Cargo', awbPrefix: '910', defaultCutoffHours: 5, open24h: true },
  { code: 'GF', name: 'Gulf Air Cargo', awbPrefix: '072', defaultCutoffHours: 5, open24h: true },
  { code: 'RJ', name: 'Royal Jordanian Cargo', awbPrefix: '512', defaultCutoffHours: 5, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'ME', name: 'Middle East Airlines Cargo', awbPrefix: '076', defaultCutoffHours: 5, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'KU', name: 'Kuwait Airways Cargo', awbPrefix: '229', defaultCutoffHours: 5, open24h: true },
  { code: 'FDB', name: 'flydubai Cargo', awbPrefix: '141', defaultCutoffHours: 4, open24h: true },
  { code: 'W6', name: 'Wizz Air Cargo', awbPrefix: '533', defaultCutoffHours: 3, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'FR', name: 'Ryanair Cargo', awbPrefix: '224', defaultCutoffHours: 3, open24h: false, openTime: '05:00', closeTime: '23:00' },
  { code: 'U2', name: 'easyJet Cargo', awbPrefix: '888', defaultCutoffHours: 3, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'DY', name: 'Norwegian Cargo', awbPrefix: '328', defaultCutoffHours: 4, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'FI', name: 'Icelandair Cargo', awbPrefix: '108', defaultCutoffHours: 4, open24h: false, openTime: '05:00', closeTime: '21:00' },
  { code: 'WS', name: 'WestJet Cargo', awbPrefix: '838', defaultCutoffHours: 3, open24h: false, openTime: '05:00', closeTime: '23:00' },
  { code: 'PD', name: 'Porter Airlines Cargo', awbPrefix: '245', defaultCutoffHours: 3, open24h: false, openTime: '06:00', closeTime: '21:00' },
  { code: 'Y4', name: 'Volaris Cargo', awbPrefix: '037', defaultCutoffHours: 3, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'VB', name: 'VivaAerobus Cargo', awbPrefix: '236', defaultCutoffHours: 3, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'B6', name: 'JetBlue Cargo', awbPrefix: '279', defaultCutoffHours: 3, open24h: false, openTime: '05:00', closeTime: '23:00' },
  { code: 'AS', name: 'Alaska Air Cargo', awbPrefix: '027', defaultCutoffHours: 3, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'HA', name: 'Hawaiian Airlines Cargo', awbPrefix: '173', defaultCutoffHours: 4, open24h: false, openTime: '06:00', closeTime: '21:00' },
  { code: 'F9', name: 'Frontier Airlines Cargo', awbPrefix: '422', defaultCutoffHours: 3, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: 'NK', name: 'Spirit Airlines Cargo', awbPrefix: '487', defaultCutoffHours: 3, open24h: false, openTime: '06:00', closeTime: '22:00' },
  { code: 'G4', name: 'Allegiant Air Cargo', awbPrefix: '691', defaultCutoffHours: 3, open24h: false, openTime: '06:00', closeTime: '21:00' },
  { code: 'SY', name: 'Sun Country Cargo', awbPrefix: '337', defaultCutoffHours: 3, open24h: false, openTime: '05:00', closeTime: '22:00' },
  { code: '9W', name: 'Jet Airways Cargo (legacy)', awbPrefix: '589', defaultCutoffHours: 5, open24h: false, openTime: '06:00', closeTime: '20:00', notes: 'Historical prefix retained for demo AWB parsing' },
];

// Deduplicate awbPrefix if any collision (HX vs RH both 851 in list — fix)
function uniqueAirlines() {
  const seen = new Set();
  const out = [];
  let extra = 900;
  for (const a of AIRLINES) {
    let prefix = a.awbPrefix;
    while (seen.has(prefix)) {
      prefix = String(extra++).padStart(3, '0');
    }
    seen.add(prefix);
    out.push({
      ...a,
      awbPrefix: prefix,
      terminalAddress: a.terminalAddress || `ORD Cargo — ${a.name} dock`,
      contactPhone: a.contactPhone || `773-555-${pad(randInt(1000, 9999), 4)}`,
      open24h: a.open24h ?? false,
      openTime: a.open24h ? null : (a.openTime || '05:00'),
      closeTime: a.open24h ? null : (a.closeTime || '23:00'),
      defaultCutoffHours: a.defaultCutoffHours || 4,
      notes: a.notes || null,
    });
  }
  // Pad to 100 if short
  while (out.length < 100) {
    const i = out.length + 1;
    const prefix = String(700 + i).padStart(3, '0');
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    out.push({
      code: `X${String(i).padStart(2, '0')}`.slice(0, 3),
      name: `Regional Cargo Carrier ${i}`,
      awbPrefix: prefix,
      terminalAddress: `ORD Cargo Annex Bay ${i}`,
      contactPhone: `773-555-${pad(2000 + i, 4)}`,
      open24h: false,
      openTime: '06:00',
      closeTime: '22:00',
      defaultCutoffHours: 4,
      notes: 'Synthetic carrier for volume testing',
    });
  }
  return out.slice(0, 100);
}

// ─── DRIVER identity pools ─────────────────────────────────────────────────
const FIRST = [
  'Alex','Jordan','Sam','Casey','Morgan','Riley','Taylor','Jamie','Chris','Pat',
  'Drew','Avery','Quinn','Reese','Skyler','Cameron','Blake','Harper','Logan','Parker',
  'Devon','Finley','Hayden','Kendall','Lane','Micah','Noah','Peyton','Remy','Sage',
  'Tatum','Val','Wes','Zion','Ari','Brook','Dale','Ellis','Frankie','Gray',
  'Hector','Isabel','Javier','Kara','Luis','Maya','Nina','Omar','Priya','Ravi',
];
const LAST = [
  'Lopez','Wilson','Martinez','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson',
  'Garcia','Robinson','Clark','Rodriguez','Lewis','Lee','Walker','Hall','Allen','Young',
  'King','Wright','Scott','Torres','Nguyen','Patel','Kim','Brooks','Kelly','Sanders',
  'Price','Bennett','Wood','Barnes','Ross','Henderson','Coleman','Jenkins','Perry','Hughes',
  'Khan','Singh','Chen','Okafor','Mbeki','Silva','Costa','Ivanov','Kowalski','Nakamura',
];

async function wipe() {
  console.log('Wiping operational data…');
  // Order respects FKs
  try { await prisma.shipmentGroupShipment.deleteMany(); } catch (_) {}
  try { await prisma.shipmentGroup.deleteMany(); } catch (_) {}
  // Disconnect trip-shipment M2M by deleting trips first if client allows
  await prisma.trip.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.airline.deleteMany();
  await prisma.warehouse.deleteMany();
  console.log('Wipe complete.');
}

async function seedWarehouses() {
  console.log('Seeding warehouses…');
  const rows = [];
  for (const w of WAREHOUSES) {
    rows.push(await prisma.warehouse.create({ data: w }));
  }
  console.log(`  ${rows.length} warehouses`);
  return rows;
}

async function seedAirlines() {
  console.log('Seeding airlines…');
  const list = uniqueAirlines();
  const rows = [];
  for (const a of list) {
    rows.push(await prisma.airline.create({ data: a }));
  }
  console.log(`  ${rows.length} airlines`);
  return rows;
}

async function seedDrivers() {
  console.log('Seeding 50 drivers…');
  const classes = [
    ...Array(28).fill('A'),
    ...Array(14).fill('B'),
    ...Array(8).fill('C'),
  ];
  const dayOffPatterns = [
    ['Sat', 'Sun'], ['Sun'], ['Sat'], ['Mon'], ['Wed'],
    ['Fri', 'Sat'], ['Sun', 'Mon'], ['Tue', 'Wed'], ['Thu', 'Fri'], ['Sat', 'Sun', 'Mon'],
  ];
  const shiftPairs = [
    [6, 14], [7, 15], [8, 16], [5, 13], [10, 18],
    [12, 20], [14, 22], [4, 12], [9, 17], [6, 16],
  ];
  const statuses = [
    ...Array(22).fill('Available'),
    ...Array(6).fill('On Call'),
    ...Array(5).fill('Off Duty'),
    ...Array(4).fill('Break'),
    ...Array(3).fill('On Trip'),
    ...Array(4).fill('Vacation'),
    ...Array(3).fill('Sick Leave'),
    ...Array(3).fill('Training'),
  ];

  const drivers = [];
  for (let i = 0; i < 50; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 3 + 1) % LAST.length];
    const name = `${first} ${last}`;
    const licenseClass = classes[i];
    const vehicleTypes =
      licenseClass === 'A' ? (i % 3 === 0 ? ['Tractor', 'Straight Truck'] : ['Tractor']) :
      licenseClass === 'B' ? ['Straight Truck', 'Cube Truck'] :
      ['Cube Truck'];

    const [sh, eh] = shiftPairs[i % shiftPairs.length];
    const daysOff = dayOffPatterns[i % dayOffPatterns.length];
    const schedule = `${daysOff.includes('Sat') && daysOff.includes('Sun') ? 'Mon-Fri' : 'Custom'} (${isoHour(sh)}-${isoHour(eh)})`;
    const status = statuses[i % statuses.length];

    let leaveStart = null;
    let leaveEnd = null;
    let statusReason = null;
    if (status === 'Vacation') {
      leaveStart = daysFromNow(-1);
      leaveEnd = daysFromNow(5 + (i % 5));
      statusReason = 'Approved vacation';
    } else if (status === 'Sick Leave') {
      leaveStart = daysFromNow(-1);
      leaveEnd = daysFromNow(2 + (i % 3));
      statusReason = 'Doctor note on file';
    } else if (status === 'Training') {
      leaveStart = daysFromNow(0);
      leaveEnd = daysFromNow(2);
      statusReason = 'Hazmat / GDP refresher';
    }

    const breakUntil = status === 'Break' ? daysFromNow(0, new Date().getHours(), new Date().getMinutes() + 15) : null;
    const lastCheckin =
      ['Available', 'Break', 'On Trip'].includes(status) && i % 5 !== 0
        ? daysFromNow(0, sh - 1 + (i % 2), randInt(0, 50))
        : null;

    const licExp = daysFromNow(randInt(-20, 400));
    const medExp =
      licenseClass === 'C' && i % 5 === 0 ? null : daysFromNow(randInt(-30, 360));

    const data = {
      name,
      employeeId: `ORD-D${pad(i + 1)}`,
      phone: `312-555-${pad(1000 + i, 4)}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@ord-cargo.com`.slice(0, 100),
      address: `${100 + i * 11} Cargo Parkway, Bensenville, IL 60106`,
      dateOfBirth: daysFromNow(-365 * (25 + (i % 30))),
      gender: pick(['Male', 'Female', 'Non-Binary', null]),

      status,
      statusReason,
      leaveStart,
      leaveEnd,

      schedule: schedule.slice(0, 100),
      shiftStart: isoHour(sh),
      shiftEnd: isoHour(eh),
      daysOff,
      availableOnDaysOff: i % 9 === 0,
      overtimePreference: i % 2 === 0,
      maxWeeklyHours: i % 5 === 0 ? 50 : 60,

      licenseNumber: `IL-${licenseClass}-${String(200000 + i * 17).slice(-6)}`,
      licenseClass,
      licenseExpiration: licExp,
      licensePhoto: null,
      medicalCertExpiration: medExp,
      endorsements:
        licenseClass === 'A' && i % 3 === 0 ? ['Hazmat', 'Tanker'] :
        licenseClass === 'A' && i % 3 === 1 ? ['Doubles'] :
        licenseClass === 'B' && i % 4 === 0 ? ['Hazmat'] : [],
      vehicleTypes,
      trailerEligible: licenseClass !== 'C',
      hazmatCertified: i % 4 === 0 || i % 5 === 0,
      gdpTrained: i % 3 === 0,

      currentLocation: pick(['ORD T5', 'MDW Cargo', 'Yard A', 'I-294', 'CES Dock', 'Home']),
      currentLatitude: 41.97 + (Math.random() - 0.5) * 0.08,
      currentLongitude: -87.9 + (Math.random() - 0.5) * 0.08,
      lastCheckin,
      hoursDrivenToday: status === 'On Trip' ? 2 + (i % 6) : i % 7 === 0 ? 1.5 : 0,
      onDutyHours: status === 'On Trip' ? 4 + (i % 4) : 0,
      lastBreakTime: status === 'Break' ? daysFromNow(0, new Date().getHours() - 1) : null,
      breakUntil,
      shiftStartTime: lastCheckin,
      shiftEndTime: status === 'Off Duty' ? daysFromNow(-1, 18) : null,

      preferredRunTypes:
        i % 4 === 0 ? ['Import'] :
        i % 4 === 1 ? ['Export'] :
        i % 4 === 2 ? ['Import', 'Export'] : ['Local', 'Import'],
      homeBase: pick(['ORD', 'MDW', 'RFD', 'Yard A']),
      maxRadius: licenseClass === 'A' ? 250 : licenseClass === 'B' ? 120 : 60,
      overnightAllowed: licenseClass === 'A',
      crossBorder: i % 8 === 0,

      performanceRating: Math.min(5, Math.round((3 + (i % 20) / 10) * 10) / 10),
      totalTripsCompleted: (i * 11) % 200,
      onTimeDeliveryRate: 85 + (i % 15),
      safetyScore: 88 + (i % 12),
      incidents: i % 11 === 0 ? 1 : 0,

      hireDate: daysFromNow(-30 * (6 + (i % 48))),
      employmentStatus: 'Active',
      payType: i % 5 === 0 ? 'Per Mile' : 'Hourly',
      payRate: licenseClass === 'A' ? 28 + (i % 8) : licenseClass === 'B' ? 24 + (i % 5) : 20 + (i % 4),
      overtimeRate: null,
      bonusEligible: i % 3 === 0,
      lastPayRaise: daysFromNow(-60 * (1 + (i % 8))),

      emergencyContactName: `EC ${last}`,
      emergencyContactPhone: `312-555-${pad(2000 + i, 4)}`,
      emergencyContactRelation: pick(['Spouse', 'Parent', 'Sibling', 'Friend']),

      notes: i % 6 === 0 ? 'Prefers early airport turns' : i % 11 === 0 ? 'GDP trained — pharma preferred' : null,
      specialSkills: i % 5 === 0 ? 'Forklift' : i % 7 === 0 ? 'Bilingual ES' : null,
      medicalConditions: null,
    };

    drivers.push(await prisma.driver.create({ data }));
  }
  console.log(`  ${drivers.length} drivers`);
  return drivers;
}

async function seedEquipment() {
  console.log('Seeding equipment (Volvo / Mack / Isuzu / Hyundai trailers)…');
  const units = [];

  const powerSpecs = [
    // Tractors — Volvo & Mack
    ...Array.from({ length: 18 }, (_, i) => ({
      prefix: 'TRC', n: i + 1, equipmentType: 'Tractor', category: 'Power Unit',
      modelDetails: i % 2 === 0 ? `Volvo VNL 860 ${2020 + (i % 5)}` : `Mack Anthem 6x4 ${2019 + (i % 6)}`,
      capacityLbs: 80000, year: 2019 + (i % 6),
    })),
    // Straight trucks — mix
    ...Array.from({ length: 12 }, (_, i) => ({
      prefix: 'STT', n: i + 1, equipmentType: 'Straight Truck', category: 'Power Unit',
      modelDetails: i % 2 === 0 ? `Volvo VNR 300 ${2021 + (i % 4)}` : `Mack MD6 ${2020 + (i % 5)}`,
      capacityLbs: 12000, year: 2020 + (i % 5),
    })),
    // Cube — Isuzu
    ...Array.from({ length: 10 }, (_, i) => ({
      prefix: 'CBT', n: i + 1, equipmentType: 'Cube Truck', category: 'Power Unit',
      modelDetails: `Isuzu NPR-HD ${2021 + (i % 4)}`,
      capacityLbs: 6000, year: 2021 + (i % 4),
    })),
    // Sprinter-style
    ...Array.from({ length: 6 }, (_, i) => ({
      prefix: 'SPV', n: i + 1, equipmentType: 'Sprinter Van', category: 'Power Unit',
      modelDetails: `Mercedes Sprinter 2500 ${2022 + (i % 3)}`,
      capacityLbs: 3500, year: 2022 + (i % 3),
    })),
  ];

  const trailerSpecs = [
    ...Array.from({ length: 20 }, (_, i) => ({
      prefix: 'RBT', n: i + 1, equipmentType: 'Roller Bed', category: 'Trailer',
      modelDetails: i % 2 === 0 ? 'Hyundai Translead Rollerbed 53' : 'Wabash Rollerbed 53',
      capacityLbs: 45000, palletPositions: 26, year: 2018 + (i % 7),
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      prefix: 'DRY', n: i + 1, equipmentType: 'Dry Van', category: 'Trailer',
      modelDetails: i % 2 === 0 ? 'Hyundai Translead Dry Van 53' : 'Great Dane Dry Van 53',
      capacityLbs: 45000, palletPositions: 26, year: 2017 + (i % 8),
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      prefix: 'REF', n: i + 1, equipmentType: 'Reefer', category: 'Trailer',
      modelDetails: i % 2 === 0 ? 'Hyundai Reefer 53' : 'Utility 3000R Reefer',
      capacityLbs: 43000, palletPositions: 24, year: 2019 + (i % 6),
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      prefix: 'FLB', n: i + 1, equipmentType: 'Flat Bed', category: 'Trailer',
      modelDetails: 'Fontaine Infinity Flatbed',
      capacityLbs: 48000, year: 2018 + (i % 5),
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      prefix: 'OPD', n: i + 1, equipmentType: 'Open Deck', category: 'Trailer',
      modelDetails: 'Transcraft Eagle Open Deck',
      capacityLbs: 48000, year: 2019 + (i % 4),
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      prefix: 'LOB', n: i + 1, equipmentType: 'Low Boy', category: 'Trailer',
      modelDetails: 'Trail King Lowboy',
      capacityLbs: 80000, year: 2016 + (i % 6),
    })),
  ];

  for (const s of [...powerSpecs, ...trailerSpecs]) {
    const unitNumber = `${s.prefix}-${pad(s.n)}`;
    const oos = Math.random() < 0.06;
    units.push(await prisma.equipment.create({
      data: {
        unitNumber,
        equipmentType: s.equipmentType,
        category: s.category,
        status: oos ? 'Out of Service' : 'In Service',
        outOfServiceReason: oos ? pick(['Brake repair', 'Awaiting parts', 'DOT inspection']) : null,
        modelDetails: s.modelDetails,
        capacityLbs: s.capacityLbs,
        palletPositions: s.palletPositions || null,
        year: s.year,
        licensePlate: `IL${randInt(100000, 999999)}`,
        vin: `1M${randInt(100000000, 999999999)}${pad(s.n, 4)}`.slice(0, 17),
        registrationExpiration: daysFromNow(randInt(-15, 320)),
        nextMaintenanceDue: daysFromNow(randInt(-5, 120)),
        notes: null,
      },
    }));
  }
  console.log(`  ${units.length} equipment units`);
  return units;
}

async function seedShipments(airlines, warehouses) {
  console.log('Seeding 120+ shipments…');
  const shipments = [];
  let ordSeq = 1000;

  // Imports — ~70
  for (let i = 0; i < 70; i++) {
    const airline = pick(airlines);
    const warehouse = pick(warehouses);
    const day = randInt(-4, 4);
    const lastFreeDay = daysFromNow(day, 17);
    const overdue = lastFreeDay.getTime() < Date.now();
    const storageFeeDaysOver = overdue ? randInt(1, 5) : 0;
    const isGDP = Math.random() < 0.22;
    const status = pick([
      'Pending', 'Pending', 'Pending', 'Pending',
      'Assigned', 'Assigned',
      'In Transit',
      'Completed', 'Completed', 'Completed',
    ]);
    const storageFeePaid = storageFeeDaysOver > 0 ? Math.random() < 0.55 : true;
    const terminalFeePaid = Math.random() < 0.7;

    shipments.push(await prisma.shipment.create({
      data: {
        type: 'Import',
        status,
        airlineId: airline.id,
        warehouseId: warehouse.id,
        airwaybillNumber: randomAwb8(),
        ordNumber: `ORD-${String(ordSeq++).padStart(5, '0')}`,
        pieces: randInt(1, 48),
        weight: randInt(40, 9000),
        weightUnit: Math.random() < 0.55 ? 'lb' : 'kg',
        pmcCount: Math.random() < 0.35 ? randInt(1, 5) : 0,
        lastFreeDay,
        storageFeePerDay: pick([35, 45, 55, 65, 75]),
        storageFeeDaysOver,
        storageFeePaid,
        terminalFee: pick([50, 75, 95, 120]),
        terminalFeePaid,
        isGDP,
        gdpTemperatureRange: isGDP ? pick(['2-8°C', '15-25°C', '2-8°C']) : null,
        notes: Math.random() < 0.15 ? 'Fragile — upright only' : null,
      },
    }));
  }

  // Exports — ~60
  for (let i = 0; i < 60; i++) {
    const airline = pick(airlines);
    const warehouse = pick(warehouses);
    const day = randInt(0, 5);
    const flightHour = randInt(6, 22);
    const flightDate = daysFromNow(day, flightHour);
    const cutoff = airline.defaultCutoffHours || 4;
    const lockoutTime = new Date(flightDate.getTime() - cutoff * 3600000);
    const pickupReadyAt = new Date(flightDate.getTime() - (cutoff + 3) * 3600000);
    const deliveryAppointmentAt = new Date(flightDate.getTime() - (cutoff - 1) * 3600000);
    const status = pick([
      'Pending', 'Pending', 'Pending', 'Pending',
      'Assigned', 'Assigned',
      'In Transit',
      'Completed', 'Completed',
    ]);

    shipments.push(await prisma.shipment.create({
      data: {
        type: 'Export',
        status,
        airlineId: airline.id,
        warehouseId: warehouse.id,
        airwaybillNumber: randomAwb8(),
        pieces: randInt(1, 36),
        weight: randInt(30, 7000),
        weightUnit: Math.random() < 0.55 ? 'lb' : 'kg',
        pmcCount: Math.random() < 0.3 ? randInt(1, 4) : 0,
        flightDate,
        lockoutTime,
        pickupReadyAt,
        deliveryAppointmentAt,
        doorNumber: status !== 'Pending' && Math.random() < 0.5 ? String(randInt(1, 30)) : null,
        truckType: pick(['Straight', 'Cube', null]),
        notes: Math.random() < 0.1 ? 'Must make airline cutoff' : null,
      },
    }));
  }

  console.log(`  ${shipments.length} shipments`);
  return shipments;
}

async function seedTrips(drivers, equipment, shipments) {
  console.log('Seeding 55+ trips (~30 completed)…');
  const powerUnits = equipment.filter((e) => e.category === 'Power Unit' && e.status === 'In Service');
  const trailers = equipment.filter((e) => e.category === 'Trailer' && e.status === 'In Service');
  const activeDrivers = drivers.filter((d) =>
    ['Available', 'On Call', 'On Trip', 'Break', 'Off Duty'].includes(d.status),
  );

  const pendingImp = shipments.filter((s) => s.type === 'Import' && s.status === 'Pending');
  const pendingExp = shipments.filter((s) => s.type === 'Export' && s.status === 'Pending');
  const completedShips = shipments.filter((s) => s.status === 'Completed');
  const assignedShips = shipments.filter((s) => s.status === 'Assigned' || s.status === 'In Transit');

  const trips = [];
  let seq = 1;
  const year = new Date().getFullYear();

  const makeTripNumber = () => `TRIP-${year}-${pad(seq++, 4)}`;

  // 30 completed runs spread over last 14 days
  for (let i = 0; i < 30; i++) {
    const runType = i % 2 === 0 ? 'Import' : 'Export';
    const driver = pick(activeDrivers);
    const truck = pick(powerUnits);
    const trailer = truck.equipmentType === 'Tractor' && Math.random() < 0.65 ? pick(trailers) : null;
    const dayOffset = -randInt(0, 14);
    const planned = daysFromNow(dayOffset, randInt(5, 14), randInt(0, 45));
    const windowHrs = randInt(2, 6);
    const expected = new Date(planned.getTime() + windowHrs * 3600000);
    // Mix on-time and late finishes
    const lateMins = Math.random() < 0.28 ? randInt(15, 90) : -randInt(0, 25);
    const startTime = new Date(planned.getTime() + randInt(-10, 25) * 60000);
    const finishTime = new Date(expected.getTime() + lateMins * 60000);

    // Prefer completed-status shipments of matching type; fall back to any
    let pool = completedShips.filter((s) => s.type === runType);
    if (pool.length < 1) pool = shipments.filter((s) => s.type === runType);
    const cargo = pickN(pool, randInt(1, Math.min(3, pool.length || 1)));

    const trip = await prisma.trip.create({
      data: {
        tripNumber: makeTripNumber(),
        runType,
        status: 'Completed',
        driverId: driver.id,
        truckId: truck.id,
        trailerId: trailer?.id || null,
        plannedDepartureTime: planned,
        expectedCompletionTime: expected,
        startTime,
        finishTime,
        notes: Math.random() < 0.2 ? 'Airport traffic delay noted' : '',
        shipmentIds: cargo.map((c) => c.id),
        shipments: cargo.length ? { connect: cargo.map((c) => ({ id: c.id })) } : undefined,
      },
    });
    trips.push(trip);
  }

  // 10 scheduled
  for (let i = 0; i < 10; i++) {
    const runType = i % 2 === 0 ? 'Import' : 'Export';
    const driver = pick(activeDrivers);
    const truck = pick(powerUnits);
    const trailer = truck.equipmentType === 'Tractor' && Math.random() < 0.5 ? pick(trailers) : null;
    const planned = daysFromNow(randInt(0, 2), randInt(6, 16));
    const expected = new Date(planned.getTime() + randInt(2, 5) * 3600000);
    const pool = (runType === 'Import' ? pendingImp : pendingExp);
    const cargo = pickN(pool.length ? pool : shipments.filter((s) => s.type === runType), randInt(1, 2));

    trips.push(await prisma.trip.create({
      data: {
        tripNumber: makeTripNumber(),
        runType,
        status: 'Scheduled',
        driverId: driver.id,
        truckId: truck.id,
        trailerId: trailer?.id || null,
        plannedDepartureTime: planned,
        expectedCompletionTime: expected,
        notes: '',
        shipmentIds: cargo.map((c) => c.id),
        shipments: cargo.length ? { connect: cargo.map((c) => ({ id: c.id })) } : undefined,
      },
    }));
  }

  // 10 en route
  for (let i = 0; i < 10; i++) {
    const runType = i % 2 === 0 ? 'Import' : 'Export';
    const driver = pick(activeDrivers);
    const truck = pick(powerUnits);
    const trailer = truck.equipmentType === 'Tractor' && Math.random() < 0.55 ? pick(trailers) : null;
    const planned = daysFromNow(0, randInt(4, 12));
    const expected = new Date(planned.getTime() + randInt(2, 5) * 3600000);
    const startTime = new Date(planned.getTime() + randInt(-5, 20) * 60000);
    const pool = assignedShips.filter((s) => s.type === runType);
    const cargo = pickN(pool.length ? pool : shipments.filter((s) => s.type === runType), randInt(1, 2));

    trips.push(await prisma.trip.create({
      data: {
        tripNumber: makeTripNumber(),
        runType,
        status: 'En Route',
        driverId: driver.id,
        truckId: truck.id,
        trailerId: trailer?.id || null,
        plannedDepartureTime: planned,
        expectedCompletionTime: expected,
        startTime,
        notes: Math.random() < 0.15 ? 'Driver reported heavy terminal queue' : '',
        shipmentIds: cargo.map((c) => c.id),
        shipments: cargo.length ? { connect: cargo.map((c) => ({ id: c.id })) } : undefined,
      },
    }));
  }

  // 5 more mixed recent completed for analytics density
  for (let i = 0; i < 5; i++) {
    const runType = pick(['Import', 'Export']);
    const driver = pick(activeDrivers);
    const truck = pick(powerUnits);
    const planned = daysFromNow(-randInt(1, 7), randInt(6, 15));
    const expected = new Date(planned.getTime() + randInt(2, 4) * 3600000);
    const startTime = new Date(planned.getTime() + randInt(0, 15) * 60000);
    const finishTime = new Date(expected.getTime() + randInt(-20, 40) * 60000);
    const cargo = pickN(shipments.filter((s) => s.type === runType), 1);

    trips.push(await prisma.trip.create({
      data: {
        tripNumber: makeTripNumber(),
        runType,
        status: 'Completed',
        driverId: driver.id,
        truckId: truck.id,
        plannedDepartureTime: planned,
        expectedCompletionTime: expected,
        startTime,
        finishTime,
        notes: '',
        shipmentIds: cargo.map((c) => c.id),
        shipments: cargo.length ? { connect: cargo.map((c) => ({ id: c.id })) } : undefined,
      },
    }));
  }

  console.log(`  ${trips.length} trips (completed≈${trips.filter((t) => t.status === 'Completed').length})`);
  return trips;
}

async function assignSomeHandoffs(drivers, equipment) {
  // Morning-style handoffs for ~12 available drivers so Handoff/Dispatch look alive
  const available = drivers.filter((d) => d.status === 'Available' && d.lastCheckin);
  const freeTrucks = equipment.filter(
    (e) => e.category === 'Power Unit' && e.status === 'In Service' && !e.assignedDriverId,
  );
  let n = 0;
  for (let i = 0; i < Math.min(12, available.length, freeTrucks.length); i++) {
    await prisma.equipment.update({
      where: { id: freeTrucks[i].id },
      data: { assignedDriverId: available[i].id, availableAt: null },
    });
    n++;
  }
  console.log(`  ${n} morning handoff assignments`);
}

async function main() {
  console.log('══════════════════════════════════════════════');
  console.log(' ORD Cargo — full database rebuild seed');
  console.log('══════════════════════════════════════════════');
  await wipe();
  const warehouses = await seedWarehouses();
  const airlines = await seedAirlines();
  const drivers = await seedDrivers();
  const equipment = await seedEquipment();
  const shipments = await seedShipments(airlines, warehouses);
  const trips = await seedTrips(drivers, equipment, shipments);
  await assignSomeHandoffs(drivers, equipment);

  console.log('──────────────────────────────────────────────');
  console.log('Done.');
  console.log(`  Warehouses : ${warehouses.length}`);
  console.log(`  Airlines   : ${airlines.length}`);
  console.log(`  Drivers    : ${drivers.length}`);
  console.log(`  Equipment  : ${equipment.length}`);
  console.log(`  Shipments  : ${shipments.length}`);
  console.log(`  Trips      : ${trips.length}`);
  console.log('──────────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

