const express = require('express');
const router = express.Router();
const { createPergerakan, getAllPergerakan, deletePergerakan, updatePergerakan, downloadTemplate } = require('../controllers/pergerakanController');

// GET /api/pergerakan/template — Download template Excel untuk import
router.get('/template', downloadTemplate);

// POST /api/pergerakan — Simpan data pergerakan
router.post('/', createPergerakan);

// GET /api/pergerakan — Ambil semua data pergerakan
router.get('/', getAllPergerakan);

// DELETE /api/pergerakan/:id — Hapus data pergerakan
router.delete('/:id', deletePergerakan);

// PUT /api/pergerakan/:id — Update data pergerakan
router.put('/:id', updatePergerakan);

module.exports = router;
