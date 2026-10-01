// Facebook-style friends: search people, send a request, the other person accepts
// or declines. Everything is checked here on the server; the client only asks.
const mongoose = require('mongoose');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { emitToUsers, isOnline } = require('../utils/realtime');
const { serverError } = require('../utils/http');
const { isBlockedEitherWay, viewerContext, maskUser, canSeeOnline, idStr, friendIdsOf, coParticipantIdsOf } = require('../utils/privacy');
const push = require('../services/push');

const USER_FIELDS = 'name email avatar status lastSeen privacy';

const otherSide = (row, me) => (idStr(row.requester) === String(me) ? row.recipient : row.requester);

// { [userId]: { state: 'friends' | 'outgoing' | 'incoming', requestId } } for the given people.
const relationsFor = async (me, userIds) => {
  const ids = userIds.map(String).filter(id => id !== String(me));
  if (!ids.length) return {};
  const rows = await Friendship.find({ pair: { $in: ids.map(id => Friendship.pairKey(me, id)) } })
    .select('requester recipient status').lean();
  const out = {};
  for (const row of rows) {
    const other = idStr(otherSide(row, me));
    out[other] = {
      state: row.status === 'accepted' ? 'friends' : idStr(row.requester) === String(me) ? 'outgoing' : 'incoming',
      requestId: String(row._id)
    };
  }
  return out;
};

const shapePerson = (user, ctx, relation) => ({
  ...maskUser(user, ctx),
  online: isOnline(user._id) && canSeeOnline(user, ctx),
  friendship: relation || { state: 'none' }
});

// Tell both people (all their tabs/devices) so lists and buttons update instantly.
const announce = (row, event = 'friend:updated') =>
  emitToUsers([row.requester, row.recipient], event, {
    requestId: String(row._id),
    requester: String(row.requester?._id || row.requester),
    recipient: String(row.recipient?._id || row.recipient),
    status: row.status || null
  });

// @GET /api/friends — my friends
const listFriends = async (req, res) => {
  try {
    const me = req.user._id;
    const rows = await Friendship.find({ status: 'accepted', $or: [{ requester: me }, { recipient: me }] })
      .sort({ acceptedAt: -1 }).lean();
    const users = await User.find({ _id: { $in: rows.map(r => otherSide(r, me)) } }).select(USER_FIELDS).lean();
    const byId = new Map(users.map(u => [String(u._id), u]));
    const ctx = await viewerContext(me);
    res.json(rows
      .map(r => {
        const user = byId.get(idStr(otherSide(r, me)));
        if (!user || ctx.blocked.has(String(user._id))) return null;
        return { ...shapePerson(user, ctx, { state: 'friends', requestId: String(r._id) }), friendsSince: r.acceptedAt };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name)));
  } catch (error) {
    serverError(res, error);
  }
};

// @GET /api/friends/requests — { incoming, outgoing }
const listRequests = async (req, res) => {
  try {
    const me = req.user._id;
    const rows = await Friendship.find({ status: 'pending', $or: [{ requester: me }, { recipient: me }] })
      .sort({ createdAt: -1 }).lean();
    const users = await User.find({ _id: { $in: rows.map(r => otherSide(r, me)) } }).select(USER_FIELDS).lean();
    const byId = new Map(users.map(u => [String(u._id), u]));
    const ctx = await viewerContext(me);
    const incoming = [];
    const outgoing = [];
    for (const r of rows) {
      const user = byId.get(idStr(otherSide(r, me)));
      if (!user) continue;
      const mine = idStr(r.requester) === String(me);
      // Requests from people I blocked stay hidden (they can't be accepted anyway).
      if (!mine && ctx.blocked.has(String(user._id))) continue;
      const entry = { requestId: String(r._id), sentAt: r.createdAt, user: shapePerson(user, ctx, { state: mine ? 'outgoing' : 'incoming', requestId: String(r._id) }) };
      (mine ? outgoing : incoming).push(entry);
    }
    res.json({ incoming, outgoing });
  } catch (error) {
    serverError(res, error);
  }
};

// @POST /api/friends/requests { userId }
const sendRequest = async (req, res) => {
  try {
    const me = String(req.user._id);
    const target = String(req.body?.userId || '');
    if (!mongoose.isValidObjectId(target)) return res.status(400).json({ message: 'Choose someone to add' });
    if (target === me) return res.status(400).json({ message: "You can't add yourself" });
    const user = await User.findById(target).select('name').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Neutral wording: never reveal who blocked whom.
    if (await isBlockedEitherWay(me, target)) return res.status(403).json({ message: 'You can’t send a friend request to this person.' });

    const pair = Friendship.pairKey(me, target);
    const existing = await Friendship.findOne({ pair });
    if (existing?.status === 'accepted') return res.status(409).json({ message: 'You are already friends', state: 'friends' });
    if (existing && idStr(existing.requester) === me) return res.status(409).json({ message: 'Friend request already sent', state: 'outgoing' });
    if (existing) {
      // They already asked me → sending back means yes.
      existing.status = 'accepted';
      existing.acceptedAt = new Date();
      await existing.save();
      announce(existing);
      return res.json({ state: 'friends', requestId: String(existing._id) });
    }

    let row;
    try {
      row = await Friendship.create({ requester: me, recipient: target, pair });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'A request between you already exists' });
      throw error;
    }
    announce(row, 'friend:request');
    push.notifyUser(target, { title: 'New friend request', body: `${req.user.name} sent you a friend request`, tag: `friend-${me}` });
    res.status(201).json({ state: 'outgoing', requestId: String(row._id) });
  } catch (error) {
    serverError(res, error);
  }
};

