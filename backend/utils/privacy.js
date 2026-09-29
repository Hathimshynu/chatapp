// Blocking + privacy rules, enforced on the server for every viewer.
// "Contacts" = people you have a direct (1:1) chat with — the relation is symmetric.
const Block = require('../models/Block');
const Conversation = require('../models/Conversation');

const idStr = (value) => String(value?._id || value);

const contactIdsOf = async (userId) => {
  const ids = await Conversation.find({ isGroup: { $ne: true }, participants: userId }).distinct('participants');
  return new Set(ids.map(String).filter(id => id !== String(userId)));
};

// Everyone who shares any conversation (direct or group) with the user.
const coParticipantIdsOf = async (userId) => {
  const ids = await Conversation.find({ participants: userId }).distinct('participants');
  return new Set(ids.map(String).filter(id => id !== String(userId)));
};

// Users with a block relation to `userId` in either direction.
const blockedWith = async (userId) => {
  const rows = await Block.find({ $or: [{ blocker: userId }, { blocked: userId }] }).select('blocker blocked').lean();
  const ids = new Set();
  const iBlocked = new Set();
  for (const row of rows) {
    if (idStr(row.blocker) === String(userId)) { ids.add(idStr(row.blocked)); iBlocked.add(idStr(row.blocked)); }
    else ids.add(idStr(row.blocker));
  }
  return { any: ids, iBlocked };
};

const isBlockedEitherWay = async (a, b) =>
  !!(await Block.exists({ $or: [{ blocker: a, blocked: b }, { blocker: b, blocked: a }] }));

const allowed = (setting, isContact) => (setting || 'everyone') === 'everyone' || (setting === 'contacts' && isContact);

// Everything needed to mask other people for one viewer (2 small queries).
const viewerContext = async (viewerId) => {
  const [contacts, blocks] = await Promise.all([contactIdsOf(viewerId), blockedWith(viewerId)]);
  return { viewerId: String(viewerId), contacts, blocked: blocks.any, iBlocked: blocks.iBlocked };
};

// Copy of `user` with fields hidden according to *their* privacy settings and blocks.
const maskUser = (user, ctx) => {
  if (!user || typeof user !== 'object') return user;
  const out = { ...user };
  const self = idStr(user._id) === ctx.viewerId;
  delete out.privacy;
  delete out.pushPreview;
  delete out.isOnline;
  if (self) return out;
  const privacy = user.privacy || {};
  const isContact = ctx.contacts.has(idStr(user._id));
  const blocked = ctx.blocked.has(idStr(user._id));
  if (blocked || !allowed(privacy.profilePhoto, isContact)) out.avatar = '';
  if (blocked || !allowed(privacy.about, isContact)) out.status = '';
  if (blocked || !allowed(privacy.lastSeen, isContact)) out.lastSeen = null;
  return out;
};

const canSeeOnline = (user, ctx) => {
  const id = idStr(user._id);
  if (id === ctx.viewerId) return true;
  return !ctx.blocked.has(id) && allowed(user.privacy?.online, ctx.contacts.has(id));
};

// Read receipts in direct chats: hidden if either person turned them off
// (WhatsApp's reciprocal rule). Group receipts are always shown.
const hiddenReadersFor = (conversation, viewerId) => {
  if (!conversation || conversation.isGroup) return null;
  const people = conversation.participants || [];
  const me = people.find(p => idStr(p) === String(viewerId));
  const other = people.find(p => idStr(p) !== String(viewerId));
  if (!other) return null;
  const off = (p) => p && typeof p === 'object' && p.privacy?.readReceipts === false;
  return off(me) || off(other) ? new Set([idStr(other)]) : null;
};

// Same rule for a conversation whose participants are plain ids (loads their settings).
const hiddenReadersForConversation = async (conversation, viewerId) => {
  if (!conversation || conversation.isGroup) return null;
  const User = require('../models/User');
  const people = await User.find({ _id: { $in: conversation.participants } }).select('privacy').lean();
  return hiddenReadersFor({ isGroup: false, participants: people }, viewerId);
};

const maskReads = (message, viewerId, hidden) => {
  if (!message || !hidden || idStr(message.sender) !== String(viewerId)) return message;
  return { ...message, seen: (message.seen || []).filter(id => !hidden.has(idStr(id))) };
};

module.exports = {
  contactIdsOf, coParticipantIdsOf, blockedWith, isBlockedEitherWay, allowed,
  viewerContext, maskUser, canSeeOnline, hiddenReadersFor, hiddenReadersForConversation, maskReads, idStr
};
