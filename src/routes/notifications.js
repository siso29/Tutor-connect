const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id,type,title,body,link,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.user.id]);
    res.json({ notifications: result.rows, unreadCount: result.rows.filter(n=>!n.read_at).length });
  } catch (error) { next(error); }
});
router.patch('/:id/read', async (req, res, next) => {
  try {
    const result = await pool.query('UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING *',[Number(req.params.id),req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ notification: result.rows[0] });
  } catch (error) { next(error); }
});
router.patch('/read-all', async (req, res, next) => {
  try {
    const result = await pool.query('UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE user_id=$1 AND read_at IS NULL',[req.user.id]);
    res.json({ updated: result.rowCount });
  } catch (error) { next(error); }
});
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM notifications WHERE id=$1 AND user_id=$2 RETURNING id',[Number(req.params.id),req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ deleted: true });
  } catch (error) { next(error); }
});
module.exports = router;
