const mongoose = require('mongoose');
const { serverError } = require('../utils/http');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { emitToUsers } = require('../utils/realtime');
const {
  MESSAGE_POPULATE,
  idsEqual,
  serializeMessage,
  findConversationFor,
  findOrCreateDirectConversation,
  createAndBroadcastMessage,
  broadcastMessageUpdate,
  memberJoinedAt,
  visibleSinceFilter,
  isVisibleTo
} = require('../services/messages');
const { populateConversation, shapeConversation, shapeForViewer, can } = require('../services/groups');
const {
  viewerContext, isBlockedEitherWay, hiddenReadersForConversation, maskReads, maskUser
} = require('../utils/privacy');

const SENDABLE_TYPES = ['text', 'image', 'video', 'audio', 'file', 'sticker'];
const MAX_TEXT_LENGTH = 5000;
const EDIT_WINDOW_MS = 15 * 60 * 1000;

const isValidId = (id) => mongoose.isValidObjectId(id);

const unreadFilter = (userId) => ({
  sender: { $ne: userId },
  seen: { $ne: userId },
  messageType: { $ne: 'system' },
  deleted: { $ne: true },
  deletedFor: { $ne: userId }
});

// Messages a user may see across many conversations: everything in direct chats,
// and only messages since they joined in each group.
const scopeFor = (conversations, userId) => {
  const direct = conversations.filter(c => !c.isGroup).map(c => c._id);
  const scope = direct.length ? [{ conversationId: { $in: direct } }] : [];
  for (const c of conversations.filter(g => g.isGroup)) {
    scope.push({ conversationId: c._id, createdAt: { $gte: memberJoinedAt(c, userId) || new Date(0) } });
  }
  return scope;
};

// @GET /api/messages/conversations
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversations = await populateConversation(
      Conversation.find({ participants: userId })
    ).sort({ updatedAt: -1 }).lean();

    const scope = scopeFor(conversations, userId);
    const counts = scope.length ? await Message.aggregate([
      { $match: { $or: scope, ...unreadFilter(userId) } },
      { $group: { _id: '$conversationId', count: { $sum: 1 } } }
    ]) : [];
    const countMap = new Map(counts.map(c => [String(c._id), c.count]));

    const ctx = await viewerContext(userId);
    res.json(conversations.map(c => shapeConversation(c, userId, countMap.get(String(c._id)) || 0, ctx)));
  } catch (error) {
    serverError(res, error);
  }
};

// @GET /api/messages/unread-count — total unread, used by the account switcher
const getUnreadCount = async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id }).select('isGroup members').lean();
    const scope = scopeFor(conversations, req.user._id);
    const total = scope.length ? await Message.countDocuments({ $or: scope, ...unreadFilter(req.user._id) }) : 0;
    res.json({ total });
  } catch (error) {
    serverError(res, error);
  }
};

// @GET /api/messages/:conversationId?before=<ISO date>&limit=40
const getMessages = async (req, res) => {
  try {
    if (!isValidId(req.params.conversationId)) return res.status(400).json({ message: 'Invalid conversation' });
    const conversation = await findConversationFor(req.user._id, req.params.conversationId);
    if (!conversation) return res.status(403).json({ message: 'Access denied' });

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 100);
    const filter = { conversationId: conversation._id, deletedFor: { $ne: req.user._id }, ...visibleSinceFilter(conversation, req.user._id) };
    if (req.query.before) {
      const before = new Date(req.query.before);
      if (!Number.isNaN(before.getTime())) filter.createdAt = { ...filter.createdAt, $lt: before };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate(MESSAGE_POPULATE)
      .lean();

    const hidden = await hiddenReadersForConversation(conversation, req.user._id);
    res.json({
      messages: messages.reverse().map(m => maskReads(serializeMessage(m), req.user._id, hidden)),
      hasMore: messages.length === limit
    });
  } catch (error) {
    serverError(res, error);
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
      deletedFor: { $ne: req.user._id },
      ...visibleSinceFilter(conversation, req.user._id)
    })
      .select('messageType media createdAt')
      .sort({ createdAt: -1 })
      .limit(60)
      .lean();
    res.json(media);
  } catch (error) {
    serverError(res, error);
  }
};

