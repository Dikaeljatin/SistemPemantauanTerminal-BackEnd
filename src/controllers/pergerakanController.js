const pool = require('../config/db');
const { logActivity } = require('./activityController');

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
        'Timestamp': '15/01/2025 08:30',
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
        'Timestamp': '15/01/2025 09:00',
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
        'Timestamp': '15/01/2025 10:15',
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
      { 'Kolom': 'Timestamp', 'Format': 'DD/MM/YYYY HH:mm', 'Contoh': '15/01/2025 08:30', 'Keterangan': 'Tanggal dan waktu pergerakan' },
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

// POST /api/pergerakan/import — Import data dari file Excel
exports.importExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File tidak ditemukan' });
    }

    const XLSX = require('xlsx');
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });

    // Cari sheet "Data Import" atau gunakan sheet pertama
    const sheetName = wb.SheetNames.includes('Data Import') ? 'Data Import' : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    if (rows.length < 2) {
      return res.status(400).json({ error: 'File kosong atau tidak memiliki data' });
    }

    // Validate headers
    const headers = rows[0].map((h) => (h || '').toString().trim());
    const expectedHeaders = [
      'Timestamp', 'Status', 'TNKB', 'Jenis Kendaraan',
      'Jumlah Penumpang Kedatangan', 'Jumlah Penumpang Keberangkatan',
      'Trayek Asal', 'Trayek Tujuan', 'Nama Perusahaan'
    ];

    // Check if all expected headers exist
    const missingHeaders = expectedHeaders.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return res.status(400).json({
        error: `Format file tidak sesuai template. Kolom yang hilang: ${missingHeaders.join(', ')}`,
      });
    }

    // Get column indices
    const colIdx = {};
    expectedHeaders.forEach((h) => { colIdx[h] = headers.indexOf(h); });

    const dataRows = rows.slice(1).filter((row) => row && row.length > 0);
    if (dataRows.length === 0) {
      return res.status(400).json({ error: 'Tidak ada data untuk diimport' });
    }

    const created_by = req.body.created_by || null;
    let imported = 0;
    let errors = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2; // Excel row number (1-indexed + header)

      const timestamp = row[colIdx['Timestamp']] ? row[colIdx['Timestamp']].toString().trim() : '';
      const rawTimestamp = row[colIdx['Timestamp']]; // Keep raw value for serial date check
      const status = row[colIdx['Status']] ? row[colIdx['Status']].toString().trim().toLowerCase() : '';
      const tnkb = row[colIdx['TNKB']] ? row[colIdx['TNKB']].toString().trim().toUpperCase() : '';
      const jenisKendaraan = row[colIdx['Jenis Kendaraan']] ? row[colIdx['Jenis Kendaraan']].toString().trim().toUpperCase() : '';
      const penumpangKedatangan = parseInt(row[colIdx['Jumlah Penumpang Kedatangan']]) || 0;
      const penumpangKeberangkatan = parseInt(row[colIdx['Jumlah Penumpang Keberangkatan']]) || 0;
      const trayekAsal = row[colIdx['Trayek Asal']] ? row[colIdx['Trayek Asal']].toString().trim() : '';
      const trayekTujuan = row[colIdx['Trayek Tujuan']] ? row[colIdx['Trayek Tujuan']].toString().trim() : '';
      const perusahaan = row[colIdx['Nama Perusahaan']] ? row[colIdx['Nama Perusahaan']].toString().trim() : '-';

      // Validate required fields
      if (!tnkb || !status || !trayekAsal || !trayekTujuan) {
        errors.push(`Baris ${rowNum}: Data tidak lengkap (TNKB, Status, Trayek wajib diisi)`);
        continue;
      }

      // Normalize status
      const statusPergerakan = status.includes('datang') ? 'kedatangan' : 'keberangkatan';
      const jumlahPenumpang = statusPergerakan === 'kedatangan' ? penumpangKedatangan : penumpangKeberangkatan;

      // Parse timestamp
      let tsValue = timestamp;
      if (!tsValue) {
        tsValue = new Date().toISOString().slice(0, 19).replace('T', ' ');
      } else {
        // Handle DD/MM/YYYY HH:mm format
        const ddmmMatch = tsValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
        if (ddmmMatch) {
          const [, dd, mm, yyyy, hh, min] = ddmmMatch;
          tsValue = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')} ${hh.padStart(2, '0')}:${min}:00`;
        } else {
          // Handle M/D/YY H:mm format (Excel short date)
          const shortMatch = tsValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})$/);
          if (shortMatch) {
            let [, mm, dd, yy, hh, min] = shortMatch;
            let yyyy = yy.length === 2 ? (parseInt(yy) > 50 ? '19' + yy : '20' + yy) : yy;
            tsValue = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')} ${hh.padStart(2, '0')}:${min}:00`;
          } else if (typeof rawTimestamp === 'number') {
            // Handle Excel serial date number
            const serial = rawTimestamp;
            const epoch = new Date(1899, 11, 30);
            const date = new Date(epoch.getTime() + serial * 86400000);
            tsValue = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:00`;
          } else {
            // Handle YYYY-MM-DD HH:mm or other formats
            tsValue = tsValue.replace('T', ' ').replace('Z', '').split('.')[0];
          }
        }
      }

      try {
        // Find or create kendaraan
        let kendaraanResult = await pool.query('SELECT kendaraan_id FROM kendaraan WHERE tnkb = $1', [tnkb]);
        let kendaraan_id;

        if (kendaraanResult.rows.length === 0) {
          // Find or create perusahaan
          let perusahaan_id = null;
          if (perusahaan && perusahaan !== '-') {
            const pResult = await pool.query('SELECT perusahaan_id FROM perusahaan WHERE nama_perusahaan = $1', [perusahaan]);
            if (pResult.rows.length > 0) {
              perusahaan_id = pResult.rows[0].perusahaan_id;
            } else {
              const newP = await pool.query('INSERT INTO perusahaan (nama_perusahaan) VALUES ($1) RETURNING perusahaan_id', [perusahaan]);
              perusahaan_id = newP.rows[0].perusahaan_id;
            }
          }
          const newK = await pool.query(
            'INSERT INTO kendaraan (tnkb, jenis_kendaraan, perusahaan_id, status) VALUES ($1, $2, $3, $4) RETURNING kendaraan_id',
            [tnkb, jenisKendaraan, perusahaan_id, statusPergerakan]
          );
          kendaraan_id = newK.rows[0].kendaraan_id;
        } else {
          kendaraan_id = kendaraanResult.rows[0].kendaraan_id;
        }

        // Insert pergerakan
        await pool.query(
          `INSERT INTO data_pergerakan (kendaraan_id, trayek_asal, trayek_tujuan, jumlah_penumpang, status_pergerakan, "timestamp", created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6::timestamp, $7, CURRENT_TIMESTAMP)`,
          [kendaraan_id, trayekAsal, trayekTujuan, jumlahPenumpang, statusPergerakan, tsValue, created_by]
        );
        imported++;
      } catch (err) {
        errors.push(`Baris ${rowNum}: ${err.message}`);
      }
    }

    res.json({
      message: `Import selesai. ${imported} data berhasil diimport.`,
      imported,
      total: dataRows.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (error) {
    console.error('Error importExcel:', error);
    res.status(500).json({ error: 'Gagal import data: ' + error.message });
  }
};

// GET /api/pergerakan/export — Export semua data pergerakan ke Excel
exports.exportExcel = async (req, res) => {
  try {
    const XLSX = require('xlsx');

    // Optional query params for filtering
    const { bulan, tahun, tanggal } = req.query;

    let whereClause = '';
    const params = [];

    if (tanggal) {
      // Filter harian: tanggal format YYYY-MM-DD
      whereClause = `WHERE dp."timestamp" >= $1::timestamp AND dp."timestamp" <= $2::timestamp`;
      params.push(`${tanggal} 00:00:00`, `${tanggal} 23:59:59`);
    } else if (bulan && tahun) {
      if (bulan !== 'Semua') {
        const bulanMap = {
          'Januari': '01', 'Februari': '02', 'Maret': '03', 'April': '04',
          'Mei': '05', 'Juni': '06', 'Juli': '07', 'Agustus': '08',
          'September': '09', 'Oktober': '10', 'November': '11', 'Desember': '12',
        };
        const bulanNum = bulanMap[bulan];
        if (bulanNum) {
          const lastDay = new Date(parseInt(tahun), parseInt(bulanNum), 0).getDate();
          whereClause = `WHERE dp."timestamp" >= $1::timestamp AND dp."timestamp" <= $2::timestamp`;
          params.push(`${tahun}-${bulanNum}-01 00:00:00`, `${tahun}-${bulanNum}-${String(lastDay).padStart(2, '0')} 23:59:59`);
        }
      } else if (tahun) {
        whereClause = `WHERE dp."timestamp" >= $1::timestamp AND dp."timestamp" <= $2::timestamp`;
        params.push(`${tahun}-01-01 00:00:00`, `${tahun}-12-31 23:59:59`);
      }
    }

    const result = await pool.query(`
      SELECT 
        dp."timestamp",
        dp.status_pergerakan,
        dp.jumlah_penumpang,
        dp.trayek_asal,
        dp.trayek_tujuan,
        k.tnkb,
        k.jenis_kendaraan,
        p.nama_perusahaan
      FROM data_pergerakan dp
      LEFT JOIN kendaraan k ON dp.kendaraan_id = k.kendaraan_id
      LEFT JOIN perusahaan p ON k.perusahaan_id = p.perusahaan_id
      ${whereClause}
      ORDER BY dp."timestamp" ASC
    `, params);

    // Build Excel data
    const sheetData = result.rows.map((row, idx) => {
      const ts = row.timestamp ? new Date(row.timestamp) : null;
      const formattedTs = ts
        ? `${String(ts.getDate()).padStart(2, '0')}/${String(ts.getMonth() + 1).padStart(2, '0')}/${ts.getFullYear()} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`
        : '';
      const status = row.status_pergerakan === 'kedatangan' ? 'Kedatangan' : 'Keberangkatan';
      return {
        'No': idx + 1,
        'Timestamp': formattedTs,
        'Status': status,
        'TNKB': row.tnkb || '',
        'Jenis Kendaraan': row.jenis_kendaraan || '',
        'Jumlah Penumpang Kedatangan': row.status_pergerakan === 'kedatangan' ? (row.jumlah_penumpang || 0) : '-',
        'Jumlah Penumpang Keberangkatan': row.status_pergerakan === 'keberangkatan' ? (row.jumlah_penumpang || 0) : '-',
        'Trayek Asal': row.trayek_asal || '',
        'Trayek Tujuan': row.trayek_tujuan || '',
        'Nama Perusahaan': row.nama_perusahaan || '-',
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);

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

    XLSX.utils.book_append_sheet(wb, ws, 'Data Kendaraan');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Generate filename
    let filename = 'Export_Data_Kendaraan';
    if (tanggal) {
      filename += `_${tanggal}`;
    } else if (bulan && tahun) {
      filename += `_${bulan}_${tahun}`;
    } else {
      filename += `_Semua`;
    }
    filename += '.xlsx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exportExcel:', error);
    res.status(500).json({ error: 'Gagal export data' });
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
      created_by,
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
      `INSERT INTO data_pergerakan (kendaraan_id, trayek_asal, trayek_tujuan, jumlah_penumpang, status_pergerakan, "timestamp", created_by)
       VALUES ($1, $2, $3, $4, $5, $6::timestamp, $7) RETURNING *`,
      [kendaraan_id, trayek_asal, trayek_tujuan, jumlah_penumpang || 0, status_pergerakan, tsValue, created_by || null]
    );

    // Log activity
    await logActivity(
      created_by || 'Petugas',
      'create',
      `Menginput data kendaraan ${status_pergerakan} - ${tnkb}`,
      `Trayek: ${trayek_asal} → ${trayek_tujuan}, Penumpang: ${jumlah_penumpang || 0}`
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

// Membangun WHERE conditions + params dari query filter yang dipakai bersama
// oleh getAllPergerakan dan getSummary, supaya logikanya tidak duplikat.
function buildFilterConditions(query) {
  const { filter_mode, bulan, tahun, tanggal, status, search } = query;
  const conditions = [];
  const params = [];

  // Filter tanggal
  if (filter_mode === 'harian' && tanggal) {
    params.push(`${tanggal} 00:00:00`, `${tanggal} 23:59:59`);
    conditions.push(`dp."timestamp" >= $${params.length - 1}::timestamp AND dp."timestamp" <= $${params.length}::timestamp`);
  } else if (filter_mode === 'bulanan' && tahun) {
    const bulanNum = bulan && bulan !== '0' ? String(parseInt(bulan)).padStart(2, '0') : null;
    if (bulanNum) {
      const lastDay = new Date(parseInt(tahun), parseInt(bulan), 0).getDate();
      params.push(`${tahun}-${bulanNum}-01 00:00:00`, `${tahun}-${bulanNum}-${String(lastDay).padStart(2,'0')} 23:59:59`);
    } else {
      params.push(`${tahun}-01-01 00:00:00`, `${tahun}-12-31 23:59:59`);
    }
    conditions.push(`dp."timestamp" >= $${params.length - 1}::timestamp AND dp."timestamp" <= $${params.length}::timestamp`);
  }

  // Filter status
  if (status && (status === 'kedatangan' || status === 'keberangkatan')) {
    params.push(status);
    conditions.push(`dp.status_pergerakan = $${params.length}`);
  }

  // Filter pencarian
  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    const si = params.length;
    conditions.push(`(k.tnkb ILIKE $${si} OR k.jenis_kendaraan ILIKE $${si} OR dp.trayek_asal ILIKE $${si} OR dp.trayek_tujuan ILIKE $${si} OR p.nama_perusahaan ILIKE $${si})`);
  }

  return { conditions, params };
}

function toWhere(conditions) {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

// Kolom yang boleh dipakai untuk sorting tabel (whitelist, mencegah SQL injection lewat nama kolom)
const SORTABLE_COLUMNS = {
  waktu: 'dp."timestamp"',
  tnkb: 'k.tnkb',
  jenis: 'k.jenis_kendaraan',
  status: 'dp.status_pergerakan',
  penumpang: 'dp.jumlah_penumpang',
  trayekAsal: 'dp.trayek_asal',
  trayekTujuan: 'dp.trayek_tujuan',
  perusahaan: 'p.nama_perusahaan',
};

// GET /api/pergerakan — Ambil data pergerakan, mendukung server-side pagination + filter
// Query params:
//   page, limit          → aktifkan pagination (tanpa page = ambil semua, untuk chart)
//   filter_mode          → "harian" | "bulanan"
//   tanggal              → YYYY-MM-DD (untuk harian)
//   bulan                → 1-12 (untuk bulanan, 0 = semua bulan)
//   tahun                → angka tahun
//   status               → "kedatangan" | "keberangkatan"
//   search               → pencarian TNKB / jenis / trayek / perusahaan
//   sort_key, sort_dir   → kolom & arah sorting tabel (lihat SORTABLE_COLUMNS)
exports.getAllPergerakan = async (req, res) => {
  try {
    const { page, limit = 20, sort_key, sort_dir } = req.query;
    const { conditions, params } = buildFilterConditions(req.query);
    const whereClause = toWhere(conditions);
    const sortColumn = SORTABLE_COLUMNS[sort_key] || 'dp."timestamp"';
    const sortDirection = sort_dir === 'asc' ? 'ASC' : 'DESC';

    const selectFields = `
      dp.pergerakan_id,
      dp."timestamp",
      dp.status_pergerakan,
      dp.jumlah_penumpang,
      dp.trayek_asal,
      dp.trayek_tujuan,
      dp.created_by,
      dp.updated_by,
      dp.created_at,
      dp.updated_at,
      k.tnkb,
      k.jenis_kendaraan,
      k.kapasitas_mobil,
      p.nama_perusahaan
    `;

    const baseFrom = `
      FROM data_pergerakan dp
      LEFT JOIN kendaraan k ON dp.kendaraan_id = k.kendaraan_id
      LEFT JOIN perusahaan p ON k.perusahaan_id = p.perusahaan_id
      ${whereClause}
    `;

    if (page !== undefined) {
      // Server-side pagination
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset = (pageNum - 1) * limitNum;

      const countResult = await pool.query(`SELECT COUNT(*) ${baseFrom}`, params);
      const total = parseInt(countResult.rows[0].count);

      const dataParams = [...params, limitNum, offset];
      const dataResult = await pool.query(
        `SELECT ${selectFields} ${baseFrom} ORDER BY ${sortColumn} ${sortDirection} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
        dataParams
      );

      return res.json({
        data: dataResult.rows,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
      });
    }

    // Tanpa page → ambil semua (dipakai untuk export/import, bukan chart — chart pakai /summary)
    const result = await pool.query(
      `SELECT ${selectFields} ${baseFrom} ORDER BY ${sortColumn} ${sortDirection}`,
      params
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error getAllPergerakan:', error);
    res.status(500).json({ error: 'Gagal mengambil data pergerakan' });
  }
};

