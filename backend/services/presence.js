// Presence (online / last seen), filtered by each user's privacy settings and blocks:
//   everyone → all users (except blocked ones), contacts → contacts only, nobody → no one.
const User = require('../models/User');
const { getIo, isOnline, onlineUserIds, userRoom } = require('../utils/realtime');
const { contactIdsOf, blockedWith, allowed } = require('../utils/privacy');

// Send the user's current presence. People who may not see it get
// `online: false, lastSeen: null`, which also retracts an "online" they saw earlier
// (e.g. right after being blocked or a privacy change).
const broadcastPresence = async (userId, { online = isOnline(userId), lastSeen } = {}) => {
  const io = getIo();
  if (!io) return;
  const id = String(userId);
  const [me, contacts, blocks] = await Promise.all([
    User.findById(id).select('privacy lastSeen').lean(),
    contactIdsOf(id),
    blockedWith(id)
  ]);
  if (!me) return;
  const seenAt = lastSeen || me.lastSeen;
  const payloadFor = (isContact) => {
    const showOnline = online && allowed(me.privacy?.online, isContact);
    const showLastSeen = allowed(me.privacy?.lastSeen, isContact);
    return { userId: id, online: showOnline, lastSeen: !showOnline && showLastSeen && seenAt ? seenAt : null };
  };
  const blockedRooms = [...blocks.any].map(userRoom);
  const contactRooms = [...contacts].filter(c => !blocks.any.has(c)).map(userRoom);

  io.except([userRoom(id), ...blockedRooms, ...contactRooms]).emit('presence', payloadFor(false));
  if (contactRooms.length) io.to(contactRooms).emit('presence', payloadFor(true));
  if (blockedRooms.length) io.to(blockedRooms).emit('presence', { userId: id, online: false, lastSeen: null });
};

// Which online users this viewer is allowed to see as online.
const visibleOnlineFor = async (viewerId) => {
  const viewer = String(viewerId);
  const online = onlineUserIds().filter(id => id !== viewer);
  if (!online.length) return [];
  const [users, contacts, blocks] = await Promise.all([
    User.find({ _id: { $in: online } }).select('privacy').lean(),
    contactIdsOf(viewer),
    blockedWith(viewer)
  ]);
  return users
    .filter(u => !blocks.any.has(String(u._id)) && allowed(u.privacy?.online, contacts.has(String(u._id))))
    .map(u => String(u._id));
};

module.exports = { broadcastPresence, visibleOnlineFor };
