const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function formatUser(row) {
  if (!row) return null;
  const name = row.full_name || row.name || '';
  const avatar = row.avatar || (name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'TC');
  return {
    id: row.id,
    name,
    fullName: name,
    full_name: name,
    email: row.email,
    role: row.role,
    status: row.is_active !== false ? 'Active' : 'Inactive',
    avatar,
    phone: row.phone || '',
    is_active: row.is_active !== false,
    created_at: row.created_at
  };
}

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Authentication routes are working!' });
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { fullName, name, email, password, role, bio, qualifications, subjects, hourlyRate, location, gradeLevels } = req.body;
    const resolvedName = fullName || name;

    if (!resolvedName || !email || !password) {
      return res.status(400).json({
        error: 'Full name, email, and password are required.'
      });
    }

    const validRoles = ['student', 'guardian', 'learner', 'tutor', 'admin'];
    let resolvedRole = (role || 'guardian').toLowerCase();
    if (resolvedRole === 'learner') resolvedRole = 'guardian';

    if (!validRoles.includes(resolvedRole)) {
      return res.status(400).json({
        error: `Role must be one of: ${validRoles.join(', ')}`
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

    let userRow;

    try {
      await client.query('BEGIN');

      const avatar = resolvedName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'TC';

      const result = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role, avatar)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, full_name, email, role, is_active, avatar, created_at`,
        [resolvedName.trim(), normalizedEmail, passwordHash, resolvedRole, avatar]
      );

      userRow = result.rows[0];

      if (resolvedRole === 'tutor') {
        await client.query(
          `INSERT INTO tutor_profiles (
            user_id, bio, qualifications, subjects, hourly_rate, location, grade_levels,
            modes, experience, verified, verification_status, description, method
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            userRow.id,
            bio || 'Dedicated educator focused on clear explanations and student achievement.',
            qualifications || 'Certified Tutor',
            Array.isArray(subjects) ? subjects : ['General Education'],
            hourlyRate !== undefined ? Number(hourlyRate) : 250,
            location || 'Addis Ababa',
            Array.isArray(gradeLevels) ? gradeLevels : [6, 7, 8, 9, 10],
            ['Online', 'In-person'],
            3,
            true,
            'Verified',
            bio || 'Dedicated educator focused on clear explanations and student achievement.',
            'Step-by-step guidance and practice problems.'
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
      { sub: String(userRow.id), role: userRow.role },
      secret,
      { expiresIn: '7d' }
    );

    const formatted = formatUser(userRow);

    return res.status(201).json({
      message: 'Registration successful.',
      token,
      user: formatted
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
      `SELECT id, full_name, email, password_hash, role, is_active, avatar, phone, created_at
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

    const formatted = formatUser(user);

    return res.json({
      message: 'Login successful.',
      token,
      user: formatted
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({
      error: 'Login failed: ' + error.message
    });
  }
});

// Get logged-in user profile
router.get('/me', authenticate, async (req, res) => {
  try {
    let profileData = null;

    if (req.user.role === 'tutor') {
      const profileRes = await pool.query(
        `SELECT bio, qualifications, subjects, grade_levels, hourly_rate, location,
                modes, experience, availability, available_days, available_times,
                verified, verification_status, description, method, updated_at
         FROM tutor_profiles
         WHERE user_id = $1`,
        [req.user.id]
      );
      profileData = profileRes.rows[0] || null;
    }

    const formatted = formatUser(req.user);

    res.json({
      user: {
        ...formatted,
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