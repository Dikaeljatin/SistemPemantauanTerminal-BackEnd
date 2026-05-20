const express = require('express');
const router = express.Router();
const { predict } = require('../controllers/prediksiController');

// POST /api/prediksi — Prediksi pergerakan kendaraan
router.post('/', predict);

module.exports = router;