const isAllowedMediaUrl = (url) =>
  typeof url === 'string' && (url.startsWith('/api/media/') || /^https:\/\//i.test(url));

// Blocked direct chats. The blocker is told to unblock; the blocked person gets
// a neutral message that doesn't reveal the block.
const blockedResponse = async (res, me, otherId) => {
  const Block = require('../models/Block');
  const iBlocked = await Block.exists({ blocker: me, blocked: otherId });
  return res.status(403).json({
    message: iBlocked ? 'You blocked this contact. Unblock them to send a message.' : 'Message could not be delivered.',
    code: iBlocked ? 'BLOCKED_BY_YOU' : 'NOT_DELIVERED'
  });
};

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
      if (conversation.isGroup && !can(conversation, req.user._id, 'sendMessages')) {
        return res.status(403).json({ message: 'Only admins can send messages to this group' });
      }
      if (!conversation.isGroup) {
        const otherId = conversation.participants.find(id => !idsEqual(id, req.user._id));
        if (otherId && await isBlockedEitherWay(req.user._id, otherId)) return blockedResponse(res, req.user._id, otherId);
      }
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
      if (await isBlockedEitherWay(req.user._id, receiverId)) return blockedResponse(res, req.user._id, receiverId);
      ({ conversation, created } = await findOrCreateDirectConversation(req.user._id, receiverId));
    }

    let replyToId = null;
    if (replyTo && isValidId(replyTo)) {
      const original = await Message.exists({ _id: replyTo, conversationId: conversation._id, messageType: { $ne: 'system' }, ...visibleSinceFilter(conversation, req.user._id) });
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
      payload.conversation = await shapeForViewer(
        await populateConversation(Conversation.findById(conversation._id)).lean(),
        req.user._id
      );
    }
    res.status(201).json(payload);
  } catch (error) {
    console.error('sendMessage error:', error);
    serverError(res, error);
  }
};

// Add delivered/read receipts with timestamps. The `$ne` filters make each push
// happen at most once per user, so the receipts array stays bounded.
const recordReceipts = async (messageIds, userId, kinds) => {
  const at = new Date();
  if (kinds.includes('delivered')) {
    await Message.updateMany(
      { _id: { $in: messageIds }, deliveredTo: { $ne: userId } },
      { $addToSet: { deliveredTo: userId }, $push: { receipts: { user: userId, kind: 'delivered', at } } }
    );
  }
  if (kinds.includes('read')) {
    await Message.updateMany(
      { _id: { $in: messageIds }, seen: { $ne: userId } },
      { $addToSet: { seen: userId }, $push: { receipts: { user: userId, kind: 'read', at } } }
    );
  }
};

// @POST /api/messages/:conversationId/read
const markConversationRead = async (req, res) => {
  try {
    if (!isValidId(req.params.conversationId)) return res.status(400).json({ message: 'Invalid conversation' });
    const conversation = await findConversationFor(req.user._id, req.params.conversationId);
    if (!conversation) return res.status(403).json({ message: 'Access denied' });

    const unseen = await Message.find({
      conversationId: conversation._id,
      ...unreadFilter(req.user._id),
      ...visibleSinceFilter(conversation, req.user._id)
    })
      .select('_id sender')
      .lean();

    // Tell my other tabs/devices the badge is cleared, even when nothing changed.
    emitToUsers([req.user._id], 'conversation:read', { conversationId: String(conversation._id) });
    if (!unseen.length) return res.json({ updated: 0 });

    await recordReceipts(unseen.map(m => m._id), req.user._id, ['delivered', 'read']);

    const bySender = new Map();
    for (const message of unseen) {
      const key = String(message.sender);
      if (!bySender.has(key)) bySender.set(key, []);
      bySender.get(key).push(String(message._id));
    }
    const hiddenForSender = await hiddenReadersForConversation(conversation, req.user._id);
    for (const [senderId, messageIds] of bySender) {
      if (hiddenForSender) break; // read receipts are off between these two people
      emitToUsers([senderId], 'messages:seen', {
        conversationId: String(conversation._id),
        messageIds,
        userId: String(req.user._id)
      });
    }
    res.json({ updated: unseen.length });
  } catch (error) {
    serverError(res, error);
  }
};

// Mark everything waiting for this user as delivered (called when they come online).
const markPendingDelivered = async (userId) => {
  const conversations = await Conversation.find({ participants: userId }).select('isGroup members').lean();
  const scope = scopeFor(conversations, userId);
  if (!scope.length) return;
  const pending = await Message.find({
    $or: scope,
    sender: { $ne: userId },
    deliveredTo: { $ne: userId },
    messageType: { $ne: 'system' },
    deleted: { $ne: true }
  }).select('_id sender conversationId').lean();
  if (!pending.length) return;

  await recordReceipts(pending.map(m => m._id), userId, ['delivered']);

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
  if (!isVisibleTo(conversation, message, req.user._id) || message.deletedFor?.some(id => idsEqual(id, req.user._id))) {
    res.status(404).json({ message: 'Message not found' });
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
    res.json(await broadcastMessageUpdate(conversation, message._id, req.user._id));
  } catch (error) {
    serverError(res, error);
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

    if (!idsEqual(message.sender, req.user._id) || message.messageType === 'system') {
      return res.status(403).json({ message: 'You can only delete your own messages for everyone' });
    }
    message.deleted = true;
    message.text = '';
    message.media = undefined;
    message.image = '';
    message.audio = '';
    message.reactions = [];
    await message.save();
    res.json(await broadcastMessageUpdate(conversation, message._id, req.user._id));
  } catch (error) {
    serverError(res, error);
  }
};

