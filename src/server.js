require('dotenv').config();
const http = require('http');
const app  = require('./app');
const { pool }   = require('./config/database.config');
const { initWs } = require('./websocket/wsServer');

const PORT = process.env.PORT || 3000;

const start = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('[DB] Connected to Supabase PostgreSQL');

    const httpServer = http.createServer(app);

    // Khởi động WebSocket
    initWs(httpServer);
    console.log('[WS] Socket.io initialized ✓');

    httpServer.listen(PORT, () => {
      console.log(`BidVibe API running on http://localhost:${PORT}`);
      console.log(`ENV: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
};

start();