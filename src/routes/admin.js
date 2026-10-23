const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Apply authentication and admin role requirement to all admin routes
router.use(authenticate, authorize('admin'));

/**
 * GET /api/admin/stats
 * Platform overview metrics.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const userStatsQuery = `
      SELECT 
        COUNT(id)::integer AS total_users,
        COUNT(CASE WHEN role IN ('student', 'guardian', 'learner') THEN 1 END)::integer AS total_students,
        COUNT(CASE WHEN role = 'tutor' THEN 1 END)::integer AS total_tutors,
        COUNT(CASE WHEN role = 'admin' THEN 1 END)::integer AS total_admins,
        COUNT(CASE WHEN is_active = FALSE THEN 1 END)::integer AS deactivated_users
      FROM users
    `;

    const bookingStatsQuery = `
      SELECT 
        COUNT(id)::integer AS total_bookings,
        COUNT(CASE WHEN LOWER(status) = 'pending' THEN 1 END)::integer AS pending_bookings,
        COUNT(CASE WHEN LOWER(status) IN ('accepted', 'confirmed') THEN 1 END)::integer AS accepted_bookings,
        COUNT(CASE WHEN LOWER(status) = 'completed' THEN 1 END)::integer AS completed_bookings,
        COUNT(CASE WHEN LOWER(status) = 'cancelled' THEN 1 END)::integer AS cancelled_bookings,
        COUNT(CASE WHEN LOWER(status) IN ('rejected', 'declined') THEN 1 END)::integer AS rejected_bookings
      FROM bookings
    `;

    const reviewStatsQuery = `
      SELECT 
        COUNT(id)::integer AS total_reviews,
        ROUND(COALESCE(AVG(rating), 0), 2) AS avg_platform_rating
      FROM reviews
    `;

    const supportStatsQuery = `
      SELECT 
        (SELECT COUNT(id)::integer FROM inquiries) AS total_inquiries,
        (SELECT COUNT(id)::integer FROM inquiries WHERE status = 'Open') AS open_inquiries,
        (SELECT COUNT(id)::integer FROM reports) AS total_reports,
        (SELECT COUNT(id)::integer FROM reports WHERE status = 'Open') AS open_reports
    `;

    const [userStats, bookingStats, reviewStats, supportStats] = await Promise.all([
      pool.query(userStatsQuery),
      pool.query(bookingStatsQuery),
      pool.query(reviewStatsQuery),
      pool.query(supportStatsQuery)
    ]);

    res.json({
      users: userStats.rows[0],
      bookings: bookingStats.rows[0],
      reviews: reviewStats.rows[0],
      support: supportStats.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/users
 * Search and paginate all users.
 */
router.get('/users', async (req, res, next) => {
  try {
    const { role, isActive, search, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (role) {
      conditions.push(`role = $${paramIndex}`);
      values.push(role);
      paramIndex++;
    }

    if (isActive !== undefined && isActive !== '') {
      conditions.push(`is_active = $${paramIndex}`);
      values.push(isActive === 'true');
      paramIndex++;
    }

    if (search) {
      conditions.push(`(full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      values.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(id)::integer AS total FROM users ${whereClause}`, values);
    const total = countRes.rows[0].total;

    const query = `
      SELECT id, full_name, email, role, is_active, avatar, phone, created_at
      FROM users
      ${whereClause}
      ORDER BY id ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const usersRes = await pool.query(query, [...values, limitNum, offset]);

    res.json({
      users: usersRes.rows.map(u => ({
        id: u.id,
        name: u.full_name,
        fullName: u.full_name,
        full_name: u.full_name,
        email: u.email,
        role: u.role,
        status: u.is_active ? 'Active' : 'Inactive',
        avatar: u.avatar || u.full_name.slice(0, 2).toUpperCase(),
        phone: u.phone,
        created_at: u.created_at
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/admin/users/:id/status
 * Activate or deactivate a user account.
 */
router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { isActive, status } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    let activeState = isActive;
    if (activeState === undefined && status) {
      activeState = status === 'Active' || status === true;
    }

    if (typeof activeState !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean.' });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own admin account.' });
    }

    const updateRes = await pool.query(
      `UPDATE users 
       SET is_active = $1 
       WHERE id = $2 
       RETURNING id, full_name, email, role, is_active`,
      [activeState, userId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      message: `User status changed to ${activeState ? 'active' : 'inactive'}.`,
      user: updateRes.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/bookings
 * Full system booking logs.
 */
router.get('/bookings', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`b.status ILIKE $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(id)::integer AS total FROM bookings b ${whereClause}`, values);
    const total = countRes.rows[0].total;

    const query = `
      SELECT 
        b.*,
        s.full_name AS student_name,
        s.email AS student_email,
        t.full_name AS tutor_name,
        t.email AS tutor_email,
        r.rating AS review_rating
      FROM bookings b
      LEFT JOIN users s ON b.student_id = s.id
      JOIN users t ON b.tutor_id = t.id
      LEFT JOIN reviews r ON b.id = r.booking_id
      ${whereClause}
      ORDER BY b.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const bookingsRes = await pool.query(query, [...values, limitNum, offset]);

    res.json({
      bookings: bookingsRes.rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/inquiries
 */
router.get('/inquiries', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM inquiries ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/reports
 */
router.get('/reports', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM reports ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
