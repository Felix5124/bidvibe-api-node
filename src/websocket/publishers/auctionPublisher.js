const { WsEvents } = require('../../constants/wsEvents');

const getIo = () => {
  const { getIo: _getIo } = require('../wsServer');
  return _getIo();
};

const publishAuctionUpdate = (auctionId, payload) => {
  try { getIo().to(WsEvents.ROOM_AUCTION(auctionId)).emit(WsEvents.AUCTION_UPDATE, payload); }
  catch { }
};

const publishTimerTick = (auctionId, remainingSeconds, endTime) => {
  try { getIo().to(WsEvents.ROOM_AUCTION(auctionId)).emit(WsEvents.TIMER_TICK, { remainingSeconds, endTime }); }
  catch { }
};

const publishDutchDrop = (auctionId, payload) => {
  try { getIo().to(WsEvents.ROOM_AUCTION(auctionId)).emit(WsEvents.DUTCH_PRICE_DROP, payload); }
  catch { }
};

const publishAuctionEnded = (auctionId, payload) => {
  try { getIo().to(WsEvents.ROOM_AUCTION(auctionId)).emit(WsEvents.AUCTION_ENDED, payload); }
  catch { }
};

const publishSealedReveal = (auctionId, payload) => {
  try { getIo().to(WsEvents.ROOM_AUCTION(auctionId)).emit(WsEvents.SEALED_REVEAL, payload); }
  catch { }
};

module.exports = {
  publishAuctionUpdate,
  publishTimerTick,
  publishDutchDrop,
  publishAuctionEnded,
  publishSealedReveal,
};