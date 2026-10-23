
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const pool = require('./config/db');

dotenv.config();

const app = express();

// Allowed frontend origins for local development
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests without an Origin header, such as server-to-server requests
    if (!origin) {
      return callback(null, true);
    }

    const configuredOrigin = process.env.FRONTEND_ORIGIN;

    if (
      allowedOrigins.includes(origin) ||
      origin === configuredOrigin ||
      /^http:\/\/localhost:\d+$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With'
  ]
}));

// Middleware
app.use(express.json({
  verify: (req, res, buffer) => {
    if (req.originalUrl.startsWith('/api/payments/webhook')) {
      req.rawBody = Buffer.from(buffer);
    }
  }
}));

app.use(express.urlencoded({ extended: true }));

// Route imports
const authRoutes = require('./routes/auth');
const tutorRoutes = require('./routes/tutors');
const bookingRoutes = require('./routes/booking');
const reviewRoutes = require('./routes/reviews');
const adminRoutes = require('./routes/admin');
const supportRoutes = require('./routes/support');
const paymentRoutes = require('./routes/payments');
const messagingRoutes = require('./routes/messaging');
const notificationRoutes = require('./routes/notifications');

// Landing page
app.get('/', (req, res) => {
  res.json({
    message: 'Tutor-Connect Backend API is active!',
    version: '1.1.0',
    endpoints: {
      health: 'GET /api/health',
      auth: '/api/auth',
      tutors: '/api/tutors',
      bookings: '/api/bookings',
      reviews: '/api/reviews',
      admin: '/api/admin',
      support: '/api/support',
      inquiries: '/api/inquiries',
      reports: '/api/reports',
      payments: '/api/payments',
      messages: '/api/messages',
      notifications: '/api/notifications'
    }
  });
});

// Database health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT current_database() AS database, NOW() AS server_time'
    );

    res.json({
      status: 'healthy',
      database: result.rows[0].database,
      server_time: result.rows[0].server_time,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error.message);

    res.status(500).json({
      status: 'unhealthy',
      error: 'Database connection failed'
    });
  }
});

// Main API routes
app.use('/api/auth', authRoutes);
app.use('/api/tutors', tutorRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/messages', messagingRoutes);
app.use('/api/notifications', notificationRoutes);

// Reuse support.js for inquiries
app.use('/api/inquiries', (req, res, next) => {
  req.url = '/inquiries' + req.url;
  supportRoutes(req, res, next);
});

// Reuse support.js for reports
app.use('/api/reports', (req, res, next) => {
  req.url = '/reports' + req.url;
  supportRoutes(req, res, next);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error('API Error:', err.message);

  const status = err.status || 500;

  res.status(status).json({
    error: err.message || 'Internal server error'
  });
});

module.exports = app;
