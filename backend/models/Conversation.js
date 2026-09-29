const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// Groups are conversations with isGroup=true. `participants` is the membership
// index shared by direct chats and groups (every access check queries it), while
// `members` carries the group-only metadata (role, join time). Both are always
// updated together by services/groups.js. Group size is capped (MAX_GROUP_MEMBERS),
// so neither array can grow without bound.
const memberSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['admin', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const permission = { type: String, enum: ['all', 'admins'], default: 'all' };

const conversationSchema = new mongoose.Schema({
  participants: [{ type: ObjectId, ref: 'User' }],
  lastMessage: { type: ObjectId, ref: 'Message' },
  isGroup: { type: Boolean, default: false },

  // ── Group-only fields ──────────────────────────────────────────
  name: { type: String, trim: true, maxlength: 60 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  avatar: { type: String, default: '' },
  createdBy: { type: ObjectId, ref: 'User' },
  members: { type: [memberSchema], default: undefined },
  settings: {
    type: new mongoose.Schema({
      editInfo: { ...permission, default: 'admins' },
      sendMessages: permission,
      addMembers: { ...permission, default: 'admins' }
    }, { _id: false }),
    default: undefined
  },
  // Unguessable invite token; null/absent = no active invite link.
  inviteCode: { type: String, default: undefined },

  pinnedBy: [{ type: ObjectId, ref: 'User' }],
  mutedBy: [{ type: ObjectId, ref: 'User' }],
  // Per-user archive (same pattern as pinnedBy/mutedBy — never affects other members).
  archivedBy: [{ type: ObjectId, ref: 'User' }]
}, { timestamps: true });

conversationSchema.index({ participants: 1, updatedAt: -1 });
conversationSchema.index({ inviteCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Conversation', conversationSchema);
