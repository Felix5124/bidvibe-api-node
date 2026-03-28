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

module.exports = {
  getItems, getItem, approveItem, rejectItem,
  createSession, addAuction, removeAuction,
  startSession, pauseSession, resumeSession, stopSession,
  resetTimer, deleteBid,
};