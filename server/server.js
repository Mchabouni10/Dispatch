require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const prisma = require('./lib/prisma');
const requireAuth = require('./middleware/requireAuth');
const protectUploads = require('./middleware/protectUploads');
const { initRealtime } = require('./lib/realtime');

const app = express();

// Socket.io needs a raw http.Server to attach to — app.listen() creates
// one internally but doesn't expose it, so we create it ourselves here
// and hand it to both Express (as before) and Socket.io.
const httpServer = http.createServer(app);
initRealtime(httpServer);

app.use(cors());
// Default limit is ~100kb, which a single warehouse photo (sent as base64 JSON)
// blows past instantly -> 413 Payload Too Large. Raised to fit a handful of
// photos per request (base64 adds ~33% overhead on top of raw file size).
app.use(express.json({ limit: '15mb' }));

// Serve uploaded files — was `express.static` with no auth at all, meaning
// anyone with a URL had permanent, unauthenticated access to driver license
// scans, DOT medical cards, passports, and airport badge photos. protectUploads
// requires a valid session and, for driver documents specifically, re-applies
// the same 'full'-access-only rule used on the JSON driver endpoints. See
// middleware/protectUploads.js for the full rationale.
app.use('/uploads', protectUploads, express.static(path.join(__dirname, 'uploads')));

// Health check remains public for deployment monitoring.
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'PostgreSQL via Prisma', time: new Date() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Authentication is public; all shared operational data requires a session.
app.use('/api/auth', require('./routes/auth'));
app.use('/api', requireAuth);

// Routes (Now using Prisma)
app.use('/api/airlines', require('./routes/airlines'));
app.use('/api/warehouses', require('./routes/warehouses'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/equipment', require('./routes/equipment'));
app.use('/api/shipments', require('./routes/shipments'));
app.use('/api/dispatch', require('./routes/dispatch'));
app.use('/api/users', require('./routes/users'));

const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('✅ PostgreSQL connected via Prisma');
});