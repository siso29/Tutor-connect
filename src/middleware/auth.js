const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * Middleware to authenticate requests using JWT Bearer token.
 * Attaches the user object to req.user.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required. Missing or malformed Bearer token.'
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token missing.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.sub || decoded.id;

    if (!userId) {
      return res.status(401).json({ error: 'Invalid token payload.' });
    }

    const result = await pool.query(
      `SELECT id, full_name, email, role, is_active, created_at 
       FROM users 
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User account no longer exists.' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'User account is deactivated.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired. Please log in again.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid authentication token.' });
    }

    console.error('Auth middleware error:', error.message);
    return res.status(500).json({ error: 'Internal authentication error.' });
  }
};

/**
 * Middleware factory to authorize specific user roles.
 * Example: authorize('tutor', 'admin')
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Authentication required first.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden. Access denied for role '${req.user.role}'. Required: [${allowedRoles.join(', ')}]`
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  authorize
};
