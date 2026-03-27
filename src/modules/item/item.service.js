const repo = require('./item.repository');
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

module.exports = { createItem, getItem, getInventory, confirmReceipt };