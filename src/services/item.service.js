const repo = require("../repositories/item.repository");
const marketRepo = require("../repositories/market.repository");
const { ErrorCode } = require("../constants/errorCodes");
const { ItemStatus } = require("../constants/enums");
const { query } = require("../config/database.config");

const createItem = (userId, body) =>
  repo.create({
    name: body.name,
    description: body.description,
    imageUrls: body.imageUrls || [],
    tags: body.tags || [],
    rarity: body.rarity || "COMMON",
    sellerId: userId,
    currentOwnerId: userId,
    status: ItemStatus.PENDING,
  });

const getItem = async (id) => {
  const item = await repo.findById(id);
  if (!item)
    throw {
      errorCode: ErrorCode.NOT_FOUND,
      status: 404,
      message: "Vật phẩm không tồn tại.",
    };
  return item;
};

const getInventory = (userId, q) => repo.findByOwner(userId, q);

const readItemOwnerId = (item) =>
  item?.currentOwner?.id || item?.current_owner_id || item?.owner_id || null;

const requestShipping = async (
  itemId,
  userId,
  { shippingAddress, shippingPhone, updateProfileAddress } = {},
) => {
  const item = await repo.findById(itemId);
  if (!item) {
    throw {
      errorCode: ErrorCode.NOT_FOUND,
      status: 404,
      message: "Vật phẩm không tồn tại.",
    };
  }
  if (readItemOwnerId(item) !== userId) {
    throw {
      errorCode: ErrorCode.FORBIDDEN,
      status: 403,
      message: "Bạn không phải chủ sở hữu vật phẩm này.",
    };
  }
  if (item.status !== ItemStatus.IN_INVENTORY) {
    throw {
      errorCode: ErrorCode.VALIDATION_ERROR,
      status: 400,
      message: "Vật phẩm không ở trạng thái hợp lệ.",
    };
  }
  const normalizedAddress = String(shippingAddress || "").trim();
  if (!normalizedAddress) {
    throw {
      errorCode: ErrorCode.VALIDATION_ERROR,
      status: 400,
      message: "Vui lòng cung cấp địa chỉ giao hàng.",
    };
  }

  const normalizedPhone = String(shippingPhone || "").trim();
  if (!normalizedPhone) {
    throw {
      errorCode: ErrorCode.VALIDATION_ERROR,
      status: 400,
      message: "Vui lòng cung cấp số điện thoại.",
    };
  }

  if (!/^\d{10}$/.test(normalizedPhone)) {
    throw {
      errorCode: ErrorCode.VALIDATION_ERROR,
      status: 400,
      message: "Số điện thoại phải chính xác 10 chữ số.",
    };
  }

  const latestRequest = await repo.findLatestShippingRequest(itemId);
  if (latestRequest && latestRequest.status === "PENDING") {
    throw {
      errorCode: ErrorCode.CONFLICT,
      status: 409,
      message: "Vật phẩm này đã có yêu cầu giao hàng đang chờ duyệt.",
    };
  }
  if (latestRequest && latestRequest.status === "APPROVED") {
    throw {
      errorCode: ErrorCode.CONFLICT,
      status: 409,
      message: "Yêu cầu giao hàng đã được duyệt, vui lòng chờ nhận hàng.",
    };
  }

  const request = await repo.createShippingRequest({
    itemId,
    requesterId: userId,
    shippingAddress: normalizedAddress,
    shippingPhone: normalizedPhone,
  });

  if (updateProfileAddress) {
    await query("UPDATE users SET address = $2, phone = $3 WHERE id = $1", [
      userId,
      normalizedAddress,
      normalizedPhone,
    ]);
  }

  return request;
};

const confirmReceipt = async (itemId, userId) => {
  const item = await repo.findById(itemId);
  if (!item) {
    throw {
      errorCode: ErrorCode.NOT_FOUND,
      status: 404,
      message: "Vật phẩm không tồn tại.",
    };
  }
  if (readItemOwnerId(item) !== userId) {
    throw {
      errorCode: ErrorCode.FORBIDDEN,
      status: 403,
      message: "Bạn không phải chủ sở hữu vật phẩm này.",
    };
  }
  if (item.status !== ItemStatus.IN_INVENTORY) {
    throw {
      errorCode: ErrorCode.VALIDATION_ERROR,
      status: 400,
      message: "Vật phẩm không ở trạng thái hợp lệ.",
    };
  }
  const shippingRequest = await repo.findLatestShippingRequest(itemId);
  if (!shippingRequest || shippingRequest.requester_id !== userId) {
    throw {
      errorCode: ErrorCode.FORBIDDEN,
      status: 403,
      message: "Không tìm thấy yêu cầu giao hàng hợp lệ cho vật phẩm này.",
    };
  }
  if (shippingRequest.status !== "APPROVED") {
    throw {
      errorCode: ErrorCode.VALIDATION_ERROR,
      status: 400,
      message: "Yêu cầu giao hàng chưa được duyệt.",
    };
  }

  await repo.updateShippingRequest(shippingRequest.id, { status: "RECEIVED" });
  return repo.updateStatus(itemId, ItemStatus.SHIPPED);
};

const deleteRejectedItem = async (itemId, userId) => {
  const item = await repo.findById(itemId);
  if (!item) {
    throw {
      errorCode: ErrorCode.NOT_FOUND,
      status: 404,
      message: "Vật phẩm không tồn tại.",
    };
  }
  if (readItemOwnerId(item) !== userId) {
    throw {
      errorCode: ErrorCode.ITEM_NOT_OWNED,
      status: 403,
      message: "Bạn không phải chủ sở hữu vật phẩm này.",
    };
  }
  if (item.status !== ItemStatus.REJECTED) {
    throw {
      errorCode: ErrorCode.ITEM_DELETE_NOT_ALLOWED,
      status: 400,
      message: "Chỉ có thể xóa vật phẩm đã bị từ chối.",
    };
  }
  return repo.remove(itemId);
};

const listOnMarket = async (userId, { itemId, askingPrice }) => {
  const item = await repo.findById(itemId);
  if (!item) {
    throw {
      errorCode: ErrorCode.NOT_FOUND,
      status: 404,
      message: "Vật phẩm không tồn tại.",
    };
  }
  if (readItemOwnerId(item) !== userId) {
    throw {
      errorCode: ErrorCode.ITEM_NOT_OWNED,
      status: 403,
      message: "Bạn không phải chủ sở hữu vật phẩm này.",
    };
  }
  if (item.status !== ItemStatus.IN_INVENTORY) {
    throw {
      errorCode: ErrorCode.ITEM_NOT_IN_INVENTORY,
      status: 400,
      message: "Vật phẩm không ở trong kho.",
    };
  }
  const inCooldown = await repo.isInCooldown(itemId);
  if (inCooldown) {
    throw {
      errorCode: ErrorCode.ITEM_IN_COOLDOWN,
      status: 400,
      message: "Vật phẩm đang trong thời gian chờ.",
    };
  }
  const listing = await marketRepo.create(userId, itemId, askingPrice);
  return { ...item, listing };
};

module.exports = {
  createItem,
  getItem,
  getInventory,
  requestShipping,
  confirmReceipt,
  deleteRejectedItem,
  listOnMarket,
};
