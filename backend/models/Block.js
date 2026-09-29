const mongoose = require('mongoose');

// "blocker has blocked blocked". Existing messages are kept; the block only
// stops new direct messages, calls, presence and status between the two.
const blockSchema = new mongoose.Schema({
  blocker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  blocked: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

// One row per pair (no duplicates); also serves "who did I block".
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
// Reverse lookup: "who blocked me" (needed for reciprocal checks).
blockSchema.index({ blocked: 1 });

module.exports = mongoose.model('Block', blockSchema);
