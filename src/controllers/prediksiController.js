const pool = require('../config/db');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PREDICT_PORT = process.env.PREDICT_PORT || 5001;

// POST /api/prediksi — Prediksi pergerakan kendaraan menggunakan Prophet
exports.predict = async (req, res) => {
  try {
    const { tanggal_mulai, tanggal_akhir } = req.body;

    if (!tanggal_mulai || !tanggal_akhir) {
      return res.status(400).json({ error: 'Tanggal mulai dan akhir wajib diisi' });
    }

    const diffDays = Math.round((new Date(tanggal_akhir) - new Date(tanggal_mulai)) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return res.status(400).json({ error: 'Tanggal akhir tidak boleh sebelum tanggal mulai' });
    }
    if (diffDays > 30) {
      return res.status(400).json({ error: 'Rentang prediksi maksimal 30 hari (1 bulan)' });
    }

    // Dua query paralel: data harian + pola distribusi per jam
    // Jauh lebih efisien vs satu query per-jam (~25.000 baris) — SQL sudah agregasi
    const [dailyResult, hourlyResult] = await Promise.all([
      pool.query(`
        SELECT
          date_trunc('day', "timestamp")::date                                  AS day_ts,
          SUM(CASE WHEN status_pergerakan = 'kedatangan'   THEN 1 ELSE 0 END)  AS masuk,
          SUM(CASE WHEN status_pergerakan = 'keberangkatan' THEN 1 ELSE 0 END) AS keluar,
          COALESCE(SUM(jumlah_penumpang), 0)                                    AS penumpang
        FROM data_pergerakan
        WHERE "timestamp" IS NOT NULL
        GROUP BY date_trunc('day', "timestamp")::date
        ORDER BY day_ts ASC
      `),
      pool.query(`
        SELECT
          sub.hour,
          AVG(sub.hour_masuk)     AS masuk,
          AVG(sub.hour_keluar)    AS keluar,
          AVG(sub.hour_penumpang) AS penumpang
        FROM (
          SELECT
            EXTRACT(HOUR FROM "timestamp")::int                                    AS hour,
            SUM(CASE WHEN status_pergerakan = 'kedatangan'   THEN 1 ELSE 0 END)   AS hour_masuk,
            SUM(CASE WHEN status_pergerakan = 'keberangkatan' THEN 1 ELSE 0 END)  AS hour_keluar,
            COALESCE(SUM(jumlah_penumpang), 0)                                     AS hour_penumpang
          FROM data_pergerakan
          WHERE "timestamp" IS NOT NULL
          GROUP BY date_trunc('hour', "timestamp"), EXTRACT(HOUR FROM "timestamp")
        ) sub
        GROUP BY sub.hour
        ORDER BY sub.hour
      `),
    ]);

    if (dailyResult.rows.length < 7) {
      return res.status(400).json({ error: 'Data historis tidak cukup untuk prediksi (minimal 7 hari data)' });
    }

    const pad = (n) => String(n).padStart(2, '0');

    const daily_history = dailyResult.rows.map((row) => {
      const d = new Date(row.day_ts);
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      return {
        ds,
        masuk:     parseInt(row.masuk)     || 0,
        keluar:    parseInt(row.keluar)    || 0,
        penumpang: parseInt(row.penumpang) || 0,
      };
    });

    // Pola distribusi per jam: { "0": {masuk, keluar, penumpang}, ..., "23": {...} }
    const hourly_pattern = {};
    for (let h = 0; h < 24; h++) hourly_pattern[h] = { masuk: 0, keluar: 0, penumpang: 0 };
    hourlyResult.rows.forEach((row) => {
      const h = parseInt(row.hour);
      hourly_pattern[h] = {
        masuk:     parseFloat(row.masuk)     || 0,
        keluar:    parseFloat(row.keluar)    || 0,
        penumpang: parseFloat(row.penumpang) || 0,
      };
    });

    // Kirim ke Flask prediction server via HTTP POST (tidak ada cold start)
    const input = { daily_history, hourly_pattern, tanggal_mulai, tanggal_akhir };
    const postData = JSON.stringify(input);

    const options = {
      hostname: '127.0.0.1',
      port: PREDICT_PORT,
      path: '/predict',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const httpReq = http.request(options, (httpRes) => {
      let data = '';
      httpRes.on('data', (chunk) => { data += chunk; });
      httpRes.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.error) return res.status(500).json({ error: result.error });
          res.json(result);
        } catch (parseErr) {
          console.error('Parse error:', parseErr, 'Output:', data);
          res.status(500).json({ error: 'Gagal parse hasil prediksi' });
        }
      });
    });

    httpReq.on('error', (e) => {
      console.error('Flask server tidak tersedia:', e.message);
      res.status(503).json({ error: 'Layanan prediksi sedang tidak tersedia. Coba beberapa saat lagi.' });
    });

    httpReq.write(postData);
    httpReq.end();
  } catch (error) {
    console.error('Error predict:', error);
    res.status(500).json({ error: 'Gagal melakukan prediksi: ' + error.message });
  }
};
