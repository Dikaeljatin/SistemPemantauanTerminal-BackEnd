const pool = require('../config/db');
const { logActivity } = require('./activityController');

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

    // Log aktivitas
    await logActivity(
      petugas_nama || 'Petugas',
      'kirim',
      `Kirim laporan periode ${periode}`,
      `Total kendaraan: ${total_kendaraan || 0}, Penumpang: ${total_penumpang || 0}`
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

// GET /api/laporan/:id/export — Export data laporan ke Excel
exports.exportLaporan = async (req, res) => {
  try {
    const { id } = req.params;

    // Get laporan info
    const laporanResult = await pool.query('SELECT * FROM laporan WHERE laporan_id = $1', [id]);
    if (laporanResult.rows.length === 0) {
      return res.status(404).json({ error: 'Laporan tidak ditemukan' });
    }
    const laporan = laporanResult.rows[0];

    // Parse periode to get date filter
    // Format: "Harian - DD/MM/YYYY" or "Bulanan - NamaBulan YYYY"
    const periode = laporan.periode;
    let whereClause = '';
    const params = [];

    if (periode.startsWith('Harian')) {
      // "Harian - DD/MM/YYYY"
      const dateStr = periode.replace('Harian - ', '');
      const [dd, mm, yyyy] = dateStr.split('/');
      const startDate = `${yyyy}-${mm}-${dd} 00:00:00`;
      const endDate = `${yyyy}-${mm}-${dd} 23:59:59`;
      whereClause = `WHERE dp."timestamp" >= $1::timestamp AND dp."timestamp" <= $2::timestamp`;
      params.push(startDate, endDate);
    } else if (periode.startsWith('Bulanan')) {
      // "Bulanan - NamaBulan YYYY"
      const parts = periode.replace('Bulanan - ', '');
      const bulanMap = {
        'Januari': '01', 'Februari': '02', 'Maret': '03', 'April': '04',
        'Mei': '05', 'Juni': '06', 'Juli': '07', 'Agustus': '08',
        'September': '09', 'Oktober': '10', 'November': '11', 'Desember': '12', 'Semua': null,
      };
      const [bulanNama, tahun] = parts.split(' ');
      const bulanNum = bulanMap[bulanNama];
      if (bulanNum) {
        const startDate = `${tahun}-${bulanNum}-01 00:00:00`;
        // Get last day of month
        const lastDay = new Date(parseInt(tahun), parseInt(bulanNum), 0).getDate();
        const endDate = `${tahun}-${bulanNum}-${String(lastDay).padStart(2, '0')} 23:59:59`;
        whereClause = `WHERE dp."timestamp" >= $1::timestamp AND dp."timestamp" <= $2::timestamp`;
        params.push(startDate, endDate);
      }
    }

    // Fetch data
    const dataResult = await pool.query(`
      SELECT 
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
      ${whereClause}
      ORDER BY dp."timestamp" ASC
    `, params);

    // Generate Excel using xlsx
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();

    // Sheet 1: Data Pergerakan
    const sheetData = dataResult.rows.map((row, idx) => {
      const ts = row.timestamp ? new Date(row.timestamp) : null;
      const formattedTs = ts
        ? `${String(ts.getDate()).padStart(2, '0')}/${String(ts.getMonth() + 1).padStart(2, '0')}/${ts.getFullYear()} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`
        : '';
      return {
        'No': idx + 1,
        'Timestamp': formattedTs,
        'Status': row.status_pergerakan === 'kedatangan' ? 'Kedatangan' : 'Keberangkatan',
        'TNKB': row.tnkb || '',
        'Jenis Kendaraan': row.jenis_kendaraan || '',
        'Jumlah Penumpang Kedatangan': row.status_pergerakan === 'kedatangan' ? (row.jumlah_penumpang || 0) : '-',
        'Jumlah Penumpang Keberangkatan': row.status_pergerakan === 'keberangkatan' ? (row.jumlah_penumpang || 0) : '-',
        'Trayek Asal': row.trayek_asal || '',
        'Trayek Tujuan': row.trayek_tujuan || '',
        'Nama Perusahaan': row.nama_perusahaan || '-',
      };
    });

    const ws = XLSX.utils.json_to_sheet(sheetData);

    // Set column widths
    ws['!cols'] = [
      { wch: 5 },  // No
      { wch: 18 }, // Timestamp
      { wch: 14 }, // Status
      { wch: 14 }, // TNKB
      { wch: 16 }, // Jenis Kendaraan
      { wch: 28 }, // Jumlah Penumpang Kedatangan
      { wch: 30 }, // Jumlah Penumpang Keberangkatan
      { wch: 16 }, // Trayek Asal
      { wch: 16 }, // Trayek Tujuan
      { wch: 22 }, // Nama Perusahaan
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Data Pergerakan');

    // Sheet 2: Ringkasan
    const kedatangan = dataResult.rows.filter(r => r.status_pergerakan === 'kedatangan').length;
    const keberangkatan = dataResult.rows.filter(r => r.status_pergerakan === 'keberangkatan').length;
    const totalPenumpang = dataResult.rows.reduce((s, r) => s + (r.jumlah_penumpang || 0), 0);

    const ringkasanData = [
      { 'Keterangan': 'Periode', 'Nilai': laporan.periode },
      { 'Keterangan': 'Petugas', 'Nilai': laporan.petugas_nama },
      { 'Keterangan': 'Tanggal Kirim', 'Nilai': new Date(laporan.created_at).toLocaleString('id-ID') },
      { 'Keterangan': 'Total Kendaraan', 'Nilai': dataResult.rows.length },
      { 'Keterangan': 'Total Kedatangan', 'Nilai': kedatangan },
      { 'Keterangan': 'Total Keberangkatan', 'Nilai': keberangkatan },
      { 'Keterangan': 'Total Penumpang', 'Nilai': totalPenumpang },
      { 'Keterangan': 'Catatan', 'Nilai': laporan.catatan || '-' },
    ];

    const ws2 = XLSX.utils.json_to_sheet(ringkasanData);
    ws2['!cols'] = [{ wch: 22 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan');

    // Write to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Send file
    const filename = `Laporan_${periode.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exportLaporan:', error);
    res.status(500).json({ error: 'Gagal export laporan' });
  }
};
