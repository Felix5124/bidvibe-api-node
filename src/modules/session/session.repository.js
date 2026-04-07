const { query } = require('../../config/database.config');
const { pageResponse, parsePagination } = require('../../utils/pagination');

const findAll = async (q) => {
  const { page, size } = parsePagination(q);
  const conditions = [];
  const params = [];

  if (q.status) {
    params.push(q.status);
    conditions.push(`status = $${params.length}`);
  }
  if (q.type) {
    params.push(q.type);
    conditions.push(`type = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT * FROM auction_sessions
     ${where}
     ORDER BY start_time DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, size, page * size]
  );
  const { rows: cnt } = await query(
    `SELECT COUNT(*) FROM auction_sessions ${where}`,
    params
  );
  return pageResponse(rows, cnt[0].count, page, size);
};

const findById = async (id) => {
  const { rows } = await query(
    'SELECT * FROM auction_sessions WHERE id = $1',
    [id]
  );
  return rows[0];
};

const findAuctions = async (sessionId) => {
  const { rows } = await query(
    `SELECT
       a.*,
       i.name        AS item_name,
       i.image_urls  AS item_images,
       i.rarity      AS item_rarity,
       i.tags        AS item_tags,
       i.description AS item_description,
       u.nickname    AS seller_nickname,
       u.reputation_score AS seller_score
     FROM auctions a
     JOIN items i ON i.id = a.item_id
     JOIN users u ON u.id = i.seller_id
     WHERE a.session_id = $1
     ORDER BY a.order_index ASC`,
    [sessionId]
  );
  return rows;
};

const create = async ({ title, type, startTime }) => {
  const { rows } = await query(
    `INSERT INTO auction_sessions (id, title, type, start_time, status, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'SCHEDULED', now())
     RETURNING *`,
    [title, type, startTime]
  );
  return rows[0];
};

const updateStatus = async (id, status, extra = {}) => {
  const sets = ['status = $2'];
  const params = [id, status];

  if (extra.remainingSeconds !== undefined) {
    params.push(extra.remainingSeconds);
    sets.push(`remaining_seconds = $${params.length}`);
  }

  const { rows } = await query(
    `UPDATE auction_sessions SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0];
};

module.exports = { findAll, findById, findAuctions, create, updateStatus };