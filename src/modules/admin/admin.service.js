const repo           = require('./admin.repository');
const itemRepo       = require('../item/item.repository');
const sessionRepo    = require('../session/session.repository');
const notifService   = require('../notification/notification.service');
const { NotificationType } = require('../../constants/enums');
const { ErrorCode }  = require('../../constants/errorCodes');
const { publishAuctionUpdate } = require('../../websocket/publishers/auctionPublisher');

// ── ITEMS ──────────────────────────────────────────────────

const getItems = (q) => repo.getItems(q);

const getItem = async (id) => {
  const item = await itemRepo.findById(id);
  if (!item) throw { errorCode: ErrorCode.NOT_FOUND, status: 404 };
  return item;
};

const approveItem = async (itemId, { tags, rarity, startPrice }) => {
  const item = await repo.approveItem(itemId, { tags, rarity, startPrice });
  if (!item) throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Item không tồn tại hoặc không ở trạng thái PENDING.' };
  return item;
};

const rejectItem = async (itemId, reason) => {
  const item = await repo.rejectItem(itemId, reason);
  if (!item) throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Item không tồn tại hoặc không ở trạng thái PENDING.' };

  await notifService.send(
    item.seller_id,
    NotificationType.ITEM_REJECTED,
    'Vật phẩm bị từ chối',
    `Vật phẩm "${item.name}" đã bị từ chối. Lý do: ${reason}`
  );
  return item;
};

// ── SESSIONS ───────────────────────────────────────────────

const createSession = (body) => sessionRepo.create(body);

const addAuction = (sessionId, body) => repo.createAuction(sessionId, body);

const removeAuction = (auctionId) => repo.removeAuction(auctionId);

const startSession = (sessionId) => repo.startSession(sessionId);

const pauseSession = (sessionId) => repo.pauseSession(sessionId);

const resumeSession = (sessionId) => repo.resumeSession(sessionId);

const stopSession = (sessionId) => repo.stopSession(sessionId);

const resetTimer = async (auctionId) => {
  const result = await repo.resetTimer(auctionId);
  publishAuctionUpdate(auctionId, {
    currentPrice: result.current_price,
    endTime:      result.end_time,
  });
  return result;
};

const deleteBid = async (bidId) => {
  const result = await repo.deleteBid(bidId);
  publishAuctionUpdate(result.auctionId, {
    currentPrice: result.newPrice,
    winnerId:     result.newWinnerId,
  });
  return result;
};
// ── USERS ──────────────────────────────────────────────────

const getUsers     = (q) => repo.getUsers(q);
const getUser      = (id) => repo.getUserDetail(id);
const updateRole   = (id, role) => repo.updateUserField(id, { role });
const muteUser     = (id) => repo.updateUserField(id, { is_muted: true });
const unmuteUser   = (id) => repo.updateUserField(id, { is_muted: false });

const banUser = async (id, reason) => {
  const updated = await repo.updateUserField(id, {
    is_banned: true,
    banned_at: new Date().toISOString(),
  });
  await notifService.send(
    id,
    NotificationType.MODERATION,
    'Tài khoản bị khóa',
    `Tài khoản của bạn đã bị khóa. Lý do: ${reason || 'Vi phạm điều khoản.'}`
  );
  return updated;
};

const unbanUser = (id) =>
  repo.updateUserField(id, { is_banned: false, banned_at: null });

const kickUser = async (userId, auctionId) => {
  try {
    const { getIo } = require('../../websocket/wsServer');
    const sockets = await getIo().fetchSockets();
    for (const socket of sockets) {
      if (socket.data.userId === userId) {
        socket.leave(`auction:${auctionId}`);
        socket.emit('kicked', { auctionId, message: 'Bạn bị đuổi khỏi phòng đấu giá.' });
      }
    }
  } catch {
    // WS không sẵn sàng
  }
  await notifService.send(
    userId,
    NotificationType.MODERATION,
    'Bị đuổi khỏi phòng',
    'Quản trị viên đã ngắt kết nối của bạn.'
  );
  return { message: 'Đã kick user.' };
};

// ── FINANCE ────────────────────────────────────────────────

const getAdminTransactions = (q) => repo.getTransactions(q);

const approveTransaction = async (txId) => {
  const tx = await repo.approveTransaction(txId);
  // Lấy userId để notify
  const { rows: u } = await query(
    'SELECT user_id FROM wallets WHERE id = $1', [tx.wallet_id]
  );
  if (u.length) {
    const label = tx.type === 'DEPOSIT' ? 'nạp' : 'rút';
    await notifService.send(
      u[0].user_id,
      NotificationType.FINANCE,
      `Yêu cầu ${label} tiền được duyệt`,
      `Yêu cầu ${label} ${parseFloat(tx.amount).toLocaleString('vi-VN')}đ đã được xử lý thành công.`
    );
  }
  return tx;
};

const rejectTransaction = async (txId) => {
  const tx = await repo.rejectTransaction(txId);
  const { rows: u } = await query(
    'SELECT user_id FROM wallets WHERE id = $1', [tx.wallet_id]
  );
  if (u.length) {
    const label = tx.type === 'DEPOSIT' ? 'nạp' : 'rút';
    await notifService.send(
      u[0].user_id,
      NotificationType.FINANCE,
      `Yêu cầu ${label} tiền bị từ chối`,
      `Yêu cầu ${label} ${parseFloat(tx.amount).toLocaleString('vi-VN')}đ đã bị từ chối.`
    );
  }
  return tx;
};

const getP2pMessages = (listingId) => repo.getP2pMessages(listingId);

module.exports = {
  getItems, getItem, approveItem, rejectItem,
  createSession, addAuction, removeAuction,
  startSession, pauseSession, resumeSession, stopSession,
  resetTimer, deleteBid,
  getUsers, getUser, updateRole,
  muteUser, unmuteUser, banUser, unbanUser, kickUser,
  getAdminTransactions, approveTransaction, rejectTransaction,
  getP2pMessages,
};