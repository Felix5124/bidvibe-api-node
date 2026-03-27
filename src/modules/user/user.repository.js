const { query } = require('../../config/database.config');
const { pageResponse, parsePagination } = require('../../utils/pagination');

const findById = async (id) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0];
};

const findPublicById = async (id) => {
  const { rows } = await query(
    `SELECT id, nickname, avatar_url, reputation_score, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0];
};

const update = async (id, { nickname, avatarUrl, phone, address }) => {
  const { rows } = await query(
    `UPDATE users
     SET nickname = $2, avatar_url = $3, phone = $4, address = $5
     WHERE id = $1
     RETURNING *`,
    [id, nickname, avatarUrl, phone, address]
  );
  return rows[0];
};

const findRatings = async (userId, q) => {
  const { page, size } = parsePagination(q);
  const { rows } = await query(
    `SELECT r.*, u.nickname AS from_nickname, u.avatar_url AS from_avatar
     FROM ratings r
     JOIN users u ON u.id = r.from_user_id
     WHERE r.to_user_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, size, page * size]
  );
  const { rows: cnt } = await query(
    'SELECT COUNT(*) FROM ratings WHERE to_user_id = $1',
    [userId]
  );
  return pageResponse(rows, cnt[0].count, page, size);
};

const findWatchlist = async (userId, q) => {
  const { page, size } = parsePagination(q);
  const { rows } = await query(
    `SELECT i.*
     FROM watchlists w
     JOIN items i ON i.id = w.item_id
     WHERE w.user_id = $1
     LIMIT $2 OFFSET $3`,
    [userId, size, page * size]
  );
  const { rows: cnt } = await query(
    'SELECT COUNT(*) FROM watchlists WHERE user_id = $1',
    [userId]
  );
  return pageResponse(rows, cnt[0].count, page, size);
};

const addWatchlist = async (userId, itemId) => {
  await query(
    `INSERT INTO watchlists (user_id, item_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, itemId]
  );
  return { message: 'Đã thêm vào watchlist.' };
};

const removeWatchlist = async (userId, itemId) => {
  await query(
    'DELETE FROM watchlists WHERE user_id = $1 AND item_id = $2',
    [userId, itemId]
  );
  return { message: 'Đã xóa khỏi watchlist.' };
};

module.exports = {
  findById, findPublicById, update,
  findRatings, findWatchlist, addWatchlist, removeWatchlist,
};