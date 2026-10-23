const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const router = express.Router();

// Optional authentication middleware
async function getAuthUser(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.split(' ')[1];
    if (!token || token.startsWith('mock-') || token.startsWith('demo-')) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret_change_in_production');
    const userId = decoded.sub || decoded.id;
    if (!userId) return null;

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

function formatBooking(row) {
  if (!row) return null;
  const bookingCode = row.booking_code || `bk-${row.id}`;
  const learnerName = row.learner_name || row.student_name || 'Abel Jr. Bekele';
  const guardianName = row.guardian_name || row.student_name || 'Abel Bekele';
  const tutorName = row.tutor_name || 'Dawit Alemu';

  let dateStr = row.date_label;
  if (!dateStr && row.lesson_date) {
    try {
      dateStr = new Date(row.lesson_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      dateStr = 'Oct 24, 2026';
    }
  }

  let timeStr = row.time_label;
  if (!timeStr && row.lesson_date) {
    try {
      timeStr = new Date(row.lesson_date).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      timeStr = '10:00 AM';
    }
  }

  const durationHours = row.duration_minutes ? String(Math.round(row.duration_minutes / 60)) : '1';
  const price = Number(row.price || row.hourly_rate || 250);
  const total = Number(row.total || (price * Number(durationHours || 1)));

  // Normalize status for display
  let status = row.status || 'Pending';
  if (status === 'accepted') status = 'Confirmed';
  if (status === 'rejected') status = 'Declined';
  if (status === 'pending') status = 'Pending';
  if (status === 'completed') status = 'Completed';
  if (status === 'cancelled') status = 'Cancelled';

  return {
    // Frontend fields
    id: bookingCode,
    bookingId: row.id,
    bookingCode,
    learnerId: row.student_id ? String(row.student_id) : 'u-1',
    learnerName,
    guardianName,
    tutorId: row.tutor_id,
    tutorName,
    subject: row.subject || 'Mathematics',
    date: dateStr || 'Oct 24, 2026',
    time: timeStr || '10:00 AM',
    mode: row.mode || 'Online',
    grade: row.grade_label || 'Grade 10',
    duration: durationHours,
    price,
    total,
    status,
    message: row.message || '',
    createdAt: row.created_at,

    // Backend compatibility fields
    student_id: row.student_id,
    lesson_date: row.lesson_date,
    duration_minutes: row.duration_minutes || 60,
    tutor: {
      id: row.tutor_id,
      full_name: tutorName,
      email: row.tutor_email || '',
      hourly_rate: price
    }
  };
}

/**
 * GET /api/bookings
 * Returns all bookings formatted as an array for frontend.
 */
router.get('/', async (req, res, next) => {
  try {
    const user = await getAuthUser(req);
    const { status } = req.query;

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (user) {
      if (user.role === 'student' || user.role === 'guardian' || user.role === 'learner') {
        conditions.push(`b.student_id = $${paramIndex}`);
        values.push(user.id);
        paramIndex++;
      } else if (user.role === 'tutor') {
        conditions.push(`b.tutor_id = $${paramIndex}`);
        values.push(user.id);
        paramIndex++;
      }
    }

    if (status) {
      conditions.push(`b.status ILIKE $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        b.*,
        s.full_name AS student_name,
        s.email AS student_email,
        t.full_name AS tutor_name,
        t.email AS tutor_email,
        tp.hourly_rate
      FROM bookings b
      LEFT JOIN users s ON b.student_id = s.id
      JOIN users t ON b.tutor_id = t.id
      LEFT JOIN tutor_profiles tp ON t.id = tp.user_id
      ${whereClause}
      ORDER BY b.id DESC
    `;

    const result = await pool.query(query, values);
    const formatted = result.rows.map(formatBooking);

    // Return direct array for frontend Array.isArray(data) support
    res.json(formatted);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bookings
 * Create new lesson booking. Supports both frontend structure and backend test structure.
 */
router.post('/', async (req, res, next) => {
  try {
    const user = await getAuthUser(req);
    const body = req.body;

    const tutorId = parseInt(body.tutorId, 10);
    if (isNaN(tutorId)) {
      return res.status(400).json({ error: 'tutorId must be a valid integer.' });
    }

    // Verify tutor exists
    const tutorCheck = await pool.query(
      `SELECT u.id, u.full_name, u.email, tp.hourly_rate 
       FROM users u
       LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
       WHERE u.id = $1 AND u.role = 'tutor'`,
      [tutorId]
    );

    if (tutorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tutor not found.' });
    }

    const tutor = tutorCheck.rows[0];

    // Determine student / learner ID
    let studentId = user ? user.id : null;
    if (!studentId && body.learnerId) {
      const parsed = parseInt(body.learnerId.replace('u-', ''), 10);
      if (!isNaN(parsed)) studentId = parsed;
    }
    // Fallback student if still null
    if (!studentId) {
      const fallbackUser = await pool.query(`SELECT id FROM users WHERE role IN ('student', 'guardian') LIMIT 1`);
      if (fallbackUser.rows.length > 0) studentId = fallbackUser.rows[0].id;
    }

    // Determine lesson date
    let lessonDate = null;
    if (body.lessonDate) {
      const d = new Date(body.lessonDate);
      if (!isNaN(d.getTime())) lessonDate = d.toISOString();
    }
    if (!lessonDate) {
      lessonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    }

    const durationMinutes = body.durationMinutes
      ? parseInt(body.durationMinutes, 10)
      : (body.duration ? parseInt(body.duration, 10) * 60 : 60);

    const bookingCode = body.id || `bk-${Date.now()}`;
    const learnerName = body.learnerName || (user ? user.full_name : 'Learner');
    const guardianName = body.guardianName || (user ? user.full_name : 'Guardian');
    const subject = body.subject || 'Mathematics';
    const dateLabel = body.date || new Date(lessonDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeLabel = body.time || '10:00 AM';
    const mode = body.mode || 'Online';
    const gradeLabel = body.grade || 'Grade 10';
    const price = body.price || tutor.hourly_rate || 250;
    const total = body.total || price;
    const message = body.message || '';
    const status = body.status || 'Pending';

    const insertQuery = `
      INSERT INTO bookings (
        student_id, tutor_id, lesson_date, duration_minutes, message, status,
        booking_code, learner_name, guardian_name, subject, date_label, time_label, mode, grade_label, price, total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      studentId,
      tutorId,
      lessonDate,
      durationMinutes,
      message,
      status,
      bookingCode,
      learnerName,
      guardianName,
      subject,
      dateLabel,
      timeLabel,
      mode,
      gradeLabel,
      price,
      total
    ]);

    const created = result.rows[0];
    created.tutor_name = tutor.full_name;
    created.tutor_email = tutor.email;
    created.hourly_rate = tutor.hourly_rate;

    const formatted = formatBooking(created);

    res.status(201).json({
      message: 'Booking request sent successfully.',
      booking: formatted
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bookings/:id
 * Retrieve single booking by ID or booking_code.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;
    let query = 'SELECT b.*, t.full_name AS tutor_name, t.email AS tutor_email, tp.hourly_rate FROM bookings b JOIN users t ON b.tutor_id = t.id LEFT JOIN tutor_profiles tp ON t.id = tp.user_id WHERE ';
    let values = [rawId];

    const numericId = parseInt(rawId.replace('bk-', ''), 10);
    if (!isNaN(numericId) && numericId <= 2147483647) {
      query += '(b.id = $1 OR b.booking_code = $2)';
      values = [numericId, rawId];
    } else {
      query += 'b.booking_code = $1';
    }

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const formatted = formatBooking(result.rows[0]);
    res.json({ booking: formatted, ...formatted });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/bookings/:id/status
 * Update booking status. Accepts statuses like Confirmed, Declined, Cancelled, Completed, accepted, rejected, etc.
 */
router.patch('/:id/status', async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }

    // Normalize status
    let normalizedStatus = status;
    const sLower = status.toLowerCase();
    if (sLower === 'confirmed' || sLower === 'accepted') normalizedStatus = 'Confirmed';
    else if (sLower === 'declined' || sLower === 'rejected') normalizedStatus = 'Declined';
    else if (sLower === 'completed') normalizedStatus = 'Completed';
    else if (sLower === 'cancelled') normalizedStatus = 'Cancelled';
    else if (sLower === 'pending') normalizedStatus = 'Pending';

    let findQuery = 'SELECT b.*, t.full_name AS tutor_name, t.email AS tutor_email, tp.hourly_rate FROM bookings b JOIN users t ON b.tutor_id = t.id LEFT JOIN tutor_profiles tp ON t.id = tp.user_id WHERE ';
    let findValues = [rawId];

    const numericId = parseInt(rawId.replace('bk-', ''), 10);
    if (!isNaN(numericId) && numericId <= 2147483647) {
      findQuery += '(b.id = $1 OR b.booking_code = $2)';
      findValues = [numericId, rawId];
    } else {
      findQuery += 'b.booking_code = $1';
    }

    const findRes = await pool.query(findQuery, findValues);
    if (findRes.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const bookingRow = findRes.rows[0];

    // Update status
    const updateRes = await pool.query(
      `UPDATE bookings 
       SET status = $1 
       WHERE id = $2 
       RETURNING *`,
      [normalizedStatus, bookingRow.id]
    );

    const updated = updateRes.rows[0];
    updated.tutor_name = bookingRow.tutor_name;
    updated.tutor_email = bookingRow.tutor_email;
    updated.hourly_rate = bookingRow.hourly_rate;

    const formatted = formatBooking(updated);

    res.json({
      message: `Booking status updated to '${normalizedStatus}'.`,
      booking: formatted
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
