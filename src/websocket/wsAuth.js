const { verifyToken } = require('../config/jwt.config');

const wsAuthMiddleware = async (socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace('Bearer ', '');

  if (!token) return next(new Error('WS_UNAUTHORIZED'));

  try {
    const decoded = await verifyToken(token);
    socket.data.userId = decoded.sub;
    socket.data.email  = decoded.email;
    next();
  } catch {
    next(new Error('WS_TOKEN_INVALID'));
  }
};

module.exports = { wsAuthMiddleware };