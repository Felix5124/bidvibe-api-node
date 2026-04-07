const { query, getClient } = require("../../config/database.config");
const { pageResponse, parsePagination } = require("../../utils/pagination");

// ── HELPERS ─────────────────────────────────────────────────

const normalizeUser = (user) => {
  if (!user) return null;
  return {
    ...user,
    avatarUrl: user.avatar_url,
    reputationScore: user.reputation_score,
    isBanned: user.is_banned,
    isMuted: user.is_muted,
    bannedAt: user.banned_at,
    createdAt: user.created_at,
  };
};

const normalizeItem = (item) => {
  if (!item) return null;
  return {
    ...item,
    imageUrls: item.image_urls,
    sellerId: item.seller_id,
    currentOwnerId: item.current_owner_id,
    cooldownUntil: item.cooldown_until,
    createdAt: item.created_at,
  };
};

const normalizeAuction = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    startPrice: parseFloat(row.start_price),
    currentPrice: parseFloat(row.current_price),
    minPrice: row.min_price ? parseFloat(row.min_price) : null,
    stepPrice: parseFloat(row.step_price),
    decreaseAmount: row.decrease_amount
      ? parseFloat(row.decrease_amount)
      : null,
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
      status: row.session_status,
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
        avatarUrl: row.seller_avatar,
      },
    },
    winner: row.winner_id
      ? {
          id: row.winner_id,
          nickname: row.winner_nickname,
          avatarUrl: row.winner_avatar,
        }
      : null,
  };
};

// ── ITEMS ──────────────────────────────────────────────────

const getItems = async (q) => {
  const { page, size } = parsePagination(q);
  const conditions = [];
  const params = [];

  if (q.status) {
    params.push(q.status);
    conditions.push(`i.status = $${params.length}`);
  }
  if (q.rarity) {
    params.push(q.rarity);
    conditions.push(`i.rarity = $${params.length}`);
  }
  if (q.sellerId) {
    params.push(q.sellerId);
    conditions.push(`i.seller_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await query(
    `SELECT i.*, u.nickname AS seller_nickname, u.email AS seller_email
     FROM items i
     JOIN users u ON u.id = i.seller_id
     ${where}
     ORDER BY i.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, size, page * size],
  );
  const { rows: cnt } = await query(
    `SELECT COUNT(*) FROM items i ${where}`,
    params,
  );
  return pageResponse(rows.map(normalizeItem), cnt[0].count, page, size);
};

const approveItem = async (itemId, { tags, rarity, startPrice }) => {
  const { rows } = await query(
    `UPDATE items
     SET status = 'APPROVED', tags = $2, rarity = $3
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [itemId, JSON.stringify(tags), rarity],
  );
  return rows[0];
};

const rejectItem = async (itemId, reason) => {
  const { rows } = await query(
    `UPDATE items
     SET status = 'REJECTED'
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [itemId],
  );
  return rows[0] ? { ...rows[0], reason } : null;
};

// ── SESSIONS ───────────────────────────────────────────────

const createAuction = async (sessionId, payload) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    const {
      itemId,
      startPrice,
      stepPrice,
      orderIndex,
      decreaseAmount,
      minPrice,
      rarity,
      endTime,
    } = payload;

    const safeStepPrice = stepPrice !== undefined ? stepPrice : 0;
    const safeOrderIndex = orderIndex !== undefined ? orderIndex : 0;
    const safeDecreaseAmount =
      decreaseAmount !== undefined ? decreaseAmount : null;
    const safeMinPrice = minPrice !== undefined ? minPrice : null;
    const safeEndTime = endTime || null;

    const { rows } = await client.query(
      `INSERT INTO auctions
         (id, session_id, item_id, start_price, current_price,
          step_price, duration_seconds, extend_seconds, order_index,
          status, decrease_amount, interval_seconds, min_price, end_time)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $3,
          $4, 120, 30, $5,
          'WAITING', $6, 5, $7, $8)
       RETURNING id`,
      [
        sessionId,
        itemId,
        startPrice,
        safeStepPrice,
        safeOrderIndex,
        safeDecreaseAmount,
        safeMinPrice,
        safeEndTime,
      ],
    );

    const newAuctionId = rows[0].id;

    await client.query(
      `UPDATE items 
       SET status = 'IN_AUCTION', rarity = COALESCE($2, rarity) 
       WHERE id = $1`,
      [itemId, rarity || null],
    );

    await client.query("COMMIT");

    const { rows: fullAuction } = await query(
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
      [newAuctionId],
    );

    return normalizeAuction(fullAuction[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[createAuction] Lỗi khi thêm vật phẩm vào phiên:", e);
    throw e;
  } finally {
    client.release();
  }
};

