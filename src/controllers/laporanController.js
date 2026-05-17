const pool = require('../config/db');

// POST /api/laporan — Kirim laporan baru
exports.createLaporan = async (req, res) => {
  try {
    const {
      petugas_nama,
      periode,
      catatan,
      total_kendaraan,
      total_kedatangan,
      total_keberangkatan,
      total_penumpang,
    } = req.body;

    if (!periode) {
      return res.status(400).json({ error: 'Periode wajib diisi' });
    }

    const result = await pool.query(
      `INSERT INTO laporan (petugas_nama, periode, catatan, total_kendaraan, total_kedatangan, total_keberangkatan, total_penumpang)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        petugas_nama || 'Petugas',
        periode,
        catatan || '-',
        total_kendaraan || 0,
        total_kedatangan || 0,
        total_keberangkatan || 0,
        total_penumpang || 0,
      ]
    );

    res.status(201).json({
      message: 'Laporan berhasil dikirim',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error createLaporan:', error);
    res.status(500).json({ error: 'Gagal mengirim laporan' });
  }
};

// GET /api/laporan — Ambil semua laporan
exports.getAllLaporan = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM laporan ORDER BY created_at DESC'
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error getAllLaporan:', error);
    res.status(500).json({ error: 'Gagal mengambil laporan' });
  }
};

// PATCH /api/laporan/:id/read — Tandai laporan sebagai dibaca
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE laporan SET status = 'dibaca' WHERE laporan_id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Laporan tidak ditemukan' });
    }
    res.json({ message: 'Laporan ditandai dibaca', data: result.rows[0] });
  } catch (error) {
    console.error('Error markAsRead:', error);
    res.status(500).json({ error: 'Gagal update status laporan' });
  }
};

// PATCH /api/laporan/read-all — Tandai semua laporan sebagai dibaca
exports.markAllAsRead = async (req, res) => {
  try {
    await pool.query(`UPDATE laporan SET status = 'dibaca' WHERE status = 'belum-dibaca'`);
    res.json({ message: 'Semua laporan ditandai dibaca' });
  } catch (error) {
    console.error('Error markAllAsRead:', error);
    res.status(500).json({ error: 'Gagal update status laporan' });
  }
};
