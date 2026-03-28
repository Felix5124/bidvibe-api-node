const cron = require('node-cron');
const { query, getClient }   = require('../config/database.config');
const { publishDutchDrop, publishAuctionEnded } = require('../websocket/publishers/auctionPublisher');
const { activateNextAuction } = require('./englishAuction.scheduler');
const { ENGLISH_BREAK_SECONDS } = require('../constants/appConstants');

const startDutchScheduler = () => {
  cron.schedule('* * * * * *', async () => {
    try {
      const { rows } = await query(
        `SELECT a.* FROM auctions a
         JOIN auction_sessions s ON s.id = a.session_id
         WHERE a.status = 'ACTIVE' AND s.type = 'DUTCH'`
      );

      for (const auction of rows) {
        const lastDrop   = new Date(auction.last_price_drop_at || auction.created_at);
        const msSinceDrop = Date.now() - lastDrop.getTime();
        const intervalMs  = (auction.interval_seconds || 5) * 1000;

        if (msSinceDrop < intervalMs) continue;

        const newPrice = parseFloat(auction.current_price) - parseFloat(auction.decrease_amount || 0);
        const minPrice = parseFloat(auction.min_price || 0);

        if (newPrice <= minPrice) {
          // Chạm sàn — kết thúc không có người thắng
          await query(
            `UPDATE auctions
             SET status = 'ENDED', current_price = $2
             WHERE id = $1`,
            [auction.id, minPrice]
          );

          // Trả item về APPROVED để Admin xếp lại
          await query(
            `UPDATE items SET status = 'APPROVED' WHERE id = $1`,
            [auction.item_id]
          );

          publishAuctionEnded(auction.id, {
            auctionId:  auction.id,
            winnerId:   null,
            finalPrice: minPrice,
            status:     'ENDED',
          });

          setTimeout(
            () => activateNextAuction(auction.session_id, auction.order_index),
            ENGLISH_BREAK_SECONDS * 1000
          );
        } else {
          // Giảm giá
          await query(
            `UPDATE auctions
             SET current_price      = $2,
                 last_price_drop_at = now()
             WHERE id = $1`,
            [auction.id, newPrice]
          );

          publishDutchDrop(auction.id, {
            currentPrice:  newPrice,
            minPrice,
            previousPrice: auction.current_price,
          });
        }
      }
    } catch (e) {
      console.error('[DutchScheduler] Error:', e.message);
    }
  });

  console.log('[DutchScheduler] Started ✓');
};

module.exports = { startDutchScheduler };