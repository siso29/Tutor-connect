
require('dotenv').config();

const express = require('express');
const pool = require('./src/config/db');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Tutor platform backend is running!');
});

app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT current_database() AS database, NOW() AS time'
    );

    res.json({
      message: 'Database connected successfully!',
      database: result.rows[0].database,
      time: result.rows[0].time
    });
  } catch (error) {
    console.error('Database error:', error.message);
    res.status(500).json({
      error: 'Database connection failed'
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});