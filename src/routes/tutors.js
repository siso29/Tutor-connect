const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/tutors
 * Search, filter, and paginate available tutors.
 * Query params: search, subject, minRate, maxRate, gradeLevel, location, sortBy, page, limit
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      search,
      subject,
      minRate,
      maxRate,
      gradeLevel,
      location,
      sortBy = 'rating_desc',
      page = 1,
      limit = 10
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['u.role = $1', 'u.is_active = TRUE'];
    const values = ['tutor'];
    let paramIndex = 2;

    if (search) {
      conditions.push(`(u.full_name ILIKE $${paramIndex} OR tp.bio ILIKE $${paramIndex} OR tp.qualifications ILIKE $${paramIndex})`);
      values.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (subject) {
      conditions.push(`EXISTS (
        SELECT 1 FROM unnest(tp.subjects) s 
        WHERE LOWER(s) = LOWER($${paramIndex})
      )`);
      values.push(subject.trim());
      paramIndex++;
    }

    if (minRate !== undefined && minRate !== '') {
      conditions.push(`tp.hourly_rate >= $${paramIndex}`);
      values.push(Number(minRate));
      paramIndex++;
    }

    if (maxRate !== undefined && maxRate !== '') {
      conditions.push(`tp.hourly_rate <= $${paramIndex}`);
      values.push(Number(maxRate));
      paramIndex++;
    }

    if (location) {
      conditions.push(`tp.location ILIKE $${paramIndex}`);
      values.push(`%${location.trim()}%`);
      paramIndex++;
    }

    if (gradeLevel !== undefined && gradeLevel !== '') {
      conditions.push(`$${paramIndex}::integer = ANY(tp.grade_levels)`);
      values.push(parseInt(gradeLevel, 10));
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Determine sorting
    let orderClause = 'ORDER BY avg_rating DESC NULLS LAST, u.id DESC';
    if (sortBy === 'rate_asc') {
      orderClause = 'ORDER BY tp.hourly_rate ASC NULLS LAST';
    } else if (sortBy === 'rate_desc') {
      orderClause = 'ORDER BY tp.hourly_rate DESC NULLS LAST';
    } else if (sortBy === 'name_asc') {
      orderClause = 'ORDER BY u.full_name ASC';
    } else if (sortBy === 'newest') {
      orderClause = 'ORDER BY u.created_at DESC';
    }

    // Total count query
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) AS total
      FROM users u
      LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
      ${whereClause}
    `;
    const countRes = await pool.query(countQuery, values);
    const total = parseInt(countRes.rows[0].total, 10) || 0;

    // Data query with aggregated review stats
    const dataQuery = `
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.created_at,
        tp.bio,
        tp.qualifications,
        COALESCE(tp.subjects, '{}') AS subjects,
        COALESCE(tp.grade_levels, '{}') AS grade_levels,
        COALESCE(tp.hourly_rate, 0) AS hourly_rate,
        tp.location,
        tp.updated_at,
        ROUND(COALESCE(AVG(r.rating), 0), 2) AS avg_rating,
        COUNT(r.id)::integer AS review_count
      FROM users u
      LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
      LEFT JOIN reviews r ON u.id = r.tutor_id
      ${whereClause}
      GROUP BY u.id, tp.user_id, tp.bio, tp.qualifications, tp.subjects, tp.grade_levels, tp.hourly_rate, tp.location, tp.updated_at
      ${orderClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataValues = [...values, limitNum, offset];
    const dataRes = await pool.query(dataQuery, dataValues);

    res.json({
      tutors: dataRes.rows,
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
 * GET /api/tutors/:id
 * Retrieve public profile for a specific tutor, including reviews.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const tutorId = parseInt(req.params.id, 10);
    if (isNaN(tutorId)) {
      return res.status(400).json({ error: 'Invalid tutor ID.' });
    }

    const tutorQuery = `
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.created_at,
        tp.bio,
        tp.qualifications,
        COALESCE(tp.subjects, '{}') AS subjects,
        COALESCE(tp.grade_levels, '{}') AS grade_levels,
        COALESCE(tp.hourly_rate, 0) AS hourly_rate,
        tp.location,
        tp.updated_at,
        ROUND(COALESCE(AVG(r.rating), 0), 2) AS avg_rating,
        COUNT(r.id)::integer AS review_count
      FROM users u
      LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
      LEFT JOIN reviews r ON u.id = r.tutor_id
      WHERE u.id = $1 AND u.role = 'tutor' AND u.is_active = TRUE
      GROUP BY u.id, tp.user_id, tp.bio, tp.qualifications, tp.subjects, tp.grade_levels, tp.hourly_rate, tp.location, tp.updated_at
    `;

    const tutorRes = await pool.query(tutorQuery, [tutorId]);
    if (tutorRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tutor not found or inactive.' });
    }

    const tutor = tutorRes.rows[0];

    // Fetch recent reviews for this tutor
    const reviewsQuery = `
      SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        s.id AS student_id,
        s.full_name AS student_name
      FROM reviews r
      JOIN users s ON r.student_id = s.id
      WHERE r.tutor_id = $1
      ORDER BY r.created_at DESC
      LIMIT 10
    `;
    const reviewsRes = await pool.query(reviewsQuery, [tutorId]);
    tutor.reviews = reviewsRes.rows;

    res.json({ tutor });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/tutors/profile
 * Update logged-in tutor's own profile.
 * Only accessible by users with role 'tutor'.
 */
router.put('/profile', authenticate, authorize('tutor'), async (req, res, next) => {
  try {
    const { bio, qualifications, subjects, gradeLevels, hourlyRate, location } = req.body;

    // Validate hourly rate
    if (hourlyRate !== undefined && Number(hourlyRate) < 0) {
      return res.status(400).json({ error: 'Hourly rate must be 0 or higher.' });
    }

    // Validate grade levels (0 to 12)
    if (gradeLevels !== undefined) {
      if (!Array.isArray(gradeLevels)) {
        return res.status(400).json({ error: 'gradeLevels must be an array of integers (0-12).' });
      }
      const valid = gradeLevels.every(g => Number.isInteger(g) && g >= 0 && g <= 12);
      if (!valid) {
        return res.status(400).json({ error: 'Grade levels must be integers between 0 and 12.' });
      }
    }

    if (subjects !== undefined && !Array.isArray(subjects)) {
      return res.status(400).json({ error: 'subjects must be an array of strings.' });
    }

    // Upsert tutor profile
    const upsertQuery = `
      INSERT INTO tutor_profiles (user_id, bio, qualifications, subjects, grade_levels, hourly_rate, location, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        bio = COALESCE($2, tutor_profiles.bio),
        qualifications = COALESCE($3, tutor_profiles.qualifications),
        subjects = COALESCE($4, tutor_profiles.subjects),
        grade_levels = COALESCE($5, tutor_profiles.grade_levels),
        hourly_rate = COALESCE($6, tutor_profiles.hourly_rate),
        location = COALESCE($7, tutor_profiles.location),
        updated_at = NOW()
      RETURNING *
    `;

    const result = await pool.query(upsertQuery, [
      req.user.id,
      bio !== undefined ? bio : null,
      qualifications !== undefined ? qualifications : null,
      subjects !== undefined ? subjects : null,
      gradeLevels !== undefined ? gradeLevels : null,
      hourlyRate !== undefined ? Number(hourlyRate) : null,
      location !== undefined ? location : null
    ]);

    res.json({
      message: 'Tutor profile updated successfully.',
      profile: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
