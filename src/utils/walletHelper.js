const { query } = require('../config/database.config');
const { ErrorCode } = require('../constants/errorCodes');

class WalletHelper {
  static async lockFunds(walletId, amount, referenceId, client) {
    const { rows } = await query(
      `UPDATE wallets
         SET balance_available = balance_available - $1,
             balance_locked    = balance_locked    + $1,
             version           = version + 1
       WHERE id = $2 AND balance_available >= $1
       RETURNING id`,
      [amount, walletId], client
    );
    if (!rows.length) {
      throw { errorCode: ErrorCode.INSUFFICIENT_BALANCE, status: 400, message: 'Số dư không đủ.' };
    }
    await query(
      `INSERT INTO transactions (id, wallet_id, type, amount, status, reference_id, created_at)
       VALUES (gen_random_uuid(), $1, 'BID_LOCK', $2, 'COMPLETED', $3, now())`,
      [walletId, amount, referenceId], client
    );
  }

  static async unlockFunds(walletId, amount, referenceId, client) {
    await query(
      `UPDATE wallets
         SET balance_available = balance_available + $1,
             balance_locked    = balance_locked    - $1
       WHERE id = $2`,
      [amount, walletId], client
    );
    await query(
      `INSERT INTO transactions (id, wallet_id, type, amount, status, reference_id, created_at)
       VALUES (gen_random_uuid(), $1, 'BID_UNLOCK', $2, 'COMPLETED', $3, now())`,
      [walletId, amount, referenceId], client
    );
  }

  static async chargeFinalPayment(walletId, lockedAmount, feeRate = 0.05, referenceId, client) {
    const fee = Math.round(lockedAmount * feeRate);
    await query(
      `UPDATE wallets SET balance_locked = balance_locked - $1 WHERE id = $2`,
      [lockedAmount, walletId], client
    );
    await query(
      `UPDATE wallets SET balance_available = balance_available - $1 WHERE id = $2`,
      [fee, walletId], client
    );
    await query(
      `INSERT INTO transactions (id, wallet_id, type, amount, status, reference_id, created_at)
       VALUES
         (gen_random_uuid(), $1, 'FINAL_PAYMENT', $2, 'COMPLETED', $3, now()),
         (gen_random_uuid(), $1, 'PLATFORM_FEE',  $4, 'COMPLETED', $3, now())`,
      [walletId, lockedAmount, referenceId, fee], client
    );
  }
}

module.exports = { WalletHelper };