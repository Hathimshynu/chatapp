const mongoose = require('mongoose');
const { serverError } = require('../utils/http');
const Status = require('../models/Status');
const StatusView = require('../models/StatusView');
const Conversation = require('../models/Conversation');
const Media = require('../models/Media');
const User = require('../models/User');
const { emitToUsers } = require('../utils/realtime');
const { idsEqual, findOrCreateDirectConversation, createAndBroadcastMessage } = require('../services/messages');
const { populateConversation, shapeForViewer } = require('../services/groups');
const { blockedWith, viewerContext, maskUser } = require('../utils/privacy');

const BACKGROUNDS = ['violet', 'ocean', 'sunset', 'forest', 'rose', 'night', 'amber', 'slate'];
const REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥'];
const MAX_TEXT = 700;
const MAX_ACTIVE_PER_USER = 30;

const isValidId = (id) => mongoose.isValidObjectId(id);
const notExpired = () => ({ expiresAt: { $gt: new Date() } });
const publicAvatar = (avatar) => (avatar && !avatar.startsWith('data:') ? avatar : '');

// "Contacts" = people you have a direct chat with. The relation is symmetric.
const contactsOf = async (userId) => {
  const ids = await Conversation.find({ isGroup: { $ne: true }, participants: userId }).distinct('participants');
  return new Set(ids.map(String).filter(id => id !== String(userId)));
};

// Server-side visibility rule. `ownerContacts` is the owner's contact set and
// `ownerBlocks` everyone with a block relation to the owner (either direction).
const canView = (status, viewerId, ownerContacts, ownerBlocks = new Set()) => {
  if (idsEqual(status.user, viewerId)) return true;
  if (status.expiresAt <= new Date()) return false;
  if (ownerBlocks.has(String(viewerId))) return false;
  if (!ownerContacts.has(String(viewerId))) return false;
  const listed = (status.visibility?.users || []).some(id => idsEqual(id, viewerId));
  if (status.visibility?.mode === 'except') return !listed;
  if (status.visibility?.mode === 'only') return listed;
  return true;
};

const audienceOf = async (status) => {
  const [contacts, blocks] = await Promise.all([contactsOf(status.user), blockedWith(status.user)]);
  return [...contacts].filter(id => canView(status, id, contacts, blocks.any));
};

// Fields other users may see (never the owner's visibility list).
const publicStatus = (status) => ({
  _id: status._id,
  user: status.user,
  type: status.type,
  text: status.text,
  background: status.background,
  align: status.align,
  font: status.font,
  media: status.media,
  caption: status.caption,
  createdAt: status.createdAt,
  expiresAt: status.expiresAt
});

// Load a status the caller is allowed to see; 404 otherwise (no existence leak).
const loadVisible = async (req, res) => {
  const notFound = () => { res.status(404).json({ message: 'Status not found or expired' }); return null; };
  if (!isValidId(req.params.id)) return notFound();
  const status = await Status.findOne({ _id: req.params.id, ...notExpired() }).lean();
  if (!status) return notFound();
  if (!idsEqual(status.user, req.user._id)) {
    const [ownerContacts, ownerBlocks] = await Promise.all([contactsOf(status.user), blockedWith(status.user)]);
    if (!canView(status, req.user._id, ownerContacts, ownerBlocks.any)) return notFound();
  }
  return status;
};

const fail = (res, error) => {
  console.error('status error:', error);
  serverError(res, error);
};

