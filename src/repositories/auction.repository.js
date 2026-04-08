const { query, getClient } = require('../config/database.config');
const { pageResponse, parsePagination } = require('../utils/pagination');

// --- Helper: Chuẩn hóa DTO giống AuctionResponse.java ---
const normalizeAuction = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    startPrice: parseFloat(row.start_price),
    currentPrice: parseFloat(row.current_price),
    minPrice: row.min_price ? parseFloat(row.min_price) : null,
    stepPrice: parseFloat(row.step_price),
    decreaseAmount: row.decrease_amount ? parseFloat(row.decrease_amount) : null,
    intervalSeconds: row.interval_seconds,
    durationSeconds: row.duration_seconds,
    extendSeconds: row.extend_seconds,
    endTime: row.end_time,
    orderIndex: row.order_index,
    status: row.status,
    
    session: {
      id: row.session_id,
      title: row.session_title,
      type: row.session_type,
      status: row.session_status
    },
    item: {
      id: row.item_id,
      name: row.item_name,
      description: row.item_description,
      imageUrls: row.item_images || [],
      tags: row.item_tags || [],
      rarity: row.item_rarity,
      seller: {
        id: row.seller_id,
        nickname: row.seller_nickname,
        avatarUrl: row.seller_avatar
      }
    },
    winner: row.winner_id ? {
      id: row.winner_id,
      nickname: row.winner_nickname,
      avatarUrl: row.winner_avatar
    } : null
  };
};

// ── READ ───────────────────────────────────────────────────

const findById = async (id) => {
  const { rows } = await query(
    `SELECT
       a.*,
       i.name        AS item_name,
       i.image_urls  AS item_images,
       i.rarity      AS item_rarity,
       i.description AS item_description,
       i.tags        AS item_tags,
       i.seller_id,
       s.title       AS session_title,
       s.type        AS session_type,
       s.status      AS session_status,
       u.nickname    AS seller_nickname,
       u.avatar_url  AS seller_avatar,
       w.nickname    AS winner_nickname,
       w.avatar_url  AS winner_avatar
     FROM auctions a
     JOIN items i         ON i.id = a.item_id
     JOIN users u         ON u.id = i.seller_id
     JOIN auction_sessions s ON s.id = a.session_id
     LEFT JOIN users w    ON w.id = a.winner_id
     WHERE a.id = $1`,
    [id]
  );
  return normalizeAuction(rows[0]);
};

const findBids = async (auctionId, q, isSealed = false) => {
  if (isSealed) {
    const { rows: auc } = await query('SELECT status FROM auctions WHERE id = $1', [auctionId]);
    if (auc[0]?.status !== 'ENDED') {
      return { sealed: true, message: 'Kết quả sẽ được công bố khi phiên kết thúc.' };
    }
  }

  const { page, size } = parsePagination(q);
  const { rows } = await query(
    `SELECT
       b.id, b.amount, b.bid_time, b.is_proxy,
       u.id AS user_id, u.nickname, u.avatar_url, u.reputation_score
     FROM bids b
     JOIN users u ON u.id = b.user_id
     WHERE b.auction_id = $1
     ORDER BY b.bid_time DESC
     LIMIT $2 OFFSET $3`,
    [auctionId, size, page * size]
  );
  const { rows: cnt } = await query('SELECT COUNT(*) FROM bids WHERE auction_id = $1', [auctionId]);
  
  const mappedRows = rows.map(r => ({
    id: r.id,
    auctionId: auctionId,
    amount: parseFloat(r.amount),
    bidTime: r.bid_time,
    proxy: r.is_proxy,
    bidder: {
      id: r.user_id,
      nickname: r.nickname,
      avatarUrl: r.avatar_url,
      reputationScore: parseFloat(r.reputation_score)
    }
  }));

  return pageResponse(mappedRows, cnt[0].count, page, size);
};

const findMessages = async (auctionId, q) => {
  const { page, size } = parsePagination(q);
  const { rows } = await query(
    `SELECT
       m.id, m.content, m.created_at,
       u.id AS sender_id, u.nickname, u.avatar_url, u.reputation_score
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.auction_id = $1
     ORDER BY m.created_at ASC
     LIMIT $2 OFFSET $3`,
    [auctionId, size, page * size]
  );
  const { rows: cnt } = await query(
    'SELECT COUNT(*) FROM messages WHERE auction_id = $1', [auctionId]
  );

  const mappedRows = rows.map(r => ({
    id: r.id,
    auctionId: auctionId,
    content: r.content,
    createdAt: r.created_at,
    sender: {
      id: r.sender_id,
      nickname: r.nickname,
      avatarUrl: r.avatar_url,
      reputationScore: parseFloat(r.reputation_score) || 5.0
    },
    receiver: null
  }));

  return pageResponse(mappedRows, cnt[0].count, page, size);
};

