const express = require('express');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { escapeRegex } = require('../utils/realtime');
const { scopeFor } = require('../controllers/messageController');

const router = express.Router();
router.use(protect);

const publicAvatar = (avatar) => (avatar && !avatar.startsWith('data:') ? avatar : '');

// @GET /api/search?q=…  → { users, groups, messages }
// The query is always regex-escaped, so input like "(", "[", "*" or "\" is literal.
router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 50);
    if (!q) return res.json({ users: [], groups: [], messages: [] });
    const me = req.user._id;
    const pattern = new RegExp(escapeRegex(q), 'i');

    const conversations = await Conversation.find({ participants: me })
      .select('isGroup name avatar participants members')
      .populate('participants', 'name')
      .lean();

    const users = await User.find({ _id: { $ne: me }, $or: [{ name: pattern }, { email: pattern }] })
      .select('name email avatar status lastSeen')
      .limit(10)
      .lean();

    // Groups I belong to, matched by name or by a member's name.
    const groups = conversations
      .filter(c => c.isGroup)
      .map(c => {
        const member = c.participants.find(p => String(p._id) !== String(me) && pattern.test(p.name));
        return pattern.test(c.name || '') || member
          ? { _id: c._id, name: c.name, avatar: publicAvatar(c.avatar), memberCount: c.participants.length, matchedMember: member && !pattern.test(c.name || '') ? member.name : undefined }
          : null;
      })
      .filter(Boolean)
      .slice(0, 10);

    // Messages in my chats (respecting group join dates and "delete for me").
    const scope = scopeFor(conversations, me);
    const senderIds = [...new Set(conversations.flatMap(c => c.participants).filter(p => pattern.test(p.name)).map(p => String(p._id)))];
    const messages = scope.length ? await Message.find({
      $and: [
        { $or: scope },
        { $or: [{ text: pattern }, { sender: { $in: senderIds }, messageType: { $in: ['text', 'image', 'video', 'file'] } }] }
      ],
      messageType: { $ne: 'system' },
      deleted: { $ne: true },
      deletedFor: { $ne: me }
    })
      .select('text messageType conversationId sender createdAt media.name')
      .populate('sender', 'name')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean() : [];

    res.json({
      users: users.map(u => ({ ...u, avatar: u.avatar })),
      groups,
      messages
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
