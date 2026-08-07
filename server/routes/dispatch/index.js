const express = require('express');
const router = express.Router();

// Core trip CRUD: GET /, GET /:id, POST /, PUT /:id, DELETE /:id
router.use(require('./trips.routes'));

// Backup driver/truck sub-resource: POST /:id/backups
router.use(require('./trip-backups.routes'));

// Trip state transitions: PATCH /:id/start, PATCH /:id/finish
router.use(require('./trip-lifecycle.routes'));

module.exports = router;