// @GET /api/status/feed — my statuses + contacts' visible statuses, grouped by person
const getFeed = async (req, res) => {
  try {
    const me = req.user._id;
    const [contacts, ctx] = await Promise.all([contactsOf(me), viewerContext(me)]);
    const [mine, theirs] = await Promise.all([
      Status.find({ user: me, ...notExpired() }).sort({ createdAt: 1 }).lean(),
      Status.find({ user: { $in: [...contacts] }, ...notExpired() }).sort({ createdAt: 1 }).lean()
    ]);
    // Each owner's contacts include me (symmetric), so only the mode rules remain.
    // Blocks are symmetric too: ctx.blocked covers both directions.
    const visible = theirs.filter(s => canView(s, me, new Set([String(me)]), ctx.blocked.has(String(s.user)) ? new Set([String(me)]) : new Set()));

    const [myViews, viewCounts, owners] = await Promise.all([
      StatusView.find({ viewer: me, status: { $in: visible.map(s => s._id) } }).select('status').lean(),
      StatusView.aggregate([
        { $match: { status: { $in: mine.map(s => s._id) } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      User.find({ _id: { $in: [...new Set(visible.map(s => String(s.user)))] } }).select('name avatar privacy').lean()
    ]);
    const viewed = new Set(myViews.map(v => String(v.status)));
    const counts = new Map(viewCounts.map(c => [String(c._id), c.count]));

    const byUser = new Map();
    for (const status of visible) {
      const key = String(status.user);
      if (!byUser.has(key)) byUser.set(key, []);
      byUser.get(key).push({ ...publicStatus(status), viewed: viewed.has(String(status._id)) });
    }
    const updates = owners.map(owner => {
      const statuses = byUser.get(String(owner._id)) || [];
      return {
        user: { _id: owner._id, name: owner.name, avatar: publicAvatar(maskUser(owner, ctx).avatar) },
        statuses,
        lastAt: statuses.at(-1)?.createdAt,
        allViewed: statuses.every(s => s.viewed)
      };
    }).filter(u => u.statuses.length)
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

    res.json({
      mine: mine.map(s => ({ ...publicStatus(s), visibility: s.visibility, viewCount: counts.get(String(s._id)) || 0 })),
      updates
    });
  } catch (error) {
    fail(res, error);
  }
};

// @POST /api/status
const createStatus = async (req, res) => {
  try {
    const me = req.user._id;
    const type = req.body.type;
    if (!['text', 'image', 'video'].includes(type)) return res.status(400).json({ message: 'Invalid status type' });

    const active = await Status.countDocuments({ user: me, ...notExpired() });
    if (active >= MAX_ACTIVE_PER_USER) return res.status(400).json({ message: `You can have at most ${MAX_ACTIVE_PER_USER} active statuses` });

    const doc = { user: me, type };
    if (type === 'text') {
      const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
      if (!text) return res.status(400).json({ message: 'Status text is required' });
      if (text.length > MAX_TEXT) return res.status(400).json({ message: `Status text is limited to ${MAX_TEXT} characters` });
      doc.text = text;
      doc.background = BACKGROUNDS.includes(req.body.background) ? req.body.background : BACKGROUNDS[0];
      if (['left', 'center', 'right'].includes(req.body.align)) doc.align = req.body.align;
      if (['sans', 'serif', 'bold', 'mono'].includes(req.body.font)) doc.font = req.body.font;
    } else {
      // Status media must be the poster's own upload of the right kind.
      const url = req.body.media?.url;
      const key = typeof url === 'string' && url.startsWith('/api/media/') ? url.slice('/api/media/'.length) : null;
      const media = key && await Media.findOne({ key, owner: me }).select('mimeType').lean();
      if (!media) return res.status(400).json({ message: 'Upload the photo or video first' });
      if (!media.mimeType.startsWith(`${type}/`) || media.mimeType === 'image/svg+xml') {
        return res.status(400).json({ message: `That file is not a valid ${type}` });
      }
      doc.media = {
        url,
        mimeType: media.mimeType,
        width: Number(req.body.media.width) || 0,
        height: Number(req.body.media.height) || 0,
        duration: Math.min(Number(req.body.media.duration) || 0, 600)
      };
      const caption = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';
      if (caption.length > MAX_TEXT) return res.status(400).json({ message: `Caption is limited to ${MAX_TEXT} characters` });
      doc.caption = caption;
    }

    // Visibility: only your own contacts can ever be listed.
    const mode = ['contacts', 'except', 'only'].includes(req.body.visibility?.mode) ? req.body.visibility.mode : 'contacts';
    const contacts = await contactsOf(me);
    const users = Array.isArray(req.body.visibility?.users)
      ? [...new Set(req.body.visibility.users.map(String))].filter(id => contacts.has(id)).slice(0, 256)
      : [];
    if (mode === 'only' && !users.length) return res.status(400).json({ message: 'Choose at least one contact to share with' });
    doc.visibility = { mode, users: mode === 'contacts' ? [] : users };

    const status = await Status.create(doc);
    if (status.media) {
      // The file disappears with the status.
      await Media.updateOne({ key: status.media.url.slice('/api/media/'.length), owner: me }, { expiresAt: status.expiresAt });
    }
    const audience = await audienceOf(status.toObject());
    emitToUsers([...audience, me], 'status:created', { userId: String(me), statusId: String(status._id) });
    res.status(201).json({ ...publicStatus(status), visibility: status.visibility, viewCount: 0 });
  } catch (error) {
    fail(res, error);
  }
};

// @GET /api/status/:id
const getStatus = async (req, res) => {
  try {
    const status = await loadVisible(req, res);
    if (!status) return;
    res.json(idsEqual(status.user, req.user._id) ? status : publicStatus(status));
  } catch (error) {
    fail(res, error);
  }
};

// @DELETE /api/status/:id — owner only
const deleteStatus = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ message: 'Status not found' });
    const status = await Status.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!status) return res.status(404).json({ message: 'Status not found' });
    const audience = await audienceOf(status);
    await Promise.all([
      Status.deleteOne({ _id: status._id }),
      StatusView.deleteMany({ status: status._id }),
      status.media ? Media.updateOne({ key: status.media.url.slice('/api/media/'.length), owner: req.user._id }, { expiresAt: new Date() }) : null
    ]);
    emitToUsers([...audience, req.user._id], 'status:deleted', { userId: String(req.user._id), statusId: String(status._id) });
    res.json({ deleted: true });
  } catch (error) {
    fail(res, error);
  }
};

