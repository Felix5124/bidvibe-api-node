const { query } = require('../../config/database.config');
const { pageResponse, parsePagination } = require('../../utils/pagination');

const create = async ({ name, description, imageUrls, tags, rarity, sellerId, currentOwnerId, status }) => {
  const { rows } = await query(
    `INSERT INTO items
       (id, seller_id, current_owner_id, name, description, image_urls, tags, rarity, status, created_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, now())
     RETURNING *`,
    [sellerId, currentOwnerId, name, description,
     JSON.stringify(imageUrls || []),
     JSON.stringify(tags || []),
     rarity || 'COMMON', status]
  );
  return rows[0];
};

const findById = async (id) => {
  const { rows } = await query(
    `SELECT i.*,
            s.nickname  AS seller_nickname,
            s.avatar_url AS seller_avatar,
            s.reputation_score AS seller_score,
            o.nickname  AS owner_nickname
     FROM items i
     JOIN users s ON s.id = i.seller_id
     JOIN users o ON o.id = i.current_owner_id
     WHERE i.id = $1`,
    [id]
  );
  return rows[0];
};

const findByOwner = async (userId, q) => {
  const { page, size } = parsePagination(q);
  const { rows } = await query(
    `SELECT * FROM items
     WHERE current_owner_id = $1 AND status = 'IN_INVENTORY'
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, size, page * size]
  );
  const { rows: cnt } = await query(
    `SELECT COUNT(*) FROM items
     WHERE current_owner_id = $1 AND status = 'IN_INVENTORY'`,
    [userId]
  );
  return pageResponse(rows, cnt[0].count, page, size);
};

const updateStatus = async (id, status) => {
  const { rows } = await query(
    'UPDATE items SET status = $2 WHERE id = $1 RETURNING *',
    [id, status]
  );
  return rows[0];
};

const update = async (id, fields) => {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const { rows } = await query(
    `UPDATE items SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...Object.values(fields)]
  );
  return rows[0];
};

module.exports = { create, findById, findByOwner, updateStatus, update };