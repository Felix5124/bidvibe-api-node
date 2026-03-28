const { query } = require('../config/database.config');

/**
 * Gọi khi server khởi động lại —
 * Restore các auction đang ACTIVE để scheduler tiếp tục đúng.
 */
const restoreActiveState = async () => {
  console.log('[SessionManager] Checking for active sessions to restore...');

  const { rows: activeAuctions } = await query(
    `SELECT a.id, a.end_time,
            s.type AS session_type
     FROM auctions a
     JOIN auction_sessions s ON s.id = a.session_id
     WHERE a.status = 'ACTIVE'`
  );

  if (!activeAuctions.length) {
    console.log('[SessionManager] No active auctions found.');
    return;
  }

  for (const auction of activeAuctions) {
    const remaining = Math.max(0, Math.round((new Date(auction.end_time) - Date.now()) / 1000));
    console.log(`[SessionManager] Restored ${auction.session_type} auction ${auction.id} — ${remaining}s remaining`);
  }

  console.log(`[SessionManager] Restored ${activeAuctions.length} auction(s)`);
};

module.exports = { restoreActiveState };