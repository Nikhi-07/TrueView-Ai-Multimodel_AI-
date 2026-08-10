const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode ? res.statusCode : 500;
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(statusCode);

  res.json({
    // Never leak internal/database details to users in production.
    message: isProduction && statusCode >= 500
      ? 'Internal server error'
      : (err.message || 'Something went wrong'),
    stack: isProduction ? null : err.stack,
  });
};

module.exports = { errorHandler };
