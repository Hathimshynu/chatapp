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
| `controllers/userController.js` | Search, profiles (with friendship state and mutual friends), privacy settings, blocking |
| `controllers/friendController.js`, `routes/friends.js`, `models/Friendship.js` | Friend requests: send, accept, decline, cancel, unfriend, lists. One document per pair (unique `pair` key) |
| `utils/privacy.js` | Privacy and blocking rules applied to every user object the server sends ("contacts" = friends + direct-chat partners) |
| `socket/groupCalls.js` | Group call registry, membership checks, 8-person cap, call logs |
| `routes/media.js` | Uploads (raw body, max 15 MB) and streaming with HTTP Range support |
| `routes/calls.js` | Agora tokens, issued only to the two people in a live call |
| `controllers/groupController.js`, `services/groups.js` | Groups: members, roles, permissions, invite links, leave/delete, membership cache |
| `controllers/statusController.js` | Status: feed, visibility rules, views, replies/reactions, expiry |
| `routes/search.js` | Regex-escaped search over people, my groups and my messages |
| `services/push.js`, `routes/push.js` | Web Push (VAPID) for users with no open app |

## Socket events

The client connects with `io(url, { auth: { token } })`.

| Direction | Event | Payload |
|---|---|---|
| server → client | `presence:list` / `presence` | online user ids / `{ userId, online, lastSeen }` |
| server → client | `message:new`, `message:updated`, `message:removed` | `{ message, conversationId }` |
| server → client | `messages:delivered`, `messages:seen` | `{ conversationId, messageIds, userId }` |
| server → client | `conversation:read`, `conversation:cleared`, `user:updated` | |
| client → server | `typing`, `typing:stop` | `{ conversationId, type: 'typing' \| 'recording' }` — the server checks membership and relays to the other members only |
| server → client | `typing`, `typing:stop` | `{ conversationId, userId, type }` |
| server → client | `group:updated` | `{ conversationId, group, action, userIds? }` — created / info / settings / added / removed / promoted / demoted / joined / left |
| server → client | `group:removed` | `{ conversationId, reason: 'removed' \| 'left' \| 'deleted' }` — sent to users who lost access |
| server → client | `status:created`, `status:deleted` | `{ userId, statusId }` — only to users allowed to see it |
| server → client | `status:viewed` | `{ statusId, viewer, viewedAt }` — to the owner |
| server → client | `status:reaction` | `{ statusId, userId, emoji }` — to the owner |
| client → server | `call:start` (with ack), `call:accept` (with ack), `call:reject`, `call:end` | `{ receiverId, type }` / `{ callId }` |
| server → client | `call:incoming`, `call:accepted`, `call:handled`, `call:ended` | |
| client ↔ server | `call:relay` | `{ callId }` — media isn't arriving; relayed to the other participant so both reconnect via Agora's TCP relay |
| client → server | `groupcall:start` / `groupcall:join` (with ack), `groupcall:decline`, `groupcall:leave` | `{ conversationId, type }` / `{ callId }` |
| server → client | `groupcall:incoming`, `groupcall:updated`, `groupcall:ended`, `groupcall:handled` | `updated`: `{ conversationId, call \| null }`; `ended`: `{ callId, conversationId, reason }` |
| client ↔ server | `groupcall:relay` | `{ callId }` — relayed to the other participants of that call |
| server → client | `conversation:updated` | `{ conversationId, pinned? , muted?, archived? }` — to your own devices |
| server → client | `block:updated` | `{ userId, blocked }` — to your own devices |
| server → client | `friend:request` | `{ requestId, requester, recipient, status }` — to both people |
| server → client | `friend:updated` | `{ requestId, requester, recipient, status: 'accepted' \| null }` — accepted, declined, cancelled or unfriended |

## Friends API

| Method | Path | Who | Result |
|---|---|---|---|
| GET | `/api/friends` | me | My friends (privacy-masked) |
| GET | `/api/friends/requests` | me | `{ incoming, outgoing }` pending requests |
| POST | `/api/friends/requests` `{ userId }` | anyone | `201` sent · `200` friends (they had asked you) · `400` self/invalid · `403` blocked · `404` no user · `409` already sent/friends · `429` |
| POST | `/api/friends/requests/:id/accept` | recipient only | `200` friends · `404` otherwise |
| POST | `/api/friends/requests/:id/decline` | recipient only | `200` · `404` otherwise |
| DELETE | `/api/friends/requests/:id` | sender only | `200` cancelled · `404` otherwise |
| DELETE | `/api/friends/:userId` | either friend | `200` unfriended · `404` not friends |

`GET /api/users/search`, `GET /api/search` and `GET /api/users/:id` include `friendship: { state: 'none' | 'outgoing' | 'incoming' | 'friends', requestId? }`; profiles also include `mutualFriends`.
