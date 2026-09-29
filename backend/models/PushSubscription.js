const mongoose = require('mongoose');

// A browser/device Web Push endpoint registered for one account. The same device
// can hold several accounts (multi-account), hence the compound unique index.
const pushSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  endpoint: { type: String, required: true, maxlength: 1000 },
  keys: {
    p256dh: { type: String, required: true, maxlength: 200 },
    auth: { type: String, required: true, maxlength: 100 }
  }
}, { timestamps: true });

pushSubscriptionSchema.index({ endpoint: 1, user: 1 }, { unique: true });
pushSubscriptionSchema.index({ user: 1 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
