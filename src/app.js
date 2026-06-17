const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// CORS — hanya izinkan origin dari frontend
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Izinkan request tanpa origin (misal: Postman saat testing)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Tidak diizinkan oleh CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting khusus untuk endpoint login (max 10 percobaan / 15 menit per IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi setelah 15 menit' },
});

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Monitoring System API is running' });
});

// Health check endpoint untuk keep-alive
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', loginLimiter, authRoutes);

const pergerakanRoutes = require('./routes/pergerakanRoutes');
app.use('/api/pergerakan', pergerakanRoutes);

const laporanRoutes = require('./routes/laporanRoutes');
app.use('/api/laporan', laporanRoutes);

const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

const jenisKendaraanRoutes = require('./routes/jenisKendaraanRoutes');
app.use('/api/jenis-kendaraan', jenisKendaraanRoutes);

const konfigurasiRoutes = require('./routes/konfigurasiRoutes');
app.use('/api/konfigurasi', konfigurasiRoutes);

const prediksiRoutes = require('./routes/prediksiRoutes');
app.use('/api/prediksi', prediksiRoutes);

const activityRoutes = require('./routes/activityRoutes');
app.use('/api/activity', activityRoutes);

module.exports = app;
