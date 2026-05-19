const pool = require('../config/db');

// GET /api/pergerakan/template — Download template Excel untuk import data kendaraan
exports.downloadTemplate = async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();

    // Header columns matching the import format
    const headers = [
      'Timestamp',
      'Status',
      'TNKB',
      'Jenis Kendaraan',
      'Jumlah Penumpang Kedatangan',
      'Jumlah Penumpang Keberangkatan',
      'Trayek Asal',
      'Trayek Tujuan',
      'Nama Perusahaan',
    ];

    // Example data rows
    const exampleData = [
      {
        'Timestamp': '2025-01-15 08:30',
        'Status': 'Kedatangan',
        'TNKB': 'BL 1234 AB',
        'Jenis Kendaraan': 'KIA',
        'Jumlah Penumpang Kedatangan': 5,
        'Jumlah Penumpang Keberangkatan': '',
        'Trayek Asal': 'Banda Aceh',
        'Trayek Tujuan': 'Blangpidie',
        'Nama Perusahaan': 'Nagan Raya',
      },
      {
        'Timestamp': '2025-01-15 09:00',
        'Status': 'Keberangkatan',
        'TNKB': 'BL 5678 CD',
        'Jenis Kendaraan': 'HIACE',
        'Jumlah Penumpang Kedatangan': '',
        'Jumlah Penumpang Keberangkatan': 8,
        'Trayek Asal': 'Blangpidie',
        'Trayek Tujuan': 'Meulaboh',
        'Nama Perusahaan': 'Flamboyan Jaya Pratama',
      },
      {
        'Timestamp': '2025-01-15 10:15',
        'Status': 'Kedatangan',
        'TNKB': 'BL 9012 EF',
        'Jenis Kendaraan': 'L300',
        'Jumlah Penumpang Kedatangan': 3,
        'Jumlah Penumpang Keberangkatan': '',
        'Trayek Asal': 'Tapaktuan',
        'Trayek Tujuan': 'Blangpidie',
        'Nama Perusahaan': '-',
      },
    ];

    // Create data sheet with examples
    const ws = XLSX.utils.json_to_sheet(exampleData);

    // Set column widths
    ws['!cols'] = [
      { wch: 20 }, // Timestamp
      { wch: 16 }, // Status
      { wch: 14 }, // TNKB
      { wch: 18 }, // Jenis Kendaraan
      { wch: 28 }, // Jumlah Penumpang Kedatangan
      { wch: 30 }, // Jumlah Penumpang Keberangkatan
      { wch: 18 }, // Trayek Asal
      { wch: 18 }, // Trayek Tujuan
      { wch: 24 }, // Nama Perusahaan
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Data Import');

    // Create instruction sheet
    const instruksi = [
      { 'Kolom': 'Timestamp', 'Format': 'YYYY-MM-DD HH:mm', 'Contoh': '2025-01-15 08:30', 'Keterangan': 'Tanggal dan waktu pergerakan' },
      { 'Kolom': 'Status', 'Format': 'Kedatangan / Keberangkatan', 'Contoh': 'Kedatangan', 'Keterangan': 'Status pergerakan kendaraan' },
      { 'Kolom': 'TNKB', 'Format': 'Teks', 'Contoh': 'BL 1234 AB', 'Keterangan': 'Tanda Nomor Kendaraan' },
      { 'Kolom': 'Jenis Kendaraan', 'Format': 'KIA / HIACE / L300 / MICROBUS', 'Contoh': 'KIA', 'Keterangan': 'Jenis kendaraan (huruf kapital)' },
      { 'Kolom': 'Jumlah Penumpang Kedatangan', 'Format': 'Angka', 'Contoh': '5', 'Keterangan': 'Isi jika status = Kedatangan, kosongkan jika Keberangkatan' },
      { 'Kolom': 'Jumlah Penumpang Keberangkatan', 'Format': 'Angka', 'Contoh': '8', 'Keterangan': 'Isi jika status = Keberangkatan, kosongkan jika Kedatangan' },
      { 'Kolom': 'Trayek Asal', 'Format': 'Teks', 'Contoh': 'Banda Aceh', 'Keterangan': 'Nama kota asal (gunakan nama lengkap)' },
      { 'Kolom': 'Trayek Tujuan', 'Format': 'Teks', 'Contoh': 'Blangpidie', 'Keterangan': 'Nama kota tujuan (gunakan nama lengkap)' },
      { 'Kolom': 'Nama Perusahaan', 'Format': 'Teks', 'Contoh': 'Nagan Raya', 'Keterangan': 'Nama perusahaan, isi - jika tidak ada' },
    ];

    const ws2 = XLSX.utils.json_to_sheet(instruksi);
    ws2['!cols'] = [
      { wch: 30 }, // Kolom
      { wch: 35 }, // Format
      { wch: 24 }, // Contoh
      { wch: 50 }, // Keterangan
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Petunjuk Pengisian');

    // Write to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Template_Import_Data_Kendaraan.xlsx"');
    res.send(buffer);
  } catch (error) {
    console.error('Error downloadTemplate:', error);
    res.status(500).json({ error: 'Gagal generate template' });
  }
};

