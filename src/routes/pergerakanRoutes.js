const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { requireAuth, requireRole } = require('../middleware/auth');
const { createPergerakan, getAllPergerakan, getSummary, deletePergerakan, updatePergerakan, downloadTemplate, importExcel, exportExcel } = require('../controllers/pergerakanController');

router.get('/template', requireAuth, downloadTemplate);
router.get('/export', requireAuth, exportExcel);
router.get('/summary', getSummary); // publik — agregat untuk chart, dipakai dashboard/analisis
router.post('/import', requireAuth, requireRole('petugas', 'admin'), upload.single('file'), importExcel);
router.post('/', requireAuth, requireRole('petugas', 'admin'), createPergerakan);
router.get('/', getAllPergerakan); // publik — data jadwal terminal bisa dilihat tanpa login
router.delete('/:id', requireAuth, requireRole('petugas', 'admin'), deletePergerakan);
router.put('/:id', requireAuth, requireRole('petugas', 'admin'), updatePergerakan);

module.exports = router;
