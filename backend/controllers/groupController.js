const crypto = require('crypto');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { emitToUsers } = require('../utils/realtime');
const { idsEqual, createSystemMessage, PARTICIPANT_FIELDS } = require('../services/messages');
const {
  MAX_GROUP_MEMBERS, PERMISSIONS, findMember, isAdmin, can,
  invalidateMembership, populateConversation, shapeConversation, groupPayload
} = require('../services/groups');

const NAME_MAX = 60;
const DESCRIPTION_MAX = 500;
const INVITE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

const isValidId = (id) => mongoose.isValidObjectId(id);
const isValidAvatar = (avatar) =>
  avatar === '' || (typeof avatar === 'string' && avatar.length < 500 && (avatar.startsWith('/api/media/') || /^https:\/\//i.test(avatar)));

// Validate + dedupe a list of user ids and confirm they exist.
const resolveUsers = async (ids, excludeIds = []) => {
  if (!Array.isArray(ids)) return { error: 'Members must be a list' };
  if (ids.length > MAX_GROUP_MEMBERS) return { error: `A group can have at most ${MAX_GROUP_MEMBERS} members` };
  const exclude = new Set(excludeIds.map(String));
  const unique = [...new Set(ids.map(String))].filter(id => !exclude.has(id));
  if (unique.some(id => !isValidId(id))) return { error: 'Invalid member id' };
  const found = await User.find({ _id: { $in: unique } }).select('_id').lean();
  if (found.length !== unique.length) return { error: 'Some selected users do not exist' };
  return { ids: unique };
};

// Load a group the caller belongs to. Non-members get 404 so they can't probe groups.
const loadGroup = async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(404).json({ message: 'Group not found' });
    return null;
  }
  const group = await Conversation.findOne({ _id: req.params.id, isGroup: true, participants: req.user._id });
  if (!group) res.status(404).json({ message: 'Group not found' });
  return group;
};

// Push the shared group state to every current member (and anyone listed in `alsoNotify`).
const broadcastGroup = async (conversationId, event = {}) => {
  invalidateMembership(conversationId);
  const group = await Conversation.findById(conversationId).populate('participants', PARTICIPANT_FIELDS).lean();
  if (!group) return null;
  emitToUsers(group.participants.map(p => p._id), 'group:updated', {
    conversationId: String(conversationId),
    group: groupPayload(group),
    ...event
  });
  return group;
};

const respondWithGroup = async (res, conversationId, userId, status = 200) => {
  const group = await populateConversation(Conversation.findById(conversationId)).lean();
  res.status(status).json(shapeConversation(group, userId));
};

const fail = (res, error) => {
  console.error('group error:', error);
  res.status(500).json({ message: error.message });
};

// @POST /api/groups  { name, description?, avatar?, memberIds[] }
const createGroup = async (req, res) => {
  try {
    const me = req.user._id;
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    const avatar = req.body.avatar ?? '';
    if (!name) return res.status(400).json({ message: 'Group name is required' });
    if (name.length > NAME_MAX) return res.status(400).json({ message: `Group name is limited to ${NAME_MAX} characters` });
    if (description.length > DESCRIPTION_MAX) return res.status(400).json({ message: `Description is limited to ${DESCRIPTION_MAX} characters` });
    if (!isValidAvatar(avatar)) return res.status(400).json({ message: 'Invalid group photo' });

    const { ids, error } = await resolveUsers(req.body.memberIds || [], [me]);
    if (error) return res.status(400).json({ message: error });
    if (!ids.length) return res.status(400).json({ message: 'Add at least one other member' });
    if (ids.length + 1 > MAX_GROUP_MEMBERS) return res.status(400).json({ message: `A group can have at most ${MAX_GROUP_MEMBERS} members` });

    const now = new Date();
    const group = await Conversation.create({
      isGroup: true,
      name,
      description,
      avatar,
      createdBy: me,
      participants: [me, ...ids],
      members: [
        { user: me, role: 'admin', joinedAt: now },
        ...ids.map(user => ({ user, role: 'member', joinedAt: now }))
      ],
      settings: {}
    });
    await createSystemMessage(group, me, 'created', { value: name });
    await broadcastGroup(group._id, { action: 'created' });
    await respondWithGroup(res, group._id, me, 201);
  } catch (error) {
    fail(res, error);
  }
};

