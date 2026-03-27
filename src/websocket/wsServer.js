const { Server } = require('socket.io');
const { wsAuthMiddleware } = require('./wsAuth');
const auctionChatHandler = require('./handlers/auctionChat.handler');
const p2pChatHandler     = require('./handlers/p2pChat.handler');

let io;

const initWs = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin:      process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use(wsAuthMiddleware);

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    console.log(`[WS] Connected: ${userId}`);

    // Auto join personal room để nhận notification
    socket.join(`user:${userId}`);

    auctionChatHandler(io, socket);
    p2pChatHandler(io, socket);

    socket.on('disconnect', () => {
      console.log(`[WS] Disconnected: ${userId}`);
    });
  });

  return io;
};

const getIo = () => {
  if (!io) throw new Error('WebSocket chưa được khởi động');
  return io;
};

module.exports = { initWs, getIo };