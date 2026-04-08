require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');

const { pool }          = require('./config/database.config');
const { errorHandler }  = require('./middlewares/errorHandler.middleware');
const { apiLimiter }    = require('./middlewares/rateLimiter.middleware');
const apiRoutes         = require('./routes');

// ── Routes ─────────────────────────────────────────────────

const app = express();

const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (configuredOrigins.includes(origin)) return true;

  const isDev = (process.env.NODE_ENV || 'development') !== 'production';
  return isDev && /^http:\/\/localhost:\d+$/.test(origin);
};

// ── Global Middleware ───────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));
app.use('/api', apiLimiter);

// ── Health Check ────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      success:   true,
      message:   'BidVibe API is running',
      database:  'connected',
      timestamp: new Date(),
    });
  } catch {
    res.status(500).json({
      success:  false,
      message:  'Database connection failed',
      database: 'disconnected',
    });
  }
});

// ── API Routes ──────────────────────────────────────────────
app.use('/api', apiRoutes);

// ── 404 ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global Error Handler ────────────────────────────────────
app.use(errorHandler);

module.exports = app;