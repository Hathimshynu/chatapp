const mongoose = require('mongoose');
const { serverError } = require('../utils/http');
const User = require('../models/User');
const Block = require('../models/Block');
const Conversation = require('../models/Conversation');
const { emitToUsers, escapeRegex, isOnline } = require('../utils/realtime');
const { viewerContext, maskUser, canSeeOnline, contactIdsOf, blockedWith } = require('../utils/privacy');
const { broadcastPresence } = require('../services/presence');

const PUBLIC_FIELDS = 'name email avatar status lastSeen privacy';
const MAX_INLINE_AVATAR = 3 * 1024 * 1024;
const VISIBILITY = ['everyone', 'contacts', 'nobody'];

// @GET /api/users/search?query=name
const searchUsers = async (req, res) => {
  try {
    const query = String(req.query.query || '').trim().slice(0, 50);
    if (!query) return res.json([]);
    const pattern = new RegExp(escapeRegex(query), 'i');

    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [{ name: pattern }, { email: pattern }]
    }).select(PUBLIC_FIELDS).limit(20).lean();

    const ctx = await viewerContext(req.user._id);
    res.json(users.map(u => maskUser(u, ctx)));
  } catch (error) {
    serverError(res, error);
  }
};

// @GET /api/users/me
const getMe = async (req, res) => {
  const { privacy, pushPreview, ...me } = req.user;
  res.json({ ...me, privacy: privacy || {}, pushPreview });
};

// @GET /api/users/:id
const getUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user' });
    const user = await User.findById(req.params.id).select(PUBLIC_FIELDS).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    const ctx = await viewerContext(req.user._id);
    res.json({
      ...maskUser(user, ctx),
      online: isOnline(user._id) && canSeeOnline(user, ctx),
      blockedByMe: ctx.iBlocked.has(String(user._id))
    });
  } catch (error) {
    serverError(res, error);
  }
};

const isValidAvatar = (avatar) => {
  if (avatar === '') return true;
  if (typeof avatar !== 'string') return false;
  if (avatar.startsWith('/api/media/') || /^https:\/\//i.test(avatar)) return avatar.length < 500;
  return /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(avatar) && avatar.length < MAX_INLINE_AVATAR;
};

// Tell everyone who chats with this user about a profile change — each person
// gets a copy masked by the user's privacy settings for *them*.
const broadcastProfile = async (userId) => {
  const id = String(userId);
  const [user, partners, contacts, blocks] = await Promise.all([
    User.findById(id).select(PUBLIC_FIELDS).lean(),
    Conversation.find({ participants: id }).distinct('participants'),
    contactIdsOf(id),
    blockedWith(id)
  ]);
  for (const partner of partners.map(String)) {
    if (partner === id) {
      emitToUsers([id], 'user:updated', { _id: id, name: user.name, avatar: user.avatar, status: user.status });
      continue;
    }
    // The partner's view of me: contact iff I'm in their contacts (symmetric).
    const ctx = { viewerId: partner, contacts: new Set(contacts.has(partner) ? [id] : []), blocked: new Set(blocks.any.has(partner) ? [id] : []) };
    const masked = maskUser(user, ctx);
    emitToUsers([partner], 'user:updated', { _id: id, name: masked.name, avatar: masked.avatar, status: masked.status });
  }
};

// @PUT /api/users/profile
const updateProfile = async (req, res) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name || name.length > 50) return res.status(400).json({ message: 'Name must be 1–50 characters' });
      const taken = await User.exists({ name, _id: { $ne: req.user._id } });
      if (taken) return res.status(400).json({ message: 'That name is already taken' });
      updates.name = name;
    }
    if (req.body.status !== undefined) {
      updates.status = String(req.body.status).trim().slice(0, 139);
    }
    if (req.body.avatar !== undefined) {
      if (!isValidAvatar(req.body.avatar)) return res.status(400).json({ message: 'Invalid profile photo' });
      updates.avatar = req.body.avatar;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { returnDocument: 'after', runValidators: true })
      .select('-password')
      .lean();
    await broadcastProfile(req.user._id);
    res.json(user);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'That name is already taken' });
    serverError(res, error);
  }
};

// @GET /api/users/privacy
const getPrivacy = async (req, res) => {
  const privacy = req.user.privacy || {};
  res.json({
    lastSeen: privacy.lastSeen || 'everyone',
    online: privacy.online || 'everyone',
    profilePhoto: privacy.profilePhoto || 'everyone',
    about: privacy.about || 'everyone',
    readReceipts: privacy.readReceipts !== false
  });
};

// @PUT /api/users/privacy  { lastSeen?, online?, profilePhoto?, about?, readReceipts? }
const updatePrivacy = async (req, res) => {
  try {
    const set = {};
    for (const key of ['lastSeen', 'online', 'profilePhoto', 'about']) {
      if (req.body[key] === undefined) continue;
      if (!VISIBILITY.includes(req.body[key])) return res.status(400).json({ message: `Invalid value for ${key}` });
      set[`privacy.${key}`] = req.body[key];
    }
    if (req.body.readReceipts !== undefined) {
      if (typeof req.body.readReceipts !== 'boolean') return res.status(400).json({ message: 'readReceipts must be true or false' });
      set['privacy.readReceipts'] = req.body.readReceipts;
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: set }, { returnDocument: 'after' }).select('privacy').lean();
    // Apply immediately: re-send presence and profile with the new rules.
    await Promise.all([broadcastPresence(req.user._id), broadcastProfile(req.user._id)]);
    req.user.privacy = user.privacy;
    return getPrivacy(req, res);
  } catch (error) {
    serverError(res, error);
  }
};

// @GET /api/users/blocked
const listBlocked = async (req, res) => {
  try {
    // Photos are hidden in both directions while blocked, so the list shows names only.
    const rows = await Block.find({ blocker: req.user._id }).sort({ createdAt: -1 }).populate('blocked', 'name').lean();
    res.json(rows.filter(r => r.blocked).map(r => ({
      _id: r.blocked._id,
      name: r.blocked.name,
      blockedAt: r.createdAt
    })));
  } catch (error) {
    serverError(res, error);
  }
};

// @POST /api/users/:id/block   and   @DELETE /api/users/:id/block
const setBlocked = (block) => async (req, res) => {
  try {
    const me = String(req.user._id);
    const target = req.params.id;
    if (!mongoose.isValidObjectId(target)) return res.status(400).json({ message: 'Invalid user' });
    if (target === me) return res.status(400).json({ message: "You can't block yourself" });
    if (!(await User.exists({ _id: target }))) return res.status(404).json({ message: 'User not found' });

    if (block) await Block.updateOne({ blocker: me, blocked: target }, { $setOnInsert: { blocker: me, blocked: target } }, { upsert: true });
    else await Block.deleteOne({ blocker: me, blocked: target });

    // My other tabs update their UI; the other person is not told.
    emitToUsers([me], 'block:updated', { userId: target, blocked: block });
    // Presence and profile visibility change both ways.
    await Promise.all([broadcastPresence(me), broadcastPresence(target), broadcastProfile(me), broadcastProfile(target)]);
    res.json({ userId: target, blocked: block });
  } catch (error) {
    serverError(res, error);
  }
};

module.exports = {
  searchUsers, getMe, getUser, updateProfile, getPrivacy, updatePrivacy,
  listBlocked, block: setBlocked(true), unblock: setBlocked(false)
};
