const repo = require('./item.repository');
const marketRepo = require('../market/market.repository');
const { ErrorCode } = require('../../constants/errorCodes');
const { ItemStatus } = require('../../constants/enums');

const createItem = (userId, body) =>
  repo.create({
    name:           body.name,
    description:    body.description,
    imageUrls:      body.imageUrls || [],
    tags:           body.tags || [],
    rarity:         body.rarity || 'COMMON',
    sellerId:       userId,
    currentOwnerId: userId,
    status:         ItemStatus.PENDING,
  });

const getItem = async (id) => {
  const item = await repo.findById(id);
  if (!item) throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Vật phẩm không tồn tại.' };
  return item;
};

const getInventory = (userId, q) => repo.findByOwner(userId, q);

const confirmReceipt = async (itemId, userId) => {
  const item = await repo.findById(itemId);
  if (!item) {
    throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Vật phẩm không tồn tại.' };
  }
  if (item.current_owner_id !== userId) {
    throw { errorCode: ErrorCode.FORBIDDEN, status: 403, message: 'Bạn không phải chủ sở hữu vật phẩm này.' };
  }
  if (item.status !== ItemStatus.IN_INVENTORY) {
    throw { errorCode: ErrorCode.VALIDATION_ERROR, status: 400, message: 'Vật phẩm không ở trạng thái hợp lệ.' };
  }
  return repo.updateStatus(itemId, ItemStatus.SHIPPED);
};

const deleteRejectedItem = async (itemId, userId) => {
  const item = await repo.findById(itemId);
  if (!item) {
    throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Vật phẩm không tồn tại.' };
  }
  if (item.current_owner_id !== userId) {
    throw { errorCode: ErrorCode.ITEM_NOT_OWNED, status: 403, message: 'Bạn không phải chủ sở hữu vật phẩm này.' };
  }
  if (item.status !== ItemStatus.REJECTED) {
    throw { errorCode: ErrorCode.ITEM_DELETE_NOT_ALLOWED, status: 400, message: 'Chỉ có thể xóa vật phẩm đã bị từ chối.' };
  }
  return repo.remove(itemId);
};

const listOnMarket = async (userId, { itemId, askingPrice }) => {
  const item = await repo.findById(itemId);
  if (!item) {
    throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Vật phẩm không tồn tại.' };
  }
  if (item.current_owner_id !== userId) {
    throw { errorCode: ErrorCode.ITEM_NOT_OWNED, status: 403, message: 'Bạn không phải chủ sở hữu vật phẩm này.' };
  }
  if (item.status !== ItemStatus.IN_INVENTORY) {
    throw { errorCode: ErrorCode.ITEM_NOT_IN_INVENTORY, status: 400, message: 'Vật phẩm không ở trong kho.' };
  }
  const inCooldown = await repo.isInCooldown(itemId);
  if (inCooldown) {
    throw { errorCode: ErrorCode.ITEM_IN_COOLDOWN, status: 400, message: 'Vật phẩm đang trong thời gian chờ.' };
  }
  const listing = await marketRepo.create(userId, itemId, askingPrice);
  return { ...item, listing };
};

module.exports = { createItem, getItem, getInventory, confirmReceipt, deleteRejectedItem, listOnMarket };