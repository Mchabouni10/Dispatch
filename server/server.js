require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const prisma = require('./lib/prisma');
const requireAuth = require('./middleware/requireAuth');

const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('✅ PostgreSQL connected via Prisma');
});
