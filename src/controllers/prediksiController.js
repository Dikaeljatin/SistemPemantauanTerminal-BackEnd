const pool = require('../config/db');
const { spawn } = require('child_process');
const path = require('path');

// POST /api/prediksi — Prediksi pergerakan kendaraan menggunakan Prophet
exports.predict = async (req, res) => {
  try {
    const { tanggal_mulai, tanggal_akhir } = req.body;

    if (!tanggal_mulai || !tanggal_akhir) {
      return res.status(400).json({ error: 'Tanggal mulai dan akhir wajib diisi' });
    }

    // Fetch historical data from database
    // Aggregate per hour: count masuk (kedatangan), keluar (keberangkatan), and total penumpang
    const result = await pool.query(`
      SELECT 
        date_trunc('hour', "timestamp") as hour_ts,
        SUM(CASE WHEN status_pergerakan = 'kedatangan' THEN 1 ELSE 0 END) as masuk,
        SUM(CASE WHEN status_pergerakan = 'keberangkatan' THEN 1 ELSE 0 END) as keluar,
        COALESCE(SUM(jumlah_penumpang), 0) as penumpang
      FROM data_pergerakan
      WHERE "timestamp" IS NOT NULL
      GROUP BY date_trunc('hour', "timestamp")
      ORDER BY hour_ts ASC
    `);

    if (result.rows.length < 24) {
      return res.status(400).json({ error: 'Data historis tidak cukup untuk prediksi (minimal 24 jam data)' });
    }

    const history = result.rows.map((row) => {
      const d = new Date(row.hour_ts);
      const pad = (n) => String(n).padStart(2, '0');
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00:00`;
      return {
        ds,
        masuk: parseInt(row.masuk) || 0,
        keluar: parseInt(row.keluar) || 0,
        penumpang: parseInt(row.penumpang) || 0,
      };
    });

    // Spawn Python script
    const scriptPath = path.join(__dirname, '..', 'python', 'predict.py');
    // Pakai PYTHON_PATH dari env, fallback ke 'python3' (Linux/Render) atau 'python' (Windows)
    const pythonCmd = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
    const py = spawn(pythonCmd, [scriptPath]);

    let output = '';
    let errorOutput = '';

    py.stdout.on('data', (data) => { output += data.toString(); });
    py.stderr.on('data', (data) => { errorOutput += data.toString(); });

    py.on('close', (code) => {
      if (code !== 0) {
        console.error('Python error:', errorOutput);
        return res.status(500).json({ error: 'Gagal menjalankan prediksi: ' + errorOutput });
      }

      try {
        const result = JSON.parse(output);
        if (result.error) {
          return res.status(500).json({ error: result.error });
        }
        res.json(result);
      } catch (parseErr) {
        console.error('Parse error:', parseErr, 'Output:', output);
        res.status(500).json({ error: 'Gagal parse hasil prediksi' });
      }
    });

    // Send input data to Python via stdin
    const input = {
      history,
      tanggal_mulai,
      tanggal_akhir,
    };
    py.stdin.write(JSON.stringify(input));
    py.stdin.end();
  } catch (error) {
    console.error('Error predict:', error);
    res.status(500).json({ error: 'Gagal melakukan prediksi: ' + error.message });
  }
};
