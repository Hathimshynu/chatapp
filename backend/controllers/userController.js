const mongoose = require('mongoose');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { emitToUsers, escapeRegex, isOnline } = require('../utils/realtime');

const PUBLIC_FIELDS = 'name email avatar status lastSeen';
const MAX_INLINE_AVATAR = 3 * 1024 * 1024;

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

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @GET /api/users/me
const getMe = async (req, res) => {
  res.json(req.user);
};

// @GET /api/users/:id
const getUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user' });
    const user = await User.findById(req.params.id).select(PUBLIC_FIELDS).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ ...user, online: isOnline(user._id) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const isValidAvatar = (avatar) => {
  if (avatar === '') return true;
  if (typeof avatar !== 'string') return false;
  if (avatar.startsWith('/api/media/') || /^https:\/\//i.test(avatar)) return avatar.length < 500;
  return /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(avatar) && avatar.length < MAX_INLINE_AVATAR;
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

    // Let everyone who chats with this user refresh their name/photo live.
    const partnerIds = await Conversation.find({ participants: req.user._id }).distinct('participants');
    emitToUsers(partnerIds, 'user:updated', {
      _id: user._id,
      name: user.name,
      avatar: user.avatar,
      status: user.status
    });

    res.json(user);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'That name is already taken' });
    res.status(500).json({ message: error.message });
  }
};

module.exports = { searchUsers, getMe, getUser, updateProfile };
