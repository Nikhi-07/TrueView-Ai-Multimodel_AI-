const rateLimit = require('express-rate-limit');

// Rate limiter disabled for development/testing
const authLimiter = (req, res, next) => next();

module.exports = { authLimiter };