const removeAuction = async (auctionId) => {
  const { rows } = await query(
    `SELECT item_id FROM auctions WHERE id = $1 AND status = 'WAITING'`,
    [auctionId],
  );
  if (!rows.length)
    throw {
      errorCode: "VALIDATION_ERROR",
      status: 400,
      message: "Chỉ xóa được auction ở trạng thái WAITING.",
    };

  // Trả item về APPROVED
  await query(`UPDATE items SET status = 'APPROVED' WHERE id = $1`, [
    rows[0].item_id,
  ]);
  await query(`DELETE FROM auctions WHERE id = $1`, [auctionId]);
};

const startSession = async (sessionId) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    // Kiểm tra session có auction không
    const { rows: auctions } = await client.query(
      `SELECT id FROM auctions WHERE session_id = $1 LIMIT 1`,
      [sessionId],
    );
    if (!auctions.length) {
      throw {
        errorCode: "SESSION_EMPTY",
        status: 400,
        message: "Phiên chưa có vật phẩm nào.",
      };
    }

    // Cập nhật session ACTIVE
    await client.query(
      `UPDATE auction_sessions SET status = 'ACTIVE' WHERE id = $1`,
      [sessionId],
    );

    // Kích hoạt auction đầu tiên (order_index = 0)
    const { rows: first } = await client.query(
      `UPDATE auctions
       SET status = 'ACTIVE',
           end_time = now() + (duration_seconds * interval '1 second')
       WHERE session_id = $1 AND order_index = 0 AND status = 'WAITING'
       RETURNING *`,
      [sessionId],
    );

    await client.query("COMMIT");
    return first[0];
  } catch (e) {
    await client.query("ROLLBACK");
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
    [sessionId],
  );
  const remaining = auc[0]
    ? Math.max(0, Math.round((new Date(auc[0].end_time) - Date.now()) / 1000))
    : null;

  await query(
    `UPDATE auction_sessions
     SET status = 'PAUSED', remaining_seconds = $2
     WHERE id = $1`,
    [sessionId, remaining],
  );

  await query(
    `UPDATE auctions SET status = 'WAITING'
     WHERE session_id = $1 AND status = 'ACTIVE'`,
    [sessionId],
  );
  return { sessionId, remainingSeconds: remaining };
};

const resumeSession = async (sessionId) => {
  const { rows: session } = await query(
    "SELECT * FROM auction_sessions WHERE id = $1",
    [sessionId],
  );
  if (!session.length) throw { errorCode: "NOT_FOUND", status: 404 };

  const remaining = session[0].remaining_seconds || 120;

  await query(
    `UPDATE auction_sessions
     SET status = 'ACTIVE', remaining_seconds = null
     WHERE id = $1`,
    [sessionId],
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
    [sessionId, remaining],
  );
  return rows[0];
};

const stopSession = async (sessionId) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    // Lấy tất cả auction chưa kết thúc
    const { rows: auctions } = await client.query(
      `SELECT id FROM auctions
       WHERE session_id = $1 AND status IN ('ACTIVE', 'WAITING')`,
      [sessionId],
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
        [auc.id],
      );
      await client.query(
        `UPDATE auctions SET status = 'CANCELLED' WHERE id = $1`,
        [auc.id],
      );
    }

    await client.query(
      `UPDATE auction_sessions SET status = 'CANCELLED' WHERE id = $1`,
      [sessionId],
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
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
    [auctionId],
  );
  return rows[0];
};

const deleteBid = async (bidId) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    const { rows: bid } = await client.query(
      "SELECT * FROM bids WHERE id = $1",
      [bidId],
    );
    if (!bid.length) throw { errorCode: "NOT_FOUND", status: 404 };

    const { auction_id, user_id, amount } = bid[0];

    // Hoàn tiền
    await client.query(
      `UPDATE wallets
       SET balance_available = balance_available + $1,
           balance_locked    = balance_locked    - $1
       WHERE user_id = $2`,
      [amount, user_id],
    );

    await client.query("DELETE FROM bids WHERE id = $1", [bidId]);

    // Tính lại current_price và winner
    const { rows: topBid } = await client.query(
      `SELECT * FROM bids
       WHERE auction_id = $1
       ORDER BY amount DESC LIMIT 1`,
      [auction_id],
    );

    let newPrice, newWinner;
    if (topBid.length) {
      newPrice = topBid[0].amount;
      newWinner = topBid[0].user_id;
    } else {
      const { rows: auc } = await client.query(
        "SELECT start_price FROM auctions WHERE id = $1",
        [auction_id],
      );
      newPrice = auc[0].start_price;
      newWinner = null;
    }

    await client.query(
      `UPDATE auctions
       SET current_price = $2, winner_id = $3
       WHERE id = $1`,
      [auction_id, newPrice, newWinner],
    );

    await client.query("COMMIT");
    return { auctionId: auction_id, newPrice, newWinnerId: newWinner };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};
