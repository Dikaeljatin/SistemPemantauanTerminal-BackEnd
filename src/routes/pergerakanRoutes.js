const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { createPergerakan, getAllPergerakan, deletePergerakan, updatePergerakan, downloadTemplate, importExcel, exportExcel } = require('../controllers/pergerakanController');

// GET /api/pergerakan/template — Download template Excel untuk import
router.get('/template', downloadTemplate);

// GET /api/pergerakan/export — Export semua data ke Excel
router.get('/export', exportExcel);

// POST /api/pergerakan/import — Import data dari file Excel
router.post('/import', upload.single('file'), importExcel);

// POST /api/pergerakan — Simpan data pergerakan
router.post('/', createPergerakan);

// GET /api/pergerakan — Ambil semua data pergerakan
router.get('/', getAllPergerakan);

// DELETE /api/pergerakan/:id — Hapus data pergerakan
router.delete('/:id', deletePergerakan);

// PUT /api/pergerakan/:id — Update data pergerakan
router.put('/:id', updatePergerakan);

module.exports = router;
