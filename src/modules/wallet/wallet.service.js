const repo = require('./wallet.repository');
const { generateTransferCode } = require('../../utils/transferCode');
const { ErrorCode } = require('../../constants/errorCodes');
const { TransactionType, TransactionStatus } = require('../../constants/enums');
const { query, getClient } = require('../../config/database.config');

const getWallet = async (userId) => {
  const wallet = await repo.findByUserId(userId);
  if (!wallet) throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Ví không tồn tại.' };
  const balanceAvailable = parseFloat(wallet.balance_available) || 0;
  const balanceLocked = parseFloat(wallet.balance_locked) || 0;
  return {
    balanceAvailable,
    balanceLocked,
    totalBalance: balanceAvailable + balanceLocked,
  };
};

const createDeposit = async (userId, amount) => {
  if (!amount || amount <= 0) {
    throw { errorCode: ErrorCode.INVALID_AMOUNT, status: 400, message: 'Số tiền không hợp lệ.' };
  }

  const wallet = await repo.findByUserId(userId);
  const transferCode = generateTransferCode();
  const expiredAt = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 giờ

  const tx = await repo.createTransaction({
    walletId: wallet.id,
    type: TransactionType.DEPOSIT,
    amount,
    status: TransactionStatus.PENDING,
    description: transferCode,
  });

  return {
    transactionId: tx.id,
    transferCode,
    bankAccount: '1234567890 - Vietcombank - BidVibe JSC',
    amount,
    expiredAt,
  };
};

const createWithdraw = async (userId, { amount, bankName, accountNumber, accountHolder }) => {
  if (!amount || amount <= 0) {
    throw { errorCode: ErrorCode.INVALID_AMOUNT, status: 400, message: 'Số tiền không hợp lệ.' };
  }

  const wallet = await repo.findByUserId(userId);

  if (parseFloat(wallet.balance_available) < parseFloat(amount)) {
    throw {
      errorCode: ErrorCode.INSUFFICIENT_BALANCE,
      status: 400,
      message: 'Số dư khả dụng không đủ.',
    };
  }

  return repo.createWithdraw(wallet.id, amount, { bankName, accountNumber, accountHolder });
};

const getTransactions = (userId, q) => repo.findTransactions(userId, q);

const getPendingTransactions = async () => {
  const { rows } = await query(
    `SELECT t.*, w.user_id, u.nickname, u.avatar_url, u.email
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     JOIN users u ON u.id = w.user_id
     WHERE t.status = 'PENDING'
     ORDER BY t.created_at DESC`
  );
  return rows;
};

const approveDeposit = async (txId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: tx } = await client.query(
      "SELECT * FROM transactions WHERE id = $1 AND type = 'DEPOSIT' AND status = 'PENDING' FOR UPDATE",
      [txId]
    );
    if (!tx.length) {
      throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Giao dịch không tồn tại hoặc đã xử lý.' };
    }

    await client.query(
      "UPDATE wallets SET balance_available = balance_available + $1 WHERE id = $2",
      [tx[0].amount, tx[0].wallet_id]
    );

    const { rows: updated } = await client.query(
      "UPDATE transactions SET status = 'COMPLETED' WHERE id = $1 RETURNING *",
      [txId]
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

const rejectDeposit = async (txId) => {
  const { rows: tx } = await query(
    "SELECT * FROM transactions WHERE id = $1 AND type = 'DEPOSIT' AND status = 'PENDING'",
    [txId]
  );
  if (!tx.length) {
    throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Giao dịch không tồn tại hoặc đã xử lý.' };
  }

  const { rows: updated } = await query(
    "UPDATE transactions SET status = 'REJECTED' WHERE id = $1 RETURNING *",
    [txId]
  );
  return updated[0];
};

const approveWithdraw = async (txId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: tx } = await client.query(
      "SELECT * FROM transactions WHERE id = $1 AND type = 'WITHDRAW' AND status = 'PENDING' FOR UPDATE",
      [txId]
    );
    if (!tx.length) {
      throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Giao dịch không tồn tại hoặc đã xử lý.' };
    }

    await client.query(
      "UPDATE wallets SET balance_locked = balance_locked - $1 WHERE id = $2",
      [tx[0].amount, tx[0].wallet_id]
    );

    const { rows: updated } = await client.query(
      "UPDATE transactions SET status = 'COMPLETED' WHERE id = $1 RETURNING *",
      [txId]
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

const rejectWithdraw = async (txId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: tx } = await client.query(
      "SELECT * FROM transactions WHERE id = $1 AND type = 'WITHDRAW' AND status = 'PENDING' FOR UPDATE",
      [txId]
    );
    if (!tx.length) {
      throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Giao dịch không tồn tại hoặc đã xử lý.' };
    }

    await client.query(
      "UPDATE wallets SET balance_available = balance_available + $1, balance_locked = balance_locked - $1 WHERE id = $2",
      [tx[0].amount, tx[0].wallet_id]
    );

    const { rows: updated } = await client.query(
      "UPDATE transactions SET status = 'REJECTED' WHERE id = $1 RETURNING *",
      [txId]
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

module.exports = {
  getWallet, createDeposit, createWithdraw, getTransactions,
  getPendingTransactions, approveDeposit, rejectDeposit, approveWithdraw, rejectWithdraw
};