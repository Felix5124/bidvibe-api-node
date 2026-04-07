const { WsEvents } = require('../../constants/wsEvents');

const pushNotification = (userId, payload) => {
  try {
    const { getIo } = require('../wsServer');
    getIo().to(`user:${userId}`).emit(WsEvents.NOTIFICATION, payload);
  } catch { }
};
module.exports = { pushNotification };