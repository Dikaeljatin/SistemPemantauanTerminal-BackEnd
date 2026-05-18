const pool = require('../config/db');

exports.getAll = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM jenis_kendaraan ORDER BY id');
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error getAll jenis:', error);
    res.status(500).json({ error: 'Gagal mengambil data' });
  }
};

exports.create = async (req, res) => {
  try {
    const { nama, kapasitas } = req.body;
    if (!nama) return res.status(400).json({ error: 'Nama jenis wajib diisi' });
    const result = await pool.query(
      'INSERT INTO jenis_kendaraan (nama, kapasitas) VALUES ($1, $2) RETURNING *',
      [nama, kapasitas || 10]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Jenis kendaraan sudah ada' });
    console.error('Error create jenis:', error);
    res.status(500).json({ error: 'Gagal menambahkan' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, kapasitas } = req.body;
    const result = await pool.query(
      'UPDATE jenis_kendaraan SET nama = COALESCE($1, nama), kapasitas = COALESCE($2, kapasitas) WHERE id = $3 RETURNING *',
      [nama, kapasitas, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error update jenis:', error);
    res.status(500).json({ error: 'Gagal update' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM jenis_kendaraan WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json({ message: 'Berhasil dihapus' });
  } catch (error) {
    console.error('Error delete jenis:', error);
    res.status(500).json({ error: 'Gagal menghapus' });
  }
};
