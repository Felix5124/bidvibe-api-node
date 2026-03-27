const WsEvents = Object.freeze({
  AUCTION_UPDATE:   'auction_update',
  TIMER_TICK:       'timer_tick',
  DUTCH_PRICE_DROP: 'dutch_price_drop',
  AUCTION_STARTED:  'auction_started',
  AUCTION_ENDED:    'auction_ended',
  SEALED_REVEAL:    'sealed_reveal',
  CHAT_MESSAGE:     'chat_message',
  NOTIFICATION:     'notification',
  P2P_MESSAGE:      'p2p_message',
  ROOM_AUCTION:     (auctionId) => `auction:${auctionId}`,
});

module.exports = { WsEvents };