const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

const statusSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['text', 'image', 'video'], required: true },
  // Text statuses
  text: { type: String, default: '', maxlength: 700 },
  background: { type: String, default: '' },
  align: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
  font: { type: String, enum: ['sans', 'serif', 'bold', 'mono'], default: 'sans' },
  // Media statuses
  media: {
    type: new mongoose.Schema({
      url: String, mimeType: String, width: Number, height: Number, duration: Number
    }, { _id: false }),
    default: undefined
  },
  caption: { type: String, default: '', maxlength: 700 },
  // Who may see it. Contacts = people you have a direct chat with.
  visibility: {
    mode: { type: String, enum: ['contacts', 'except', 'only'], default: 'contacts' },
    users: [{ type: ObjectId, ref: 'User' }]
  },
  expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + STATUS_TTL_MS) }
}, { timestamps: true });

statusSchema.index({ user: 1, expiresAt: -1 });
// MongoDB removes expired documents in the background (~once a minute);
// queries additionally filter on expiresAt so expiry is exact.
statusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

statusSchema.statics.TTL_MS = STATUS_TTL_MS;

module.exports = mongoose.model('Status', statusSchema);
