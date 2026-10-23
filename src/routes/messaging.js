const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

function isLearner(role) { return ['student','guardian','learner'].includes(role); }

router.get('/conversations', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.id,c.booking_id,c.student_id,c.tutor_id,c.updated_at,
       CASE WHEN c.student_id=$1 THEN t.full_name ELSE s.full_name END AS other_name,
       CASE WHEN c.student_id=$1 THEN 'tutor' ELSE 'student' END AS other_role,
       (SELECT body FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
       (SELECT created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
       (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>$1 AND m.read_at IS NULL) AS unread_count
       FROM conversations c JOIN users s ON s.id=c.student_id JOIN users t ON t.id=c.tutor_id
       WHERE c.student_id=$1 OR c.tutor_id=$1 ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.conversation_id=c.id),c.updated_at) DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.post('/conversations', async (req, res, next) => {
  try {
    const tutorId = Number(req.body.tutorId);
    const bookingId = req.body.bookingId ? Number(req.body.bookingId) : null;
    if (!Number.isSafeInteger(tutorId) || tutorId < 1) return res.status(400).json({ error: 'Valid tutorId is required.' });
    let studentId;
    let actualTutorId;
    if (isLearner(req.user.role)) { studentId = req.user.id; actualTutorId = tutorId; }
    else if (req.user.role === 'tutor') { studentId = Number(req.body.studentId); actualTutorId = req.user.id; }
    else return res.status(403).json({ error: 'Only students/guardians and tutors can start conversations.' });
    if (!Number.isSafeInteger(studentId) || studentId < 1) return res.status(400).json({ error: 'Valid studentId is required for tutor-started conversations.' });
    const people = await pool.query("SELECT id,role FROM users WHERE id=ANY($1::int[])", [[studentId,actualTutorId]]);
    const student = people.rows.find(u=>u.id===studentId); const tutor=people.rows.find(u=>u.id===actualTutorId);
    if (!student || !isLearner(student.role) || !tutor || tutor.role!=='tutor') return res.status(400).json({ error: 'Conversation participants are invalid.' });
    if (bookingId) {
      const b = await pool.query('SELECT id FROM bookings WHERE id=$1 AND student_id=$2 AND tutor_id=$3',[bookingId,studentId,actualTutorId]);
      if (!b.rows.length) return res.status(403).json({ error: 'Booking does not belong to these participants.' });
    }
    const result = await pool.query(
      `INSERT INTO conversations(student_id,tutor_id,booking_id) VALUES($1,$2,$3)
       ON CONFLICT(student_id,tutor_id,booking_id) DO UPDATE SET updated_at=NOW() RETURNING *`,
      [studentId,actualTutorId,bookingId]
    );
    res.status(201).json({ conversation: result.rows[0] });
  } catch (error) { next(error); }
});

router.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const conversationId = Number(req.params.id);
    const membership = await pool.query('SELECT id FROM conversations WHERE id=$1 AND (student_id=$2 OR tutor_id=$2)',[conversationId,req.user.id]);
    if (!membership.rows.length) return res.status(404).json({ error: 'Conversation not found.' });
    const result = await pool.query('SELECT m.id,m.sender_id,m.body,m.read_at,m.created_at,u.full_name AS sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=$1 ORDER BY m.created_at ASC LIMIT 500',[conversationId]);
    await pool.query('UPDATE messages SET read_at=NOW() WHERE conversation_id=$1 AND sender_id<>$2 AND read_at IS NULL',[conversationId,req.user.id]);
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    const conversationId = Number(req.params.id);
    const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
    if (!body || body.length > 5000) return res.status(400).json({ error: 'Message must contain 1–5000 characters.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const conversation = await client.query('SELECT * FROM conversations WHERE id=$1 AND (student_id=$2 OR tutor_id=$2) FOR UPDATE',[conversationId,req.user.id]);
      if (!conversation.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Conversation not found.' }); }
      const c = conversation.rows[0];
      const inserted = await client.query('INSERT INTO messages(conversation_id,sender_id,body) VALUES($1,$2,$3) RETURNING *',[conversationId,req.user.id,body]);
      const recipientId = c.student_id === req.user.id ? c.tutor_id : c.student_id;
      await client.query('UPDATE conversations SET updated_at=NOW() WHERE id=$1',[conversationId]);
      await client.query("INSERT INTO notifications(user_id,type,title,body,link) VALUES($1,'message','New message',$2,'/guardian-dashboard')",[recipientId,body.slice(0,180)]);
      await client.query('COMMIT');
      res.status(201).json({ message: inserted.rows[0] });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } catch (error) { next(error); }
});
module.exports = router;