// @POST /api/messages/:messageId/react  { emoji } — same emoji again removes it
const reactToMessage = async (req, res) => {
  try {
    const context = await loadOwnedContext(req, res);
    if (!context) return;
    const { message, conversation } = context;
    if (message.deleted || message.messageType === 'system') return res.status(400).json({ message: 'Cannot react to this message' });

    const emoji = typeof req.body.emoji === 'string' ? req.body.emoji.trim().slice(0, 16) : '';
    const existing = message.reactions.find(r => idsEqual(r.user, req.user._id));
    message.reactions = message.reactions.filter(r => !idsEqual(r.user, req.user._id));
    if (emoji && existing?.emoji !== emoji) {
      message.reactions.push({ user: req.user._id, emoji });
    }
    await message.save();
    res.json(await broadcastMessageUpdate(conversation, message._id, req.user._id));
  } catch (error) {
    serverError(res, error);
  }
};

// @GET /api/messages/:messageId/info — who received / read your message, and when
const getMessageInfo = async (req, res) => {
  try {
    const context = await loadOwnedContext(req, res);
    if (!context) return;
    const { message, conversation } = context;
    if (!idsEqual(message.sender, req.user._id)) return res.status(403).json({ message: 'Only the sender can view message info' });

    const recipientIds = conversation.participants.filter(id => !idsEqual(id, req.user._id));
    const users = await User.find({ _id: { $in: recipientIds } }).select('name avatar privacy').lean();
    const hidden = await hiddenReadersForConversation(conversation, req.user._id);
    const ctx = await viewerContext(req.user._id);
    const at = (userId, kind) => message.receipts?.find(r => idsEqual(r.user, userId) && r.kind === kind)?.at || null;
    const recipients = users.map(user => {
      const read = !hidden?.has(String(user._id)) && message.seen.some(id => idsEqual(id, user._id));
      const delivered = read || message.deliveredTo.some(id => idsEqual(id, user._id));
      return {
        user: (({ _id, name, avatar }) => ({ _id, name, avatar: avatar?.startsWith('data:') ? '' : avatar }))(maskUser(user, ctx)),
        deliveredAt: delivered ? (at(user._id, 'delivered') || at(user._id, 'read') || true) : null,
        readAt: read ? (at(user._id, 'read') || true) : null
      };
    });
    res.json({ messageId: message._id, sentAt: message.createdAt, recipients });
  } catch (error) {
    serverError(res, error);
  }
};

// @GET /api/messages/single/:messageId
const getSingleMessage = async (req, res) => {
  try {
    const context = await loadOwnedContext(req, res);
    if (!context) return;
    await context.message.populate(MESSAGE_POPULATE);
    const hidden = await hiddenReadersForConversation(context.conversation, req.user._id);
    res.json(maskReads(serializeMessage(context.message), req.user._id, hidden));
  } catch (error) {
    serverError(res, error);
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
    serverError(res, error);
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
    const flag = { pinnedBy: 'pinned', mutedBy: 'muted', archivedBy: 'archived' }[field];
    emitToUsers([req.user._id], 'conversation:updated', { conversationId: String(conversation._id), [flag]: enabled });
    res.json({ value: enabled });
  } catch (error) {
    serverError(res, error);
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
      .populate({ path: 'conversationId', select: 'participants isGroup name avatar', populate: { path: 'participants', select: 'name' } })
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
        peer: !call.conversationId?.isGroup && peer ? { _id: peer._id, name: peer.name } : null,
        group: call.conversationId?.isGroup ? { _id: call.conversationId._id, name: call.conversationId.name, avatar: call.conversationId.avatar || '' } : null,
        participants: call.call?.participants || undefined,
        // Group calls are "missed" per person: did I join?
        joined: call.call?.group ? (call.call.joined || []).some(id => idsEqual(id, userId)) : undefined,
        createdAt: call.createdAt
      };
    }));
  } catch (error) {
    serverError(res, error);
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
  getMessageInfo,
  scopeFor,
  clearConversation,
  togglePin: toggleMembership('pinnedBy'),
  toggleMute: toggleMembership('mutedBy'),
  toggleArchive: toggleMembership('archivedBy'),
  getCallHistory
};
