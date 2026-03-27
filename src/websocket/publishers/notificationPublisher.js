const { WsEvents } = require('../../constants/wsEvents');

const pushNotification = (userId, payload) => {
  try {
    const { getIo } = require('../wsServer');
    getIo().to(`user:${userId}`).emit(WsEvents.NOTIFICATION, payload);
  } catch {
    // WS chưa khởi động — bỏ qua, không crash app
  }
};

module.exports = { pushNotification };