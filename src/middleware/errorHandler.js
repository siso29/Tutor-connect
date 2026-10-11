/**
 * Centralized Express Error Handling Middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.url}:`, err);

  // PostgreSQL specific error handling
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Conflict: Unique constraint violation.',
      detail: err.detail
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Bad Request: Foreign key reference does not exist.',
      detail: err.detail
    });
  }

  if (err.code === '23514') {
    return res.status(400).json({
      error: 'Bad Request: Value violated check constraint.',
      detail: err.detail
    });
  }

  if (err.code === '22P02') {
    return res.status(400).json({
      error: 'Bad Request: Invalid data input format (e.g. invalid integer or UUID).'
    });
  }

  // JSON payload parser error
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Bad Request: Malformed JSON in request body.'
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message
  });
};

module.exports = errorHandler;
