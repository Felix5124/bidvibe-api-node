const repo     = require('../repositories/analytics.repository');
const itemRepo = require('../repositories/item.repository');
const { ErrorCode } = require('../constants/errorCodes');

const getPriceHistory = async (itemId) => {
  const item = await itemRepo.findById(itemId);
  if (!item) {
    throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Vật phẩm không tồn tại.' };
  }
  const dataPoints = await repo.getPriceHistory(itemId);
  return { itemId, itemName: item.name, dataPoints };
};

module.exports = { getPriceHistory };