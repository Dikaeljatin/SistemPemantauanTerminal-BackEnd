const pool = require('../config/db');

// GET /api/users — Ambil semua user
exports.getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, nama, email, username, role, status, created_at FROM users ORDER BY user_id'
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error getAllUsers:', error);
    res.status(500).json({ error: 'Gagal mengambil data user' });
  }
};

// POST /api/users — Tambah user baru
exports.createUser = async (req, res) => {
  try {
    const { nama, email, username, password, role } = req.body;
    if (!nama || !username || !password || !role) {
      return res.status(400).json({ error: 'Field wajib tidak lengkap' });
    }
    const result = await pool.query(
      'INSERT INTO users (nama, email, username, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, nama, email, username, role',
      [nama, email || null, username, password, role]
    );
    res.status(201).json({ message: 'User berhasil ditambahkan', data: result.rows[0] });
  } catch (error) {
    console.error('Error createUser:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username atau email sudah digunakan' });
    }
    res.status(500).json({ error: 'Gagal menambahkan user' });
  }
};

// PUT /api/users/:id — Update user
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, email, username, password, role, status } = req.body;
    let query, params;
    if (password) {
      query = 'UPDATE users SET nama=$1, email=$2, username=$3, password=$4, role=$5, status=$6 WHERE user_id=$7 RETURNING user_id, nama, email, username, role, status';
      params = [nama, email || null, username, password, role, status || 'aktif', id];
    } else {
      query = 'UPDATE users SET nama=$1, email=$2, username=$3, role=$4, status=$5 WHERE user_id=$6 RETURNING user_id, nama, email, username, role, status';
      params = [nama, email || null, username, role, status || 'aktif', id];
    }
    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ message: 'User berhasil diupdate', data: result.rows[0] });
  } catch (error) {
    console.error('Error updateUser:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username atau email sudah digunakan' });
    }
    res.status(500).json({ error: 'Gagal update user' });
  }
};

// DELETE /api/users/:id — Hapus user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM user_kendaraan WHERE user_id = $1', [id]);
    const result = await pool.query('DELETE FROM users WHERE user_id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ message: 'User berhasil dihapus' });
  } catch (error) {
    console.error('Error deleteUser:', error);
    res.status(500).json({ error: 'Gagal menghapus user' });
  }
};
