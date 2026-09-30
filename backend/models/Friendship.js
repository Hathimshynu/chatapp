const mongoose = require('mongoose');

// One document per pair of users (Facebook-style friends).
//  status 'pending'  → `requester` sent a request to `recipient`
//  status 'accepted' → they are friends
// Declining, cancelling or unfriending deletes the document.
const friendshipSchema = new mongoose.Schema(
  {
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // "<smallerId>_<largerId>": unique, so a pair can only ever have one request/friendship
    // (A→B and B→A at the same time is impossible, even under concurrent requests).
    pair: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    acceptedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

friendshipSchema.index({ pair: 1 }, { unique: true });
// "My friends" and "requests sent to me" lookups.
friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ recipient: 1, status: 1 });

friendshipSchema.statics.pairKey = (a, b) => [String(a), String(b)].sort().join('_');

module.exports = mongoose.model('Friendship', friendshipSchema);
