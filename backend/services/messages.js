const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { emitToUsers, isOnline } = require('../utils/realtime');

// Avatars are deliberately not populated on messages: they can be large legacy
// base64 strings and the client already has them from the conversation list.
const MESSAGE_POPULATE = [
  { path: 'sender', select: 'name' },
  {
    path: 'replyTo',
    select: 'text messageType sender deleted media.url media.mimeType media.name media.duration call',
    populate: { path: 'sender', select: 'name' }
  },
  { path: 'system.actor', select: 'name' },
  { path: 'system.targets', select: 'name' }
];

// privacy is loaded so utils/privacy can mask per viewer; maskUser strips it from output.
const PARTICIPANT_FIELDS = 'name email avatar status lastSeen privacy';

const idsEqual = (a, b) => String(a) === String(b);

// Shape a message document for the client (hide per-user bookkeeping).
const serializeMessage = (doc) => {
  const message = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete message.deletedFor;
  delete message.receipts; // exposed only through the message-info endpoint
  delete message.__v;
  if (message.deleted) {
    message.text = '';
    message.media = undefined;
    message.image = '';
    message.audio = '';
    message.reactions = [];
    message.replyTo = null;
    message.statusRef = undefined;
  }
  if (message.replyTo && message.replyTo.deleted) {
    message.replyTo = { _id: message.replyTo._id, deleted: true, sender: message.replyTo.sender };
  }
  return message;
};

const findConversationFor = (userId, conversationId) =>
  Conversation.findOne({ _id: conversationId, participants: userId });

// When a member joined a group; null for direct chats (they see everything).
const memberJoinedAt = (conversation, userId) => {
  if (!conversation?.isGroup) return null;
  const member = (conversation.members || []).find(m => idsEqual(m.user, userId));
  return member?.joinedAt || null;
};

// Group members only see messages sent after they joined (like WhatsApp).
const visibleSinceFilter = (conversation, userId) => {
  const joinedAt = memberJoinedAt(conversation, userId);
  return joinedAt ? { createdAt: { $gte: joinedAt } } : {};
};

const isVisibleTo = (conversation, message, userId) => {
  const joinedAt = memberJoinedAt(conversation, userId);
  return !joinedAt || message.createdAt >= joinedAt;
};

const findOrCreateDirectConversation = async (userA, userB) => {
  let conversation = await Conversation.findOne({
    isGroup: false,
    participants: { $all: [userA, userB], $size: 2 }
  });
  let created = false;
  if (!conversation) {
    conversation = await Conversation.create({ participants: [userA, userB], isGroup: false });
    created = true;
  }
  return { conversation, created };
};

const loadMessage = (messageId) =>
  Message.findById(messageId).populate(MESSAGE_POPULATE);

// Create a message, bump the conversation and fan it out to every participant's
// devices (including the sender's other tabs).
const createAndBroadcastMessage = async ({ conversation, senderId, fields, created = false }) => {
  const otherIds = conversation.participants.filter(id => !idsEqual(id, senderId));
  const isSystem = fields.messageType === 'system';
  const deliveredTo = fields.deliveredTo || (isSystem ? [] : otherIds.filter(id => isOnline(id)));
  const now = new Date();
  const message = await Message.create({
    conversationId: conversation._id,
    sender: senderId,
    ...fields,
    seen: fields.seen || [senderId],
    deliveredTo,
    ...(conversation.isGroup && !isSystem ? {
      recipientCount: otherIds.length,
      receipts: deliveredTo.map(user => ({ user, kind: 'delivered', at: now }))
    } : {})
  });

  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { lastMessage: message._id, updatedAt: now } },
    { timestamps: false }
  );

  const populated = serializeMessage(await loadMessage(message._id));
  emitToUsers(conversation.participants, 'message:new', {
    message: populated,
    conversationId: String(conversation._id),
    conversationCreated: created
  });

  // Web Push for recipients with no open app (lazy require avoids a cycle).
  if (!isSystem) require('./push').notifyNewMessage(conversation, populated, senderId);
  return populated;
};

// `viewerId` gets the returned copy; in direct chats each person gets a copy with
// read receipts masked according to their privacy settings.
const broadcastMessageUpdate = async (conversation, messageId, viewerId = null) => {
  const updated = serializeMessage(await loadMessage(messageId));
  const conversationId = String(conversation._id);
  if (conversation.isGroup) {
    emitToUsers(conversation.participants, 'message:updated', { message: updated, conversationId });
    return updated;
  }
  const { hiddenReadersFor, maskReads } = require('../utils/privacy');
  const people = await User.find({ _id: { $in: conversation.participants } }).select('privacy').lean();
  const view = (userId) => maskReads(updated, userId, hiddenReadersFor({ isGroup: false, participants: people }, userId));
  for (const userId of conversation.participants) {
    emitToUsers([userId], 'message:updated', { message: view(userId), conversationId });
  }
  return viewerId ? view(viewerId) : updated;
};

// ── Group system messages ("Alice added Bob") ─────────────────────
const SYSTEM_TEXT = {
  created: (a, t, v) => `${a} created the group "${v}"`,
  added: (a, t) => `${a} added ${t}`,
  removed: (a, t) => `${a} removed ${t}`,
  left: (a) => `${a} left`,
  joined: (a) => `${a} joined using the invite link`,
  promoted: (a, t, v) => (v === 'auto' ? `${t} is now an admin` : `${a} made ${t} an admin`),
  demoted: (a, t) => `${a} dismissed ${t} as admin`,
  renamed: (a, t, v) => `${a} changed the group name to "${v}"`,
  description: (a) => `${a} changed the group description`,
  avatar: (a) => `${a} changed the group photo`,
  settings: (a) => `${a} changed the group settings`,
  invite_reset: (a) => `${a} reset the invite link`
};

const joinNames = (names) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

const createSystemMessage = async (conversation, actorId, action, { targets = [], value = '' } = {}) => {
  const users = await User.find({ _id: { $in: [actorId, ...targets] } }).select('name').lean();
  const nameOf = (id) => users.find(u => idsEqual(u._id, id))?.name || 'Someone';
  const text = SYSTEM_TEXT[action](nameOf(actorId), joinNames(targets.map(nameOf)), value);
  return createAndBroadcastMessage({
    conversation,
    senderId: actorId,
    fields: { messageType: 'system', text, system: { action, actor: actorId, targets, value } }
  });
};

module.exports = {
  MESSAGE_POPULATE,
  PARTICIPANT_FIELDS,
  idsEqual,
  serializeMessage,
  findConversationFor,
  memberJoinedAt,
  visibleSinceFilter,
  isVisibleTo,
  findOrCreateDirectConversation,
  createAndBroadcastMessage,
  broadcastMessageUpdate,
  createSystemMessage,
  loadMessage
};
