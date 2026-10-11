const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Authentication routes are working!' });
});

// Register a student or tutor
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, role, bio, qualifications, subjects, hourlyRate, location, gradeLevels } = req.body;

    if (!fullName || !email || !password || !role) {
      return res.status(400).json({
        error: 'Full name, email, password, and role are required.'
      });
    }

    if (!['student', 'tutor'].includes(role)) {
      return res.status(400).json({
        error: 'Role must be student or tutor.'
      });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        error: 'Password must contain at least 8 characters.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'This email is already registered.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const client = await pool.connect();

    let user;

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, full_name, email, role, created_at`,
        [fullName.trim(), normalizedEmail, passwordHash, role]
      );

      user = result.rows[0];

      if (role === 'tutor') {
        await client.query(
          `INSERT INTO tutor_profiles (user_id, bio, qualifications, subjects, hourly_rate, location, grade_levels)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            user.id,
            bio || null,
            qualifications || null,
            Array.isArray(subjects) ? subjects : [],
            hourlyRate !== undefined ? Number(hourlyRate) : 0,
            location || null,
            Array.isArray(gradeLevels) ? gradeLevels : []
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const secret = process.env.JWT_SECRET || 'default_jwt_secret_change_in_production';
    const token = jwt.sign(
      { sub: String(user.id), role: user.role },
      secret,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Registration successful.',
      token,
      user
    });
  } catch (error) {
    console.error('Registration error:', error.message);

    if (error.code === '23505') {
      return res.status(409).json({
        error: 'This email is already registered.'
      });
    }

    return res.status(500).json({
      error: 'Registration failed. ' + error.message
    });
  }
});

// Log in
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required.'
      });
    }

    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, role, is_active
       FROM users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        error: 'This account is inactive.'
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    const secret = process.env.JWT_SECRET || 'default_jwt_secret_change_in_production';
    const token = jwt.sign(
      { sub: String(user.id), role: user.role },
      secret,
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({
      error: 'Login failed: ' + error.message
    });
  }
});

// Get the logged-in user's profile
router.get('/me', authenticate, async (req, res) => {
  try {
    let profileData = null;

    if (req.user.role === 'tutor') {
      const profileRes = await pool.query(
        `SELECT bio, qualifications, subjects, grade_levels, hourly_rate, location, updated_at
         FROM tutor_profiles
         WHERE user_id = $1`,
        [req.user.id]
      );
      profileData = profileRes.rows[0] || null;
    }

    res.json({
      user: {
        id: req.user.id,
        full_name: req.user.full_name,
        email: req.user.email,
        role: req.user.role,
        is_active: req.user.is_active,
        created_at: req.user.created_at,
        profile: profileData
      }
    });
  } catch (error) {
    console.error('Fetch me error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve profile.' });
  }
});

// Change Password
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Current password and new password are required.'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'New password must have at least 8 characters.'
      });
    }

    const userRes = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    const valid = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password does not match.' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

    return res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Change password error:', error.message);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

module.exports = router;