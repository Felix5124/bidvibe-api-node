const { query } = require('../../config/database.config');
const { WsEvents } = require('../../constants/wsEvents');

module.exports = (io, socket) => {
  socket.on('market:chat', async ({ listingId, content }) => {
    const senderId = socket.data.userId;
    try {
      const { rows: listing } = await query(
        'SELECT seller_id, buyer_id FROM market_listings WHERE id = $1',
        [listingId]
      );
      if (!listing.length) return;

      const { seller_id, buyer_id } = listing[0];
      const receiverId = senderId === seller_id ? buyer_id : seller_id;

      await query(
        `INSERT INTO messages (id, sender_id, receiver_id, market_listing_id, content, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
        [senderId, receiverId, listingId, content]
      );

      if (receiverId) {
        io.to(`user:${receiverId}`).emit(WsEvents.P2P_MESSAGE, {
          senderId,
          marketListingId: listingId,
          content,
          createdAt: new Date(),
        });
      }
    } catch (err) {
      console.error('[WS] market:chat error:', err.message);
    }
  });
};