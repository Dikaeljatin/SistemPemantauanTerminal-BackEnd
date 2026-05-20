const pool = require('../config/db');

// GET /api/activity — Ambil semua activity log
exports.getAllActivity = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 500'
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error getAllActivity:', error);
    res.status(500).json({ error: 'Gagal mengambil activity log' });
  }
};

// Helper: Log activity (called from other controllers)
exports.logActivity = async (username, action, description, detail = null) => {
  try {
    await pool.query(
      'INSERT INTO activity_log (username, action, description, detail) VALUES ($1, $2, $3, $4)',
      [username || 'System', action, description, detail]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};
