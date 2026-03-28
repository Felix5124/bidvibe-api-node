const { query } = require('../../config/database.config');

const getPriceHistory = async (itemId) => {
  // Lấy tất cả bids liên quan đến item
  const { rows: bidPoints } = await query(
    `SELECT
       b.amount    AS price,
       b.bid_time  AS time,
       'BID'       AS source
     FROM bids b
     JOIN auctions a ON a.id = b.auction_id
     WHERE a.item_id = $1`,
    [itemId]
  );

  // Lấy giá thắng cuối (FINAL_PAYMENT)
  const { rows: finalPoints } = await query(
    `SELECT
       t.amount     AS price,
       t.created_at AS time,
       'FINAL'      AS source
     FROM transactions t
     JOIN auctions a ON a.id = t.reference_id
     WHERE a.item_id = $1
       AND t.type   = 'FINAL_PAYMENT'
       AND t.status = 'COMPLETED'`,
    [itemId]
  );

  // Gộp + sort theo thời gian
  const dataPoints = [...bidPoints, ...finalPoints]
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  return dataPoints;
};

module.exports = { getPriceHistory };