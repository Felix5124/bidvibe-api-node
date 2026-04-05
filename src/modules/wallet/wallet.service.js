const repo = require('./wallet.repository');
const { generateTransferCode } = require('../../utils/transferCode');
const { ErrorCode } = require('../../constants/errorCodes');
const { TransactionType, TransactionStatus } = require('../../constants/enums');
const { query, getClient } = require('../../config/database.config');
const notifService = require('../notification/notification.service');
const { NotificationType } = require('../../constants/enums');

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
  const expiredAt = new Date(Date.now() + 3 * 60 * 60 * 1000);

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

const normalizeTransaction = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    walletId: row.wallet_id,
    userId: row.user_id,
    userNickname: row.user_nickname || row.nickname,
    type: row.type,
    amount: parseFloat(row.amount),
    status: row.status,
    referenceId: row.reference_id,
    description: row.description,
    createdAt: row.created_at,
  };
};

const getNormalizedTx = async (txId) => {
  const { rows } = await query(
    `SELECT t.*, u.id AS user_id, u.nickname AS user_nickname
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     JOIN users u ON u.id = w.user_id
     WHERE t.id = $1`, [txId]
  );
  return normalizeTransaction(rows[0]);
};

const getPendingTransactions = async () => {
  const { rows } = await query(
    `SELECT t.*, u.id AS user_id, u.nickname AS user_nickname
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     JOIN users u ON u.id = w.user_id
     WHERE t.status = 'PENDING'
       AND t.type IN ('DEPOSIT', 'WITHDRAW')
     ORDER BY t.created_at ASC`
  );
  return rows.map(normalizeTransaction);
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

    await client.query(
      "UPDATE transactions SET status = 'COMPLETED' WHERE id = $1",
      [txId]
    );

    await client.query('COMMIT');
    
    const result = await getNormalizedTx(txId);

    await notifService.send(
      result.userId,
      NotificationType.FINANCE,
      "Nạp tiền thành công",
      `Yêu cầu nạp ${result.amount.toLocaleString('vi-VN')} VND đã được duyệt. Số dư khả dụng đã được cập nhật.`,
      txId
    );

    return result;
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

  await query(
    "UPDATE transactions SET status = 'REJECTED' WHERE id = $1",
    [txId]
  );

  const result = await getNormalizedTx(txId);

  await notifService.send(
    result.userId,
    NotificationType.FINANCE,
    "Yêu cầu nạp tiền bị từ chối",
    `Yêu cầu nạp ${result.amount.toLocaleString('vi-VN')} VND đã bị từ chối. Vui lòng liên hệ hỗ trợ.`,
    txId
  );

  return result;
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

    await client.query(
      "UPDATE transactions SET status = 'COMPLETED' WHERE id = $1",
      [txId]
    );

    await client.query('COMMIT');
    
    const result = await getNormalizedTx(txId);

    await notifService.send(
      result.userId,
      NotificationType.FINANCE,
      "Rút tiền thành công",
      `Yêu cầu rút ${result.amount.toLocaleString('vi-VN')} VND đã được duyệt. Vui lòng kiểm tra tài khoản ngân hàng.`,
      txId
    );

    return result;
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

    await client.query(
      "UPDATE transactions SET status = 'REJECTED' WHERE id = $1",
      [txId]
    );

    await client.query('COMMIT');
    
    const result = await getNormalizedTx(txId);

    await notifService.send(
      result.userId,
      NotificationType.FINANCE,
      "Yêu cầu rút tiền bị từ chối",
      `Yêu cầu rút ${result.amount.toLocaleString('vi-VN')} VND đã bị từ chối. Số tiền đã được hoàn lại vào số dư khả dụng.`,
      txId
    );

    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

module.exports = {
  getWallet, createDeposit, createWithdraw, getTransactions,
  getPendingTransactions, approveDeposit, rejectDeposit, approveWithdraw, rejectWithdraw,
  normalizeTransaction
};