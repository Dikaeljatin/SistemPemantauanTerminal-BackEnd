const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getAll, update } = require('../controllers/konfigurasiController');

// Semua role bisa baca konfigurasi, hanya super_admin yang bisa ubah
router.get('/', requireAuth, getAll);
router.put('/', requireAuth, requireRole('super_admin'), update);

module.exports = router;
