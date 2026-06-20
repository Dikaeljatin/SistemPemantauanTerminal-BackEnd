const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getAllActivity } = require('../controllers/activityController');

// Hanya admin yang boleh lihat activity log
router.get('/', requireAuth, requireRole('admin'), getAllActivity);

module.exports = router;
