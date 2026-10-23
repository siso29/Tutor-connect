const express = require('express');
const pool = require('../config/db');

const router = express.Router();

// GET /api/support/inquiries
router.get('/inquiries', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM inquiries ORDER BY id DESC');
    res.json(result.rows.map(row => ({
      id: row.ticket_number || `inq-${row.id}`,
      inquiryId: row.id,
      ticketNumber: row.ticket_number || `TC-${row.id}`,
      name: row.name,
      email: row.email,
      subject: row.subject,
      message: row.message,
      status: row.status || 'Open',
      date: new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    })));
  } catch (error) {
    next(error);
  }
});

// POST /api/support/inquiries
router.post('/inquiries', async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    const ticketNumber = `TC-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await pool.query(
      `INSERT INTO inquiries (ticket_number, name, email, subject, message, status)
       VALUES ($1, $2, $3, $4, $5, 'Open')
       RETURNING *`,
      [ticketNumber, name || 'Anonymous', email || '', subject || 'General Inquiry', message || '']
    );

    const row = result.rows[0];
    res.status(201).json({
      id: row.ticket_number,
      ticketNumber: row.ticket_number,
      status: 'Open',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      ...req.body
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/support/inquiries/:id/resolve
router.patch('/inquiries/:id/resolve', async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE inquiries SET status = 'Resolved' WHERE ticket_number = $1 OR id::text = $1`,
      [id]
    );
    res.json({ message: 'Inquiry marked as resolved.' });
  } catch (error) {
    next(error);
  }
});

// GET /api/support/reports
router.get('/reports', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM reports ORDER BY id DESC');
    res.json(result.rows.map(row => ({
      id: `rep-${row.id}`,
      reportId: row.id,
      type: row.type || 'Review Report',
      tutorId: row.tutor_id,
      targetId: row.target_id,
      reporterName: row.reporter_name,
      reason: row.reason,
      status: row.status || 'Open',
      date: new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    })));
  } catch (error) {
    next(error);
  }
});

// POST /api/support/reports
router.post('/reports', async (req, res, next) => {
  try {
    const { type, tutorId, targetId, reporterName, reason } = req.body;
    const result = await pool.query(
      `INSERT INTO reports (type, tutor_id, target_id, reporter_name, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'Open')
       RETURNING *`,
      [type || 'Review Report', tutorId || null, targetId || null, reporterName || 'Anonymous', reason || '']
    );

    res.status(201).json({
      id: `rep-${result.rows[0].id}`,
      status: 'Open',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      ...req.body
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/support/reports/:id/resolve
router.patch('/reports/:id/resolve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id.replace('rep-', ''), 10);
    await pool.query(
      `UPDATE reports SET status = 'Resolved' WHERE id = $1`,
      [numericId]
    );
    res.json({ message: 'Report marked as resolved.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
