# ChatApp Backend

Express + MongoDB API, Socket.IO realtime server, media storage and Agora token service. See the [root README](../README.md) for setup and environment variables.

## Layout

| Path | Purpose |
|---|---|
| `server.js` | Express app, routes, error handler, starts Socket.IO |
| `socket/index.js` | Authenticated sockets, multi-device presence, typing indicators |
| `socket/calls.js` | Call signaling, busy/offline/timeout handling, call logs |
| `services/messages.js` | Creating messages and broadcasting them to every participant's devices |
| `controllers/messageController.js` | Conversations, pagination, read/delivered receipts, edit, delete, reactions, pin/mute/clear, call history |
| `controllers/userController.js` | Search, profiles |
| `routes/media.js` | Uploads (raw body, max 15 MB) and streaming with HTTP Range support |
| `routes/calls.js` | Agora tokens, issued only to the two people in a live call |

## Socket events

The client connects with `io(url, { auth: { token } })`.

| Direction | Event | Payload |
|---|---|---|
| server → client | `presence:list` / `presence` | online user ids / `{ userId, online, lastSeen }` |
| server → client | `message:new`, `message:updated`, `message:removed` | `{ message, conversationId }` |
| server → client | `messages:delivered`, `messages:seen` | `{ conversationId, messageIds, userId }` |
| server → client | `conversation:read`, `conversation:cleared`, `user:updated` | |
| both | `typing`, `typing:stop` | `{ conversationId, receiverId, type: 'typing' \| 'recording' }` |
| client → server | `call:start` (with ack), `call:accept` (with ack), `call:reject`, `call:end` | `{ receiverId, type }` / `{ callId }` |
| server → client | `call:incoming`, `call:accepted`, `call:handled`, `call:ended` | |