// ── ENGLISH BID ────────────────────────────────────────────

const placeBid = async ({ auctionId, userId, amount }) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock auction row
    const { rows: auc } = await client.query(
      `SELECT a.*, i.seller_id
       FROM auctions a
       JOIN items i ON i.id = a.item_id
       WHERE a.id = $1 AND a.status = 'ACTIVE'
       FOR UPDATE`,
      [auctionId]
    );
    if (!auc.length) {
      throw { errorCode: 'AUCTION_NOT_ACTIVE', status: 400, message: 'Phiên đấu giá không còn hoạt động.' };
    }

    const auction = auc[0];

    // Validate seller
    if (auction.seller_id === userId) {
      throw { errorCode: 'SELLER_CANNOT_BID', status: 403, message: 'Người bán không thể đấu giá vật phẩm của mình.' };
    }

    // Validate amount
    const minBid = parseFloat(auction.current_price) + parseFloat(auction.step_price);
    if (parseFloat(amount) < minBid) {
      throw { errorCode: 'BID_TOO_LOW', status: 400, message: `Giá tối thiểu là ${minBid.toLocaleString('vi-VN')}đ.` };
    }

    // Check balance
    const { rows: wallet } = await client.query(
      'SELECT id, balance_available FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (!wallet.length || parseFloat(wallet[0].balance_available) < parseFloat(amount)) {
      throw { errorCode: 'INSUFFICIENT_BALANCE', status: 400, message: 'Số dư khả dụng không đủ.' };
    }

    const prevWinnerId = auction.winner_id;

    // Unlock tiền người bid cũ (nếu có và khác người hiện tại)
    if (prevWinnerId && prevWinnerId !== userId) {
      await client.query(
        `UPDATE wallets
         SET balance_available = balance_available + $1,
             balance_locked    = balance_locked    - $1
         WHERE user_id = $2`,
        [auction.current_price, prevWinnerId]
      );
      await client.query(
        `INSERT INTO transactions (id, wallet_id, type, amount, status, reference_id, created_at)
         SELECT gen_random_uuid(), id, 'BID_UNLOCK', $1, 'COMPLETED', $2, now()
         FROM wallets WHERE user_id = $3`,
        [auction.current_price, auctionId, prevWinnerId]
      );
    }

    // Lock tiền người bid mới
    await client.query(
      `UPDATE wallets
       SET balance_available = balance_available - $1,
           balance_locked    = balance_locked    + $1
       WHERE id = $2`,
      [amount, wallet[0].id]
    );
    await client.query(
      `INSERT INTO transactions (id, wallet_id, type, amount, status, reference_id, created_at)
       VALUES (gen_random_uuid(), $1, 'BID_LOCK', $2, 'COMPLETED', $3, now())`,
      [wallet[0].id, amount, auctionId]
    );

    // Ghi bid
    const { rows: bid } = await client.query(
      `INSERT INTO bids (id, auction_id, user_id, amount, bid_time, is_proxy)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), false)
       RETURNING *`,
      [auctionId, userId, amount]
    );

    // Popcorn Bidding — gia hạn nếu bid trong 30s cuối
    let newEndTime = auction.end_time;
    const remainingMs = new Date(auction.end_time) - Date.now();
    if (remainingMs < auction.extend_seconds * 1000) {
      newEndTime = new Date(Date.now() + auction.extend_seconds * 1000);
    }

    // Cập nhật auction
    const { rows: updated } = await client.query(
      `UPDATE auctions
       SET current_price = $2,
           winner_id     = $3,
           end_time      = $4,
           version       = version + 1
       WHERE id = $1
       RETURNING *`,
      [auctionId, amount, userId, newEndTime]
    );

    await client.query('COMMIT');
    return { bid: bid[0], auction: updated[0], prevWinnerId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

// ── PROXY BID ──────────────────────────────────────────────

const upsertProxyBid = async (auctionId, userId, maxAmount) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      'SELECT * FROM proxy_bids WHERE auction_id = $1 AND user_id = $2',
      [auctionId, userId]
    );

    if (existing.length) {
      if (parseFloat(maxAmount) <= parseFloat(existing[0].max_amount)) {
        throw { errorCode: 'VALIDATION_ERROR', status: 400, message: 'Chỉ được tăng mức giá tối đa.' };
      }
      await client.query(
        `UPDATE proxy_bids
         SET max_amount = $3, is_active = true
         WHERE auction_id = $1 AND user_id = $2`,
        [auctionId, userId, maxAmount]
      );
    } else {
      await client.query(
        `INSERT INTO proxy_bids (id, auction_id, user_id, max_amount, is_active, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, true, now())`,
        [auctionId, userId, maxAmount]
      );
    }

    await client.query('COMMIT');
    return { auctionId, userId, maxAmount };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

