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
      enum: ["text", "image", "video", "audio", "file", "sticker", "call"],
      default: "text",
    },
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
