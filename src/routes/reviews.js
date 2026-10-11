const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/reviews
 * Submit a review for a completed lesson.
 * Only the student who completed the booking can submit a review.
 */
router.post('/', authenticate, authorize('student'), async (req, res, next) => {
  try {
    const { bookingId, rating, comment } = req.body;

    if (!bookingId || rating === undefined) {
      return res.status(400).json({ error: 'bookingId and rating are required.' });
    }

    const bookingIdNum = parseInt(bookingId, 10);
    const ratingNum = parseInt(rating, 10);

    if (isNaN(bookingIdNum)) {
      return res.status(400).json({ error: 'bookingId must be a valid integer.' });
    }

    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'rating must be an integer between 1 and 5.' });
    }

    // Verify booking
    const bookingRes = await pool.query(
      'SELECT id, student_id, tutor_id, status FROM bookings WHERE id = $1',
      [bookingIdNum]
    );

    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = bookingRes.rows[0];

    if (booking.student_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only review your own bookings.' });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({
        error: `Reviews can only be submitted for completed lessons (current status: '${booking.status}').`
      });
    }

    // Check if already reviewed
    const existingReview = await pool.query(
      'SELECT id FROM reviews WHERE booking_id = $1',
      [bookingIdNum]
    );

    if (existingReview.rows.length > 0) {
      return res.status(409).json({ error: 'A review has already been submitted for this booking.' });
    }

    const insertRes = await pool.query(
      `INSERT INTO reviews (booking_id, student_id, tutor_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [bookingIdNum, req.user.id, booking.tutor_id, ratingNum, comment ? comment.trim() : null]
    );

    res.status(201).json({
      message: 'Review submitted successfully.',
      review: insertRes.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reviews/tutor/:tutorId
 * Get all reviews and rating breakdown for a tutor.
 */
router.get('/tutor/:tutorId', async (req, res, next) => {
  try {
    const tutorId = parseInt(req.params.tutorId, 10);
    if (isNaN(tutorId)) {
      return res.status(400).json({ error: 'Invalid tutor ID.' });
    }

    const reviewsQuery = `
      SELECT 
        r.id,
        r.booking_id,
        r.rating,
        r.comment,
        r.created_at,
        s.id AS student_id,
        s.full_name AS student_name
      FROM reviews r
      JOIN users s ON r.student_id = s.id
      WHERE r.tutor_id = $1
      ORDER BY r.created_at DESC
    `;
    const reviewsRes = await pool.query(reviewsQuery, [tutorId]);

    // Calculate statistics
    const statsQuery = `
      SELECT 
        COUNT(id)::integer AS total_reviews,
        ROUND(COALESCE(AVG(rating), 0), 2) AS avg_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END)::integer AS star_5,
        COUNT(CASE WHEN rating = 4 THEN 1 END)::integer AS star_4,
        COUNT(CASE WHEN rating = 3 THEN 1 END)::integer AS star_3,
        COUNT(CASE WHEN rating = 2 THEN 1 END)::integer AS star_2,
        COUNT(CASE WHEN rating = 1 THEN 1 END)::integer AS star_1
      FROM reviews
      WHERE tutor_id = $1
    `;
    const statsRes = await pool.query(statsQuery, [tutorId]);

    res.json({
      reviews: reviewsRes.rows,
      stats: statsRes.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reviews/booking/:bookingId
 * Get the review for a specific booking.
 */
router.get('/booking/:bookingId', async (req, res, next) => {
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    if (isNaN(bookingId)) {
      return res.status(400).json({ error: 'Invalid booking ID.' });
    }

    const reviewRes = await pool.query(
      `SELECT r.*, s.full_name AS student_name, t.full_name AS tutor_name
       FROM reviews r
       JOIN users s ON r.student_id = s.id
       JOIN users t ON r.tutor_id = t.id
       WHERE r.booking_id = $1`,
      [bookingId]
    );

    if (reviewRes.rows.length === 0) {
      return res.status(404).json({ error: 'No review found for this booking.' });
    }

    res.json({ review: reviewRes.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