// Load a pending request by id and check who may act on it.
const pendingRequest = async (req, res, role) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: 'Friend request not found' });
    return null;
  }
  const row = await Friendship.findOne({ _id: req.params.id, status: 'pending' });
  const me = String(req.user._id);
  if (!row || idStr(row[role]) !== me) {
    // Same answer whether it doesn't exist or isn't yours.
    res.status(404).json({ message: 'Friend request not found' });
    return null;
  }
  return row;
};

// @POST /api/friends/requests/:id/accept — only the recipient
const acceptRequest = async (req, res) => {
  try {
    const row = await pendingRequest(req, res, 'recipient');
    if (!row) return;
    if (await isBlockedEitherWay(row.requester, row.recipient)) return res.status(403).json({ message: 'This request can’t be accepted.' });
    row.status = 'accepted';
    row.acceptedAt = new Date();
    await row.save();
    announce(row);
    push.notifyUser(row.requester, { title: 'Friend request accepted', body: `${req.user.name} accepted your friend request`, tag: `friend-${row.recipient}` });
    res.json({ state: 'friends', requestId: String(row._id) });
  } catch (error) {
    serverError(res, error);
  }
};

// @POST /api/friends/requests/:id/decline — only the recipient (the sender is not told)
const declineRequest = async (req, res) => {
  try {
    const row = await pendingRequest(req, res, 'recipient');
    if (!row) return;
    await row.deleteOne();
    announce({ ...row.toObject(), status: null });
    res.json({ state: 'none' });
  } catch (error) {
    serverError(res, error);
  }
};

// @DELETE /api/friends/requests/:id — only the sender (cancel)
const cancelRequest = async (req, res) => {
  try {
    const row = await pendingRequest(req, res, 'requester');
    if (!row) return;
    await row.deleteOne();
    announce({ ...row.toObject(), status: null });
    res.json({ state: 'none' });
  } catch (error) {
    serverError(res, error);
  }
};

// @DELETE /api/friends/:userId — unfriend (either side). Chats and history stay.
const unfriend = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ message: 'Invalid user' });
    const row = await Friendship.findOneAndDelete({ pair: Friendship.pairKey(req.user._id, req.params.userId), status: 'accepted' }).lean();
    if (!row) return res.status(404).json({ message: 'You are not friends' });
    announce({ ...row, status: null });
    res.json({ state: 'none' });
  } catch (error) {
    serverError(res, error);
  }
};

// @GET /api/friends/suggestions — "People you may know": friends of friends (most mutual
// friends first), then people you share a chat or group with. Never yourself, existing
// friends, anyone with a pending request either way, or anyone blocked either way.
const SUGGESTION_LIMIT = 20;
const suggestions = async (req, res) => {
  try {
    const me = String(req.user._id);
    const [friends, related, ctx, shared] = await Promise.all([
      friendIdsOf(me),
      Friendship.find({ $or: [{ requester: me }, { recipient: me }] }).select('requester recipient').lean(),
      viewerContext(me),
      coParticipantIdsOf(me)
    ]);
    const exclude = new Set([me, ...ctx.blocked]);
    related.forEach(r => { exclude.add(idStr(r.requester)); exclude.add(idStr(r.recipient)); });

    const mutual = new Map();
    if (friends.size) {
      const ids = [...friends];
      const rows = await Friendship.find({ status: 'accepted', $or: [{ requester: { $in: ids } }, { recipient: { $in: ids } }] })
        .select('requester recipient').limit(5000).lean();
      for (const row of rows) {
        for (const [friend, other] of [[idStr(row.requester), idStr(row.recipient)], [idStr(row.recipient), idStr(row.requester)]]) {
          if (friends.has(friend) && !exclude.has(other)) mutual.set(other, (mutual.get(other) || 0) + 1);
        }
      }
    }
    shared.forEach(id => { if (!exclude.has(id) && !mutual.has(id)) mutual.set(id, 0); });

    const ranked = [...mutual.entries()].sort((a, b) => b[1] - a[1]).slice(0, SUGGESTION_LIMIT).map(([id]) => id);
    const users = await User.find({ _id: { $in: ranked } }).select(USER_FIELDS).lean();
    const byId = new Map(users.map(u => [String(u._id), u]));
    res.json(ranked.map(id => byId.get(id)).filter(Boolean)
      .map(u => ({ ...shapePerson(u, ctx, { state: 'none' }), mutualFriends: mutual.get(String(u._id)) || 0 })));
  } catch (error) {
    serverError(res, error);
  }
};

// Blocking someone also removes any friendship or request between you.
const removeBetween = async (a, b) => {
  const row = await Friendship.findOneAndDelete({ pair: Friendship.pairKey(a, b) }).lean();
  if (row) announce({ ...row, status: null });
};

// Mutual friends count for a profile.
const mutualCount = async (me, other) => {
  const ids = async (id) => {
    const rows = await Friendship.find({ status: 'accepted', $or: [{ requester: id }, { recipient: id }] }).select('requester recipient').lean();
    return new Set(rows.map(r => idStr(otherSide(r, id))));
  };
  const [mine, theirs] = await Promise.all([ids(me), ids(other)]);
  let count = 0;
  mine.forEach(id => { if (theirs.has(id)) count += 1; });
  return count;
};

module.exports = {
  listFriends, listRequests, suggestions, sendRequest, acceptRequest, declineRequest, cancelRequest, unfriend,
  relationsFor, removeBetween, mutualCount
};