// @GET /api/groups/:id
const getGroup = async (req, res) => {
  try {
    const group = await loadGroup(req, res);
    if (!group) return;
    await respondWithGroup(res, group._id, req.user._id);
  } catch (error) {
    fail(res, error);
  }
};

// @PATCH /api/groups/:id  { name?, description?, avatar? }
const updateInfo = async (req, res) => {
  try {
    const me = req.user._id;
    const group = await loadGroup(req, res);
    if (!group) return;
    if (!can(group, me, 'editInfo')) return res.status(403).json({ message: 'Only admins can edit this group\'s info' });

    const changes = [];
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name || name.length > NAME_MAX) return res.status(400).json({ message: `Group name must be 1–${NAME_MAX} characters` });
      if (name !== group.name) { group.name = name; changes.push(['renamed', name]); }
    }
    if (req.body.description !== undefined) {
      const description = String(req.body.description).trim();
      if (description.length > DESCRIPTION_MAX) return res.status(400).json({ message: `Description is limited to ${DESCRIPTION_MAX} characters` });
      if (description !== group.description) { group.description = description; changes.push(['description']); }
    }
    if (req.body.avatar !== undefined) {
      if (!isValidAvatar(req.body.avatar)) return res.status(400).json({ message: 'Invalid group photo' });
      if (req.body.avatar !== group.avatar) { group.avatar = req.body.avatar; changes.push(['avatar']); }
    }
    if (!changes.length) return respondWithGroup(res, group._id, me);

    await group.save();
    for (const [action, value] of changes) await createSystemMessage(group, me, action, { value });
    await broadcastGroup(group._id, { action: 'info' });
    await respondWithGroup(res, group._id, me);
  } catch (error) {
    fail(res, error);
  }
};

// @PATCH /api/groups/:id/settings  { editInfo?, sendMessages?, addMembers? } — admins only
const updateSettings = async (req, res) => {
  try {
    const me = req.user._id;
    const group = await loadGroup(req, res);
    if (!group) return;
    if (!isAdmin(group, me)) return res.status(403).json({ message: 'Only admins can change group settings' });

    const next = { ...(group.settings?.toObject?.() || group.settings || {}) };
    for (const key of PERMISSIONS) {
      if (req.body[key] === undefined) continue;
      if (!['all', 'admins'].includes(req.body[key])) return res.status(400).json({ message: `Invalid value for ${key}` });
      next[key] = req.body[key];
    }
    group.settings = next;
    await group.save();
    await createSystemMessage(group, me, 'settings');
    await broadcastGroup(group._id, { action: 'settings' });
    await respondWithGroup(res, group._id, me);
  } catch (error) {
    fail(res, error);
  }
};

// @POST /api/groups/:id/members  { userIds[] }
const addMembers = async (req, res) => {
  try {
    const me = req.user._id;
    const group = await loadGroup(req, res);
    if (!group) return;
    if (!can(group, me, 'addMembers')) return res.status(403).json({ message: 'Only admins can add members' });

    const { ids, error } = await resolveUsers(req.body.userIds || [], group.participants);
    if (error) return res.status(400).json({ message: error });
    if (!ids.length) return res.status(400).json({ message: 'Those people are already in the group' });
    if (group.participants.length + ids.length > MAX_GROUP_MEMBERS) {
      return res.status(400).json({ message: `A group can have at most ${MAX_GROUP_MEMBERS} members` });
    }

    const now = new Date();
    await Conversation.updateOne(
      { _id: group._id },
      { $addToSet: { participants: { $each: ids } }, $push: { members: { $each: ids.map(user => ({ user, role: 'member', joinedAt: now })) } } }
    );
    const fresh = await Conversation.findById(group._id);
    await createSystemMessage(fresh, me, 'added', { targets: ids });
    await broadcastGroup(group._id, { action: 'added', userIds: ids });
    await respondWithGroup(res, group._id, me);
  } catch (error) {
    fail(res, error);
  }
};

