// Group voice/video calls. One Agora channel per call; the server tracks who is
// in each call and only group members can join (checked against the database on
// every join and every token request).
const crypto = require('crypto');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { emitToUsers, userRoom } = require('../utils/realtime');
const { createAndBroadcastMessage } = require('../services/messages');
const { isInDirectCall } = require('./calls');
const { allowSocketEvent } = require('../utils/rateLimit');

// 8 people: every participant decodes up to 7 video streams, which is what a
// mid-range phone handles comfortably (Agora recommends ≤17 publishers per channel).
const MAX_PARTICIPANTS = 8;
const RING_TIMEOUT_MS = 45 * 1000;
const ALONE_TIMEOUT_MS = 60 * 1000;

const calls = new Map(); // callId -> call
const byConversation = new Map(); // conversationId -> callId
const byUser = new Map(); // userId -> callId

const getGroupCallByChannel = (channelName) =>
  (channelName?.startsWith('gcall_') ? calls.get(channelName.slice(6)) || null : null);
const isInGroupCall = (userId) => byUser.has(String(userId));

const memberGroup = (conversationId, userId) =>
  Conversation.findOne({ _id: conversationId, isGroup: true, participants: userId }).select('participants name').lean().catch(() => null);

const publicCall = (call) => ({
  callId: call.callId,
  conversationId: call.conversationId,
  type: call.type,
  startedBy: call.startedBy,
  startedAt: call.startedAt,
  participants: [...call.participants.keys()],
  max: MAX_PARTICIPANTS
});

// Keep every member's "call in progress · Join" state current.
const announce = async (call) => {
  const group = await Conversation.findById(call.conversationId).select('participants').lean();
  if (group) emitToUsers(group.participants, 'groupcall:updated', { conversationId: call.conversationId, call: call.ended ? null : publicCall(call) });
};

const endGroupCall = async (callId, reason = 'ended') => {
  const call = calls.get(callId);
  if (!call || call.ended) return;
  call.ended = true;
  clearTimeout(call.ringTimer);
  clearTimeout(call.aloneTimer);
  calls.delete(callId);
  byConversation.delete(call.conversationId);
  for (const userId of call.everJoined) if (byUser.get(userId) === callId) byUser.delete(userId);

  const group = await Conversation.findById(call.conversationId).catch(() => null);
  const members = group ? group.participants.map(String) : [];
  emitToUsers([...new Set([...members, ...call.everJoined])], 'groupcall:ended', { callId, conversationId: call.conversationId, reason });
  emitToUsers(members, 'groupcall:updated', { conversationId: call.conversationId, call: null });

  if (group && reason !== 'deleted') {
    const duration = call.connectedAt ? Math.round((Date.now() - call.connectedAt) / 1000) : 0;
    await createAndBroadcastMessage({
      conversation: group,
      senderId: call.startedBy,
      fields: {
        messageType: 'call',
        call: { type: call.type, status: call.everJoined.size > 1 ? 'completed' : 'missed', duration, group: true, participants: call.everJoined.size, joined: [...call.everJoined] },
        seen: [...call.everJoined]
      }
    }).catch(error => console.error('group call log:', error.message));
  }
};

const leaveCall = (callId, userId) => {
  const call = calls.get(callId);
  const id = String(userId);
  if (!call || !call.participants.has(id)) return;
  call.participants.delete(id);
  if (byUser.get(id) === callId) byUser.delete(id);
  if (call.participants.size === 0) {
    endGroupCall(callId);
    return;
  }
  // Last person left alone: end after a minute unless someone joins.
  if (call.participants.size === 1) {
    clearTimeout(call.aloneTimer);
    call.aloneTimer = setTimeout(() => { if (calls.get(callId)?.participants.size <= 1) endGroupCall(callId); }, ALONE_TIMEOUT_MS);
  }
  announce(call);
};

// Called by the group controller when someone is removed/leaves, or the group is deleted.
const removeUserFromGroupCall = (conversationId, userId) => {
  const callId = byConversation.get(String(conversationId));
  const call = callId && calls.get(callId);
  if (!call || !call.participants.has(String(userId))) return;
  emitToUsers([userId], 'groupcall:ended', { callId, conversationId: String(conversationId), reason: 'removed' });
  leaveCall(callId, userId);
};
const endGroupCallForConversation = (conversationId, reason = 'deleted') => {
  const callId = byConversation.get(String(conversationId));
  if (callId) return endGroupCall(callId, reason);
  return null;
};
const leaveAllGroupCalls = (userId) => {
  const callId = byUser.get(String(userId));
  if (callId) leaveCall(callId, userId);
};

