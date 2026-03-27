const { query } = require('../../config/database.config');
const { pageResponse, parsePagination } = require('../../utils/pagination');

const create = async ({ userId, type, title, content }) => {
  const { rows } = await query(
    `INSERT INTO notifications (id, user_id, type, title, content, is_read, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, false, now())
     RETURNING *`,
    [userId, type, title, content]
  );
  return rows[0];
};

const findByUser = async (userId, q) => {
  const { page, size } = parsePagination(q);
  const { rows } = await query(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, size, page * size]
  );
  const { rows: cnt } = await query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
    [userId]
  );
  return pageResponse(rows, cnt[0].count, page, size);
};

const markRead = async (id, userId) => {
  const { rows } = await query(
    `UPDATE notifications
     SET is_read = true
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, userId]
  );
  return rows[0];
};

const markAllRead = async (userId) => {
  await query(
    `UPDATE notifications
     SET is_read = true
     WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
};

const countUnread = async (userId) => {
  const { rows } = await query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
    [userId]
  );
  return parseInt(rows[0].count);
};

module.exports = { create, findByUser, markRead, markAllRead, countUnread };