// Remove a user from a group; if no admin remains, promote the longest-standing member.
const detachMember = async (group, userId) => {
  const remaining = group.members.filter(m => !idsEqual(m.user, userId));
  let promoted = null;
  if (remaining.length && !remaining.some(m => m.role === 'admin')) {
    const next = [...remaining].sort((a, b) => (a.joinedAt - b.joinedAt) || String(a.user).localeCompare(String(b.user)))[0];
    next.role = 'admin';
    promoted = next.user;
  }
  group.members = remaining;
  group.participants = group.participants.filter(id => !idsEqual(id, userId));
  group.pinnedBy = (group.pinnedBy || []).filter(id => !idsEqual(id, userId));
  group.mutedBy = (group.mutedBy || []).filter(id => !idsEqual(id, userId));
  await group.save();
  invalidateMembership(group._id);
  return { promoted, empty: remaining.length === 0 };
};

// @DELETE /api/groups/:id/members/:userId — admins only
const removeMember = async (req, res) => {
  try {
    const me = req.user._id;
    const group = await loadGroup(req, res);
    if (!group) return;
    if (!isAdmin(group, me)) return res.status(403).json({ message: 'Only admins can remove members' });
    const target = req.params.userId;
    if (!isValidId(target) || !findMember(group, target)) return res.status(404).json({ message: 'That person is not in this group' });
    if (idsEqual(target, me)) return res.status(400).json({ message: 'Use "Leave group" to leave' });

    await detachMember(group, target);
    emitToUsers([target], 'group:removed', { conversationId: String(group._id), reason: 'removed' });
    await createSystemMessage(group, me, 'removed', { targets: [target] });
    await broadcastGroup(group._id, { action: 'removed', userIds: [String(target)] });
    await respondWithGroup(res, group._id, me);
  } catch (error) {
    fail(res, error);
  }
};

// @POST|DELETE /api/groups/:id/admins/:userId — promote / demote (admins only)
const setAdmin = (makeAdmin) => async (req, res) => {
  try {
    const me = req.user._id;
    const group = await loadGroup(req, res);
    if (!group) return;
    if (!isAdmin(group, me)) return res.status(403).json({ message: 'Only admins can change admins' });
    const member = isValidId(req.params.userId) && findMember(group, req.params.userId);
    if (!member) return res.status(404).json({ message: 'That person is not in this group' });
    if ((member.role === 'admin') === makeAdmin) return respondWithGroup(res, group._id, me);
    if (!makeAdmin && group.members.filter(m => m.role === 'admin').length === 1) {
      return res.status(400).json({ message: 'A group needs at least one admin' });
    }
    member.role = makeAdmin ? 'admin' : 'member';
    await group.save();
    await createSystemMessage(group, me, makeAdmin ? 'promoted' : 'demoted', { targets: [member.user] });
    await broadcastGroup(group._id, { action: makeAdmin ? 'promoted' : 'demoted', userIds: [String(member.user)] });
    await respondWithGroup(res, group._id, me);
  } catch (error) {
    fail(res, error);
  }
};

// @POST /api/groups/:id/leave
const leaveGroup = async (req, res) => {
  try {
    const me = req.user._id;
    const group = await loadGroup(req, res);
    if (!group) return;
    const { promoted, empty } = await detachMember(group, me);
    emitToUsers([me], 'group:removed', { conversationId: String(group._id), reason: 'left' });
    if (empty) {
      await Message.deleteMany({ conversationId: group._id });
      await Conversation.deleteOne({ _id: group._id });
      return res.json({ left: true, deleted: true });
    }
    await createSystemMessage(group, me, 'left');
    if (promoted) await createSystemMessage(group, me, 'promoted', { targets: [promoted], value: 'auto' });
    await broadcastGroup(group._id, { action: 'left', userIds: [String(me)] });
    res.json({ left: true, promoted: promoted ? String(promoted) : null });
  } catch (error) {
    fail(res, error);
  }
};

