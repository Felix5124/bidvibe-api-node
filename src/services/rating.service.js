const repo = require("../repositories/rating.repository");
const { query } = require("../config/database.config");
const { ErrorCode } = require("../constants/errorCodes");

const createRating = async (
  fromUserId,
  { toUserId, auctionId, marketListingId, stars, comment },
) => {
  // Validate: đúng 1 trong 2 phải có giá trị
  if ((!auctionId && !marketListingId) || (auctionId && marketListingId)) {
    throw {
      errorCode: ErrorCode.VALIDATION_ERROR,
      status: 400,
      message: "Phải cung cấp đúng một trong auctionId hoặc marketListingId.",
    };
  }

  // Validate sao 1-5
  if (!stars || stars < 1 || stars > 5) {
    throw {
      errorCode: ErrorCode.VALIDATION_ERROR,
      status: 400,
      message: "Số sao phải từ 1 đến 5.",
    };
  }

  let inferredToUserId = null;

  // Validate giao dịch đã hoàn tất
  if (auctionId) {
    const { rows } = await query(
      `SELECT a.status, a.winner_id, i.seller_id
       FROM auctions a
       JOIN items i ON i.id = a.item_id
       WHERE a.id = $1`,
      [auctionId],
    );
    if (!rows.length) {
      throw {
        errorCode: ErrorCode.NOT_FOUND,
        status: 404,
        message: "Auction không tồn tại.",
      };
    }
    if (rows[0].status !== "ENDED") {
      throw {
        errorCode: ErrorCode.TRANSACTION_NOT_COMPLETE,
        status: 400,
        message: "Phiên đấu giá chưa kết thúc.",
      };
    }
    const isWinner = rows[0].winner_id === fromUserId;
    const isSeller = rows[0].seller_id === fromUserId;
    if (!isWinner && !isSeller) {
      throw {
        errorCode: ErrorCode.FORBIDDEN,
        status: 403,
        message: "Bạn không tham gia giao dịch này.",
      };
    }

    inferredToUserId = isWinner ? rows[0].seller_id : rows[0].winner_id;
    if (!inferredToUserId) {
      throw {
        errorCode: ErrorCode.VALIDATION_ERROR,
        status: 400,
        message: "Không xác định được người nhận đánh giá cho auction này.",
      };
    }
  }

  if (marketListingId) {
    const { rows } = await query(
      "SELECT status, seller_id, buyer_id FROM market_listings WHERE id = $1",
      [marketListingId],
    );
    if (!rows.length) {
      throw {
        errorCode: ErrorCode.NOT_FOUND,
        status: 404,
        message: "Listing không tồn tại.",
      };
    }
    if (rows[0].status !== "SOLD") {
      throw {
        errorCode: ErrorCode.TRANSACTION_NOT_COMPLETE,
        status: 400,
        message: "Giao dịch chưa hoàn tất.",
      };
    }
    const isBuyer = rows[0].buyer_id === fromUserId;
    const isSeller = rows[0].seller_id === fromUserId;
    if (!isBuyer && !isSeller) {
      throw {
        errorCode: ErrorCode.FORBIDDEN,
        status: 403,
        message: "Bạn không tham gia giao dịch này.",
      };
    }

    inferredToUserId = isBuyer ? rows[0].seller_id : rows[0].buyer_id;
    if (!inferredToUserId) {
      throw {
        errorCode: ErrorCode.VALIDATION_ERROR,
        status: 400,
        message: "Không xác định được người nhận đánh giá cho giao dịch này.",
      };
    }
  }

  const finalToUserId = toUserId || inferredToUserId;
  if (!finalToUserId) {
    throw {
      errorCode: ErrorCode.VALIDATION_ERROR,
      status: 400,
      message: "Thiếu toUserId và không suy ra được người nhận đánh giá.",
    };
  }

  if (toUserId && inferredToUserId && toUserId !== inferredToUserId) {
    throw {
      errorCode: ErrorCode.VALIDATION_ERROR,
      status: 400,
      message: "toUserId không khớp với giao dịch.",
    };
  }

  if (finalToUserId === fromUserId) {
    throw {
      errorCode: ErrorCode.VALIDATION_ERROR,
      status: 400,
      message: "Không thể tự đánh giá chính mình.",
    };
  }

  return repo.create({
    fromUserId,
    toUserId: finalToUserId,
    auctionId,
    marketListingId,
    stars,
    comment,
  });
};

const getUserRatings = (userId) => repo.findByUserId(userId);

module.exports = { createRating, getUserRatings };
