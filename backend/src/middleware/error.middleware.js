const AppError = require('../utils/AppError');

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  if (err.name === 'ZodError') {
    const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message },
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid access token' },
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Access token has expired' },
    });
  }

  // In development log the full stack for easy debugging; in production
  // only log a condensed message so stack traces, SQL, and filesystem paths
  // never appear in server logs that might be forwarded to external services.
  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  } else {
    console.error(`[ERROR] ${err.message}`);
  }

  // Never expose stack traces, SQL queries, database credentials, or any
  // internal implementation detail to the client response.
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
};

module.exports = errorHandler;
