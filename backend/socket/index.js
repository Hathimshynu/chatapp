const { Server } = require('socket.io');
const User = require('../models/User');
const { userFromToken } = require('../middleware/auth');
const { setIo, isOnline, onlineUserIds, userRoom } = require('../utils/realtime');
const { registerCallHandlers, endCallsForUser } = require('./calls');
const { markPendingDelivered } = require('../controllers/messageController');

// Grace periods so a page refresh or a brief mobile network drop doesn't
// flash "offline" or kill an ongoing call.
const OFFLINE_GRACE_MS = 4000;
const CALL_DROP_GRACE_MS = 20000;

const initSocket = (server, allowedOrigins) => {
  const io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
    pingInterval: 20000,
    pingTimeout: 20000
  });
  setIo(io);

  const offlineTimers = new Map();
  const callDropTimers = new Map();

  // Every socket must present a valid JWT; the user id comes from the token,
  // never from the client, so nobody can impersonate another user.
  io.use(async (socket, next) => {
    const user = await userFromToken(socket.handshake.auth?.token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = String(user._id);
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const cameOnline = !isOnline(userId);
    socket.join(userRoom(userId));

    clearTimeout(offlineTimers.get(userId));
    offlineTimers.delete(userId);
    clearTimeout(callDropTimers.get(userId));
    callDropTimers.delete(userId);

    socket.emit('presence:list', onlineUserIds());
    if (cameOnline) {
      socket.broadcast.emit('presence', { userId, online: true });
      User.updateOne({ _id: userId }, { isOnline: true }).catch(() => {});
    }
    markPendingDelivered(userId).catch(error => console.error('markPendingDelivered:', error.message));

    // ── Typing / recording indicators ────────────────────────────────
    socket.on('typing', ({ conversationId, receiverId, type } = {}) => {
      if (!conversationId || !receiverId) return;
      io.to(userRoom(receiverId)).emit('typing', {
        conversationId: String(conversationId),
        userId,
        type: type === 'recording' ? 'recording' : 'typing'
      });
    });

    socket.on('typing:stop', ({ conversationId, receiverId } = {}) => {
      if (!conversationId || !receiverId) return;
      io.to(userRoom(receiverId)).emit('typing:stop', { conversationId: String(conversationId), userId });
    });

    registerCallHandlers(io, socket);

    socket.on('disconnect', () => {
      if (isOnline(userId)) return; // another tab/device is still connected

      offlineTimers.set(userId, setTimeout(() => {
        offlineTimers.delete(userId);
        if (isOnline(userId)) return;
        const lastSeen = new Date();
        User.updateOne({ _id: userId }, { isOnline: false, lastSeen }).catch(() => {});
        io.emit('presence', { userId, online: false, lastSeen });
      }, OFFLINE_GRACE_MS));

      callDropTimers.set(userId, setTimeout(() => {
        callDropTimers.delete(userId);
        if (!isOnline(userId)) endCallsForUser(userId);
      }, CALL_DROP_GRACE_MS));
    });
  });

  return io;
};

module.exports = initSocket;
