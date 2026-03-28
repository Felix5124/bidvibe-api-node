const { query, getClient } = require('../../config/database.config');
const { pageResponse, parsePagination } = require('../../utils/pagination');

const findAll = async (q) => {
  const { page, size } = parsePagination(q);
  const conditions = ["ml.status = 'ACTIVE'"];
  const params = [];

  if (q.rarity) {
    params.push(q.rarity);
    conditions.push(`i.rarity = $${params.length}`);
  }
  if (q.minPrice) {
    params.push(q.minPrice);
    conditions.push(`ml.asking_price >= $${params.length}`);
  }
  if (q.maxPrice) {
    params.push(q.maxPrice);
    conditions.push(`ml.asking_price <= $${params.length}`);
  }
  if (q.tags) {
    // tags=sneaker,jordan → tìm item có ít nhất 1 tag khớp
    const tagArr = q.tags.split(',').map((t) => t.trim());
    params.push(JSON.stringify(tagArr));
    conditions.push(`i.tags ?| $${params.length}::text[]`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = page * size;

  const { rows } = await query(
    `SELECT
       ml.*,
       i.name        AS item_name,
       i.image_urls  AS item_images,
       i.rarity      AS item_rarity,
       i.tags        AS item_tags,
       u.nickname    AS seller_nickname,
       u.reputation_score AS seller_score
     FROM market_listings ml
     JOIN items i ON i.id = ml.item_id
     JOIN users u ON u.id = ml.seller_id
     ${where}
     ORDER BY ml.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, size, offset]
  );

  const { rows: cnt } = await query(
    `SELECT COUNT(*)
     FROM market_listings ml
     JOIN items i ON i.id = ml.item_id
     ${where}`,
    params
  );

  return pageResponse(rows, cnt[0].count, page, size);
};

const findById = async (id) => {
  const { rows } = await query(
    `SELECT
       ml.*,
       i.name        AS item_name,
       i.image_urls  AS item_images,
       i.rarity      AS item_rarity,
       i.tags        AS item_tags,
       i.description AS item_description,
       u.nickname    AS seller_nickname,
       u.reputation_score AS seller_score
     FROM market_listings ml
     JOIN items i ON i.id = ml.item_id
     JOIN users u ON u.id = ml.seller_id
     WHERE ml.id = $1`,
    [id]
  );
  return rows[0];
};

const create = async (sellerId, itemId, askingPrice) => {
  const { rows } = await query(
    `INSERT INTO market_listings
       (id, item_id, seller_id, asking_price, status, created_at, updated_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, 'ACTIVE', now(), now())
     RETURNING *`,
    [itemId, sellerId, askingPrice]
  );
  return rows[0];
};

const cancel = async (id, sellerId) => {
  const { rows } = await query(
    `UPDATE market_listings
     SET status = 'CANCELLED', updated_at = now()
     WHERE id = $1
       AND seller_id = $2
       AND status = 'ACTIVE'
     RETURNING *`,
    [id, sellerId]
  );
  return rows[0];
};

const buy = async (listingId, buyerId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock listing
    const { rows: ml } = await client.query(
      `SELECT ml.*, i.id AS item_id
       FROM market_listings ml
       JOIN items i ON i.id = ml.item_id
       WHERE ml.id = $1 AND ml.status = 'ACTIVE'
       FOR UPDATE`,
      [listingId]
    );
    if (!ml.length) {
      throw { errorCode: 'NOT_FOUND', status: 404, message: 'Listing không tồn tại hoặc đã bán.' };
    }

    const listing = ml[0];

    if (listing.seller_id === buyerId) {
      throw { errorCode: 'FORBIDDEN', status: 403, message: 'Không thể mua đồ của chính mình.' };
    }

    const price          = parseFloat(listing.asking_price);
    const fee            = Math.round(price * 0.05);
    const sellerReceives = price - fee;

    // Check balance buyer
    const { rows: buyerW } = await client.query(
      'SELECT id, balance_available FROM wallets WHERE user_id = $1 FOR UPDATE',
      [buyerId]
    );
    if (!buyerW.length || parseFloat(buyerW[0].balance_available) < price) {
      throw { errorCode: 'INSUFFICIENT_BALANCE', status: 400, message: 'Số dư không đủ.' };
    }

    // Trừ buyer
    await client.query(
      `UPDATE wallets
       SET balance_available = balance_available - $1
       WHERE id = $2`,
      [price, buyerW[0].id]
    );
    await client.query(
      `INSERT INTO transactions
         (id, wallet_id, type, amount, status, reference_id, created_at)
       VALUES
         (gen_random_uuid(), $1, 'FINAL_PAYMENT', $2, 'COMPLETED', $3, now())`,
      [buyerW[0].id, price, listingId]
    );

    // Cộng seller (trừ phí)
    const { rows: sellerW } = await client.query(
      'SELECT id FROM wallets WHERE user_id = $1',
      [listing.seller_id]
    );
    await client.query(
      `UPDATE wallets
       SET balance_available = balance_available + $1
       WHERE id = $2`,
      [sellerReceives, sellerW[0].id]
    );
    await client.query(
      `INSERT INTO transactions
         (id, wallet_id, type, amount, status, reference_id, created_at)
       VALUES
         (gen_random_uuid(), $1, 'FINAL_PAYMENT', $2, 'COMPLETED', $3, now()),
         (gen_random_uuid(), $1, 'PLATFORM_FEE',  $4, 'COMPLETED', $3, now())`,
      [sellerW[0].id, sellerReceives, listingId, fee]
    );

    // Chuyển ownership + cooldown
    await client.query(
      `UPDATE items
       SET current_owner_id = $1,
           cooldown_until   = now() + interval '12 hours'
       WHERE id = $2`,
      [buyerId, listing.item_id]
    );

    // Đóng listing
    const { rows: updated } = await client.query(
      `UPDATE market_listings
       SET status     = 'SOLD',
           buyer_id   = $2,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [listingId, buyerId]
    );

    await client.query('COMMIT');
    return updated[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

const findMessages = async (listingId, requestingUserId) => {
  // Chỉ buyer hoặc seller mới xem được
  const { rows: listing } = await query(
    'SELECT seller_id, buyer_id FROM market_listings WHERE id = $1',
    [listingId]
  );
  if (!listing.length) throw { errorCode: 'NOT_FOUND', status: 404 };

  const { seller_id, buyer_id } = listing[0];
  if (requestingUserId !== seller_id && requestingUserId !== buyer_id) {
    throw { errorCode: 'FORBIDDEN', status: 403, message: 'Bạn không có quyền xem chat này.' };
  }

  const { rows } = await query(
    `SELECT m.*,
            u.nickname   AS sender_nickname,
            u.avatar_url AS sender_avatar
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.market_listing_id = $1
     ORDER BY m.created_at ASC`,
    [listingId]
  );
  return rows;
};

const createMessage = async (listingId, senderId, content) => {
  const { rows: listing } = await query(
    'SELECT seller_id, buyer_id FROM market_listings WHERE id = $1',
    [listingId]
  );
  if (!listing.length) throw { errorCode: 'NOT_FOUND', status: 404 };

  const { seller_id, buyer_id } = listing[0];
  const receiverId = senderId === seller_id ? buyer_id : seller_id;

  const { rows } = await query(
    `INSERT INTO messages
       (id, sender_id, receiver_id, market_listing_id, content, created_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4, now())
     RETURNING *`,
    [senderId, receiverId, listingId, content]
  );

  return { message: rows[0], receiverId };
};

module.exports = {
  findAll, findById, create, cancel, buy,
  findMessages, createMessage,
};