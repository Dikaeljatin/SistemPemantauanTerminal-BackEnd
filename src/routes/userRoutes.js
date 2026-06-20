const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getAllUsers, createUser, updateUser, deleteUser } = require('../controllers/userController');

// Hanya admin yang boleh kelola user
router.get('/', requireAuth, requireRole('admin'), getAllUsers);
router.post('/', requireAuth, requireRole('admin'), createUser);
router.put('/:id', requireAuth, requireRole('admin'), updateUser);
router.delete('/:id', requireAuth, requireRole('admin'), deleteUser);

module.exports = router;