// @DELETE /api/groups/:id — admins only; removes the group and its messages for everyone
const deleteGroup = async (req, res) => {
  try {
    const group = await loadGroup(req, res);
    if (!group) return;
    if (!isAdmin(group, req.user._id)) return res.status(403).json({ message: 'Only admins can delete the group' });
    const participants = group.participants.map(String);
    await Message.deleteMany({ conversationId: group._id });
    await Conversation.deleteOne({ _id: group._id });
    invalidateMembership(group._id);
    emitToUsers(participants, 'group:removed', { conversationId: String(group._id), reason: 'deleted' });
    res.json({ deleted: true });
  } catch (error) {
    fail(res, error);
  }
};

// @POST /api/groups/:id/invite — (re)generate the invite link (admins only)
const resetInvite = async (req, res) => {
  try {
    const me = req.user._id;
    const group = await loadGroup(req, res);
    if (!group) return;
    if (!isAdmin(group, me)) return res.status(403).json({ message: 'Only admins can manage the invite link' });
    const hadLink = !!group.inviteCode;
    group.inviteCode = crypto.randomBytes(18).toString('base64url');
    await group.save();
    if (hadLink) await createSystemMessage(group, me, 'invite_reset');
    res.json({ inviteCode: group.inviteCode });
  } catch (error) {
    fail(res, error);
  }
};

// @DELETE /api/groups/:id/invite — revoke (admins only)
const revokeInvite = async (req, res) => {
  try {
    const group = await loadGroup(req, res);
    if (!group) return;
    if (!isAdmin(group, req.user._id)) return res.status(403).json({ message: 'Only admins can manage the invite link' });
    group.inviteCode = undefined;
    await group.save();
    res.json({ inviteCode: null });
  } catch (error) {
    fail(res, error);
  }
};

const findByInvite = (code) => (INVITE_PATTERN.test(code || '')
  ? Conversation.findOne({ inviteCode: code, isGroup: true })
  : null);

// @GET /api/groups/invite/:code — preview before joining (no internal ids exposed)
const previewInvite = async (req, res) => {
  try {
    const group = await findByInvite(req.params.code);
    if (!group) return res.status(404).json({ message: 'This invite link is invalid or has been reset' });
    const alreadyMember = !!findMember(group, req.user._id);
    res.json({
      name: group.name,
      description: group.description,
      avatar: group.avatar,
      memberCount: group.participants.length,
      alreadyMember,
      conversationId: alreadyMember ? group._id : undefined
    });
  } catch (error) {
    fail(res, error);
  }
};

// @POST /api/groups/invite/:code/join
const joinByInvite = async (req, res) => {
  try {
    const me = req.user._id;
    const group = await findByInvite(req.params.code);
    if (!group) return res.status(404).json({ message: 'This invite link is invalid or has been reset' });
    if (findMember(group, me)) return res.status(409).json({ message: 'You are already in this group', conversationId: group._id });
    if (group.participants.length >= MAX_GROUP_MEMBERS) return res.status(400).json({ message: 'This group is full' });

    // Conditional update guards against a concurrent reset/revoke or double join.
    const { modifiedCount } = await Conversation.updateOne(
      { _id: group._id, inviteCode: req.params.code, participants: { $ne: me } },
      { $push: { participants: me, members: { user: me, role: 'member', joinedAt: new Date() } } }
    );
    if (!modifiedCount) return res.status(409).json({ message: 'Could not join — the link may have just been reset' });
    const fresh = await Conversation.findById(group._id);
    await createSystemMessage(fresh, me, 'joined');
    await broadcastGroup(group._id, { action: 'joined', userIds: [String(me)] });
    await respondWithGroup(res, group._id, me);
  } catch (error) {
    fail(res, error);
  }
};

module.exports = {
  createGroup, getGroup, updateInfo, updateSettings, addMembers, removeMember,
  promote: setAdmin(true), demote: setAdmin(false), leaveGroup, deleteGroup,
  resetInvite, revokeInvite, previewInvite, joinByInvite
};
