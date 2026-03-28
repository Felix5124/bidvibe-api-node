const { query, getClient } = require('../../config/database.config');

const create = async ({ fromUserId, toUserId, auctionId, marketListingId, stars, comment }) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO ratings
         (id, from_user_id, to_user_id, auction_id, market_listing_id, stars, comment, created_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now())
       RETURNING *`,
      [fromUserId, toUserId, auctionId || null, marketListingId || null, stars, comment]
    );

    // Tính lại reputation_score = AVG(stars) của toàn bộ rating nhận được
    await client.query(
      `UPDATE users
       SET reputation_score = (
         SELECT ROUND(AVG(stars)::numeric, 2)
         FROM ratings
         WHERE to_user_id = $1
       )
       WHERE id = $1`,
      [toUserId]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    // Unique constraint violation → đã đánh giá rồi
    if (e.code === '23505') {
      throw { errorCode: 'RATING_ALREADY_EXISTS', status: 409, message: 'Bạn đã đánh giá giao dịch này rồi.' };
    }
    throw e;
  } finally {
    client.release();
  }
};

module.exports = { create };