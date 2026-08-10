const rateLimit = require('express-rate-limit');

// Brute-force protection for authentication endpoints.
// express-rate-limit was already a dependency; this enables it instead of a no-op.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,                  // 50 attempts per window per IP (generous for demos, blocks brute force)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many authentication attempts. Please try again later.',
  },
});

// Stricter limiter for password-reset token minting
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many password reset requests. Please try again later.',
  },
});

module.exports = { authLimiter, passwordResetLimiter };
