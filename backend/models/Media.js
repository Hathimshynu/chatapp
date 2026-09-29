const mongoose = require('mongoose');

// Binary uploads (photos, videos, voice notes, documents, avatars).
// Stored separately from messages so chat history stays small and fast to load.
// `key` is a long random string: the media URL acts as an unguessable capability,
// which lets <img>/<video>/<audio> tags load it without an Authorization header.
const mediaSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mimeType: { type: String, required: true },
  name: { type: String, default: '' },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true },
  // Set for status media so the file disappears with the status.
  expiresAt: { type: Date, default: undefined }
}, { timestamps: true });

mediaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

module.exports = mongoose.model('Media', mediaSchema);
