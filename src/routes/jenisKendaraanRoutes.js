const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getAll, create, update, remove } = require('../controllers/jenisKendaraanController');

// Semua role bisa baca jenis kendaraan, hanya admin yang bisa ubah
router.get('/', requireAuth, getAll);
router.post('/', requireAuth, requireRole('admin'), create);
router.put('/:id', requireAuth, requireRole('admin'), update);
router.delete('/:id', requireAuth, requireRole('admin'), remove);

module.exports = router;