// POST /api/pergerakan — Simpan data pergerakan kendaraan
exports.createPergerakan = async (req, res) => {
  try {
    const {
      tnkb,
      jenis_kendaraan,
      kapasitas_mobil,
      nama_perusahaan,
      status_pergerakan,
      jumlah_penumpang,
      trayek_asal,
      trayek_tujuan,
      timestamp,
    } = req.body;

    // Validasi field wajib
    if (!tnkb || !jenis_kendaraan || !status_pergerakan || !trayek_asal || !trayek_tujuan) {
      return res.status(400).json({ error: 'Field wajib tidak lengkap' });
    }

    // Cari atau buat kendaraan berdasarkan TNKB
    let kendaraanResult = await pool.query(
      'SELECT kendaraan_id FROM kendaraan WHERE tnkb = $1',
      [tnkb]
    );

    let kendaraan_id;

    if (kendaraanResult.rows.length === 0) {
      // Cari atau buat perusahaan
      let perusahaan_id = null;
      if (nama_perusahaan) {
        const perusahaanResult = await pool.query(
          'SELECT perusahaan_id FROM perusahaan WHERE nama_perusahaan = $1',
          [nama_perusahaan]
        );
        if (perusahaanResult.rows.length > 0) {
          perusahaan_id = perusahaanResult.rows[0].perusahaan_id;
        } else {
          const newPerusahaan = await pool.query(
            'INSERT INTO perusahaan (nama_perusahaan) VALUES ($1) RETURNING perusahaan_id',
            [nama_perusahaan]
          );
          perusahaan_id = newPerusahaan.rows[0].perusahaan_id;
        }
      }

      // Buat kendaraan baru
      const newKendaraan = await pool.query(
        'INSERT INTO kendaraan (tnkb, jenis_kendaraan, kapasitas_mobil, perusahaan_id, status) VALUES ($1, $2, $3, $4, $5) RETURNING kendaraan_id',
        [tnkb, jenis_kendaraan, kapasitas_mobil || null, perusahaan_id, status_pergerakan]
      );
      kendaraan_id = newKendaraan.rows[0].kendaraan_id;
    } else {
      kendaraan_id = kendaraanResult.rows[0].kendaraan_id;
      // Update status kendaraan
      await pool.query(
        'UPDATE kendaraan SET status = $1 WHERE kendaraan_id = $2',
        [status_pergerakan, kendaraan_id]
      );
    }

    // Simpan data pergerakan
    // Kirim timestamp sebagai string agar tidak dikonversi timezone oleh pg driver
    const tsValue = timestamp || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const pergerakanResult = await pool.query(
      `INSERT INTO data_pergerakan (kendaraan_id, trayek_asal, trayek_tujuan, jumlah_penumpang, status_pergerakan, "timestamp")
       VALUES ($1, $2, $3, $4, $5, $6::timestamp) RETURNING *`,
      [kendaraan_id, trayek_asal, trayek_tujuan, jumlah_penumpang || 0, status_pergerakan, tsValue]
    );

    res.status(201).json({
      message: 'Data pergerakan berhasil disimpan',
      data: pergerakanResult.rows[0],
    });
  } catch (error) {
    console.error('Error createPergerakan:', error);
    res.status(500).json({ error: 'Gagal menyimpan data pergerakan' });
  }
};

