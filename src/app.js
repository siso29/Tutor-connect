const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const tutorRoutes = require('./routes/tutors');


// Route handlers
const authRoutes = require('./routes/auth');
const tutorRoutes = require('./routes/tutors');
const bookingRoutes = require('./routes/booking');
const reviewRoutes = require('./routes/reviews');
const adminRoutes = require('./routes/admin');

// Middleware
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security and utility middleware
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/tutors', tutorRoutes);

// Root landing endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Tutor-Connect Backend API is active',
    version: '1.0.0',
    documentation: {
      health: 'GET /api/health',
      auth: '/api/auth (register, login, me)',
      tutors: '/api/tutors (search, profile, update)',
      bookings: '/api/bookings (create, view, update status)',
      reviews: '/api/reviews (submit, view)',
      admin: '/api/admin (stats, users, bookings)'
    }
  });
});

// Database health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT current_database() AS db, NOW() AS server_time');
    res.json({
      status: 'healthy',
      database: result.rows[0].db,
      timestamp: result.rows[0].server_time
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: 'Database connection failed: ' + error.message
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tutors', tutorRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);

// 404 Route Not Found
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;