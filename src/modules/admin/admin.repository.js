const { query, getClient } = require('../../config/database.config');
const { pageResponse, parsePagination } = require('../../utils/pagination');

// ── ITEMS ──────────────────────────────────────────────────

const getItems = async (q) => {
  const { page, size } = parsePagination(q);
  const conditions = [];
  const params = [];

  if (q.status)   { params.push(q.status);   conditions.push(`i.status = $${params.length}`); }
  if (q.rarity)   { params.push(q.rarity);   conditions.push(`i.rarity = $${params.length}`); }
  if (q.sellerId) { params.push(q.sellerId); conditions.push(`i.seller_id = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT i.*, u.nickname AS seller_nickname, u.email AS seller_email
     FROM items i
     JOIN users u ON u.id = i.seller_id
     ${where}
     ORDER BY i.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, size, page * size]
  );
  const { rows: cnt } = await query(
    `SELECT COUNT(*) FROM items i ${where}`,
    params
  );
  return pageResponse(rows, cnt[0].count, page, size);
};

const approveItem = async (itemId, { tags, rarity, startPrice }) => {
  const { rows } = await query(
    `UPDATE items
     SET status = 'APPROVED', tags = $2, rarity = $3
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [itemId, JSON.stringify(tags), rarity]
  );
  return rows[0];
};

const rejectItem = async (itemId, reason) => {
  const { rows } = await query(
    `UPDATE items
     SET status = 'REJECTED'
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [itemId]
  );
  return rows[0] ? { ...rows[0], reason } : null;
};

// ── SESSIONS ───────────────────────────────────────────────

const createAuction = async (sessionId, {
  itemId, startPrice, stepPrice,
  durationSeconds, extendSeconds, orderIndex,
  decreaseAmount, intervalSeconds, minPrice,
}) => {
  const { rows } = await query(
    `INSERT INTO auctions
       (id, session_id, item_id, start_price, current_price,
        step_price, duration_seconds, extend_seconds, order_index,
        status, decrease_amount, interval_seconds, min_price, created_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $3,
        $4, $5, $6, $7,
        'WAITING', $8, $9, $10, now())
     RETURNING *`,
    [sessionId, itemId, startPrice,
     stepPrice || 0, durationSeconds || 120, extendSeconds || 30, orderIndex || 0,
     decreaseAmount, intervalSeconds, minPrice]
  );

  // Cập nhật item status → IN_AUCTION
  await query(
    `UPDATE items SET status = 'IN_AUCTION' WHERE id = $1`,
    [itemId]
  );

  return rows[0];
};

const removeAuction = async (auctionId) => {
  const { rows } = await query(
    `SELECT item_id FROM auctions WHERE id = $1 AND status = 'WAITING'`,
    [auctionId]
  );
  if (!rows.length) throw { errorCode: 'VALIDATION_ERROR', status: 400, message: 'Chỉ xóa được auction ở trạng thái WAITING.' };

  // Trả item về APPROVED
  await query(`UPDATE items SET status = 'APPROVED' WHERE id = $1`, [rows[0].item_id]);
  await query(`DELETE FROM auctions WHERE id = $1`, [auctionId]);
};

const startSession = async (sessionId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Kiểm tra session có auction không
    const { rows: auctions } = await client.query(
      `SELECT id FROM auctions WHERE session_id = $1 LIMIT 1`,
      [sessionId]
    );
    if (!auctions.length) {
      throw { errorCode: 'SESSION_EMPTY', status: 400, message: 'Phiên chưa có vật phẩm nào.' };
    }

    // Cập nhật session ACTIVE
    await client.query(
      `UPDATE auction_sessions SET status = 'ACTIVE' WHERE id = $1`,
      [sessionId]
    );

    // Kích hoạt auction đầu tiên (order_index = 0)
    const { rows: first } = await client.query(
      `UPDATE auctions
       SET status = 'ACTIVE',
           end_time = now() + (duration_seconds * interval '1 second')
       WHERE session_id = $1 AND order_index = 0 AND status = 'WAITING'
       RETURNING *`,
      [sessionId]
    );

    await client.query('COMMIT');
    return first[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

const pauseSession = async (sessionId) => {
  const { rows: auc } = await query(
    `SELECT end_time FROM auctions
     WHERE session_id = $1 AND status = 'ACTIVE'
     LIMIT 1`,
    [sessionId]
  );
  const remaining = auc[0]
    ? Math.max(0, Math.round((new Date(auc[0].end_time) - Date.now()) / 1000))
    : null;

  await query(
    `UPDATE auction_sessions
     SET status = 'PAUSED', remaining_seconds = $2
     WHERE id = $1`,
    [sessionId, remaining]
  );

  await query(
    `UPDATE auctions SET status = 'WAITING'
     WHERE session_id = $1 AND status = 'ACTIVE'`,
    [sessionId]
  );
  return { sessionId, remainingSeconds: remaining };
};

const resumeSession = async (sessionId) => {
  const { rows: session } = await query(
    'SELECT * FROM auction_sessions WHERE id = $1',
    [sessionId]
  );
  if (!session.length) throw { errorCode: 'NOT_FOUND', status: 404 };

  const remaining = session[0].remaining_seconds || 120;

  await query(
    `UPDATE auction_sessions
     SET status = 'ACTIVE', remaining_seconds = null
     WHERE id = $1`,
    [sessionId]
  );

  // Kích hoạt lại auction đang dở
  const { rows } = await query(
    `UPDATE auctions
     SET status = 'ACTIVE',
         end_time = now() + ($2 * interval '1 second')
     WHERE session_id = $1
       AND order_index = (
         SELECT MAX(order_index) FROM auctions
         WHERE session_id = $1 AND status = 'WAITING'
       )
     RETURNING *`,
    [sessionId, remaining]
  );
  return rows[0];
};

const stopSession = async (sessionId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lấy tất cả auction chưa kết thúc
    const { rows: auctions } = await client.query(
      `SELECT id FROM auctions
       WHERE session_id = $1 AND status IN ('ACTIVE', 'WAITING')`,
      [sessionId]
    );

    for (const auc of auctions) {
      // Hoàn tiền cho tất cả bidder
      await client.query(
        `UPDATE wallets w
         SET balance_available = w.balance_available + b.amount,
             balance_locked    = w.balance_locked    - b.amount
         FROM bids b
         WHERE b.auction_id = $1
           AND b.user_id = w.user_id`,
        [auc.id]
      );
      await client.query(
        `UPDATE auctions SET status = 'CANCELLED' WHERE id = $1`,
        [auc.id]
      );
    }

    await client.query(
      `UPDATE auction_sessions SET status = 'CANCELLED' WHERE id = $1`,
      [sessionId]
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

const resetTimer = async (auctionId) => {
  const { rows } = await query(
    `UPDATE auctions
     SET end_time = now() + (duration_seconds * interval '1 second')
     WHERE id = $1
     RETURNING *`,
    [auctionId]
  );
  return rows[0];
};

const deleteBid = async (bidId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: bid } = await client.query(
      'SELECT * FROM bids WHERE id = $1',
      [bidId]
    );
    if (!bid.length) throw { errorCode: 'NOT_FOUND', status: 404 };

    const { auction_id, user_id, amount } = bid[0];

    // Hoàn tiền
    await client.query(
      `UPDATE wallets
       SET balance_available = balance_available + $1,
           balance_locked    = balance_locked    - $1
       WHERE user_id = $2`,
      [amount, user_id]
    );

    await client.query('DELETE FROM bids WHERE id = $1', [bidId]);

    // Tính lại current_price và winner
    const { rows: topBid } = await client.query(
      `SELECT * FROM bids
       WHERE auction_id = $1
       ORDER BY amount DESC LIMIT 1`,
      [auction_id]
    );

    let newPrice, newWinner;
    if (topBid.length) {
      newPrice  = topBid[0].amount;
      newWinner = topBid[0].user_id;
    } else {
      const { rows: auc } = await client.query(
        'SELECT start_price FROM auctions WHERE id = $1',
        [auction_id]
      );
      newPrice  = auc[0].start_price;
      newWinner = null;
    }

    await client.query(
      `UPDATE auctions
       SET current_price = $2, winner_id = $3
       WHERE id = $1`,
      [auction_id, newPrice, newWinner]
    );

    await client.query('COMMIT');
    return { auctionId: auction_id, newPrice, newWinnerId: newWinner };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

module.exports = {
  getItems, approveItem, rejectItem,
  createAuction, removeAuction,
  startSession, pauseSession, resumeSession, stopSession,
  resetTimer, deleteBid,
};