const cron = require('node-cron');
const { query, getClient }  = require('../config/database.config');
const { publishAuctionEnded, publishTimerTick } = require('../websocket/publishers/auctionPublisher');
const notifService = require('../modules/notification/notification.service');
const { NotificationType }  = require('../constants/enums');
const { PLATFORM_FEE_RATE, ENGLISH_BREAK_SECONDS } = require('../constants/appConstants');

// ── Finalize auction khi hết giờ ──────────────────────────

const finalizeEnglishAuction = async (auction) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock để tránh xử lý 2 lần
    const { rows } = await client.query(
      `SELECT * FROM auctions
       WHERE id = $1 AND status = 'ACTIVE'
       FOR UPDATE SKIP LOCKED`,
      [auction.id]
    );
    if (!rows.length) return;

    const { winner_id, current_price, session_id, order_index, item_id } = rows[0];

    if (winner_id) {
      const fee = Math.round(parseFloat(current_price) * PLATFORM_FEE_RATE);

      // Trừ locked → thanh toán
      await client.query(
        `UPDATE wallets
         SET balance_locked = balance_locked - $1
         WHERE user_id = $2`,
        [current_price, winner_id]
      );

      // Trừ phí 5% từ available
      await client.query(
        `UPDATE wallets
         SET balance_available = balance_available - $1
         WHERE user_id = $2`,
        [fee, winner_id]
      );

      // Ghi transactions
      await client.query(
        `INSERT INTO transactions
           (id, wallet_id, type, amount, status, reference_id, created_at)
         SELECT gen_random_uuid(), id, 'FINAL_PAYMENT', $1, 'COMPLETED', $2, now()
         FROM wallets WHERE user_id = $3`,
        [current_price, auction.id, winner_id]
      );
      await client.query(
        `INSERT INTO transactions
           (id, wallet_id, type, amount, status, reference_id, created_at)
         SELECT gen_random_uuid(), id, 'PLATFORM_FEE', $1, 'COMPLETED', $2, now()
         FROM wallets WHERE user_id = $3`,
        [fee, auction.id, winner_id]
      );

      // Chuyển item cho người thắng
      await client.query(
        `UPDATE items
         SET current_owner_id = $1,
             status           = 'IN_INVENTORY',
             cooldown_until   = now() + interval '12 hours'
         WHERE id = $2`,
        [winner_id, item_id]
      );

      // Unlock tiền tất cả người thua
      await client.query(
        `UPDATE wallets w
         SET balance_available = w.balance_available + b.amount,
             balance_locked    = w.balance_locked    - b.amount
         FROM (
           SELECT DISTINCT ON (user_id) user_id, amount
           FROM bids
           WHERE auction_id = $1 AND user_id != $2
           ORDER BY user_id, amount DESC
         ) b
         WHERE w.user_id = b.user_id`,
        [auction.id, winner_id]
      );
    }

    // Kết thúc auction
    await client.query(
      `UPDATE auctions SET status = 'ENDED' WHERE id = $1`,
      [auction.id]
    );

    await client.query('COMMIT');

    // Broadcast ended
    publishAuctionEnded(auction.id, {
      auctionId:  auction.id,
      winnerId:   winner_id,
      finalPrice: current_price,
      status:     'ENDED',
    });

    // Notify người thắng
    if (winner_id) {
      await notifService.send(
        winner_id,
        NotificationType.AUCTION_WON,
        '🎉 Bạn đã thắng đấu giá!',
        `Chúc mừng! Bạn đã thắng với giá ${parseFloat(current_price).toLocaleString('vi-VN')}đ.`
      );
    }

    // Sau 15s kích hoạt auction tiếp theo
    setTimeout(() => activateNextAuction(session_id, order_index), ENGLISH_BREAK_SECONDS * 1000);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[EnglishScheduler] Finalize error:', e.message);
  } finally {
    client.release();
  }
};

// ── Kích hoạt auction tiếp theo trong session ─────────────

const activateNextAuction = async (sessionId, currentIndex) => {
  const { rows } = await query(
    `SELECT * FROM auctions
     WHERE session_id = $1
       AND order_index = $2
       AND status = 'WAITING'`,
    [sessionId, currentIndex + 1]
  );

  if (!rows.length) {
    // Hết auction → complete session
    await query(
      `UPDATE auction_sessions SET status = 'COMPLETED' WHERE id = $1`,
      [sessionId]
    );
    console.log(`[EnglishScheduler] Session ${sessionId} COMPLETED`);
    return;
  }

  const next = rows[0];
  await query(
    `UPDATE auctions
     SET status   = 'ACTIVE',
         end_time = now() + (duration_seconds * interval '1 second')
     WHERE id = $1`,
    [next.id]
  );
  console.log(`[EnglishScheduler] Activated auction ${next.id}`);
};

// ── Scheduler chạy mỗi giây ──────────────────────────────

const startEnglishScheduler = () => {
  cron.schedule('* * * * * *', async () => {
    try {
      const { rows } = await query(
        `SELECT a.* FROM auctions a
         JOIN auction_sessions s ON s.id = a.session_id
         WHERE a.status = 'ACTIVE' AND s.type = 'ENGLISH'`
      );

      for (const auction of rows) {
        const now       = Date.now();
        const endTime   = new Date(auction.end_time);
        const remaining = Math.max(0, Math.round((endTime - now) / 1000));

        // Broadcast timer tick
        publishTimerTick(auction.id, remaining, endTime);

        // Finalize nếu hết giờ
        if (now >= endTime.getTime()) {
          await finalizeEnglishAuction(auction);
        }
      }
    } catch (e) {
      console.error('[EnglishScheduler] Error:', e.message);
    }
  });

  console.log('[EnglishScheduler] Started ✓');
};

module.exports = { startEnglishScheduler, activateNextAuction };