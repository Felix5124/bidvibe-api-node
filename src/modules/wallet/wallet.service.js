const repo = require('./wallet.repository');
const { generateTransferCode } = require('../../utils/transferCode');
const { ErrorCode } = require('../../constants/errorCodes');
const { TransactionType, TransactionStatus } = require('../../constants/enums');

const getWallet = async (userId) => {
  const wallet = await repo.findByUserId(userId);
  if (!wallet) throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Ví không tồn tại.' };
  return {
    balanceAvailable: wallet.balance_available,
    balanceLocked: wallet.balance_locked,
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

module.exports = { getWallet, createDeposit, createWithdraw, getTransactions };