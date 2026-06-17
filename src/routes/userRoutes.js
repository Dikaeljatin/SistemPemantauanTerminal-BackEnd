const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getAllUsers, createUser, updateUser, deleteUser } = require('../controllers/userController');

// Hanya super_admin yang boleh kelola user
router.get('/', requireAuth, requireRole('super_admin'), getAllUsers);
router.post('/', requireAuth, requireRole('super_admin'), createUser);
router.put('/:id', requireAuth, requireRole('super_admin'), updateUser);
router.delete('/:id', requireAuth, requireRole('super_admin'), deleteUser);

module.exports = router;
