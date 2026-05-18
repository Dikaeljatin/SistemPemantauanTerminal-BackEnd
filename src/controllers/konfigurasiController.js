const pool = require('../config/db');

exports.getAll = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM konfigurasi');
    const config = {};
    result.rows.forEach((r) => { config[r.key] = r.value; });
    res.json({ data: config });
  } catch (error) {
    console.error('Error getAll konfigurasi:', error);
    res.status(500).json({ error: 'Gagal mengambil konfigurasi' });
  }
};

exports.update = async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key wajib diisi' });
    await pool.query(
      'INSERT INTO konfigurasi (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      [key, value]
    );
    res.json({ message: 'Konfigurasi berhasil diupdate' });
  } catch (error) {
    console.error('Error update konfigurasi:', error);
    res.status(500).json({ error: 'Gagal update konfigurasi' });
  }
};
