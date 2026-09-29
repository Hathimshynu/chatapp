const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const Conversation = require('../models/Conversation');
const { protect } = require('../middleware/auth');
const { getCallByChannel } = require('../socket/calls');
const { getGroupCallByChannel, activeCallsFor, MAX_PARTICIPANTS } = require('../socket/groupCalls');
const { serverError } = require('../utils/http');

const router = express.Router();

const TOKEN_TTL_SECONDS = 2 * 60 * 60;
// Group tokens are short-lived and bound to the user's account, so a removed
// member cannot rejoin, and loses the channel when the token is not renewed.
const GROUP_TOKEN_TTL_SECONDS = 10 * 60;

const agoraReady = (res) => {
  if (process.env.AGORA_APP_ID && process.env.APP_CERTIFICATE) return true;
  console.error('Agora credentials are not configured');
  res.status(503).json({ message: 'Calling is not available right now' });
  return false;
};

// @GET /api/calls/token?channel=call_<id> | gcall_<id>
// 1:1: only the two participants of a live call. Group: only current group
// members who joined the call through the socket.
router.get('/token', protect, async (req, res) => {
  try {
    const channel = String(req.query.channel || '').trim();
    if (!channel) return res.status(400).json({ message: 'Call channel is required' });
    if (!agoraReady(res)) return;
    const userId = String(req.user._id);

    if (channel.startsWith('gcall_')) {
      const call = getGroupCallByChannel(channel);
      const stillMember = call && await Conversation.exists({ _id: call.conversationId, isGroup: true, participants: userId });
      if (!call || !call.participants.has(userId) || !stillMember) {
        return res.status(403).json({ message: 'This call is no longer available to you' });
      }
      const expiresAt = Math.floor(Date.now() / 1000) + GROUP_TOKEN_TTL_SECONDS;
      const token = RtcTokenBuilder.buildTokenWithAccount(
        process.env.AGORA_APP_ID, process.env.APP_CERTIFICATE, channel, userId, RtcRole.PUBLISHER, expiresAt
      );
      return res.json({ appId: process.env.AGORA_APP_ID, token, uid: userId, expiresAt });
    }

    const call = getCallByChannel(channel);
    if (!call || (call.callerId !== userId && call.receiverId !== userId)) {
      return res.status(403).json({ message: 'This call is no longer active' });
    }
    const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const token = RtcTokenBuilder.buildTokenWithUid(
      process.env.AGORA_APP_ID, process.env.APP_CERTIFICATE, channel, 0, RtcRole.PUBLISHER, expiresAt
    );
    res.json({ appId: process.env.AGORA_APP_ID, token, expiresAt });
  } catch (error) {
    serverError(res, error);
  }
});

// @GET /api/calls/group/active — group calls in progress in my groups (for "Join")
router.get('/group/active', protect, async (req, res) => {
  try {
    res.json({ calls: await activeCallsFor(req.user._id), max: MAX_PARTICIPANTS });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;