// GET /api/pergerakan — Ambil semua data pergerakan dengan join kendaraan & perusahaan
exports.getAllPergerakan = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        dp.pergerakan_id,
        dp."timestamp",
        dp.status_pergerakan,
        dp.jumlah_penumpang,
        dp.trayek_asal,
        dp.trayek_tujuan,
        k.tnkb,
        k.jenis_kendaraan,
        k.kapasitas_mobil,
        p.nama_perusahaan
      FROM data_pergerakan dp
      LEFT JOIN kendaraan k ON dp.kendaraan_id = k.kendaraan_id
      LEFT JOIN perusahaan p ON k.perusahaan_id = p.perusahaan_id
      ORDER BY dp."timestamp" DESC
    `);

    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error getAllPergerakan:', error);
    res.status(500).json({ error: 'Gagal mengambil data pergerakan' });
  }
};

// DELETE /api/pergerakan/:id — Hapus data pergerakan
exports.deletePergerakan = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM data_pergerakan WHERE pergerakan_id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Data tidak ditemukan' });
    }
    res.json({ message: 'Data berhasil dihapus', data: result.rows[0] });
  } catch (error) {
    console.error('Error deletePergerakan:', error);
    res.status(500).json({ error: 'Gagal menghapus data' });
  }
};

// PUT /api/pergerakan/:id — Update data pergerakan
exports.updatePergerakan = async (req, res) => {
  try {
    const { id } = req.params;
    const { tnkb, trayek_asal, trayek_tujuan, jumlah_penumpang, status_pergerakan, timestamp, nama_perusahaan } = req.body;

    const tsValue = timestamp || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const result = await pool.query(
      `UPDATE data_pergerakan 
       SET trayek_asal = COALESCE($1, trayek_asal),
           trayek_tujuan = COALESCE($2, trayek_tujuan),
           jumlah_penumpang = COALESCE($3, jumlah_penumpang),
           status_pergerakan = COALESCE($4, status_pergerakan),
           "timestamp" = $5::timestamp
       WHERE pergerakan_id = $6 RETURNING *`,
      [trayek_asal, trayek_tujuan, jumlah_penumpang, status_pergerakan, tsValue, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Data tidak ditemukan' });
    }

    // Update TNKB di tabel kendaraan jika diberikan
    if (tnkb && result.rows[0].kendaraan_id) {
      await pool.query('UPDATE kendaraan SET tnkb = $1 WHERE kendaraan_id = $2', [tnkb, result.rows[0].kendaraan_id]);
    }

    // Update nama perusahaan jika diberikan
    if (nama_perusahaan && result.rows[0].kendaraan_id) {
      const kendaraanRes = await pool.query('SELECT perusahaan_id FROM kendaraan WHERE kendaraan_id = $1', [result.rows[0].kendaraan_id]);
      if (kendaraanRes.rows[0]?.perusahaan_id) {
        await pool.query('UPDATE perusahaan SET nama_perusahaan = $1 WHERE perusahaan_id = $2', [nama_perusahaan, kendaraanRes.rows[0].perusahaan_id]);
      }
    }

    res.json({ message: 'Data berhasil diupdate', data: result.rows[0] });
  } catch (error) {
    console.error('Error updatePergerakan:', error);
    res.status(500).json({ error: 'Gagal update data' });
  }
};
