const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/token', protect, (req, res) => {
  const channel = String(req.query.channel || '').trim();
  if (!channel) return res.status(400).json({ message: 'Call channel is required' });
  if (!process.env.AGORA_APP_ID || !process.env.APP_CERTIFICATE) {
    return res.status(500).json({ message: 'Agora credentials are not configured' });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
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