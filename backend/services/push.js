// Web Push (VAPID) for users who have no open app/tab. Payloads are encrypted
// end-to-end to the browser by the Web Push protocol, so the push service
// (FCM, Mozilla, Apple) cannot read them.
const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const User = require('../models/User');
const { isOnline } = require('../utils/realtime');

let initialized = false;

const isConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

const init = () => {
  if (initialized) return true;
  if (!isConfigured()) return false;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    initialized = true;
  } catch (error) {
    console.error('Web Push disabled — invalid VAPID configuration:', error.message);
  }
  return initialized;
};

const publicKey = () => (init() ? process.env.VAPID_PUBLIC_KEY : null);

const previewText = (message) => {
  switch (message.messageType) {
    case 'image': return `📷 ${message.text || 'Photo'}`;
    case 'video': return `🎥 ${message.text || 'Video'}`;
    case 'audio': return '🎤 Voice message';
    case 'file': return `📄 ${message.media?.name || 'Document'}`;
    case 'sticker': return 'Sticker';
    case 'call': return `Missed ${message.call?.type === 'video' ? 'video' : 'voice'} call`;
    default: return (message.text || '').slice(0, 140);
  }
};

const send = async (subscription, payload) => {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      { TTL: 60 * 60, urgency: 'high', topic: payload.tag?.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '') }
    );
  } catch (error) {
    // 404/410: the browser unsubscribed — forget the endpoint.
    if (error.statusCode === 404 || error.statusCode === 410) {
      await PushSubscription.deleteOne({ _id: subscription._id }).catch(() => {});
    } else {
      console.error('push send failed:', error.statusCode || error.message);
    }
  }
};

// Called for every new chat message. Only users with *no* connected device get a
// push — online users already get the in-app/local notification, so nobody is
// notified twice for the same message.
const notifyNewMessage = async (conversation, message, senderId) => {
  if (!init()) return;
  try {
    const muted = new Set((conversation.mutedBy || []).map(String));
    const recipients = conversation.participants
      .map(String)
      .filter(id => id !== String(senderId) && !muted.has(id) && !isOnline(id));
    if (!recipients.length) return;

    const [subscriptions, users] = await Promise.all([
      PushSubscription.find({ user: { $in: recipients } }).lean(),
      User.find({ _id: { $in: recipients } }).select('pushPreview').lean()
    ]);
    if (!subscriptions.length) return;

    const wantsPreview = new Map(users.map(u => [String(u._id), u.pushPreview !== false]));
    const senderName = message.sender?.name || 'Someone';
    const title = conversation.isGroup ? conversation.name : senderName;
    const conversationId = String(conversation._id);

    await Promise.all(subscriptions.map(sub => {
      const showPreview = wantsPreview.get(String(sub.user));
      const text = previewText(message);
      return send(sub, {
        title,
        body: showPreview
          ? (conversation.isGroup ? `${senderName}: ${text}` : text)
          : (message.messageType === 'call' ? 'Missed call' : 'New message'),
        tag: `conv-${conversationId}`,
        conversationId,
        userId: String(sub.user)
      });
    }));
  } catch (error) {
    console.error('notifyNewMessage:', error.message);
  }
};

module.exports = { isConfigured, publicKey, notifyNewMessage };
