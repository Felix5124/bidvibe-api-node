const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    message: 'Quá nhiều request, vui lòng thử lại sau.',
  },
});

const bidLimiter = rateLimit({
  windowMs: 1000,
  max: 5,
  message: {
    success: false,
    data: null,
    message: 'Đặt giá quá nhanh.',
  },
});

module.exports = { apiLimiter, bidLimiter };