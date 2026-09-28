const mongoose = require('mongoose');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { emitToUsers } = require('../utils/realtime');
const {
  MESSAGE_POPULATE,
  PARTICIPANT_FIELDS,
  idsEqual,
  serializeMessage,
  findConversationFor,
  findOrCreateDirectConversation,
  createAndBroadcastMessage,
  broadcastMessageUpdate
} = require('../services/messages');

const SENDABLE_TYPES = ['text', 'image', 'video', 'audio', 'file', 'sticker'];
const MAX_TEXT_LENGTH = 5000;
const EDIT_WINDOW_MS = 15 * 60 * 1000;

const isValidId = (id) => mongoose.isValidObjectId(id);

const populateConversation = (query) => query
  .populate('participants', PARTICIPANT_FIELDS)
  .populate({
    path: 'lastMessage',
    select: '-image -audio -reactions -replyTo',
    populate: { path: 'sender', select: 'name' }
  });

const shapeConversation = (conversation, userId, unreadCount = 0) => {
  const lastMessage = conversation.lastMessage;
  const hiddenForMe = lastMessage?.deletedFor?.some(id => idsEqual(id, userId));
  return {
    ...conversation,
    lastMessage: lastMessage && !hiddenForMe ? serializeMessage(lastMessage) : null,
    pinned: (conversation.pinnedBy || []).some(id => idsEqual(id, userId)),
    muted: (conversation.mutedBy || []).some(id => idsEqual(id, userId)),
    pinnedBy: undefined,
    mutedBy: undefined,
    unreadCount
  };
};

const unreadFilter = (userId) => ({
  sender: { $ne: userId },
  seen: { $ne: userId },
  deleted: { $ne: true },
  deletedFor: { $ne: userId }
});

