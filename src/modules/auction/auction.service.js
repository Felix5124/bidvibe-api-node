const repo         = require('./auction.repository');
const notifService = require('../notification/notification.service');
const { query }    = require('../../config/database.config');
const { ErrorCode } = require('../../constants/errorCodes');
const { NotificationType } = require('../../constants/enums');
const { publishAuctionUpdate } = require('../../websocket/publishers/auctionPublisher');

const getAuction = async (id) => {
  const auction = await repo.findById(id);
  if (!auction) throw { errorCode: ErrorCode.NOT_FOUND, status: 404, message: 'Auction không tồn tại.' };
  return auction;
};

const getBids = async (auctionId, q) => {
  const auction = await getAuction(auctionId);
  const isSealed = auction.session_type === 'SEALED';
  return repo.findBids(auctionId, q, isSealed);
};

const getMessages = (auctionId, q) => repo.findMessages(auctionId, q);

const placeBid = async (auctionId, userId, amount) => {
  // Check banned
  const { rows: u } = await query(
    'SELECT is_banned FROM users WHERE id = $1', [userId]
  );
  if (u[0]?.is_banned) throw { errorCode: ErrorCode.USER_BANNED, status: 403 };

  const { bid, auction, prevWinnerId } = await repo.placeBid({ auctionId, userId, amount });

  // Broadcast cập nhật giá
  publishAuctionUpdate(auctionId, {
    currentPrice:    auction.current_price,
    winnerId:        auction.winner_id,
    winnerNickname:  null,
    endTime:         auction.end_time,
  });

  // Notify người bị vượt giá
  if (prevWinnerId && prevWinnerId !== userId) {
    await notifService.send(
      prevWinnerId,
      NotificationType.OUTBID,
      'Bạn bị vượt giá!',
      `Có người vừa đặt ${parseFloat(amount).toLocaleString('vi-VN')}đ, vượt qua bạn.`
    );
  }

  // Resolve proxy bids
  const proxyResult = await repo.resolveProxyBids(auctionId, amount, userId);
  if (proxyResult) {
    publishAuctionUpdate(auctionId, {
      currentPrice: proxyResult.auction.current_price,
      winnerId:     proxyResult.auction.winner_id,
      endTime:      proxyResult.auction.end_time,
    });
    // Notify người vừa bid bị proxy vượt
    await notifService.send(
      userId,
      NotificationType.OUTBID,
      'Bị vượt giá tự động!',
      `Proxy bid tự động vừa vượt qua giá của bạn.`
    );
  }

  return bid;
};

const setProxyBid = async (auctionId, userId, maxAmount) => {
  const { rows: u } = await query('SELECT is_banned FROM users WHERE id = $1', [userId]);
  if (u[0]?.is_banned) throw { errorCode: ErrorCode.USER_BANNED, status: 403 };
  return repo.upsertProxyBid(auctionId, userId, maxAmount);
};

const cancelProxyBid = (auctionId, userId) =>
  repo.cancelProxyBid(auctionId, userId);

const sendMessage = async (auctionId, userId, content) => {
  const { rows: u } = await query(
    'SELECT is_muted FROM users WHERE id = $1', [userId]
  );
  if (u[0]?.is_muted) {
    throw { errorCode: ErrorCode.USER_MUTED, status: 403, message: 'Bạn đang bị tắt chat.' };
  }
  const { rows } = await query(
    `INSERT INTO messages (id, sender_id, auction_id, content, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, now())
     RETURNING *`,
    [userId, auctionId, content]
  );
  return rows[0];
};
const buyDutch = async (auctionId, userId) => {
  const { rows: u } = await query('SELECT is_banned FROM users WHERE id = $1', [userId]);
  if (u[0]?.is_banned) throw { errorCode: ErrorCode.USER_BANNED, status: 403 };

  const auction = await repo.buyDutch({ auctionId, userId });

  // Broadcast kết thúc
  const { publishAuctionEnded } = require('../../websocket/publishers/auctionPublisher');
  publishAuctionEnded(auctionId, {
    auctionId,
    winnerId:   auction.winner_id,
    finalPrice: auction.current_price,
    status:     'ENDED',
  });

  // Notify người thắng
  await notifService.send(
    userId,
    NotificationType.AUCTION_WON,
    ' Bạn đã mua thành công!',
    `Bạn vừa mua với giá ${parseFloat(auction.current_price).toLocaleString('vi-VN')}đ.`
  );

  return auction;
};

const placeSealedBid = async (auctionId, userId, amount) => {
  const { rows: u } = await query('SELECT is_banned FROM users WHERE id = $1', [userId]);
  if (u[0]?.is_banned) throw { errorCode: ErrorCode.USER_BANNED, status: 403 };
  return repo.placeSealedBid({ auctionId, userId, amount });
};

module.exports = {
  getAuction, getBids, getMessages,
  placeBid, setProxyBid, cancelProxyBid, sendMessage,
  buyDutch, placeSealedBid,
};