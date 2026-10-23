
const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * Safely format a tutor for frontend and backend compatibility.
 * Does not invent ratings or claim that a tutor is verified.
 */
function formatTutor(row, reviews = []) {
  if (!row) return null;

  const name = row.full_name || row.name || '';
  const initials = name
    ? name
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'TC';

  const grades = Array.isArray(row.grade_levels)
    ? row.grade_levels
    : Array.isArray(row.grades)
      ? row.grades
      : [];

  const numericGrades = grades
    .map(Number)
    .filter(Number.isFinite);

  const gradeRangeLabel = numericGrades.length
    ? `Grades ${Math.min(...numericGrades)} to ${Math.max(...numericGrades)}`
    : 'Grades not specified';

  const price = Number(
    row.price !== undefined ? row.price : row.hourly_rate ?? 0
  );

  const rating = Number(
    row.rating !== undefined ? row.rating : row.avg_rating ?? 0
  );

  const reviewsCount = Number(
    row.reviewsCount !== undefined
      ? row.reviewsCount
      : row.review_count ?? reviews.length
  );

  let qualificationsList = [];

  if (Array.isArray(row.qualifications)) {
    qualificationsList = row.qualifications;
  } else if (
    typeof row.qualifications === 'string' &&
    row.qualifications.trim()
  ) {
    qualificationsList = row.qualifications
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const formattedReviews = reviews.map((review) => ({
    id: review.id,
    author:
      review.author_name ||
      review.author ||
      review.student_name ||
      'Learner',
    rating: Number(review.rating) || 0,
    date: review.created_at
      ? new Date(review.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : 'Recently',
    comment: review.comment || '',
    student_id: review.student_id,
    student_name: review.student_name,
  }));

  const verified =
    row.verified === true || row.verified === 'true';

  return {
    // Frontend properties
    id: row.id,
    name,
    initials,
    email: row.email,
    subjects: Array.isArray(row.subjects) ? row.subjects : [],
    grades,
    gradeRangeLabel,
    modes: Array.isArray(row.modes) ? row.modes : [],
    rating: Number.isFinite(rating) ? rating : 0,
    reviewsCount: Number.isFinite(reviewsCount) ? reviewsCount : 0,
    experience:
      row.experience !== null && row.experience !== undefined
        ? Number(row.experience)
        : 0,
    price: Number.isFinite(price) ? price : 0,
    availability: row.availability || '',
    availableDays: Array.isArray(row.available_days)
      ? row.available_days
      : [],
    availableTimes: Array.isArray(row.available_times)
      ? row.available_times
      : [],
    verified,
    verificationStatus:
      row.verification_status || (verified ? 'Verified' : 'Pending'),
    description: row.description || row.bio || '',
    about: row.about || row.bio || row.description || '',
    method: row.method || '',
    qualifications: qualificationsList,
    location: row.location || '',
    reviews: formattedReviews,

    // Backend compatibility properties
    full_name: name,
    hourly_rate: Number.isFinite(price) ? price : 0,
    avg_rating: Number.isFinite(rating) ? rating : 0,
    review_count: Number.isFinite(reviewsCount) ? reviewsCount : 0,
    bio: row.bio || row.about || '',
    grade_levels: grades,
    updated_at: row.updated_at,
  };
}

/**
 * Only allow users to update their own tutor profile,
 * or administrators to update a tutor profile.
 */
function canManageTutor(req, tutorUserId) {
  const user = req.user;

  if (!user) return false;

  const isAdmin = user.role === 'admin';
  const isOwner = Number(user.id) === Number(tutorUserId);

  return isAdmin || isOwner;
}

/**
 * GET /api/tutors
 * List tutors with optional filtering and pagination.
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
      limit = 50,
      format,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(
      1,
      Math.min(100, parseInt(limit, 10) || 50)
    );
    const offset = (pageNum - 1) * limitNum;

    const conditions = [
      "u.role = 'tutor'",
      'u.is_active = TRUE',
    ];

    const values = [];
    let paramIndex = 1;

    if (search && search.trim()) {
      conditions.push(`(
        u.full_name ILIKE $${paramIndex}
        OR tp.bio ILIKE $${paramIndex}
        OR tp.qualifications::text ILIKE $${paramIndex}
        OR tp.description ILIKE $${paramIndex}
      )`);

      values.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (subject && subject !== 'Any') {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM unnest(COALESCE(tp.subjects, ARRAY[]::text[])) AS s
          WHERE LOWER(s) = LOWER($${paramIndex})
        )
      `);

      values.push(subject.trim());
      paramIndex++;
    }

    if (minRate !== undefined && minRate !== '') {
      const rate = Number(minRate);

      if (!Number.isFinite(rate) || rate < 0) {
        return res.status(400).json({ error: 'Invalid minimum rate.' });
      }

      conditions.push(`tp.hourly_rate >= $${paramIndex}`);
      values.push(rate);
      paramIndex++;
    }

    if (maxRate !== undefined && maxRate !== '') {
      const rate = Number(maxRate);

      if (!Number.isFinite(rate) || rate < 0) {
        return res.status(400).json({ error: 'Invalid maximum rate.' });
      }

      conditions.push(`tp.hourly_rate <= $${paramIndex}`);
      values.push(rate);
      paramIndex++;
    }

    if (
      minRate !== undefined &&
      minRate !== '' &&
      maxRate !== undefined &&
      maxRate !== '' &&
      Number(minRate) > Number(maxRate)
    ) {
      return res.status(400).json({
        error: 'Minimum rate cannot exceed maximum rate.',
      });
    }

    if (location && location.trim()) {
      conditions.push(`tp.location ILIKE $${paramIndex}`);
      values.push(`%${location.trim()}%`);
      paramIndex++;
    }

    if (gradeLevel !== undefined && gradeLevel !== '') {
      const grade = parseInt(gradeLevel, 10);

      if (!Number.isInteger(grade) || grade < 1) {
        return res.status(400).json({ error: 'Invalid grade level.' });
      }

      conditions.push(`$${paramIndex} = ANY(tp.grade_levels)`);
      values.push(grade);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const orderOptions = {
      rate_asc: 'tp.hourly_rate ASC NULLS LAST',
      rate_desc: 'tp.hourly_rate DESC NULLS LAST',
      name_asc: 'u.full_name ASC',
      rating_desc: 'avg_rating DESC, u.id ASC',
    };

    const orderClause = orderOptions[sortBy]
      ? `ORDER BY ${orderOptions[sortBy]}`
      : 'ORDER BY avg_rating DESC, u.id ASC';

    const countQuery = `
      SELECT COUNT(DISTINCT u.id)::integer AS total
      FROM users u
      LEFT JOIN tutor_profiles tp ON tp.user_id = u.id
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, values);
    const total = Number(countResult.rows[0]?.total || 0);

    const dataQuery = `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.created_at,
        tp.bio,
        tp.qualifications,
        COALESCE(tp.subjects, ARRAY[]::text[]) AS subjects,
        COALESCE(tp.grade_levels, ARRAY[]::integer[]) AS grade_levels,
        COALESCE(tp.hourly_rate, 0) AS hourly_rate,
        tp.location,
        COALESCE(tp.modes, ARRAY[]::text[]) AS modes,
        COALESCE(tp.experience, 0) AS experience,
        tp.availability,
        COALESCE(tp.available_days, ARRAY[]::text[]) AS available_days,
        COALESCE(tp.available_times, ARRAY[]::text[]) AS available_times,
        COALESCE(tp.verified, FALSE) AS verified,
        COALESCE(tp.verification_status, 'Pending') AS verification_status,
        tp.description,
        tp.method,
        tp.updated_at,
        COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) AS avg_rating,
        COUNT(DISTINCT r.id)::integer AS review_count
      FROM users u
      LEFT JOIN tutor_profiles tp ON tp.user_id = u.id
      LEFT JOIN reviews r ON r.tutor_id = u.id
      ${whereClause}
      GROUP BY u.id, tp.user_id
      ${orderClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataResult = await pool.query(dataQuery, [
      ...values,
      limitNum,
      offset,
    ]);

    const tutorIds = dataResult.rows.map((row) => row.id);
    let reviewsByTutor = {};

    if (tutorIds.length > 0) {
      const reviewsResult = await pool.query(
        `SELECT
           r.id,
           r.tutor_id,
           r.student_id,
           r.rating,
           r.comment,
           r.author_name,
           r.created_at,
           s.full_name AS student_name
         FROM reviews r
         LEFT JOIN users s ON s.id = r.student_id
         WHERE r.tutor_id = ANY($1::integer[])
         ORDER BY r.created_at DESC`,
        [tutorIds]
      );

      for (const review of reviewsResult.rows) {
        if (!reviewsByTutor[review.tutor_id]) {
          reviewsByTutor[review.tutor_id] = [];
        }

        reviewsByTutor[review.tutor_id].push(review);
      }
    }

    const tutors = dataResult.rows.map((row) =>
      formatTutor(row, reviewsByTutor[row.id] || [])
    );

    if (format === 'paginated') {
      return res.json({
        tutors,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    }

    return res.json(tutors);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tutors/:id
 * Get one tutor and their reviews.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const tutorId = parseInt(req.params.id, 10);

    if (!Number.isInteger(tutorId) || tutorId < 1) {
      return res.status(400).json({ error: 'Invalid tutor ID.' });
    }

    const result = await pool.query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.created_at,
         tp.bio,
         tp.qualifications,
         COALESCE(tp.subjects, ARRAY[]::text[]) AS subjects,
         COALESCE(tp.grade_levels, ARRAY[]::integer[]) AS grade_levels,
         COALESCE(tp.hourly_rate, 0) AS hourly_rate,
         tp.location,
         COALESCE(tp.modes, ARRAY[]::text[]) AS modes,
         COALESCE(tp.experience, 0) AS experience,
         tp.availability,
         COALESCE(tp.available_days, ARRAY[]::text[]) AS available_days,
         COALESCE(tp.available_times, ARRAY[]::text[]) AS available_times,
         COALESCE(tp.verified, FALSE) AS verified,
         COALESCE(tp.verification_status, 'Pending') AS verification_status,
         tp.description,
         tp.method,
         tp.updated_at,
         COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) AS avg_rating,
         COUNT(DISTINCT r.id)::integer AS review_count
       FROM users u
       LEFT JOIN tutor_profiles tp ON tp.user_id = u.id
       LEFT JOIN reviews r ON r.tutor_id = u.id
       WHERE u.id = $1
         AND u.role = 'tutor'
         AND u.is_active = TRUE
       GROUP BY u.id, tp.user_id`,
      [tutorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Tutor not found or inactive.',
      });
    }

    const reviewsResult = await pool.query(
      `SELECT
         r.id,
         r.rating,
         r.comment,
         r.author_name,
         r.student_id,
         r.created_at,
         s.full_name AS student_name
       FROM reviews r
       LEFT JOIN users s ON s.id = r.student_id
       WHERE r.tutor_id = $1
       ORDER BY r.created_at DESC`,
      [tutorId]
    );

    const tutor = formatTutor(result.rows[0], reviewsResult.rows);

    return res.json({
      ...tutor,
      tutor,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/tutors/:id
 * Update an authenticated tutor's own profile or an admin-managed profile.
 *
 * Verification fields are deliberately not accepted from ordinary tutors.
 */
router.put('/:id', authenticate, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const tutorId = parseInt(req.params.id, 10);

    if (!Number.isInteger(tutorId) || tutorId < 1) {
      return res.status(400).json({ error: 'Invalid tutor ID.' });
    }

    const tutorResult = await client.query(
      `SELECT id, role
       FROM users
       WHERE id = $1 AND is_active = TRUE`,
      [tutorId]
    );

    if (tutorResult.rows.length === 0 ||
        tutorResult.rows[0].role !== 'tutor') {
      return res.status(404).json({ error: 'Tutor not found.' });
    }

    if (!canManageTutor(req, tutorId)) {
      return res.status(403).json({
        error: 'You may only update your own tutor profile.',
      });
    }

    const {
      price,
      hourlyRate,
      bio,
      about,
      description,
      method,
      subjects,
      grades,
      gradeLevels,
      location,
      modes,
      availability,
    } = req.body;

    const isAdmin = req.user.role === 'admin';

    const resolvedPrice =
      price !== undefined
        ? Number(price)
        : hourlyRate !== undefined
          ? Number(hourlyRate)
          : undefined;

    if (
      resolvedPrice !== undefined &&
      (!Number.isFinite(resolvedPrice) || resolvedPrice < 0)
    ) {
      return res.status(400).json({ error: 'Invalid hourly rate.' });
    }

    const resolvedBio =
      about !== undefined ? about : bio !== undefined ? bio : description;

    if (resolvedBio !== undefined && typeof resolvedBio !== 'string') {
      return res.status(400).json({ error: 'Bio must be text.' });
    }

    const resolvedGrades = Array.isArray(grades)
      ? grades
      : Array.isArray(gradeLevels)
        ? gradeLevels
        : undefined;

    if (
      resolvedGrades !== undefined &&
      !resolvedGrades.every(
        (grade) => Number.isInteger(grade) && grade > 0
      )
    ) {
      return res.status(400).json({ error: 'Invalid grade levels.' });
    }

    if (subjects !== undefined && !Array.isArray(subjects)) {
      return res.status(400).json({ error: 'Subjects must be an array.' });
    }

    if (modes !== undefined && !Array.isArray(modes)) {
      return res.status(400).json({ error: 'Modes must be an array.' });
    }

    // Only admins may change verification status.
    const verified = isAdmin && typeof req.body.verified === 'boolean'
      ? req.body.verified
      : undefined;

    const verificationStatus =
      isAdmin && typeof req.body.verificationStatus === 'string'
        ? req.body.verificationStatus
        : undefined;

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO tutor_profiles (
         user_id, bio, description, method, subjects, grade_levels,
         hourly_rate, location, modes, availability,
         verified, verification_status, updated_at
       )
       VALUES (
         $1, $2, $2, $3,
         COALESCE($4, ARRAY[]::text[]),
         COALESCE($5, ARRAY[]::integer[]),
         $6, $7,
         COALESCE($8, ARRAY[]::text[]),
         $9,
         COALESCE($10, FALSE),
         COALESCE($11, 'Pending'),
         NOW()
       )
       ON CONFLICT (user_id) DO UPDATE SET
         bio = COALESCE($2, tutor_profiles.bio),
         description = COALESCE($2, tutor_profiles.description),
         method = COALESCE($3, tutor_profiles.method),
         subjects = COALESCE($4, tutor_profiles.subjects),
         grade_levels = COALESCE($5, tutor_profiles.grade_levels),
         hourly_rate = COALESCE($6, tutor_profiles.hourly_rate),
         location = COALESCE($7, tutor_profiles.location),
         modes = COALESCE($8, tutor_profiles.modes),
         availability = COALESCE($9, tutor_profiles.availability),
         verified = COALESCE($10, tutor_profiles.verified),
         verification_status = COALESCE(
           $11, tutor_profiles.verification_status
         ),
         updated_at = NOW()`,
      [
        tutorId,
        resolvedBio === undefined ? null : resolvedBio.trim(),
        method === undefined ? null : method,
        subjects === undefined ? null : subjects,
        resolvedGrades === undefined ? null : resolvedGrades,
        resolvedPrice === undefined ? null : resolvedPrice,
        location === undefined ? null : location,
        modes === undefined ? null : modes,
        availability === undefined ? null : availability,
        verified === undefined ? null : verified,
        verificationStatus === undefined ? null : verificationStatus,
      ]
    );

    await client.query('COMMIT');

    const refreshed = await client.query(
      `SELECT
         u.id, u.full_name, u.email,
         tp.*,
         COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) AS avg_rating,
         COUNT(DISTINCT r.id)::integer AS review_count
       FROM users u
       JOIN tutor_profiles tp ON tp.user_id = u.id
       LEFT JOIN reviews r ON r.tutor_id = u.id
       WHERE u.id = $1
       GROUP BY u.id, tp.user_id`,
      [tutorId]
    );

    const tutor = formatTutor(refreshed.rows[0]);

    return res.json({
      message: 'Tutor profile updated successfully.',
      tutor,
      ...tutor,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Preserve the original error.
    }

    next(error);
  } finally {
    client.release();
  }
});

/**
 * POST /api/tutors/:tutorId/reviews
 * Only authenticated users may submit reviews.
 */
router.post('/:tutorId/reviews', authenticate, async (req, res, next) => {
  try {
    const tutorId = parseInt(req.params.tutorId, 10);
    const studentId = Number(req.user.id);
    const { rating, comment } = req.body;

    if (!Number.isInteger(tutorId) || tutorId < 1) {
      return res.status(400).json({ error: 'Invalid tutor ID.' });
    }

    if (!Number.isInteger(studentId) || studentId < 1) {
      return res.status(401).json({ error: 'Invalid authenticated user.' });
    }

    const ratingNum = Number(rating);

    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({
        error: 'Rating must be an integer between 1 and 5.',
      });
    }

    if (typeof comment !== 'string' || !comment.trim()) {
      return res.status(400).json({
        error: 'A review comment is required.',
      });
    }

    if (comment.trim().length > 2000) {
      return res.status(400).json({
        error: 'Review comment cannot exceed 2000 characters.',
      });
    }

    const tutorResult = await pool.query(
      `SELECT id
       FROM users
       WHERE id = $1
         AND role = 'tutor'
         AND is_active = TRUE`,
      [tutorId]
    );

    if (tutorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tutor not found.' });
    }

    if (studentId === tutorId) {
      return res.status(400).json({
        error: 'You cannot review your own tutor profile.',
      });
    }

    const studentResult = await pool.query(
      `SELECT id, full_name, role
       FROM users
       WHERE id = $1 AND is_active = TRUE`,
      [studentId]
    );

    if (studentResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found or inactive.' });
    }

    if (!['student', 'parent', 'admin'].includes(studentResult.rows[0].role)) {
      return res.status(403).json({
        error: 'Your account is not allowed to submit reviews.',
      });
    }

    // The author is taken from the authenticated account, not the request body.
    const authorName = studentResult.rows[0].full_name || 'Learner';

    const insertResult = await pool.query(
      `INSERT INTO reviews (
         tutor_id, student_id, rating, comment, author_name
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tutor_id, student_id, rating, comment,
                 author_name, created_at`,
      [tutorId, studentId, ratingNum, comment.trim(), authorName]
    );

    return res.status(201).json({
      message: 'Review added successfully.',
      review: insertResult.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