const registerGroupCallHandlers = (io, socket) => {
  const me = socket.data.userId;
  const respond = (ack) => (typeof ack === 'function' ? ack : () => {});

  const join = async (call, reply) => {
    if (!(await memberGroup(call.conversationId, me))) return reply({ error: 'You are not a member of this group' });
    if (!call.participants.has(me)) {
      if (call.participants.size >= MAX_PARTICIPANTS) return reply({ error: `This call is full (${MAX_PARTICIPANTS} people max)` });
      if (isInDirectCall(me) || (byUser.has(me) && byUser.get(me) !== call.callId)) return reply({ error: 'You are already on another call' });
      call.participants.set(me, Date.now());
      call.everJoined.add(me);
      byUser.set(me, call.callId);
      if (!call.connectedAt && call.everJoined.size > 1) call.connectedAt = Date.now();
      clearTimeout(call.aloneTimer);
      socket.to(userRoom(me)).emit('groupcall:handled', { callId: call.callId });
      announce(call);
    }
    reply({ callId: call.callId, channelName: call.channelName, type: call.type, conversationId: call.conversationId });
  };

  socket.on('groupcall:start', async ({ conversationId, type } = {}, ack) => {
    const reply = respond(ack);
    try {
      if (!allowSocketEvent('groupcall-start', me, 10, 60 * 1000)) return reply({ error: 'Too many calls. Please wait a minute.' });
      const group = conversationId && await memberGroup(conversationId, me);
      if (!group) return reply({ error: 'Group not found' });
      const existing = calls.get(byConversation.get(String(group._id)));
      if (existing) return join(existing, reply); // a call is already running → join it
      if (isInDirectCall(me) || byUser.has(me)) return reply({ error: 'You are already on another call' });

      const callId = crypto.randomBytes(12).toString('hex');
      const call = {
        callId,
        channelName: `gcall_${callId}`,
        conversationId: String(group._id),
        type: type === 'video' ? 'video' : 'audio',
        startedBy: me,
        startedAt: Date.now(),
        connectedAt: null,
        participants: new Map([[me, Date.now()]]),
        everJoined: new Set([me]),
        ended: false
      };
      call.ringTimer = setTimeout(() => { if (call.everJoined.size === 1) endGroupCall(callId, 'no_answer'); }, RING_TIMEOUT_MS);
      calls.set(callId, call);
      byConversation.set(call.conversationId, callId);
      byUser.set(me, callId);

      const starter = await User.findById(me).select('name').lean();
      emitToUsers(group.participants.map(String).filter(id => id !== me), 'groupcall:incoming', {
        callId,
        conversationId: call.conversationId,
        groupName: group.name,
        type: call.type,
        startedBy: { _id: me, name: starter?.name || 'Someone' }
      });
      announce(call);
      reply({ callId, channelName: call.channelName, type: call.type, conversationId: call.conversationId });
    } catch (error) {
      console.error('groupcall:start', error.message);
      reply({ error: 'Could not start the call' });
    }
  });

  socket.on('groupcall:join', async ({ callId } = {}, ack) => {
    const reply = respond(ack);
    const call = calls.get(callId);
    if (!call) return reply({ error: 'This call has ended' });
    try { await join(call, reply); } catch { reply({ error: 'Could not join the call' }); }
  });

  // Declined on this device → stop ringing on my other devices.
  socket.on('groupcall:decline', ({ callId } = {}) => {
    if (calls.has(callId)) socket.to(userRoom(me)).emit('groupcall:handled', { callId });
  });

  socket.on('groupcall:leave', ({ callId } = {}) => leaveCall(callId, me));

  // Media isn't getting through directly: everyone in the call reconnects via Agora's TCP relay.
  socket.on('groupcall:relay', ({ callId } = {}) => {
    const call = calls.get(callId);
    if (!call || !call.participants.has(me)) return;
    if (!allowSocketEvent('groupcall-relay', me, 5, 60 * 1000)) return;
    emitToUsers([...call.participants.keys()].filter(id => id !== me), 'groupcall:relay', { callId });
  });
};

// For clients that load after a call started: active calls in my groups.
const activeCallsFor = async (userId) => {
  const ids = [...byConversation.keys()];
  if (!ids.length) return [];
  const mine = await Conversation.find({ _id: { $in: ids }, participants: userId }).select('_id').lean();
  return mine.map(g => publicCall(calls.get(byConversation.get(String(g._id))))).filter(Boolean);
};

module.exports = {
  MAX_PARTICIPANTS,
  registerGroupCallHandlers,
  getGroupCallByChannel,
  isInGroupCall,
  removeUserFromGroupCall,
  endGroupCallForConversation,
  leaveAllGroupCalls,
  activeCallsFor
};