// @GET /api/messages/conversations
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversations = await populateConversation(
      Conversation.find({ participants: userId })
    ).sort({ updatedAt: -1 }).lean();

    const counts = await Message.aggregate([
      { $match: { conversationId: { $in: conversations.map(c => c._id) }, ...unreadFilter(userId) } },
      { $group: { _id: '$conversationId', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map(c => [String(c._id), c.count]));

    res.json(conversations.map(c => shapeConversation(c, userId, countMap.get(String(c._id)) || 0)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @GET /api/messages/unread-count — total unread, used by the account switcher
const getUnreadCount = async (req, res) => {
  try {
    const conversationIds = await Conversation.find({ participants: req.user._id }).distinct('_id');
    const total = await Message.countDocuments({
      conversationId: { $in: conversationIds },
      ...unreadFilter(req.user._id)
    });
    res.json({ total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @GET /api/messages/:conversationId?before=<ISO date>&limit=40
const getMessages = async (req, res) => {
  try {
    if (!isValidId(req.params.conversationId)) return res.status(400).json({ message: 'Invalid conversation' });
    const conversation = await findConversationFor(req.user._id, req.params.conversationId);
    if (!conversation) return res.status(403).json({ message: 'Access denied' });

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 100);
    const filter = { conversationId: conversation._id, deletedFor: { $ne: req.user._id } };
    if (req.query.before) {
      const before = new Date(req.query.before);
      if (!Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate(MESSAGE_POPULATE)
      .lean();

    res.json({
      messages: messages.reverse().map(serializeMessage),
      hasMore: messages.length === limit
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @GET /api/messages/:conversationId/media — shared photos & videos
const getSharedMedia = async (req, res) => {
  try {
    if (!isValidId(req.params.conversationId)) return res.status(400).json({ message: 'Invalid conversation' });
    const conversation = await findConversationFor(req.user._id, req.params.conversationId);
    if (!conversation) return res.status(403).json({ message: 'Access denied' });

    const media = await Message.find({
      conversationId: conversation._id,
      messageType: { $in: ['image', 'video'] },
      'media.url': { $exists: true, $ne: '' },
      deleted: { $ne: true },
      deletedFor: { $ne: req.user._id }
    })
      .select('messageType media createdAt')
      .sort({ createdAt: -1 })
      .limit(60)
      .lean();
    res.json(media);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const isAllowedMediaUrl = (url) =>
  typeof url === 'string' && (url.startsWith('/api/media/') || /^https:\/\//i.test(url));

// @POST /api/messages/send
const sendMessage = async (req, res) => {
  try {
    const { receiverId, conversationId, replyTo, clientId, forwarded } = req.body;
    const messageType = SENDABLE_TYPES.includes(req.body.messageType) ? req.body.messageType : 'text';
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';

    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ message: `Messages are limited to ${MAX_TEXT_LENGTH} characters` });
    }
    if (messageType === 'text' && !text) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }

    let media;
    if (messageType !== 'text') {
      const input = req.body.media || {};
      if (!isAllowedMediaUrl(input.url)) {
        return res.status(400).json({ message: 'A valid attachment is required' });
      }
      media = {
        url: input.url,
        mimeType: String(input.mimeType || '').slice(0, 100),
        name: String(input.name || '').slice(0, 200),
        size: Number(input.size) || 0,
        duration: Number(input.duration) || 0,
        width: Number(input.width) || 0,
        height: Number(input.height) || 0
      };
    }

    // Resolve the conversation: explicit id, or a 1:1 chat with receiverId.
    let conversation;
    let created = false;
    if (conversationId && isValidId(conversationId)) {
      conversation = await findConversationFor(req.user._id, conversationId);
      if (!conversation) return res.status(403).json({ message: 'Access denied' });
    } else {
      if (!receiverId || !isValidId(receiverId)) {
        return res.status(400).json({ message: 'Receiver is required' });
      }
      if (idsEqual(receiverId, req.user._id)) {
        return res.status(400).json({ message: 'You cannot message yourself' });
      }
      if (!(await User.exists({ _id: receiverId }))) {
        return res.status(404).json({ message: 'User not found' });
      }
      ({ conversation, created } = await findOrCreateDirectConversation(req.user._id, receiverId));
    }

    let replyToId = null;
    if (replyTo && isValidId(replyTo)) {
      const original = await Message.exists({ _id: replyTo, conversationId: conversation._id });
      if (original) replyToId = replyTo;
    }

    const message = await createAndBroadcastMessage({
      conversation,
      senderId: req.user._id,
      created,
      fields: {
        text,
        messageType,
        media,
        replyTo: replyToId,
        forwarded: !!forwarded,
        clientId: typeof clientId === 'string' ? clientId.slice(0, 64) : ''
      }
    });

    const payload = { message, conversationId: conversation._id };
    if (created) {
      payload.conversation = shapeConversation(
        await populateConversation(Conversation.findById(conversation._id)).lean(),
        req.user._id
      );
    }
    res.status(201).json(payload);
  } catch (error) {
    console.error('sendMessage error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @POST /api/messages/:conversationId/read
const markConversationRead = async (req, res) => {
  try {
    if (!isValidId(req.params.conversationId)) return res.status(400).json({ message: 'Invalid conversation' });
    const conversation = await findConversationFor(req.user._id, req.params.conversationId);
    if (!conversation) return res.status(403).json({ message: 'Access denied' });

    const unseen = await Message.find({ conversationId: conversation._id, ...unreadFilter(req.user._id) })
      .select('_id sender')
      .lean();

    // Tell my other tabs/devices the badge is cleared, even when nothing changed.
    emitToUsers([req.user._id], 'conversation:read', { conversationId: String(conversation._id) });
    if (!unseen.length) return res.json({ updated: 0 });

    await Message.updateMany(
      { _id: { $in: unseen.map(m => m._id) } },
      { $addToSet: { seen: req.user._id, deliveredTo: req.user._id } }
    );

    const bySender = new Map();
    for (const message of unseen) {
      const key = String(message.sender);
      if (!bySender.has(key)) bySender.set(key, []);
      bySender.get(key).push(String(message._id));
    }
    for (const [senderId, messageIds] of bySender) {
      emitToUsers([senderId], 'messages:seen', {
        conversationId: String(conversation._id),
        messageIds,
        userId: String(req.user._id)
      });
    }
    res.json({ updated: unseen.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark everything waiting for this user as delivered (called when they come online).
const markPendingDelivered = async (userId) => {
  const conversationIds = await Conversation.find({ participants: userId }).distinct('_id');
  if (!conversationIds.length) return;
  const pending = await Message.find({
    conversationId: { $in: conversationIds },
    sender: { $ne: userId },
    deliveredTo: { $ne: userId },
    deleted: { $ne: true }
  }).select('_id sender conversationId').lean();
  if (!pending.length) return;

  await Message.updateMany(
    { _id: { $in: pending.map(m => m._id) } },
    { $addToSet: { deliveredTo: userId } }
  );

  const groups = new Map();
  for (const message of pending) {
    const key = `${message.sender}:${message.conversationId}`;
    if (!groups.has(key)) groups.set(key, { senderId: String(message.sender), conversationId: String(message.conversationId), messageIds: [] });
    groups.get(key).messageIds.push(String(message._id));
  }
  for (const { senderId, conversationId, messageIds } of groups.values()) {
    emitToUsers([senderId], 'messages:delivered', { conversationId, messageIds, userId: String(userId) });
  }
};

const loadOwnedContext = async (req, res) => {
  if (!isValidId(req.params.messageId)) {
    res.status(400).json({ message: 'Invalid message' });
    return null;
  }
  const message = await Message.findById(req.params.messageId);
  if (!message) {
    res.status(404).json({ message: 'Message not found' });
    return null;
  }
  const conversation = await findConversationFor(req.user._id, message.conversationId);
  if (!conversation) {
    res.status(403).json({ message: 'Access denied' });
    return null;
  }
  return { message, conversation };
};

// @PATCH /api/messages/:messageId  { text }
const editMessage = async (req, res) => {
  try {
    const context = await loadOwnedContext(req, res);
    if (!context) return;
    const { message, conversation } = context;
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';

    if (!idsEqual(message.sender, req.user._id)) return res.status(403).json({ message: 'You can only edit your own messages' });
    if (message.deleted || message.messageType !== 'text') return res.status(400).json({ message: 'This message cannot be edited' });
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
      return res.status(400).json({ message: 'Messages can only be edited within 15 minutes' });
    }
    if (!text || text.length > MAX_TEXT_LENGTH) return res.status(400).json({ message: 'Invalid message text' });

    message.text = text;
    message.edited = true;
    await message.save();
    res.json(await broadcastMessageUpdate(conversation, message._id));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @DELETE /api/messages/:messageId?for=everyone|me
const deleteMessage = async (req, res) => {
  try {
    const context = await loadOwnedContext(req, res);
    if (!context) return;
    const { message, conversation } = context;

    if (req.query.for === 'me') {
      await Message.updateOne({ _id: message._id }, { $addToSet: { deletedFor: req.user._id } });
      emitToUsers([req.user._id], 'message:removed', {
        messageId: String(message._id),
        conversationId: String(conversation._id)
      });
      return res.json({ success: true });
    }

    if (!idsEqual(message.sender, req.user._id)) {
      return res.status(403).json({ message: 'You can only delete your own messages for everyone' });
    }
    message.deleted = true;
    message.text = '';
    message.media = undefined;
    message.image = '';
    message.audio = '';
    message.reactions = [];
    await message.save();
    res.json(await broadcastMessageUpdate(conversation, message._id));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @POST /api/messages/:messageId/react  { emoji } — same emoji again removes it
const reactToMessage = async (req, res) => {
  try {
    const context = await loadOwnedContext(req, res);
    if (!context) return;
    const { message, conversation } = context;
    if (message.deleted) return res.status(400).json({ message: 'Cannot react to a deleted message' });

    const emoji = typeof req.body.emoji === 'string' ? req.body.emoji.trim().slice(0, 16) : '';
    const existing = message.reactions.find(r => idsEqual(r.user, req.user._id));
    message.reactions = message.reactions.filter(r => !idsEqual(r.user, req.user._id));
    if (emoji && existing?.emoji !== emoji) {
      message.reactions.push({ user: req.user._id, emoji });
    }
    await message.save();
    res.json(await broadcastMessageUpdate(conversation, message._id));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @GET /api/messages/single/:messageId
const getSingleMessage = async (req, res) => {
  try {
    const context = await loadOwnedContext(req, res);
    if (!context) return;
    await context.message.populate(MESSAGE_POPULATE);
    res.json(serializeMessage(context.message));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const loadConversation = async (req, res) => {
  if (!isValidId(req.params.conversationId)) {
    res.status(400).json({ message: 'Invalid conversation' });
    return null;
  }
  const conversation = await findConversationFor(req.user._id, req.params.conversationId);
  if (!conversation) res.status(403).json({ message: 'Access denied' });
  return conversation;
};

// @POST /api/messages/conversation/:conversationId/clear — clear chat for me
const clearConversation = async (req, res) => {
  try {
    const conversation = await loadConversation(req, res);
    if (!conversation) return;
    await Message.updateMany(
      { conversationId: conversation._id },
      { $addToSet: { deletedFor: req.user._id, seen: req.user._id } }
    );
    emitToUsers([req.user._id], 'conversation:cleared', { conversationId: String(conversation._id) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const toggleMembership = (field) => async (req, res) => {
  try {
    const conversation = await loadConversation(req, res);
    if (!conversation) return;
    const enabled = typeof req.body.value === 'boolean'
      ? req.body.value
      : !conversation[field].some(id => idsEqual(id, req.user._id));
    await Conversation.updateOne(
      { _id: conversation._id },
      enabled ? { $addToSet: { [field]: req.user._id } } : { $pull: { [field]: req.user._id } },
      { timestamps: false }
    );
    res.json({ value: enabled });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @GET /api/messages/calls/history
const getCallHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversationIds = await Conversation.find({ participants: userId }).distinct('_id');
    const calls = await Message.find({
      conversationId: { $in: conversationIds },
      messageType: 'call',
      deletedFor: { $ne: userId }
    })
      .sort({ createdAt: -1 })
      .limit(80)
      .populate({ path: 'conversationId', select: 'participants', populate: { path: 'participants', select: 'name' } })
      .lean();

    res.json(calls.map(call => {
      const outgoing = idsEqual(call.sender, userId);
      const peer = call.conversationId?.participants?.find(p => !idsEqual(p._id, userId));
      return {
        _id: call._id,
        conversationId: call.conversationId?._id,
        type: call.call?.type || 'audio',
        status: call.call?.status || 'completed',
        duration: call.call?.duration || 0,
        direction: outgoing ? 'outgoing' : 'incoming',
        peer: peer ? { _id: peer._id, name: peer.name } : null,
        createdAt: call.createdAt
      };
    }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getConversations,
  getUnreadCount,
  getMessages,
  getSharedMedia,
  sendMessage,
  markConversationRead,
  markPendingDelivered,
  editMessage,
  deleteMessage,
  reactToMessage,
  getSingleMessage,
  clearConversation,
  togglePin: toggleMembership('pinnedBy'),
  toggleMute: toggleMembership('mutedBy'),
  getCallHistory
};
