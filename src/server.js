require('dotenv').config();
const http = require('http');
const app  = require('./app');
const { pool }   = require('./config/database.config');
const { initWs } = require('./websocket/wsServer');
const { startEnglishScheduler } = require('./schedulers/englishAuction.scheduler');
const { startDutchScheduler }   = require('./schedulers/dutchAuction.scheduler');
const { startSealedScheduler }  = require('./schedulers/sealedAuction.scheduler');
const { restoreActiveState }    = require('./schedulers/sessionManager.scheduler');

const PORT = process.env.PORT || 3000;

const start = async () => {
  try {
    // Test DB
    await pool.query('SELECT 1');
    console.log('[DB] Connected to Supabase PostgreSQL ✓');

    // HTTP Server
    const httpServer = http.createServer(app);

    // WebSocket
    initWs(httpServer);
    console.log('[WS] Socket.io initialized ✓');

    // Schedulers
    startEnglishScheduler();
    startDutchScheduler();
    startSealedScheduler();

    // Crash recovery
    await restoreActiveState();

    // Listen
    httpServer.listen(PORT, () => {
      console.log(`\n BidVibe API running on http://localhost:${PORT}`);
      console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`);
      console.log(`\n Routes:`);
      console.log(`   GET  /health`);
      console.log(`   /api/users, /api/wallet, /api/items`);
      console.log(`   /api/sessions, /api/auctions, /api/market`);
      console.log(`   /api/notifications, /api/ratings, /api/analytics`);
      console.log(`   /api/admin`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
};

start();