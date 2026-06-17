const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { predict } = require('../controllers/prediksiController');

// Semua role yang login boleh akses prediksi
router.post('/', requireAuth, predict);

module.exports = router;