const cancelProxyBid = async (auctionId, userId) => {
  await query(
    'UPDATE proxy_bids SET is_active = false WHERE auction_id = $1 AND user_id = $2',
    [auctionId, userId]
  );
  return { message: 'Đã hủy proxy bid.' };
};

const resolveProxyBids = async (auctionId, manualAmount, manualUserId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: proxies } = await client.query(
      `SELECT pb.*, w.id AS wallet_id, w.balance_available
       FROM proxy_bids pb
       JOIN wallets w ON w.user_id = pb.user_id
       WHERE pb.auction_id = $1
         AND pb.is_active = true
         AND pb.user_id != $2
       ORDER BY pb.max_amount DESC`,
      [auctionId, manualUserId]
    );
    if (!proxies.length) { await client.query('COMMIT'); return null; }

    const { rows: auc } = await client.query(
      'SELECT * FROM auctions WHERE id = $1 FOR UPDATE', [auctionId]
    );
    const auction   = auc[0];
    const topProxy  = proxies[0];
    const stepPrice = parseFloat(auction.step_price);
    const curPrice  = parseFloat(auction.current_price);

    if (parseFloat(topProxy.max_amount) <= curPrice) {
      await client.query('COMMIT');
      return null;
    }

    const autoBid = Math.min(parseFloat(topProxy.max_amount), curPrice + stepPrice);

    // Unlock manual bidder nếu proxy thắng
    await client.query(
      `UPDATE wallets
       SET balance_available = balance_available + $1,
           balance_locked    = balance_locked    - $1
       WHERE user_id = $2`,
      [manualAmount, manualUserId]
    );

    // Lock tiền proxy
    await client.query(
      `UPDATE wallets
       SET balance_available = balance_available - $1,
           balance_locked    = balance_locked    + $1
       WHERE id = $2`,
      [autoBid, topProxy.wallet_id]
    );

    // Ghi proxy bid
    await client.query(
      `INSERT INTO bids (id, auction_id, user_id, amount, bid_time, is_proxy)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), true)`,
      [auctionId, topProxy.user_id, autoBid]
    );

    // Popcorn check
    let newEndTime = auction.end_time;
    const remainingMs = new Date(auction.end_time) - Date.now();
    if (remainingMs < auction.extend_seconds * 1000) {
      newEndTime = new Date(Date.now() + auction.extend_seconds * 1000);
    }

    const { rows: updated } = await client.query(
      `UPDATE auctions
       SET current_price = $2, winner_id = $3, end_time = $4, version = version + 1
       WHERE id = $1
       RETURNING *`,
      [auctionId, autoBid, topProxy.user_id, newEndTime]
    );

    await client.query('COMMIT');
    return { auction: updated[0], proxyUserId: topProxy.user_id, amount: autoBid };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

// ── DUTCH BID ──────────────────────────────────────────────

