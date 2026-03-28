const repo         = require('./market.repository');
const { query }    = require('../../config/database.config');
const { ErrorCode } = require('../../constants/errorCodes');
const notifService = require('../notification/notification.service');
const { NotificationType } = require('../../constants/enums');
const { WsEvents } = require('../../constants/wsEvents');

const getListings  = (q) => repo.findAll(q);

const getListing = async (id) => {
  const listing = await repo.findById(id);
  if (!listing) throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Listing không tồn tại.' };
  return listing;
};

const createListing = async (userId, { itemId, askingPrice }) => {
  // Validate item
  const { rows } = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  const item = rows[0];

  if (!item) {
    throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Vật phẩm không tồn tại.' };
  }
  if (item.current_owner_id !== userId) {
    throw { errorCode: ErrorCode.FORBIDDEN, status: 403, message: 'Bạn không sở hữu vật phẩm này.' };
  }
  if (item.status !== 'IN_INVENTORY') {
    throw { errorCode: ErrorCode.ITEM_NOT_IN_INVENTORY, status: 400, message: 'Vật phẩm phải ở trong kho.' };
  }
  if (item.cooldown_until && new Date(item.cooldown_until) > new Date()) {
    const cooldownEnd = new Date(item.cooldown_until).toLocaleString('vi-VN');
    throw { errorCode: ErrorCode.ITEM_IN_COOLDOWN, status: 400, message: `Vật phẩm đang trong thời gian chờ đến ${cooldownEnd}.` };
  }

  // Kiểm tra chưa có listing ACTIVE
  const { rows: existing } = await query(
    "SELECT id FROM market_listings WHERE item_id = $1 AND status = 'ACTIVE'",
    [itemId]
  );
  if (existing.length) {
    throw { errorCode: ErrorCode.ITEM_ALREADY_LISTED, status: 400, message: 'Vật phẩm đã được niêm yết.' };
  }

  return repo.create(userId, itemId, askingPrice);
};

const cancelListing = async (listingId, userId) => {
  const result = await repo.cancel(listingId, userId);
  if (!result) throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Listing không tồn tại hoặc không thể hủy.' };
  return result;
};

const buyListing = async (listingId, buyerId) => {
  // Check banned
  const { rows: u } = await query('SELECT is_banned FROM users WHERE id = $1', [buyerId]);
  if (u[0]?.is_banned) throw { errorCode: ErrorCode.USER_BANNED, status: 403 };

  const listing = await repo.buy(listingId, buyerId);

  // Notify seller
  await notifService.send(
    listing.seller_id,
    NotificationType.FINANCE,
    '💰 Bán hàng thành công!',
    `Vật phẩm của bạn vừa được mua với giá ${parseFloat(listing.asking_price).toLocaleString('vi-VN')}đ.`
  );

  return listing;
};

const getMessages = (listingId, userId) =>
  repo.findMessages(listingId, userId);

const sendMessage = async (listingId, senderId, content) => {
  const { message, receiverId } = await repo.createMessage(listingId, senderId, content);

  // Push WS cho người nhận
  if (receiverId) {
    try {
      const { getIo } = require('../../websocket/wsServer');
      getIo().to(`user:${receiverId}`).emit(WsEvents.P2P_MESSAGE, {
        senderId,
        marketListingId: listingId,
        content,
        createdAt: message.created_at,
      });
    } catch {
      // WS chưa sẵn sàng — bỏ qua
    }
  }

  return message;
};

module.exports = {
  getListings, getListing, createListing,
  cancelListing, buyListing,
  getMessages, sendMessage,
};