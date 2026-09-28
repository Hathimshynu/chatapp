// Single place that owns the Socket.io instance so controllers and socket
// handlers can push events to users without passing `io` around.
let io = null;

const userRoom = (userId) => `user-${String(userId)}`;

const setIo = (instance) => { io = instance; };
const getIo = () => io;

// A user is online while at least one of their sockets (tab/device) is connected.
const isOnline = (userId) => !!io && (io.sockets.adapter.rooms.get(userRoom(userId))?.size || 0) > 0;

const onlineUserIds = () => {
  if (!io) return [];
  const ids = [];
  for (const [room, sockets] of io.sockets.adapter.rooms) {
    if (room.startsWith('user-') && sockets.size > 0) ids.push(room.slice(5));
  }
  return ids;
};

const emitToUsers = (userIds, event, payload) => {
  if (!io) return;
  const rooms = [...new Set(userIds.filter(Boolean).map(userRoom))];
  if (rooms.length) io.to(rooms).emit(event, payload);
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { setIo, getIo, isOnline, onlineUserIds, emitToUsers, userRoom, escapeRegex };
