const express = require('express');
const { serverError } = require('../utils/http');
const PushSubscription = require('../models/PushSubscription');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { publicKey } = require('../services/push');
const { rateLimit, LIMITS } = require('../utils/rateLimit');

const router = express.Router();
router.use(protect);

const validSubscription = (sub) =>
  sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) && sub.endpoint.length < 1000 &&
  typeof sub.keys?.p256dh === 'string' && typeof sub.keys?.auth === 'string' &&
  sub.keys.p256dh.length < 200 && sub.keys.auth.length < 100;

// @GET /api/push/config — whether push is available + the VAPID public key
router.get('/config', async (req, res) => {
  const key = publicKey();
  const count = key ? await PushSubscription.countDocuments({ user: req.user._id }) : 0;
  res.json({ enabled: !!key, publicKey: key, subscribed: count > 0, preview: req.user.pushPreview !== false });
});

// @POST /api/push/subscribe  { subscription } — user id always comes from the token
router.post('/subscribe', rateLimit(LIMITS.pushSubscribe), async (req, res) => {
  try {
    if (!publicKey()) return res.status(503).json({ message: 'Push notifications are not configured on the server' });
    const { subscription } = req.body;
    if (!validSubscription(subscription)) return res.status(400).json({ message: 'Invalid push subscription' });
    await PushSubscription.updateOne(
      { endpoint: subscription.endpoint, user: req.user._id },
      { $set: { keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } } },
      { upsert: true }
    );
    res.status(201).json({ subscribed: true });
  } catch (error) {
    serverError(res, error);
  }
});

// @DELETE /api/push/subscribe  { endpoint? } — removes this device (or all) for the current user only
router.delete('/subscribe', async (req, res) => {
  const filter = { user: req.user._id };
  if (typeof req.body?.endpoint === 'string') filter.endpoint = req.body.endpoint;
  const { deletedCount } = await PushSubscription.deleteMany(filter);
  res.json({ removed: deletedCount });
});

// @PUT /api/push/preview  { preview: boolean } — show message text in notifications?
router.put('/preview', async (req, res) => {
  const preview = req.body?.preview !== false;
  await User.updateOne({ _id: req.user._id }, { pushPreview: preview });
  res.json({ preview });
});

module.exports = router;
