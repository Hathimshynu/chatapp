const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { emitToUsers, isOnline } = require('../utils/realtime');

// Avatars are deliberately not populated on messages: they can be large legacy
// base64 strings and the client already has them from the conversation list.
const MESSAGE_POPULATE = [
  { path: 'sender', select: 'name' },
  {
    path: 'replyTo',
    select: 'text messageType sender deleted media.url media.mimeType media.name media.duration call',
    populate: { path: 'sender', select: 'name' }
  }
];

const PARTICIPANT_FIELDS = 'name email avatar status lastSeen';

const idsEqual = (a, b) => String(a) === String(b);

// Shape a message document for the client (hide per-user bookkeeping).
const serializeMessage = (doc) => {
  const message = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete message.deletedFor;
  delete message.__v;
  if (message.deleted) {
    message.text = '';
    message.media = undefined;
    message.image = '';
    message.audio = '';
    message.reactions = [];
    message.replyTo = null;
  }
  if (message.replyTo && message.replyTo.deleted) {
    message.replyTo = { _id: message.replyTo._id, deleted: true, sender: message.replyTo.sender };
  }
  return message;
};

const findConversationFor = (userId, conversationId) =>
  Conversation.findOne({ _id: conversationId, participants: userId });

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
  const message = await Message.create({
    conversationId: conversation._id,
    sender: senderId,
    ...fields,
    seen: fields.seen || [senderId],
    deliveredTo: fields.deliveredTo || otherIds.filter(id => isOnline(id))
  });

  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { lastMessage: message._id, updatedAt: new Date() } },
    { timestamps: false }
  );

  const populated = serializeMessage(await loadMessage(message._id));
  emitToUsers(conversation.participants, 'message:new', {
    message: populated,
    conversationId: String(conversation._id),
    conversationCreated: created
  });
  return populated;
};

const broadcastMessageUpdate = async (conversation, messageId) => {
  const updated = serializeMessage(await loadMessage(messageId));
  emitToUsers(conversation.participants, 'message:updated', {
    message: updated,
    conversationId: String(conversation._id)
  });
  return updated;
};

module.exports = {
  MESSAGE_POPULATE,
  PARTICIPANT_FIELDS,
  idsEqual,
  serializeMessage,
  findConversationFor,
  findOrCreateDirectConversation,
  createAndBroadcastMessage,
  broadcastMessageUpdate,
  loadMessage
};
