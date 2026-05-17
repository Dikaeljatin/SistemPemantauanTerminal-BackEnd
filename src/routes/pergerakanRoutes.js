const express = require('express');
const router = express.Router();
const { createPergerakan, getAllPergerakan, deletePergerakan, updatePergerakan } = require('../controllers/pergerakanController');

// POST /api/pergerakan — Simpan data pergerakan
router.post('/', createPergerakan);

// GET /api/pergerakan — Ambil semua data pergerakan
router.get('/', getAllPergerakan);

// DELETE /api/pergerakan/:id — Hapus data pergerakan
router.delete('/:id', deletePergerakan);

// PUT /api/pergerakan/:id — Update data pergerakan
router.put('/:id', updatePergerakan);

module.exports = router;