// ── USERS ──────────────────────────────────────────────────

const getUsers = async (q) => {
  const { page, size } = parsePagination(q);
  const conditions = [];
  const params = [];

  if (q.role) {
    params.push(q.role);
    conditions.push(`role = $${params.length}`);
  }
  if (q.isBanned !== undefined) {
    params.push(q.isBanned === "true");
    conditions.push(`is_banned = $${params.length}`);
  }
  if (q.isMuted !== undefined) {
    params.push(q.isMuted === "true");
    conditions.push(`is_muted = $${params.length}`);
  }
  if (q.search) {
    params.push(`%${q.search}%`);
    conditions.push(
      `(email ILIKE $${params.length} OR nickname ILIKE $${params.length})`,
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await query(
    `SELECT id, email, nickname, avatar_url, role,
            reputation_score, is_banned, is_muted, banned_at, created_at
     FROM users ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, size, page * size],
  );
  const { rows: cnt } = await query(
    `SELECT COUNT(*) FROM users ${where}`,
    params,
  );
  return pageResponse(rows.map(normalizeUser), cnt[0].count, page, size);
};

const getUserDetail = async (id) => {
  const { rows: u } = await query("SELECT * FROM users WHERE id = $1", [id]);
  if (!u.length) throw { errorCode: "NOT_FOUND", status: 404 };

  const { rows: bids } = await query(
    `SELECT b.*, a.item_id, i.name AS item_name
     FROM bids b
     JOIN auctions a ON a.id = b.auction_id
     JOIN items i    ON i.id = a.item_id
     WHERE b.user_id = $1
     ORDER BY b.bid_time DESC
     LIMIT 20`,
    [id],
  );

  const { rows: transactions } = await query(
    `SELECT t.*
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     WHERE w.user_id = $1
     ORDER BY t.created_at DESC
     LIMIT 20`,
    [id],
  );

  const { rows: items } = await query(
    `SELECT * FROM items
     WHERE current_owner_id = $1 AND status = 'IN_INVENTORY'`,
    [id],
  );

  return {
    ...normalizeUser(u[0]),
    bidHistory: bids,
    transactionHistory: transactions,
    ownedItems: items.map(normalizeItem),
  };
};

const updateUserField = async (id, fields) => {
  const keys = Object.keys(fields);
  if (keys.length === 0) return null;

  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = Object.values(fields);

  try {
    const { rows } = await query(
      `UPDATE users SET ${sets} WHERE id = $1 RETURNING *`,
      [id, ...values],
    );
    return normalizeUser(rows[0]);
  } catch (err) {
    console.error("[updateUserField] Error:", err.message, {
      id,
      fields,
      sets,
      values,
    });
    throw err;
  }
};

// ── FINANCE ────────────────────────────────────────────────

const { normalizeTransaction } = require("../wallet/wallet.service");

const getTransactions = async (q) => {
  const { page, size } = parsePagination(q);
  const conditions = [];
  const params = [];

  if (q.type) {
    params.push(q.type);
    conditions.push(`t.type = $${params.length}`);
  }
  if (q.status) {
    params.push(q.status);
    conditions.push(`t.status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await query(
    `SELECT t.*, u.id AS user_id, u.nickname AS user_nickname
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     JOIN users u   ON u.id = w.user_id
     ${where}
     ORDER BY t.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, size, page * size],
  );
  const { rows: cnt } = await query(
    `SELECT COUNT(*) FROM transactions t ${where}`,
    params,
  );

  return pageResponse(rows.map(normalizeTransaction), cnt[0].count, page, size);
};

const approveTransaction = async (txId) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    const { rows: tx } = await client.query(
      `SELECT * FROM transactions WHERE id = $1 AND status = 'PENDING' FOR UPDATE`,
      [txId],
    );
    if (!tx.length)
      throw {
        errorCode: "NOT_FOUND",
        status: 404,
        message: "Transaction không tồn tại hoặc đã xử lý.",
      };

    const { type, amount, wallet_id } = tx[0];

    if (type === "DEPOSIT") {
      await client.query(
        `UPDATE wallets SET balance_available = balance_available + $1 WHERE id = $2`,
        [amount, wallet_id],
      );
    } else if (type === "WITHDRAW") {
      await client.query(
        `UPDATE wallets SET balance_locked = balance_locked - $1 WHERE id = $2`,
        [amount, wallet_id],
      );
    }

    const { rows } = await client.query(
      `UPDATE transactions SET status = 'COMPLETED' WHERE id = $1 RETURNING *`,
      [txId],
    );

    await client.query("COMMIT");
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

const rejectTransaction = async (txId) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    const { rows: tx } = await client.query(
      `SELECT * FROM transactions WHERE id = $1 AND status = 'PENDING' FOR UPDATE`,
      [txId],
    );
    if (!tx.length)
      throw {
        errorCode: "NOT_FOUND",
        status: 404,
        message: "Transaction không tồn tại hoặc đã xử lý.",
      };

    const { type, amount, wallet_id } = tx[0];

    if (type === "WITHDRAW") {
      // Hoàn tiền: locked → available
      await client.query(
        `UPDATE wallets
         SET balance_available = balance_available + $1,
             balance_locked    = balance_locked    - $1
         WHERE id = $2`,
        [amount, wallet_id],
      );
    }

    const { rows } = await client.query(
      `UPDATE transactions SET status = 'CANCELLED' WHERE id = $1 RETURNING *`,
      [txId],
    );

    await client.query("COMMIT");
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

const getP2pMessages = async (listingId) => {
  const { rows } = await query(
    `SELECT m.*, u.nickname, u.avatar_url
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.market_listing_id = $1
     ORDER BY m.created_at ASC`,
    [listingId],
  );
  return rows;
};
// ── ANALYTICS ─────────────────────────────────────────────

const getOverview = async () => {
  const { rows: users } = await query(`
    SELECT
      COUNT(*)                                                    AS total_users,
      COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS active_users_last7
    FROM users
  `);

  const { rows: items } = await query(`
    SELECT COUNT(*) AS pending
    FROM items WHERE status = 'PENDING'
  `);

  const { rows: sessions } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'ACTIVE')    AS active_sessions,
      COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_sessions
    FROM auction_sessions
  `);

  const { rows: revenue } = await query(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM transactions
    WHERE type = 'PLATFORM_FEE' AND status = 'COMPLETED'
  `);

  const { rows: pendingTx } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE type = 'DEPOSIT'  AND status = 'PENDING') AS pending_deposits,
      COUNT(*) FILTER (WHERE type = 'WITHDRAW' AND status = 'PENDING') AS pending_withdrawals
    FROM transactions
  `);

  return {
    totalUsers: parseInt(users[0].total_users),
    activeUsersLast7Days: parseInt(users[0].active_users_last7),
    totalItems: parseInt(items[0].pending),
    activeSessions: parseInt(sessions[0].active_sessions),
    completedSessions: parseInt(sessions[0].completed_sessions),
    totalRevenue: parseFloat(revenue[0].total),
    pendingDeposits: parseInt(pendingTx[0].pending_deposits),
    pendingWithdrawals: parseInt(pendingTx[0].pending_withdrawals),
  };
};

const getRevenue = async (q) => {
  const { period = "daily", from, to } = q;

  const groupBy =
    period === "monthly"
      ? "DATE_TRUNC('month', created_at)"
      : period === "weekly"
        ? "DATE_TRUNC('week',  created_at)"
        : "DATE(created_at)";

  const params = [];
  let where = "WHERE type = 'PLATFORM_FEE' AND status = 'COMPLETED'";

  if (from) {
    params.push(from);
    where += ` AND created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    where += ` AND created_at <= $${params.length}`;
  }

  const { rows } = await query(
    `SELECT
       ${groupBy}      AS date,
       SUM(amount)     AS revenue,
       COUNT(*)        AS transaction_count
     FROM transactions
     ${where}
     GROUP BY 1
     ORDER BY 1 ASC`,
    params,
  );

  const totalRevenue = rows.reduce(
    (sum, row) => sum + parseFloat(row.revenue || 0),
    0,
  );

  const dailyRevenue = rows.map((row) => ({
    date: row.date,
    revenue: parseFloat(row.revenue),
    transactionCount: parseInt(row.transaction_count),
  }));

  return {
    totalRevenue,
    dailyRevenue,
  };
};

const getAuctionStats = async () => {
  const { rows } = await query(`
    SELECT
      COUNT(*)                                                       AS totalAuctions,
      COUNT(*) FILTER (WHERE status = 'ENDED')                      AS endedAuctions,
      COUNT(*) FILTER (WHERE status = 'CANCELLED')                  AS cancelledAuctions,
      COUNT(*) FILTER (WHERE status = 'ACTIVE')                     AS activeAuctions
    FROM auctions
  `);

  const { rows: bidStats } = await query(`
    SELECT
      COUNT(*)      AS totalBids
    FROM bids
  `);

  const { rows: finalPayments } = await query(`
    SELECT
      COALESCE(SUM(amount), 0) AS totalVolume,
      COUNT(*)                  AS count
    FROM transactions
    WHERE type = 'FINAL_PAYMENT' AND status = 'COMPLETED'
  `);

  const totalVolume = parseFloat(finalPayments[0].totalvolume) || 0;
  const count = parseInt(finalPayments[0].count) || 0;
  const avgWinningPrice = count > 0 ? totalVolume / count : 0;

  return {
    totalAuctions: parseInt(rows[0].totalauctions) || 0,
    endedAuctions: parseInt(rows[0].endedauctions) || 0,
    cancelledAuctions: parseInt(rows[0].cancelledauctions) || 0,
    activeAuctions: parseInt(rows[0].activeauctions) || 0,
    totalBids: parseInt(bidStats[0].totalbids) || 0,
    avgWinningPrice: avgWinningPrice,
    totalVolume: totalVolume,
  };
};

const getMarketStats = async () => {
  const { rows } = await query(`
    SELECT
      COUNT(*)                                               AS totalListings,
      COUNT(*) FILTER (WHERE status = 'SOLD')              AS soldListings,
      COUNT(*) FILTER (WHERE status = 'CANCELLED')          AS cancelledListings,
      COUNT(*) FILTER (WHERE status = 'ACTIVE')            AS activeListings
    FROM market_listings
  `);

  const { rows: soldStats } = await query(`
    SELECT
      COALESCE(SUM(asking_price), 0) AS totalVolume,
      COUNT(*)                        AS count
    FROM market_listings
    WHERE status = 'SOLD'
  `);

  const totalVolume = parseFloat(soldStats[0].totalvolume) || 0;
  const count = parseInt(soldStats[0].count) || 0;
  const avgSalePrice = count > 0 ? totalVolume / count : 0;

  return {
    totalListings: parseInt(rows[0].totallistings) || 0,
    soldListings: parseInt(rows[0].soldlistings) || 0,
    cancelledListings: parseInt(rows[0].cancelledlistings) || 0,
    activeListings: parseInt(rows[0].activelistings) || 0,
    avgSalePrice: avgSalePrice,
    totalVolume: totalVolume,
  };
};

const ensureShippingRequestsTable = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS shipping_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shipping_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'RECEIVED')),
      admin_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_shipping_requests_status ON shipping_requests (status, created_at DESC)`,
  );
};

const getShippingRequests = async (q) => {
  await ensureShippingRequestsTable();
  const { page, size } = parsePagination(q);
  const conditions = [];
  const params = [];

  if (q.status) {
    params.push(q.status);
    conditions.push(`sr.status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await query(
    `SELECT sr.*, i.name AS item_name, i.image_urls AS item_images, i.status AS item_status,
            u.nickname AS requester_nickname, u.email AS requester_email, u.phone AS requester_phone, u.address AS requester_profile_address
     FROM shipping_requests sr
     JOIN items i ON i.id = sr.item_id
     JOIN users u ON u.id = sr.requester_id
     ${where}
     ORDER BY sr.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, size, page * size],
  );
  const { rows: cnt } = await query(
    `SELECT COUNT(*) FROM shipping_requests sr ${where}`,
    params,
  );

  const content = rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    requesterId: row.requester_id,
    shippingAddress: row.shipping_address,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    item: {
      id: row.item_id,
      name: row.item_name,
      imageUrls: row.item_images || [],
      status: row.item_status,
    },
    requester: {
      id: row.requester_id,
      nickname: row.requester_nickname,
      email: row.requester_email,
      phone: row.requester_phone,
      address: row.requester_profile_address,
    },
  }));

  return pageResponse(content, cnt[0].count, page, size);
};

const updateShippingRequestStatus = async ({ id, status, adminNote }) => {
  await ensureShippingRequestsTable();

  const { rows } = await query(
    `UPDATE shipping_requests
     SET status = $2,
         admin_note = $3,
         updated_at = now()
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [id, status, adminNote || null],
  );
  return rows[0] || null;
};

module.exports = {
  getItems,
  approveItem,
  rejectItem,
  createAuction,
  removeAuction,
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  resetTimer,
  deleteBid,
  getUsers,
  getUserDetail,
  updateUserField,
  getTransactions,
  approveTransaction,
  rejectTransaction,
  getP2pMessages,
  getOverview,
  getRevenue,
  getAuctionStats,
  getMarketStats,
  getShippingRequests,
  updateShippingRequestStatus,
};
