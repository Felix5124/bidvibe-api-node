const { query } = require('../../config/database.config');
const { pageResponse, parsePagination } = require('../../utils/pagination');

const normalizeItem = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrls: row.image_urls || [],
    tags: row.tags || [],
    rarity: row.rarity,
    status: row.status,
    cooldownUntil: row.cooldown_until,
    createdAt: row.created_at,
    
    seller: row.seller_id ? {
      id: row.seller_id,
      nickname: row.seller_nickname,
      avatarUrl: row.seller_avatar_url,
      reputationScore: parseFloat(row.seller_reputation_score) || 5.0
    } : null,
    
    currentOwner: row.owner_id || row.current_owner_id ? {
      id: row.owner_id || row.current_owner_id,
      nickname: row.owner_nickname,
      avatarUrl: row.owner_avatar_url,
      reputationScore: parseFloat(row.owner_reputation_score) || 5.0
    } : null,
  };
};

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
  return normalizeItem(rows[0]);
};

const findById = async (id) => {
  const { rows } = await query(
    `SELECT i.*,
            s.id AS seller_id,
            s.nickname AS seller_nickname,
            s.avatar_url AS seller_avatar_url,
            s.reputation_score AS seller_reputation_score,
            o.id AS owner_id,
            o.nickname AS owner_nickname,
            o.avatar_url AS owner_avatar_url,
            o.reputation_score AS owner_reputation_score
     FROM items i
     JOIN users s ON s.id = i.seller_id
     LEFT JOIN users o ON o.id = i.current_owner_id
     WHERE i.id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrls: row.image_urls,
    tags: row.tags,
    rarity: row.rarity,
    status: row.status,
    cooldownUntil: row.cooldown_until,
    createdAt: row.created_at,
    seller: {
      id: row.seller_id,
      nickname: row.seller_nickname,
      avatarUrl: row.seller_avatar_url,
      reputationScore: row.seller_reputation_score,
    },
    currentOwner: row.owner_id ? {
      id: row.owner_id,
      nickname: row.owner_nickname,
      avatarUrl: row.owner_avatar_url,
      reputationScore: row.owner_reputation_score,
    } : null,
  };
};

const findByOwner = async (userId, q) => {
  const { page, size } = parsePagination(q);
  const { rows } = await query(
    `SELECT i.*,
            s.id AS seller_id,
            s.nickname AS seller_nickname,
            s.avatar_url AS seller_avatar_url,
            s.reputation_score AS seller_reputation_score,
            o.id AS owner_id,
            o.nickname AS owner_nickname,
            o.avatar_url AS owner_avatar_url,
            o.reputation_score AS owner_reputation_score
     FROM items i
     JOIN users s ON s.id = i.seller_id
     JOIN users o ON o.id = i.current_owner_id
     WHERE i.current_owner_id = $1
     ORDER BY i.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, size, page * size]
  );

  const { rows: cnt } = await query(
    `SELECT COUNT(*) FROM items WHERE current_owner_id = $1`,
    [userId]
  );

  return pageResponse(rows.map(normalizeItem), cnt[0].count, page, size);
};

const updateStatus = async (id, status) => {
  const { rows } = await query(
    'UPDATE items SET status = $2 WHERE id = $1 RETURNING *',
    [id, status]
  );
  return normalizeItem(rows[0]);
};

const update = async (id, fields) => {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const { rows } = await query(
    `UPDATE items SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...Object.values(fields)]
  );
  return normalizeItem(rows[0]);
};

const remove = async (id) => {
  const { rows } = await query(
    'DELETE FROM items WHERE id = $1 RETURNING *',
    [id]
  );
  return normalizeItem(rows[0]);
};

const isInCooldown = async (id) => {
  const { rows } = await query(
    `SELECT EXISTS(
      SELECT 1 FROM items
      WHERE id = $1 AND cooldown_until > now()
    ) AS in_cooldown`,
    [id]
  );
  return rows[0]?.in_cooldown;
};

module.exports = { create, findById, findByOwner, updateStatus, update, remove, isInCooldown };