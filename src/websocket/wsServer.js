const { Server } = require('socket.io');
const { wsAuthMiddleware } = require('./wsAuth');
const auctionChatHandler = require('./handlers/auctionChat.handler');
const p2pChatHandler     = require('./handlers/p2pChat.handler');

let io;

const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (configuredOrigins.includes(origin)) return true;

  const isDev = (process.env.NODE_ENV || 'development') !== 'production';
  return isDev && /^http:\/\/localhost:\d+$/.test(origin);
};

const initWs = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin:      (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use(wsAuthMiddleware);

  io.on('connection', (socket) => {
    const userId = socket.data.userId;

    socket.join(`user:${userId}`);

    auctionChatHandler(io, socket);
    p2pChatHandler(io, socket);

    socket.on('disconnect', () => {
    });
  });

  return io;
};

const getIo = () => {
  if (!io) throw new Error('WebSocket chưa được khởi động');
  return io;
};

module.exports = { initWs, getIo };