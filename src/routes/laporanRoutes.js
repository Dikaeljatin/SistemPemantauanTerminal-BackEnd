const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { createLaporan, getAllLaporan, markAsRead, markAllAsRead, exportLaporan } = require('../controllers/laporanController');

router.post('/', requireAuth, requireRole('petugas'), createLaporan);
router.get('/', requireAuth, getAllLaporan);
router.get('/:id/export', requireAuth, requireRole('pimpinan', 'admin'), exportLaporan);
router.patch('/:id/read', requireAuth, requireRole('pimpinan', 'admin'), markAsRead);
router.patch('/read-all', requireAuth, requireRole('pimpinan', 'admin'), markAllAsRead);

module.exports = router;
