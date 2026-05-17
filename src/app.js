const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Monitoring System API is running' });
});

// API Routes
const pergerakanRoutes = require('./routes/pergerakanRoutes');
app.use('/api/pergerakan', pergerakanRoutes);

const laporanRoutes = require('./routes/laporanRoutes');
app.use('/api/laporan', laporanRoutes);

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

module.exports = app;
