const repo = require("../repositories/admin.repository");
const itemRepo = require("../repositories/item.repository");
const sessionRepo = require("../repositories/session.repository");
const notifService = require("./notification.service");
const { NotificationType } = require("../constants/enums");
const { ErrorCode } = require("../constants/errorCodes");
const {
  publishAuctionUpdate,
} = require("../websocket/publishers/auctionPublisher");
const { query } = require("../config/database.config");

// ── ITEMS ──────────────────────────────────────────────────

const getItems = (q) => repo.getItems(q);

const getItem = async (id) => {
  const item = await itemRepo.findById(id);
  if (!item) throw { errorCode: ErrorCode.NOT_FOUND, status: 404 };
  return item;
};

const approveItem = async (itemId, { tags, rarity, startPrice }) => {
  const item = await repo.approveItem(itemId, { tags, rarity, startPrice });
  if (!item)
    throw {
      errorCode: ErrorCode.NOT_FOUND,
      status: 404,
      message: "Item không tồn tại hoặc không ở trạng thái PENDING.",
    };
  return item;
};

const rejectItem = async (itemId, reason) => {
  const item = await repo.rejectItem(itemId, reason);
  if (!item)
    throw {
      errorCode: ErrorCode.NOT_FOUND,
      status: 404,
      message: "Item không tồn tại hoặc không ở trạng thái PENDING.",
    };

  await notifService.send(
    item.seller_id,
    NotificationType.ITEM_REJECTED,
    "Vật phẩm bị từ chối",
    `Vật phẩm "${item.name}" đã bị từ chối. Lý do: ${reason}`,
  );
  return item;
};

// ── SESSIONS ───────────────────────────────────────────────

const getSessions = (q) => sessionRepo.findAll(q);

const getSession = async (id) => {
  const session = await sessionRepo.findById(id);
  if (!session) {
    throw {
      errorCode: ErrorCode.NOT_FOUND,
      status: 404,
      message: "Phiên đấu giá không tồn tại.",
    };
  }
  return session;
};

const getSessionAuctions = async (sessionId) => {
  await getSession(sessionId);
  return sessionRepo.findAuctions(sessionId);
};

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
    endTime: result.end_time,
  });
  return result;
};

const deleteBid = async (bidId) => {
  const result = await repo.deleteBid(bidId);
  publishAuctionUpdate(result.auctionId, {
    currentPrice: result.newPrice,
    winnerId: result.newWinnerId,
  });
  return result;
};
// ── USERS ──────────────────────────────────────────────────

const getUsers = (q) => repo.getUsers(q);
const getUser = (id) => repo.getUserDetail(id);
const updateRole = (id, role) => repo.updateUserField(id, { role });
const muteUser = async (id) => {
  const updated = await repo.updateUserField(id, { is_muted: true });
  try {
    await notifService.send(
      id,
      NotificationType.MODERATION,
      "Tài khoản bị tắt chat",
      "Quản trị viên đã tắt chat của bạn.",
    );
  } catch (e) {
    console.error(
      "[AdminService] Failed to send mute notification:",
      e.message,
    );
  }
  return updated;
};
const unmuteUser = (id) => repo.updateUserField(id, { is_muted: false });

const banUser = async (id, reason) => {
  try {
    const updated = await repo.updateUserField(id, {
      is_banned: true,
      banned_at: new Date().toISOString(),
    });
    try {
      await notifService.send(
        id,
        NotificationType.MODERATION,
        "Tài khoản bị khóa",
        `Tài khoản của bạn đã bị khóa. Lý do: ${reason || "Vi phạm điều khoản."}`,
      );
    } catch (e) {
      console.error(
        "[AdminService] Failed to send ban notification:",
        e.message,
      );
    }
    return updated;
  } catch (err) {
    console.error("[banUser] Error:", err);
    throw err;
  }
};

const unbanUser = (id) =>
  repo.updateUserField(id, { is_banned: false, banned_at: null });

const kickUser = async (userId, auctionId) => {
  try {
    const { getIo } = require("../websocket/wsServer");
    const sockets = await getIo().fetchSockets();
    for (const socket of sockets) {
      if (socket.data.userId === userId) {
        socket.leave(`auction:${auctionId}`);
        socket.emit("kicked", {
          auctionId,
          message: "Bạn bị đuổi khỏi phòng đấu giá.",
        });
      }
    }
  } catch {
    // WS không sẵn sàng
  }
  await notifService.send(
    userId,
    NotificationType.MODERATION,
    "Bị đuổi khỏi phòng",
    "Quản trị viên đã ngắt kết nối của bạn.",
  );
  return { message: "Đã kick user." };
};

// ── FINANCE ────────────────────────────────────────────────

