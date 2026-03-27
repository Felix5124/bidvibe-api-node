require('dotenv').config();
const http = require('http');
const app = require('./app');
const { pool } = require('./config/database.config');

const PORT = process.env.PORT || 3000;

const start = async () => {
  try {
    // Test DB connection
    await pool.query('SELECT 1');
    console.log('[DB] Connected to Supabase PostgreSQL ✓');

    const server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(` BidVibe API running on http://localhost:${PORT}`);
      console.log(` ENV: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1);
  }
};

start();