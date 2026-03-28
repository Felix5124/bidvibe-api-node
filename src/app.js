require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');

const { pool }          = require('./config/database.config');
const { errorHandler }  = require('./middlewares/errorHandler.middleware');
const { apiLimiter }    = require('./middlewares/rateLimiter.middleware');

// ── Routes ─────────────────────────────────────────────────
const userRoutes         = require('./modules/user/user.routes');
const walletRoutes       = require('./modules/wallet/wallet.routes');
const itemRoutes         = require('./modules/item/item.routes');
const sessionRoutes      = require('./modules/session/session.routes');
const auctionRoutes      = require('./modules/auction/auction.routes');
const marketRoutes       = require('./modules/market/market.routes');
const notificationRoutes = require('./modules/notification/notification.routes');
const ratingRoutes       = require('./modules/rating/rating.routes');
const analyticsRoutes    = require('./modules/analytics/analytics.routes');
const adminRoutes        = require('./modules/admin/admin.routes');

const app = express();

// ── Global Middleware ───────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      process.env.CORS_ORIGIN || 'http://localhost:5173',
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
app.use('/api/users',         userRoutes);
app.use('/api/wallet',        walletRoutes);
app.use('/api/items',         itemRoutes);
app.use('/api/sessions',      sessionRoutes);
app.use('/api/auctions',      auctionRoutes);
app.use('/api/market',        marketRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ratings',       ratingRoutes);
app.use('/api/analytics',     analyticsRoutes);
app.use('/api/admin',         adminRoutes);

// ── 404 ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global Error Handler ────────────────────────────────────
app.use(errorHandler);

module.exports = app;