const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const { protect } = require('../middleware/auth');
const { getCallByChannel } = require('../socket/calls');

const router = express.Router();

const TOKEN_TTL_SECONDS = 2 * 60 * 60;

// @GET /api/calls/token?channel=call_<id>
// Only the two participants of a live call can get a token for its channel.
router.get('/token', protect, (req, res) => {
  const channel = String(req.query.channel || '').trim();
  if (!channel) return res.status(400).json({ message: 'Call channel is required' });
  if (!process.env.AGORA_APP_ID || !process.env.APP_CERTIFICATE) {
    return res.status(500).json({ message: 'Agora credentials are not configured' });
  }

  const call = getCallByChannel(channel);
  const userId = String(req.user._id);
  if (!call || (call.callerId !== userId && call.receiverId !== userId)) {
    return res.status(403).json({ message: 'This call is no longer active' });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const token = RtcTokenBuilder.buildTokenWithUid(
    process.env.AGORA_APP_ID,
    process.env.APP_CERTIFICATE,
    channel,
    0,
    RtcRole.PUBLISHER,
    expiresAt
  );

  res.json({ appId: process.env.AGORA_APP_ID, token, expiresAt });
});

module.exports = router;
