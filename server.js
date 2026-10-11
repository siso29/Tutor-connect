require('dotenv').config();

const app = require('./src/app');
const pool = require('./src/config/db');

const PORT = process.env.PORT || 3000;

// Test database connection and start listening
pool.query('SELECT current_database() AS db, NOW() AS time')
  .then((res) => {
    console.log(`[Database] Connected to PostgreSQL '${res.rows[0].db}' at ${res.rows[0].time}`);
    
    const server = app.listen(PORT, () => {
      console.log(`[Server] Tutor-Connect backend running on http://localhost:${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal}. Gracefully shutting down...`);
      server.close(async () => {
        console.log('[Server] HTTP server closed.');
        try {
          await pool.end();
          console.log('[Database] Connection pool closed.');
          process.exit(0);
        } catch (err) {
          console.error('[Database] Error closing pool:', err.message);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })
  .catch((err) => {
    console.error('[Database Error] Failed to connect to PostgreSQL:', err.message);
    process.exit(1);
  });