const walletService = require("./wallet.service");

const getAdminTransactions = (q) => repo.getTransactions(q);

const getPendingTransactions = () => walletService.getPendingTransactions();

const approveDeposit = (txId) => walletService.approveDeposit(txId);
const rejectDeposit = (txId) => walletService.rejectDeposit(txId);
const approveWithdraw = (txId) => walletService.approveWithdraw(txId);
const rejectWithdraw = (txId) => walletService.rejectWithdraw(txId);

const approveTransaction = async (txId) => {
  const tx = await repo.approveTransaction(txId);
  // Lấy userId để notify
  const { rows: u } = await query("SELECT user_id FROM wallets WHERE id = $1", [
    tx.wallet_id,
  ]);
  if (u.length) {
    const label = tx.type === "DEPOSIT" ? "nạp" : "rút";
    await notifService.send(
      u[0].user_id,
      NotificationType.FINANCE,
      `Yêu cầu ${label} tiền được duyệt`,
      `Yêu cầu ${label} ${parseFloat(tx.amount).toLocaleString("vi-VN")}đ đã được xử lý thành công.`,
    );
  }
  return tx;
};

const rejectTransaction = async (txId) => {
  const tx = await repo.rejectTransaction(txId);
  const { rows: u } = await query("SELECT user_id FROM wallets WHERE id = $1", [
    tx.wallet_id,
  ]);
  if (u.length) {
    const label = tx.type === "DEPOSIT" ? "nạp" : "rút";
    await notifService.send(
      u[0].user_id,
      NotificationType.FINANCE,
      `Yêu cầu ${label} tiền bị từ chối`,
      `Yêu cầu ${label} ${parseFloat(tx.amount).toLocaleString("vi-VN")}đ đã bị từ chối.`,
    );
  }
  return tx;
};

const getP2pMessages = (listingId) => repo.getP2pMessages(listingId);

const getShippingRequests = (q) => repo.getShippingRequests(q);

const approveShippingRequest = async (requestId) => {
  const updated = await repo.updateShippingRequestStatus({
    id: requestId,
    status: "APPROVED",
    adminNote: null,
  });
  if (!updated) {
    throw {
      errorCode: ErrorCode.NOT_FOUND,
      status: 404,
      message: "Yêu cầu giao hàng không tồn tại.",
    };
  }

  try {
    await notifService.send(
      updated.requester_id,
      NotificationType.FINANCE,
      "Yêu cầu giao hàng đã được duyệt",
      "Yêu cầu giao hàng của bạn đã được admin duyệt. Vui lòng chờ nhận hàng.",
    );
  } catch (e) {
    console.error(
      "[AdminService] Failed to send shipping approve notification:",
      e.message,
    );
  }

  return updated;
};

const rejectShippingRequest = async (requestId, reason) => {
  const updated = await repo.updateShippingRequestStatus({
    id: requestId,
    status: "REJECTED",
    adminNote: reason || "Thông tin giao hàng chưa hợp lệ.",
  });
  if (!updated) {
    throw {
      errorCode: ErrorCode.NOT_FOUND,
      status: 404,
      message: "Yêu cầu giao hàng không tồn tại.",
    };
  }

  try {
    await notifService.send(
      updated.requester_id,
      NotificationType.FINANCE,
      "Yêu cầu giao hàng bị từ chối",
      `Yêu cầu giao hàng của bạn bị từ chối. Lý do: ${updated.admin_note || "Không có."}`,
    );
  } catch (e) {
    console.error(
      "[AdminService] Failed to send shipping reject notification:",
      e.message,
    );
  }

  return updated;
};
// ── ANALYTICS ─────────────────────────────────────────────

const getOverview = () => repo.getOverview();
const getRevenue = (q) => repo.getRevenue(q);
const getAuctionStats = () => repo.getAuctionStats();
const getMarketStats = () => repo.getMarketStats();

module.exports = {
  getItems,
  getItem,
  approveItem,
  rejectItem,
  getSessions,
  getSession,
  getSessionAuctions,
  createSession,
  addAuction,
  removeAuction,
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  resetTimer,
  deleteBid,
  getUsers,
  getUser,
  updateRole,
  muteUser,
  unmuteUser,
  banUser,
  unbanUser,
  kickUser,
  getAdminTransactions,
  getPendingTransactions,
  approveTransaction,
  rejectTransaction,
  approveDeposit,
  rejectDeposit,
  approveWithdraw,
  rejectWithdraw,
  getP2pMessages,
  getShippingRequests,
  approveShippingRequest,
  rejectShippingRequest,
  getOverview,
  getRevenue,
  getAuctionStats,
  getMarketStats,
};
