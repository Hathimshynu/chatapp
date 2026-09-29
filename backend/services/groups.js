const Conversation = require('../models/Conversation');
const { idsEqual, serializeMessage, PARTICIPANT_FIELDS } = require('./messages');

const MAX_GROUP_MEMBERS = 256;
const PERMISSIONS = ['editInfo', 'sendMessages', 'addMembers'];

const findMember = (conversation, userId) => (conversation.members || []).find(m => idsEqual(m.user, userId));
const isAdmin = (conversation, userId) => findMember(conversation, userId)?.role === 'admin';

// Group setting check: 'all' → any member, 'admins' → admins only.
const can = (conversation, userId, permission) => {
  if (!findMember(conversation, userId)) return false;
  return conversation.settings?.[permission] !== 'admins' || isAdmin(conversation, userId);
};

// ── Membership cache (typing events are authorized on every keystroke) ──
const MEMBERSHIP_TTL_MS = 30 * 1000;
const membershipCache = new Map();

const participantsOf = async (conversationId) => {
  const key = String(conversationId);
  const cached = membershipCache.get(key);
  if (cached && Date.now() - cached.at < MEMBERSHIP_TTL_MS) return cached.ids;
  const conversation = await Conversation.findById(conversationId).select('participants').lean().catch(() => null);
  const ids = conversation ? new Set(conversation.participants.map(String)) : null;
  membershipCache.set(key, { ids, at: Date.now() });
  if (membershipCache.size > 5000) membershipCache.delete(membershipCache.keys().next().value);
  return ids;
};

const invalidateMembership = (conversationId) => membershipCache.delete(String(conversationId));

// ── Shaping ───────────────────────────────────────────────────────
const populateConversation = (query) => query
  .populate('participants', PARTICIPANT_FIELDS)
  .populate({
    path: 'lastMessage',
    select: '-image -audio -reactions -replyTo -receipts',
    populate: [{ path: 'sender', select: 'name' }, { path: 'system.actor', select: 'name' }, { path: 'system.targets', select: 'name' }]
  });

// Per-user view of a conversation (pinned/muted/unread/role are personal).
const shapeConversation = (conversation, userId, unreadCount = 0) => {
  const lastMessage = conversation.lastMessage;
  const hiddenForMe = lastMessage?.deletedFor?.some(id => idsEqual(id, userId));
  const shaped = {
    ...conversation,
    lastMessage: lastMessage && !hiddenForMe ? serializeMessage(lastMessage) : null,
    pinned: (conversation.pinnedBy || []).some(id => idsEqual(id, userId)),
    muted: (conversation.mutedBy || []).some(id => idsEqual(id, userId)),
    pinnedBy: undefined,
    mutedBy: undefined,
    unreadCount
  };
  if (conversation.isGroup) {
    shaped.myRole = findMember(conversation, userId)?.role || null;
    // Invite links are visible to admins only.
    if (shaped.myRole !== 'admin') delete shaped.inviteCode;
  }
  return shaped;
};

// Shared (not per-user) group fields broadcast on changes.
const groupPayload = (conversation) => {
  const plain = typeof conversation.toObject === 'function' ? conversation.toObject() : { ...conversation };
  const { _id, isGroup, name, description, avatar, createdBy, members, settings, participants, createdAt } = plain;
  return { _id, isGroup, name, description, avatar, createdBy, members, settings, participants, createdAt };
};

module.exports = {
  MAX_GROUP_MEMBERS,
  PERMISSIONS,
  findMember,
  isAdmin,
  can,
  participantsOf,
  invalidateMembership,
  populateConversation,
  shapeConversation,
  groupPayload
};
