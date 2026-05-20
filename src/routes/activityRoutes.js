const express = require('express');
const router = express.Router();
const { getAllActivity } = require('../controllers/activityController');

router.get('/', getAllActivity);

module.exports = router;
