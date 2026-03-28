require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { pool } = require('./config/database.config');
const { errorHandler } = require('./middlewares/errorHandler.middleware');
const { apiLimiter } = require('./middlewares/rateLimiter.middleware');
const userRoutes = require('./modules/user/user.routes');
const walletRoutes = require('./modules/wallet/wallet.routes');
const itemRoutes = require('./modules/item/item.routes');
const notificationRoutes = require('./modules/notification/notification.routes');
const sessionRoutes = require('./modules/session/session.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const auctionRoutes = require('./modules/auction/auction.routes');


const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use('/api', apiLimiter);
app.use('/api/users', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auctions', auctionRoutes);


// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      success: true,
      message: 'BidVibe API is running',
      database: 'connected',
      timestamp: new Date(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      database: 'disconnected',
    });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use(errorHandler);

module.exports = app;