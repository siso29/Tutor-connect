const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/bookings
 * Create a new lesson booking.
 * Only students can create bookings.
 */
router.post('/', authenticate, authorize('student'), async (req, res, next) => {
  try {
    const { tutorId, lessonDate, durationMinutes = 60, message } = req.body;

    if (!tutorId || !lessonDate) {
      return res.status(400).json({
        error: 'tutorId and lessonDate are required.'
      });
    }

    const tutorIdNum = parseInt(tutorId, 10);
    const durationNum = parseInt(durationMinutes, 10);

    if (isNaN(tutorIdNum)) {
      return res.status(400).json({ error: 'tutorId must be a valid integer.' });
    }

    if (tutorIdNum === req.user.id) {
      return res.status(400).json({ error: 'You cannot book a lesson with yourself.' });
    }

    if (isNaN(durationNum) || durationNum < 30 || durationNum > 240) {
      return res.status(400).json({
        error: 'durationMinutes must be between 30 and 240 minutes.'
      });
    }

    const parsedDate = new Date(lessonDate);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid lessonDate format.' });
    }

    if (parsedDate < new Date()) {
      return res.status(400).json({ error: 'lessonDate must be in the future.' });
    }

    // Verify tutor exists and is active
    const tutorCheck = await pool.query(
      `SELECT u.id, u.full_name, u.email, tp.hourly_rate 
       FROM users u
       LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
       WHERE u.id = $1 AND u.role = 'tutor' AND u.is_active = TRUE`,
      [tutorIdNum]
    );

    if (tutorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tutor not found or inactive.' });
    }

    const tutor = tutorCheck.rows[0];

    const insertQuery = `
      INSERT INTO bookings (student_id, tutor_id, lesson_date, duration_minutes, message, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      req.user.id,
      tutorIdNum,
      parsedDate.toISOString(),
      durationNum,
      message ? message.trim() : null
    ]);

    res.status(201).json({
      message: 'Booking request sent successfully.',
      booking: {
        ...result.rows[0],
        tutor: {
          id: tutor.id,
          full_name: tutor.full_name,
          email: tutor.email,
          hourly_rate: tutor.hourly_rate
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bookings
 * List bookings for the authenticated user.
 * Optional query parameter: status ('pending', 'accepted', 'rejected', 'cancelled', 'completed')
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status } = req.query;
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (req.user.role === 'student') {
      conditions.push(`b.student_id = $${paramIndex}`);
      values.push(req.user.id);
      paramIndex++;
    } else if (req.user.role === 'tutor') {
      conditions.push(`b.tutor_id = $${paramIndex}`);
      values.push(req.user.id);
      paramIndex++;
    }
    // If admin, show all bookings by default

    if (status) {
      conditions.push(`b.status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        b.id,
        b.student_id,
        s.full_name AS student_name,
        s.email AS student_email,
        b.tutor_id,
        t.full_name AS tutor_name,
        t.email AS tutor_email,
        tp.hourly_rate,
        b.lesson_date,
        b.duration_minutes,
        b.message,
        b.status,
        b.created_at,
        r.id AS review_id,
        r.rating AS review_rating
      FROM bookings b
      JOIN users s ON b.student_id = s.id
      JOIN users t ON b.tutor_id = t.id
      LEFT JOIN tutor_profiles tp ON t.id = tp.user_id
      LEFT JOIN reviews r ON b.id = r.booking_id
      ${whereClause}
      ORDER BY b.lesson_date DESC
    `;

    const result = await pool.query(query, values);
    res.json({ bookings: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bookings/:id
 * Retrieve single booking by ID.
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) {
      return res.status(400).json({ error: 'Invalid booking ID.' });
    }

    const query = `
      SELECT 
        b.id,
        b.student_id,
        s.full_name AS student_name,
        s.email AS student_email,
        b.tutor_id,
        t.full_name AS tutor_name,
        t.email AS tutor_email,
        tp.hourly_rate,
        tp.location AS tutor_location,
        b.lesson_date,
        b.duration_minutes,
        b.message,
        b.status,
        b.created_at,
        r.id AS review_id,
        r.rating AS review_rating,
        r.comment AS review_comment
      FROM bookings b
      JOIN users s ON b.student_id = s.id
      JOIN users t ON b.tutor_id = t.id
      LEFT JOIN tutor_profiles tp ON t.id = tp.user_id
      LEFT JOIN reviews r ON b.id = r.booking_id
      WHERE b.id = $1
    `;

    const result = await pool.query(query, [bookingId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = result.rows[0];

    // Access check: only student, tutor, or admin can view
    if (
      req.user.role !== 'admin' &&
      booking.student_id !== req.user.id &&
      booking.tutor_id !== req.user.id
    ) {
      return res.status(403).json({ error: 'Access denied to this booking.' });
    }

    res.json({ booking });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/bookings/:id/status
 * Update status of a booking (accept, reject, cancel, complete).
 */
router.patch('/:id/status', authenticate, async (req, res, next) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const { status } = req.body;

    const validStatuses = ['accepted', 'rejected', 'cancelled', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: [${validStatuses.join(', ')}]`
      });
    }

    const bookingRes = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = bookingRes.rows[0];

    // Authorization & state transition checks
    if (req.user.role === 'admin') {
      // Admin can update freely
    } else if (req.user.role === 'tutor') {
      if (booking.tutor_id !== req.user.id) {
        return res.status(403).json({ error: 'You are not the tutor for this booking.' });
      }

      if (['accepted', 'rejected'].includes(status) && booking.status !== 'pending') {
        return res.status(400).json({
          error: `Cannot change status to '${status}' from '${booking.status}'.`
        });
      }

      if (status === 'completed' && booking.status !== 'accepted') {
        return res.status(400).json({
          error: 'Only accepted lessons can be marked as completed.'
        });
      }
    } else if (req.user.role === 'student') {
      if (booking.student_id !== req.user.id) {
        return res.status(403).json({ error: 'You are not the student for this booking.' });
      }

      if (status !== 'cancelled') {
        return res.status(403).json({
          error: 'Students can only cancel bookings.'
        });
      }

      if (booking.status === 'completed' || booking.status === 'rejected') {
        return res.status(400).json({
          error: `Cannot cancel a booking that is already '${booking.status}'.`
        });
      }
    }

    const updateRes = await pool.query(
      `UPDATE bookings 
       SET status = $1 
       WHERE id = $2 
       RETURNING *`,
      [status, bookingId]
    );

    res.json({
      message: `Booking status updated to '${status}'.`,
      booking: updateRes.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
