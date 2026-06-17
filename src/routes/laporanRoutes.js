const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { createLaporan, getAllLaporan, markAsRead, markAllAsRead, exportLaporan } = require('../controllers/laporanController');

router.post('/', requireAuth, requireRole('petugas'), createLaporan);
router.get('/', requireAuth, getAllLaporan);
router.get('/:id/export', requireAuth, requireRole('pimpinan', 'super_admin'), exportLaporan);
router.patch('/:id/read', requireAuth, requireRole('pimpinan', 'super_admin'), markAsRead);
router.patch('/read-all', requireAuth, requireRole('pimpinan', 'super_admin'), markAllAsRead);

module.exports = router;
