const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getAllUsers, createUser, updateUser, deleteUser, getMyProfile, updateMyProfile } = require('../controllers/userController');

// Profil sendiri — semua role yang login boleh akses, harus didaftarkan sebelum /:id
router.get('/me', requireAuth, getMyProfile);
router.put('/me', requireAuth, updateMyProfile);

// Hanya admin yang boleh kelola user
router.get('/', requireAuth, requireRole('admin'), getAllUsers);
router.post('/', requireAuth, requireRole('admin'), createUser);
router.put('/:id', requireAuth, requireRole('admin'), updateUser);
router.delete('/:id', requireAuth, requireRole('admin'), deleteUser);

module.exports = router;