const buyDutch = async ({ auctionId, userId }) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock auction — optimistic lock via FOR UPDATE
    const { rows: auc } = await client.query(
      `SELECT a.*, i.seller_id
       FROM auctions a
       JOIN items i ON i.id = a.item_id
       WHERE a.id = $1 AND a.status = 'ACTIVE'
       FOR UPDATE`,
      [auctionId]
    );
    if (!auc.length) {
      throw { errorCode: 'AUCTION_NOT_ACTIVE', status: 400, message: 'Phiên đấu giá không còn hoạt động.' };
    }

    const auction = auc[0];

    if (auction.seller_id === userId) {
      throw { errorCode: 'SELLER_CANNOT_BID', status: 403, message: 'Người bán không thể mua vật phẩm của mình.' };
    }

    const price = parseFloat(auction.current_price);

    // Check balance
    const { rows: wallet } = await client.query(
      'SELECT id, balance_available FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (!wallet.length || parseFloat(wallet[0].balance_available) < price) {
      throw { errorCode: 'INSUFFICIENT_BALANCE', status: 400, message: 'Số dư không đủ.' };
    }

    const fee = Math.round(price * 0.05);

    // Trừ tiền buyer
    await client.query(
      `UPDATE wallets
       SET balance_available = balance_available - $1
       WHERE id = $2`,
      [price, wallet[0].id]
    );

    // Ghi transactions
    await client.query(
      `INSERT INTO transactions (id, wallet_id, type, amount, status, reference_id, created_at)
       VALUES
         (gen_random_uuid(), $1, 'FINAL_PAYMENT', $2, 'COMPLETED', $3, now()),
         (gen_random_uuid(), $1, 'PLATFORM_FEE',  $4, 'COMPLETED', $3, now())`,
      [wallet[0].id, price, auctionId, fee]
    );

    // Ghi bid
    await client.query(
      `INSERT INTO bids (id, auction_id, user_id, amount, bid_time, is_proxy)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), false)`,
      [auctionId, userId, price]
    );

    // Chuyển item
    await client.query(
      `UPDATE items
       SET current_owner_id = $1,
           status           = 'IN_INVENTORY',
           cooldown_until   = now() + interval '12 hours'
       WHERE id = $2`,
      [userId, auction.item_id]
    );

    // Kết thúc auction
    const { rows: updated } = await client.query(
      `UPDATE auctions
       SET status    = 'ENDED',
           winner_id = $2,
           version   = version + 1
       WHERE id = $1
       RETURNING *`,
      [auctionId, userId]
    );

    await client.query('COMMIT');
    return updated[0];
  } catch (e) {
    await client.query('ROLLBACK');
    // PostgreSQL serialization error → 409
    if (e.code === '40001') {
      throw { errorCode: 'OPTIMISTIC_LOCK_CONFLICT', status: 409, message: 'Đã có người mua trước bạn.' };
    }
    throw e;
  } finally {
    client.release();
  }
};

// ── SEALED BID ─────────────────────────────────────────────

const placeSealedBid = async ({ auctionId, userId, amount }) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: auc } = await client.query(
      `SELECT a.*, i.seller_id
       FROM auctions a
       JOIN items i ON i.id = a.item_id
       WHERE a.id = $1 AND a.status = 'ACTIVE'
       FOR UPDATE`,
      [auctionId]
    );
    if (!auc.length) {
      throw { errorCode: 'AUCTION_NOT_ACTIVE', status: 400, message: 'Phiên đấu giá không còn hoạt động.' };
    }
    if (auc[0].seller_id === userId) {
      throw { errorCode: 'SELLER_CANNOT_BID', status: 403 };
    }

    // Kiểm tra đã bid chưa — chỉ 1 lần
    const { rows: existing } = await client.query(
      'SELECT id FROM bids WHERE auction_id = $1 AND user_id = $2',
      [auctionId, userId]
    );
    if (existing.length) {
      throw { errorCode: 'BID_ALREADY_EXISTS', status: 409, message: 'Bạn đã đặt giá cho phiên đấu giá kín này rồi.' };
    }

    // Check + lock balance
    const { rows: wallet } = await client.query(
      'SELECT id, balance_available FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (!wallet.length || parseFloat(wallet[0].balance_available) < parseFloat(amount)) {
      throw { errorCode: 'INSUFFICIENT_BALANCE', status: 400, message: 'Số dư không đủ.' };
    }

    await client.query(
      `UPDATE wallets
       SET balance_available = balance_available - $1,
           balance_locked    = balance_locked    + $1
       WHERE id = $2`,
      [amount, wallet[0].id]
    );

    await client.query(
      `INSERT INTO transactions (id, wallet_id, type, amount, status, reference_id, created_at)
       VALUES (gen_random_uuid(), $1, 'BID_LOCK', $2, 'COMPLETED', $3, now())`,
      [wallet[0].id, amount, auctionId]
    );

    // Ghi bid — KHÔNG broadcast giá
    const { rows: bid } = await client.query(
      `INSERT INTO bids (id, auction_id, user_id, amount, bid_time, is_proxy)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), false)
       RETURNING *`,
      [auctionId, userId, amount]
    );

    await client.query('COMMIT');
    return bid[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

module.exports = {
  findById, findBids, findMessages,
  placeBid, upsertProxyBid, cancelProxyBid, resolveProxyBids,
  buyDutch, placeSealedBid,
};