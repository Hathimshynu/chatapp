const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const { emitToUsers, isOnline, userRoom } = require('../utils/realtime');
const Block = require('../models/Block');
const { allowSocketEvent } = require('../utils/rateLimit');
const { findOrCreateDirectConversation, createAndBroadcastMessage } = require('../services/messages');

const RING_TIMEOUT_MS = 45 * 1000;

// Live calls, in memory. callId -> call, and userId -> callId for busy checks.
const calls = new Map();
const callByUser = new Map();

const getCallByChannel = (channelName) => {
  if (!channelName?.startsWith('call_')) return null;
  return calls.get(channelName.slice(5)) || null;
};

const publicUser = (user) => ({
  _id: String(user._id),
  name: user.name,
  // Large inline avatars are skipped to keep socket frames small.
  avatar: user.avatar && !user.avatar.startsWith('data:') ? user.avatar : ''
});

// Store the call in the chat as a "call" message (missed/declined/completed…).
const logCall = async ({ callerId, receiverId, type, status, duration = 0 }) => {
  try {
    const { conversation, created } = await findOrCreateDirectConversation(callerId, receiverId);
    const answered = status === 'completed' || status === 'declined';
    await createAndBroadcastMessage({
      conversation,
      senderId: callerId,
      created,
      fields: {
        messageType: 'call',
        call: { type, status, duration },
        // A missed call stays unread for the receiver, like WhatsApp.
        seen: answered ? [callerId, receiverId] : [callerId]
      }
    });
  } catch (error) {
    console.error('logCall error:', error.message);
  }
};

const finishCall = (callId, status, endedBy = null) => {
  const call = calls.get(callId);
  if (!call) return;
  clearTimeout(call.ringTimer);
  calls.delete(callId);
  if (callByUser.get(call.callerId) === callId) callByUser.delete(call.callerId);
  if (callByUser.get(call.receiverId) === callId) callByUser.delete(call.receiverId);

  const finalStatus = call.acceptedAt ? 'completed' : status;
  const duration = call.acceptedAt ? Math.round((Date.now() - call.acceptedAt) / 1000) : 0;

  emitToUsers([call.callerId, call.receiverId], 'call:ended', {
    callId,
    status: finalStatus,
    endedBy: endedBy ? String(endedBy) : null,
    duration
  });
  logCall({ callerId: call.callerId, receiverId: call.receiverId, type: call.type, status: finalStatus, duration });
};

// A user's last device went away: end whatever call they were in.
const endCallsForUser = (userId) => {
  const callId = callByUser.get(String(userId));
  if (callId) finishCall(callId, 'missed', userId);
};

const registerCallHandlers = (io, socket) => {
  const me = socket.data.userId;
  const respond = (ack) => (typeof ack === 'function' ? ack : () => {});

  socket.on('call:start', async ({ receiverId, type } = {}, ack) => {
    const reply = respond(ack);
    try {
      receiverId = String(receiverId || '');
      const callType = type === 'video' ? 'video' : 'audio';
      if (!mongoose.isValidObjectId(receiverId) || receiverId === me) return reply({ error: 'Invalid user' });
      // Lazy require: groupCalls also requires this module.
      const { isInGroupCall } = require('./groupCalls');
      if (callByUser.has(me) || isInGroupCall(me)) return reply({ error: 'You are already on a call' });

      const [caller, receiver] = await Promise.all([
        User.findById(me).select('name avatar').lean(),
        User.findById(receiverId).select('name avatar').lean()
      ]);
      if (!caller || !receiver) return reply({ error: 'User not found' });
      if (!allowSocketEvent('call-start', me, 10, 60 * 1000)) return reply({ error: 'Too many calls. Please wait a minute.' });
      // Blocked in either direction: no call. Only the blocker is told why.
      const block = await Block.findOne({ $or: [{ blocker: me, blocked: receiverId }, { blocker: receiverId, blocked: me }] }).lean();
      if (block) {
        return reply({ error: String(block.blocker) === me ? 'You blocked this contact. Unblock them to call.' : 'Call could not be connected', reason: 'blocked' });
      }

      if (!isOnline(receiverId)) {
        logCall({ callerId: me, receiverId, type: callType, status: 'missed' });
        return reply({ error: `${receiver.name} is offline right now`, reason: 'offline' });
      }
      if (callByUser.has(receiverId) || isInGroupCall(receiverId)) {
        logCall({ callerId: me, receiverId, type: callType, status: 'busy' });
        return reply({ error: `${receiver.name} is on another call`, reason: 'busy' });
      }

      const callId = crypto.randomBytes(12).toString('hex');
      const call = {
        callId,
        channelName: `call_${callId}`,
        callerId: me,
        receiverId,
        type: callType,
        acceptedAt: null,
        ringTimer: setTimeout(() => finishCall(callId, 'missed'), RING_TIMEOUT_MS)
      };
      calls.set(callId, call);
      callByUser.set(me, callId);
      callByUser.set(receiverId, callId);

      io.to(userRoom(receiverId)).emit('call:incoming', {
        callId,
        channelName: call.channelName,
        type: callType,
        caller: publicUser(caller)
      });
      reply({ callId, channelName: call.channelName, type: callType, peer: publicUser(receiver) });
    } catch (error) {
      console.error('call:start error:', error.message);
      reply({ error: 'Could not start the call' });
    }
  });

  socket.on('call:accept', ({ callId } = {}, ack) => {
    const reply = respond(ack);
    const call = calls.get(callId);
    if (!call || call.receiverId !== me) return reply({ error: 'This call is no longer available' });
    if (call.acceptedAt) return reply({ error: 'Call already answered on another device' });
    clearTimeout(call.ringTimer);
    call.acceptedAt = Date.now();
    io.to(userRoom(call.callerId)).emit('call:accepted', { callId });
    // Stop ringing on the receiver's other tabs/devices.
    socket.to(userRoom(me)).emit('call:handled', { callId });
    reply({ ok: true });
  });

  socket.on('call:reject', ({ callId } = {}) => {
    const call = calls.get(callId);
    if (!call || call.receiverId !== me || call.acceptedAt) return;
    finishCall(callId, 'declined', me);
  });

  // Hang up (either side) or cancel before it was answered (caller).
  socket.on('call:end', ({ callId } = {}) => {
    const call = calls.get(callId);
    if (!call || (call.callerId !== me && call.receiverId !== me)) return;
    finishCall(callId, 'missed', me);
  });
};

const isInDirectCall = (userId) => callByUser.has(String(userId));

module.exports = { registerCallHandlers, getCallByChannel, endCallsForUser, isInDirectCall };
