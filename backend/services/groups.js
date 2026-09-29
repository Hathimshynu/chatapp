const Conversation = require('../models/Conversation');
const { idsEqual, serializeMessage, PARTICIPANT_FIELDS } = require('./messages');
const { maskUser, hiddenReadersFor, maskReads, viewerContext } = require('../utils/privacy');

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

// Per-user view of a conversation (pinned/muted/archived/unread/role are personal).
// `ctx` (utils/privacy viewerContext) masks other people's profile fields and
// hides read receipts where privacy requires it.
const shapeConversation = (conversation, userId, unreadCount = 0, ctx = null) => {
  const lastMessage = conversation.lastMessage;
  const hiddenForMe = lastMessage?.deletedFor?.some(id => idsEqual(id, userId));
  const hiddenReaders = hiddenReadersFor(conversation, userId);
  const other = !conversation.isGroup && (conversation.participants || []).find(p => !idsEqual(p._id || p, userId));
  const shaped = {
    ...conversation,
    participants: ctx ? (conversation.participants || []).map(p => maskUser(p, ctx)) : conversation.participants,
    lastMessage: lastMessage && !hiddenForMe ? maskReads(serializeMessage(lastMessage), userId, hiddenReaders) : null,
    pinned: (conversation.pinnedBy || []).some(id => idsEqual(id, userId)),
    muted: (conversation.mutedBy || []).some(id => idsEqual(id, userId)),
    archived: (conversation.archivedBy || []).some(id => idsEqual(id, userId)),
    pinnedBy: undefined,
    mutedBy: undefined,
    archivedBy: undefined,
    unreadCount
  };
  // Only *my* blocks are revealed ("You blocked this contact"), never theirs.
  if (other && ctx) shaped.blockedByMe = ctx.iBlocked.has(String(other._id || other));
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
  // Profiles are masked per viewer, so the broadcast carries ids only; each client
  // refetches GET /api/groups/:id for its own masked view of the members.
  const participantIds = (participants || []).map(p => String(p._id || p));
  return { _id, isGroup, name, description, avatar, createdBy, members, settings, participantIds, createdAt };
};

// Shape one conversation for a viewer, loading their privacy context.
const shapeForViewer = async (conversation, viewerId, unreadCount = 0) =>
  shapeConversation(conversation, viewerId, unreadCount, await viewerContext(viewerId));

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
  shapeForViewer,
  groupPayload
};
