const express = require('express');
const router = express.Router();
const {
  createLaporan,
  getAllLaporan,
  markAsRead,
  markAllAsRead,
  exportLaporan,
} = require('../controllers/laporanController');

router.post('/', createLaporan);
router.get('/', getAllLaporan);
router.get('/:id/export', exportLaporan);
router.patch('/:id/read', markAsRead);
router.patch('/read-all', markAllAsRead);

module.exports = router;
