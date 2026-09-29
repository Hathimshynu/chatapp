const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// One document per (status, viewer) — kept out of the Status document so a
// popular status never grows an unbounded array.
const statusViewSchema = new mongoose.Schema({
  status: { type: ObjectId, ref: 'Status', required: true },
  owner: { type: ObjectId, ref: 'User', required: true },
  viewer: { type: ObjectId, ref: 'User', required: true },
  viewedAt: { type: Date, default: Date.now },
  reaction: { type: String, default: '' },
  expiresAt: { type: Date, required: true }
});

statusViewSchema.index({ status: 1, viewer: 1 }, { unique: true });
statusViewSchema.index({ viewer: 1, expiresAt: 1 });
statusViewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('StatusView', statusViewSchema);
