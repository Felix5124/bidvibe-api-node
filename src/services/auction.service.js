const repo         = require('../repositories/auction.repository');
const notifService = require('./notification.service');
const { query }    = require('../config/database.config');
const { ErrorCode } = require('../constants/errorCodes');
const { NotificationType } = require('../constants/enums');
const { publishAuctionUpdate } = require('../websocket/publishers/auctionPublisher');

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

  const { rows: bidderInfo } = await query('SELECT nickname, avatar_url, reputation_score FROM users WHERE id = $1', [userId]);

  publishAuctionUpdate(auctionId, {
    auctionId: auctionId,
    currentPrice: parseFloat(auction.current_price),
    status: auction.status,
    endTime: auction.end_time,
    currentLeader: {
      id: userId,
      nickname: bidderInfo[0].nickname,
      avatarUrl: bidderInfo[0].avatar_url,
      reputationScore: parseFloat(bidderInfo[0].reputation_score)
    }
  });

  // Notify người bị vượt giá
  if (prevWinnerId && prevWinnerId !== userId) {
    await notifService.send(
      prevWinnerId,
      NotificationType.OUTBID,
      'Bạn bị vượt giá!',
      `Có người vừa đặt ${parseFloat(amount).toLocaleString('vi-VN')}đ, vượt qua bạn.`,
      auctionId
    );
  }

  // Resolve proxy bids
  const proxyResult = await repo.resolveProxyBids(auctionId, amount, userId);
  if (proxyResult) {
    const { rows: proxyBidderInfo } = await query('SELECT nickname, avatar_url, reputation_score FROM users WHERE id = $1', [proxyResult.auction.winner_id]);
    publishAuctionUpdate(auctionId, {
      auctionId: auctionId,
      currentPrice: parseFloat(proxyResult.auction.current_price),
      status: proxyResult.auction.status,
      endTime: proxyResult.auction.end_time,
      currentLeader: proxyResult.auction.winner_id ? {
        id: proxyResult.auction.winner_id,
        nickname: proxyBidderInfo[0]?.nickname,
        avatarUrl: proxyBidderInfo[0]?.avatar_url,
        reputationScore: parseFloat(proxyBidderInfo[0]?.reputation_score)
      } : null
    });
    // Notify người vừa bid bị proxy vượt
    await notifService.send(
      userId,
      NotificationType.OUTBID,
      'Bị vượt giá tự động!',
      `Proxy bid tự động vừa vượt qua giá của bạn.`,
      auctionId
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
    'SELECT is_muted, nickname, avatar_url, reputation_score FROM users WHERE id = $1', [userId]
  );
  if (u[0]?.is_muted) {
    throw { errorCode: ErrorCode.USER_MUTED, status: 403, message: 'Bạn đang bị tắt chat.' };
  }
  
  const { rows } = await query(
    `INSERT INTO messages (id, sender_id, auction_id, content, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, now())
     RETURNING id, created_at`,
    [userId, auctionId, content]
  );

  const messageId = rows[0].id;
  const createdAt = rows[0].created_at;

  const wsPayload = {
    event: 'chat_message',
    messageId: messageId,
    senderId: userId,
    senderNickname: u[0].nickname,
    senderAvatarUrl: u[0].avatar_url,
    receiverId: null,
    auctionId: auctionId,
    content: content,
    timestamp: createdAt.toISOString()
  };

  try {
    const { getIo } = require('../websocket/wsServer');
    getIo().to(`auction:${auctionId}`).emit('chat_message', wsPayload);
  } catch (e) {
    console.error('[WS Broadcast Error]', e.message);
  }

  return {
    id: messageId,
    auctionId: auctionId,
    content: content,
    createdAt: createdAt,
    sender: {
      id: userId,
      nickname: u[0].nickname,
      avatarUrl: u[0].avatar_url,
      reputationScore: parseFloat(u[0].reputation_score) || 5.0
    },
    receiver: null
  };
};
const buyDutch = async (auctionId, userId) => {
  const { rows: u } = await query('SELECT is_banned FROM users WHERE id = $1', [userId]);
  if (u[0]?.is_banned) throw { errorCode: ErrorCode.USER_BANNED, status: 403 };

  const auction = await repo.buyDutch({ auctionId, userId });

  // Broadcast kết thúc
  const { publishAuctionEnded } = require('../websocket/publishers/auctionPublisher');
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
    `Bạn vừa mua với giá ${parseFloat(auction.current_price).toLocaleString('vi-VN')}đ.`,
    auctionId
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