const { query } = require('../../config/database.config');
const { WsEvents } = require('../../constants/wsEvents');

module.exports = (io, socket) => {
  // Client join phòng đấu giá
  socket.on('auction:join', (auctionId) => {
    socket.join(WsEvents.ROOM_AUCTION(auctionId));
    console.log(`[WS] ${socket.data.userId} joined auction:${auctionId}`);
  });

  // Client rời phòng
  socket.on('auction:leave', (auctionId) => {
    socket.leave(WsEvents.ROOM_AUCTION(auctionId));
  });

  // Client gửi chat
  socket.on('auction:chat', async ({ auctionId, content }) => {
    const userId = socket.data.userId;
    try {
      const { rows: u } = await query(
        'SELECT is_muted, nickname, avatar_url FROM users WHERE id = $1',
        [userId]
      );
      if (u[0]?.is_muted) {
        return socket.emit('error', { message: 'Bạn đang bị tắt chat.' });
      }

      await query(
        `INSERT INTO messages (id, sender_id, auction_id, content, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, now())`,
        [userId, auctionId, content]
      );

      io.to(WsEvents.ROOM_AUCTION(auctionId)).emit(WsEvents.CHAT_MESSAGE, {
        senderId:  userId,
        nickname:  u[0]?.nickname,
        avatarUrl: u[0]?.avatar_url,
        content,
        createdAt: new Date(),
      });
    } catch (err) {
      console.error('[WS] auction:chat error:', err.message);
    }
  });
};