// GET /api/pergerakan/summary — Agregat untuk grafik (SQL GROUP BY di server),
// supaya frontend tidak perlu fetch seluruh baris pergerakan hanya untuk hitung chart.
// Menerima query filter yang sama dengan getAllPergerakan (filter_mode, tanggal, bulan, tahun, status, search).
exports.getSummary = async (req, res) => {
  try {
    const { conditions, params } = buildFilterConditions(req.query);
    const baseJoins = `
      FROM data_pergerakan dp
      LEFT JOIN kendaraan k ON dp.kendaraan_id = k.kendaraan_id
      LEFT JOIN perusahaan p ON k.perusahaan_id = p.perusahaan_id
    `;
    const where = toWhere(conditions);
    const whereWith = (extra) => toWhere([...conditions, ...extra]);

    const [
      totals,
      byJenis,
      byTrayekAsal,
      byTrayekTujuan,
      byPerusahaan,
      byJam,
      byTnkbKeberangkatan,
      byTnkbKedatangan,
      penumpangPerJenis,
    ] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE dp.status_pergerakan = 'kedatangan') AS total_kedatangan,
          COUNT(*) FILTER (WHERE dp.status_pergerakan = 'keberangkatan') AS total_keberangkatan,
          COALESCE(SUM(dp.jumlah_penumpang) FILTER (WHERE dp.status_pergerakan = 'kedatangan'), 0) AS total_penumpang_datang,
          COALESCE(SUM(dp.jumlah_penumpang) FILTER (WHERE dp.status_pergerakan = 'keberangkatan'), 0) AS total_penumpang_berangkat
        ${baseJoins} ${where}
      `, params),

      pool.query(`
        SELECT COALESCE(k.jenis_kendaraan, '') AS name, COUNT(*) AS value
        ${baseJoins} ${where}
        GROUP BY k.jenis_kendaraan
        ORDER BY value DESC
      `, params),

      pool.query(`
        SELECT dp.trayek_asal AS name, COUNT(*) AS value
        ${baseJoins} ${whereWith([`dp.trayek_asal IS NOT NULL AND dp.trayek_asal != ''`])}
        GROUP BY dp.trayek_asal
        ORDER BY value DESC
        LIMIT 6
      `, params),

      pool.query(`
        SELECT dp.trayek_tujuan AS name, COUNT(*) AS value
        ${baseJoins} ${whereWith([`dp.trayek_tujuan IS NOT NULL AND dp.trayek_tujuan != ''`])}
        GROUP BY dp.trayek_tujuan
        ORDER BY value DESC
        LIMIT 6
      `, params),

      pool.query(`
        SELECT p.nama_perusahaan AS name, COUNT(*) AS value
        ${baseJoins} ${whereWith([`p.nama_perusahaan IS NOT NULL AND p.nama_perusahaan != '' AND p.nama_perusahaan != '-'`])}
        GROUP BY p.nama_perusahaan
        ORDER BY value DESC
        LIMIT 6
      `, params),

      pool.query(`
        SELECT
          LPAD(EXTRACT(HOUR FROM dp."timestamp")::text, 2, '0') || ':00' AS jam,
          COUNT(*) FILTER (WHERE dp.status_pergerakan = 'kedatangan') AS masuk,
          COUNT(*) FILTER (WHERE dp.status_pergerakan = 'keberangkatan') AS keluar,
          COALESCE(SUM(dp.jumlah_penumpang) FILTER (WHERE dp.status_pergerakan = 'kedatangan'), 0) AS datang,
          COALESCE(SUM(dp.jumlah_penumpang) FILTER (WHERE dp.status_pergerakan = 'keberangkatan'), 0) AS berangkat
        ${baseJoins} ${where}
        GROUP BY 1
        ORDER BY 1
      `, params),

      pool.query(`
        SELECT k.tnkb AS name, k.jenis_kendaraan AS jenis, COUNT(*) AS value
        ${baseJoins} ${whereWith([`dp.status_pergerakan = 'keberangkatan'`, `k.tnkb IS NOT NULL AND k.tnkb != ''`])}
        GROUP BY k.tnkb, k.jenis_kendaraan
        ORDER BY value DESC
        LIMIT 5
      `, params),

      pool.query(`
        SELECT k.tnkb AS name, k.jenis_kendaraan AS jenis, COUNT(*) AS value
        ${baseJoins} ${whereWith([`dp.status_pergerakan = 'kedatangan'`, `k.tnkb IS NOT NULL AND k.tnkb != ''`])}
        GROUP BY k.tnkb, k.jenis_kendaraan
        ORDER BY value DESC
        LIMIT 5
      `, params),

      pool.query(`
        SELECT COALESCE(k.jenis_kendaraan, '') AS name, ROUND(AVG(dp.jumlah_penumpang)) AS value
        ${baseJoins} ${where}
        GROUP BY k.jenis_kendaraan
      `, params),
    ]);

    const toNum = (rows, intFields) => rows.map((r) => {
      const o = { ...r };
      intFields.forEach((f) => { o[f] = parseInt(o[f], 10) || 0; });
      return o;
    });

    const t = totals.rows[0];
    res.json({
      total: parseInt(t.total, 10) || 0,
      totalKedatangan: parseInt(t.total_kedatangan, 10) || 0,
      totalKeberangkatan: parseInt(t.total_keberangkatan, 10) || 0,
      totalPenumpangDatang: parseInt(t.total_penumpang_datang, 10) || 0,
      totalPenumpangBerangkat: parseInt(t.total_penumpang_berangkat, 10) || 0,
      byJenis: toNum(byJenis.rows, ['value']),
      byTrayekAsal: toNum(byTrayekAsal.rows, ['value']),
      byTrayekTujuan: toNum(byTrayekTujuan.rows, ['value']),
      byPerusahaan: toNum(byPerusahaan.rows, ['value']),
      byJam: toNum(byJam.rows, ['masuk', 'keluar', 'datang', 'berangkat']),
      byTnkbKeberangkatan: toNum(byTnkbKeberangkatan.rows, ['value']),
      byTnkbKedatangan: toNum(byTnkbKedatangan.rows, ['value']),
      penumpangPerJenis: toNum(penumpangPerJenis.rows, ['value']),
    });
  } catch (error) {
    console.error('Error getSummary:', error);
    res.status(500).json({ error: 'Gagal mengambil ringkasan data pergerakan' });
  }
};

// DELETE /api/pergerakan/:id — Hapus data pergerakan
exports.deletePergerakan = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted_by = req.body.deleted_by || req.query.deleted_by || 'Petugas';
    const result = await pool.query(
      'DELETE FROM data_pergerakan WHERE pergerakan_id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Data tidak ditemukan' });
    }

    // Log activity
    await logActivity(
      deleted_by,
      'delete',
      `Menghapus data kendaraan - ID:${id}`,
      `Status: ${result.rows[0].status_pergerakan}, Trayek: ${result.rows[0].trayek_asal} → ${result.rows[0].trayek_tujuan}`
    );

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
    const { tnkb, trayek_asal, trayek_tujuan, jumlah_penumpang, status_pergerakan, timestamp, nama_perusahaan, updated_by } = req.body;

    const tsValue = timestamp || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const result = await pool.query(
      `UPDATE data_pergerakan 
       SET trayek_asal = COALESCE($1, trayek_asal),
           trayek_tujuan = COALESCE($2, trayek_tujuan),
           jumlah_penumpang = COALESCE($3, jumlah_penumpang),
           status_pergerakan = COALESCE($4, status_pergerakan),
           "timestamp" = $5::timestamp,
           updated_by = COALESCE($7, updated_by),
           updated_at = CURRENT_TIMESTAMP
       WHERE pergerakan_id = $6 RETURNING *`,
      [trayek_asal, trayek_tujuan, jumlah_penumpang, status_pergerakan, tsValue, id, updated_by || null]
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
      const existingPerusahaanId = kendaraanRes.rows[0]?.perusahaan_id;
      if (existingPerusahaanId) {
        // Perusahaan sudah ada — update namanya
        await pool.query('UPDATE perusahaan SET nama_perusahaan = $1 WHERE perusahaan_id = $2', [nama_perusahaan, existingPerusahaanId]);
      } else {
        // Kendaraan belum punya perusahaan — cari atau buat baru, lalu link ke kendaraan
        let perusahaanId;
        const cariPerusahaan = await pool.query('SELECT perusahaan_id FROM perusahaan WHERE nama_perusahaan = $1', [nama_perusahaan]);
        if (cariPerusahaan.rows.length > 0) {
          perusahaanId = cariPerusahaan.rows[0].perusahaan_id;
        } else {
          const buatPerusahaan = await pool.query('INSERT INTO perusahaan (nama_perusahaan) VALUES ($1) RETURNING perusahaan_id', [nama_perusahaan]);
          perusahaanId = buatPerusahaan.rows[0].perusahaan_id;
        }
        await pool.query('UPDATE kendaraan SET perusahaan_id = $1 WHERE kendaraan_id = $2', [perusahaanId, result.rows[0].kendaraan_id]);
      }
    }

    // Log activity
    await logActivity(
      updated_by || 'Petugas',
      'update',
      `Mengedit data kendaraan - ${tnkb || 'ID:' + id}`,
      `Trayek: ${trayek_asal} → ${trayek_tujuan}`
    );

    res.json({ message: 'Data berhasil diupdate', data: result.rows[0] });
  } catch (error) {
    console.error('Error updatePergerakan:', error);
    res.status(500).json({ error: 'Gagal update data' });
  }
};
