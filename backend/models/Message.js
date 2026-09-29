const mongoose = require("mongoose");

const { ObjectId } = mongoose.Schema.Types;

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    name: { type: String, default: "" },
    size: { type: Number, default: 0 },
    duration: { type: Number, default: 0 }, // seconds, for audio/video
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
  },
  { _id: false },
);

const reactionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    emoji: { type: String, required: true },
  },
  { _id: false },
);

const callSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["audio", "video"], default: "audio" },
    status: {
      type: String,
      enum: ["completed", "missed", "declined", "busy"],
      default: "completed",
    },
    duration: { type: Number, default: 0 },
  },
  { _id: false },
);

// Group events ("Alice added Bob"). Names are resolved from the ids at read time.
const systemSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["created", "added", "removed", "left", "joined", "promoted", "demoted", "renamed", "description", "avatar", "settings", "invite_reset"],
      required: true,
    },
    actor: { type: ObjectId, ref: "User" },
    targets: [{ type: ObjectId, ref: "User" }],
    value: { type: String, default: "" },
  },
  { _id: false },
);

// Timestamped receipts ("Read by … at …"). One entry per user per kind, so the
// array is bounded by 2 × group size.
const receiptSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["delivered", "read"], required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Snapshot of the status a message replies to (the status itself expires).
const statusRefSchema = new mongoose.Schema(
  {
    status: { type: ObjectId, ref: "Status" },
    owner: { type: ObjectId, ref: "User" },
    type: { type: String, enum: ["text", "image", "video"] },
    text: { type: String, default: "" },
    background: { type: String, default: "" },
    mediaUrl: { type: String, default: "" },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      default: "",
    },
    messageType: {
      type: String,
      enum: ["text", "image", "video", "audio", "file", "sticker", "call", "system"],
      default: "text",
    },
    system: { type: systemSchema, default: undefined },
    statusRef: { type: statusRefSchema, default: undefined },
    // Group messages: how many other members should receive it (drives group ticks).
    recipientCount: { type: Number, default: undefined },
    receipts: { type: [receiptSchema], default: undefined },
    media: { type: mediaSchema, default: undefined },
    // Legacy inline base64 fields — kept so older messages still render.
    image: { type: String, default: "" },
    audio: { type: String, default: "" },
    replyTo: { type: ObjectId, ref: "Message", default: null },
    forwarded: { type: Boolean, default: false },
    reactions: { type: [reactionSchema], default: [] },
    call: { type: callSchema, default: undefined },
    // Users who have received the message on a device (grey double tick).
    deliveredTo: [{ type: ObjectId, ref: "User" }],
    // Users who have read the message (blue double tick). Always includes the sender.
    seen: [{ type: ObjectId, ref: "User" }],
    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false }, // deleted for everyone
    deletedFor: [{ type: ObjectId, ref: "User" }], // deleted for me
    clientId: { type: String, default: "" },
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, seen: 1 });

module.exports = mongoose.model("Message", messageSchema);
