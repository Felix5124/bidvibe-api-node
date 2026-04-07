const { query, getClient } = require('../../config/database.config');
const { pageResponse, parsePagination } = require('../../utils/pagination');
const { TransactionType, TransactionStatus } = require('../../constants/enums');

const findByUserId = async (userId) => {
  const { rows } = await query(
    'SELECT * FROM wallets WHERE user_id = $1',
    [userId]
  );
  return rows[0];
};

const createTransaction = async ({ walletId, type, amount, status, description, referenceId }) => {
  const { rows } = await query(
    `INSERT INTO transactions (id, wallet_id, type, amount, status, description, reference_id, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now())
     RETURNING *`,
    [walletId, type, amount, status, description, referenceId]
  );
  return rows[0];
};

const createWithdraw = async (walletId, amount, bankInfo) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock ngay để tránh rút trùng
    await client.query(
      `UPDATE wallets
       SET balance_available = balance_available - $1,
           balance_locked    = balance_locked    + $1
       WHERE id = $2`,
      [amount, walletId]
    );

    const desc = `${bankInfo.bankName} - ${bankInfo.accountNumber} - ${bankInfo.accountHolder}`;
    const { rows } = await client.query(
      `INSERT INTO transactions (id, wallet_id, type, amount, status, description, created_at)
       VALUES (gen_random_uuid(), $1, 'WITHDRAW', $2, 'PENDING', $3, now())
       RETURNING *`,
      [walletId, amount, desc]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

const findTransactions = async (userId, q) => {
  const { page, size } = parsePagination(q);
  const conditions = ['w.user_id = $1'];
  const params = [userId];

  if (q.type) {
    params.push(q.type);
    conditions.push(`t.type = $${params.length}`);
  }
  if (q.status) {
    params.push(q.status);
    conditions.push(`t.status = $${params.length}`);
  }

  const where = conditions.join(' AND ');

  const { rows } = await query(
    `SELECT t.*
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     WHERE ${where}
     ORDER BY t.created_at DESC
     LIMIT ${size} OFFSET ${page * size}`,
    params
  );

  const { rows: cnt } = await query(
    `SELECT COUNT(*)
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     WHERE ${where}`,
    params
  );

  return pageResponse(rows, cnt[0].count, page, size);
};

module.exports = { findByUserId, createTransaction, createWithdraw, findTransactions };