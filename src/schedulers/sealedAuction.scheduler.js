const cron = require('node-cron');
const { query, getClient }    = require('../config/database.config');
const { publishSealedReveal } = require('../websocket/publishers/auctionPublisher');
const notifService  = require('../modules/notification/notification.service');
const { NotificationType }    = require('../constants/enums');
const { PLATFORM_FEE_RATE }   = require('../constants/appConstants');

const revealSealedAuction = async (auction) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lấy tất cả bids: sort theo amount DESC, bid_time ASC (tie-break)
    const { rows: bids } = await client.query(
      `SELECT b.*, u.nickname
       FROM bids b
       JOIN users u ON u.id = b.user_id
       WHERE b.auction_id = $1
       ORDER BY b.amount DESC, b.bid_time ASC`,
      [auction.id]
    );

    const winner = bids[0] || null;

    if (winner) {
      const price = parseFloat(winner.amount);
      const fee   = Math.round(price * PLATFORM_FEE_RATE);

      // Charge winner: trừ locked → thanh toán + phí
      await client.query(
        `UPDATE wallets
         SET balance_locked = balance_locked - $1
         WHERE user_id = $2`,
        [price, winner.user_id]
      );
      await client.query(
        `UPDATE wallets
         SET balance_available = balance_available - $1
         WHERE user_id = $2`,
        [fee, winner.user_id]
      );
      await client.query(
        `INSERT INTO transactions (id, wallet_id, type, amount, status, reference_id, created_at)
         SELECT gen_random_uuid(), id, 'FINAL_PAYMENT', $1, 'COMPLETED', $2, now()
         FROM wallets WHERE user_id = $3`,
        [price, auction.id, winner.user_id]
      );
      await client.query(
        `INSERT INTO transactions (id, wallet_id, type, amount, status, reference_id, created_at)
         SELECT gen_random_uuid(), id, 'PLATFORM_FEE', $1, 'COMPLETED', $2, now()
         FROM wallets WHERE user_id = $3`,
        [fee, auction.id, winner.user_id]
      );

      // Chuyển item
      await client.query(
        `UPDATE items
         SET current_owner_id = $1,
             status           = 'IN_INVENTORY',
             cooldown_until   = now() + interval '12 hours'
         WHERE id = $2`,
        [winner.user_id, auction.item_id]
      );

      // Unlock tiền người thua
      for (const bid of bids.slice(1)) {
        await client.query(
          `UPDATE wallets
           SET balance_available = balance_available + $1,
               balance_locked    = balance_locked    - $1
           WHERE user_id = $2`,
          [bid.amount, bid.user_id]
        );
      }
    } else {
      // Không có ai bid → trả item về APPROVED
      await client.query(
        `UPDATE items SET status = 'APPROVED' WHERE id = $1`,
        [auction.item_id]
      );
    }

    // Kết thúc auction
    await client.query(
      `UPDATE auctions
       SET status    = 'ENDED',
           winner_id = $2
       WHERE id = $1`,
      [auction.id, winner?.user_id || null]
    );

    await client.query('COMMIT');

    // Broadcast reveal với tất cả bids
    publishSealedReveal(auction.id, {
      winnerId:        winner?.user_id,
      winnerNickname:  winner?.nickname,
      winnerAmount:    winner?.amount,
      allBids: bids.map((b) => ({ nickname: b.nickname, amount: b.amount })),
    });

    // Notify người thắng
    if (winner) {
      await notifService.send(
        winner.user_id,
        NotificationType.AUCTION_WON,
        '🎉 Bạn đã thắng đấu giá kín!',
        `Bạn thắng với giá ${parseFloat(winner.amount).toLocaleString('vi-VN')}đ.`
      );
    }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[SealedScheduler] Error:', e.message);
  } finally {
    client.release();
  }
};

const startSealedScheduler = () => {
  // Kiểm tra mỗi phút
  cron.schedule('* * * * *', async () => {
    try {
      const { rows } = await query(
        `SELECT a.* FROM auctions a
         JOIN auction_sessions s ON s.id = a.session_id
         WHERE a.status = 'ACTIVE'
           AND s.type = 'SEALED'
           AND a.end_time <= now()`
      );

      for (const auction of rows) {
        await revealSealedAuction(auction);
      }
    } catch (e) {
      console.error('[SealedScheduler] Error:', e.message);
    }
  });

  console.log('[SealedScheduler] Started ✓');
};

module.exports = { startSealedScheduler };