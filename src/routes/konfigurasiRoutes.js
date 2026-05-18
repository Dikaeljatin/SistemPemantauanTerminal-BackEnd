const express = require('express');
const router = express.Router();
const { getAll, update } = require('../controllers/konfigurasiController');

router.get('/', getAll);
router.put('/', update);

module.exports = router;