// @POST /api/status/:id/view — viewer is always the authenticated user
const viewStatus = async (req, res) => {
  try {
    const status = await loadVisible(req, res);
    if (!status) return;
    if (idsEqual(status.user, req.user._id)) return res.json({ viewed: false, own: true });
    const now = new Date();
    const result = await StatusView.updateOne(
      { status: status._id, viewer: req.user._id },
      { $setOnInsert: { owner: status.user, viewedAt: now, expiresAt: status.expiresAt } },
      { upsert: true }
    );
    if (result.upsertedCount) {
      emitToUsers([status.user], 'status:viewed', {
        statusId: String(status._id),
        viewer: { _id: String(req.user._id), name: req.user.name, avatar: publicAvatar(req.user.avatar) },
        viewedAt: now
      });
    }
    res.json({ viewed: true });
  } catch (error) {
    fail(res, error);
  }
};

// @GET /api/status/:id/viewers — owner only
const getViewers = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ message: 'Status not found' });
    const status = await Status.findOne({ _id: req.params.id, user: req.user._id }).select('_id').lean();
    if (!status) return res.status(404).json({ message: 'Status not found' });
    const views = await StatusView.find({ status: status._id }).sort({ viewedAt: -1 }).populate('viewer', 'name avatar privacy').lean();
    const ctx = await viewerContext(req.user._id);
    res.json(views.filter(v => v.viewer).map(v => ({
      user: { _id: v.viewer._id, name: v.viewer.name, avatar: publicAvatar(maskUser(v.viewer, ctx).avatar) },
      viewedAt: v.viewedAt,
      reaction: v.reaction
    })));
  } catch (error) {
    fail(res, error);
  }
};

// Replies and reactions become normal direct messages that quote the status.
const sendStatusMessage = async (req, res, status, text) => {
  const me = req.user._id;
  const { conversation, created } = await findOrCreateDirectConversation(me, status.user);
  const message = await createAndBroadcastMessage({
    conversation,
    senderId: me,
    created,
    fields: {
      text,
      messageType: 'text',
      statusRef: {
        status: status._id,
        owner: status.user,
        type: status.type,
        text: (status.type === 'text' ? status.text : status.caption || '').slice(0, 200),
        background: status.background || '',
        mediaUrl: status.type === 'image' ? status.media?.url || '' : ''
      }
    }
  });
  const payload = { message, conversationId: conversation._id };
  if (created) payload.conversation = await shapeForViewer(await populateConversation(Conversation.findById(conversation._id)).lean(), me);
  return res.status(201).json(payload);
};

// @POST /api/status/:id/reply  { text }
const replyToStatus = async (req, res) => {
  try {
    const status = await loadVisible(req, res);
    if (!status) return;
    if (idsEqual(status.user, req.user._id)) return res.status(400).json({ message: 'You cannot reply to your own status' });
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 5000) return res.status(400).json({ message: 'Reply cannot be empty' });
    await sendStatusMessage(req, res, status, text);
  } catch (error) {
    fail(res, error);
  }
};

// @POST /api/status/:id/react  { emoji }
const reactToStatus = async (req, res) => {
  try {
    const status = await loadVisible(req, res);
    if (!status) return;
    if (idsEqual(status.user, req.user._id)) return res.status(400).json({ message: 'You cannot react to your own status' });
    const emoji = req.body.emoji;
    if (!REACTIONS.includes(emoji)) return res.status(400).json({ message: 'Unsupported reaction' });
    await StatusView.updateOne(
      { status: status._id, viewer: req.user._id },
      { $set: { reaction: emoji }, $setOnInsert: { owner: status.user, viewedAt: new Date(), expiresAt: status.expiresAt } },
      { upsert: true }
    );
    emitToUsers([status.user], 'status:reaction', { statusId: String(status._id), userId: String(req.user._id), emoji });
    await sendStatusMessage(req, res, status, emoji);
  } catch (error) {
    fail(res, error);
  }
};

module.exports = {
  getFeed, createStatus, getStatus, deleteStatus, viewStatus, getViewers, replyToStatus, reactToStatus,
  contactsOf, canView, BACKGROUNDS, REACTIONS
};
