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

      // 2. Lưu vào database
      const { rows: msg } = await query(
        `INSERT INTO messages (id, sender_id, auction_id, content, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, now()) RETURNING id, created_at`,
        [userId, auctionId, content]
      );

      // 3. Broadcast cho cả phòng (Chuẩn hóa key giống ChatMessagePayload.java)
      const wsPayload = {
        event: 'chat_message',
        messageId: msg[0].id,
        senderId: userId,
        senderNickname: u[0]?.nickname,
        senderAvatarUrl: u[0]?.avatar_url,
        receiverId: null,
        auctionId: auctionId,
        content: content,
        timestamp: msg[0].created_at.toISOString()
      };

      const room = WsEvents.ROOM_AUCTION(auctionId);
      
      io.to(room).emit(WsEvents.CHAT_MESSAGE, wsPayload);
    } catch (err) {
      console.error('[WS] auction:chat error:', err.message);
    }
  });
};