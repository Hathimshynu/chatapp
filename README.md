# ChatApp

Real-time messaging with friends, groups, statuses and HD voice & video calls. Works in any browser and installs as an app on Android, iPhone, iPad and desktop. No phone number needed: people find each other by name or email.

## Features

**Friends (Facebook-style)**
- **Friends** tab: search anyone by name or email, send a friend request, and they accept or delete it. Accepted friends appear in both people's friends lists.
- Incoming requests show a badge on the Friends tab and arrive instantly on every open tab/device (plus a push notification when the app is closed, if push is configured)
- Cancel a sent request, unfriend at any time; sending a request to someone who already asked you makes you friends straight away
- **People you may know**: friends of your friends (most mutual friends first) and people you share chats or groups with — never people you blocked or already asked
- **Profiles**: tap anyone (in search, the Friends tab, a group's member list, or a group message avatar) to see their photo, name, about, online/last seen, mutual friends, and Add friend / Message / Voice / Video
- Friends count as "contacts" for privacy settings and status visibility, together with people you have a direct chat with
- Messaging does not require friendship (like WhatsApp); blocking someone also removes the friendship and any pending request

**Messaging**
- Instant delivery over Socket.IO, with optimistic sending (messages appear immediately, with a clock until the server confirms them)
- WhatsApp-style receipts: ✓ sent, ✓✓ delivered, blue ✓✓ read
- Live "typing…" and "recording audio…" indicators, in the chat header and the chat list
- Online status and "last seen"
- Replies (swipe right on phone, double-click on desktop), reactions, edit within 15 minutes, delete for me / for everyone, forward to up to 5 chats, copy
- Photos & videos with captions (auto-compressed), documents, voice notes with waveform and 1×/1.5×/2× playback, stickers & GIFs, full emoji picker
- Paste or drag-and-drop files into a chat
- Drafts saved per chat and per account, links are clickable, 1–3 emoji messages show large
- Pin, mute, **archive** and clear chats; filter by All / Unread / Groups / Online / Pinned
- Archived chats stay archived when new messages arrive; their unread count shows on the "Archived" row. Archiving is per user and syncs across your devices.
- Offline-safe: a banner shows when you are offline or reconnecting. Messages sent meanwhile stay on screen as "Not sent" and are kept in an outbox on the device (per account), so they survive closing or reloading the app; they are sent automatically when the connection returns, even if that chat isn't open. The server ignores a repeat of a message it already has, so a flaky connection never creates duplicates. Logging out clears that account's unsent messages and drafts from the device.
- The installed app opens without a connection (cached app shell and code) and loads your chats as soon as you're back online
- Unread counts come from the server and appear in the tab title and on the installed app's icon
- Search across chats, groups (by name or member), people and message text/sender; jumps to the matching message. Special characters such as `( ) [ ] * + ? . \` are matched literally.

**Privacy & safety**
- Settings → Privacy: who can see your last seen, online status, profile photo and about (Everyone / My contacts / Nobody), and read receipts on/off. All enforced by the server.
- Block / unblock from a chat's menu or contact info; Settings → Blocked contacts. Blocked people can't message or call you, and don't see your online status, last seen, photo, about or statuses. Your chat history stays, and they aren't told.
- Rate limits on sign-in, sign-up, sending, uploads, search, statuses, groups, friend requests and blocking (see below)

**Group chats**
- Create a group (name, photo, optional description, 2–256 members); the creator becomes admin. Friends are suggested when adding members.
- Everything from direct chats works in groups: media, voice notes, stickers, replies, reactions, edit/delete, forward, drafts, drag & drop
- Sender name (colour-coded) and avatar on the first message of each run; list previews like "John: 📷 Photo"
- Group receipts: ✓✓ once everyone has received it, blue once everyone has read it; **Message info** shows who read/received it and when
- "John is typing…", "John and Sarah are typing…", "3 people are typing…" — only sent to that group's members
- Admins: add/remove members, make/dismiss admins, edit name/description/photo, invite links (create, copy, share, reset, turn off), delete the group
- Permissions: who can edit group info / send messages / add members (everyone or admins only), enforced by the server
- Leave group; if the last admin leaves, the longest-standing member becomes admin automatically
- New members only see messages from after they joined; system messages record every change
- Invite links: `https://your-domain/join/<token>` — opaque token, no database ids

**Status (stories)**
- Text statuses (8 backgrounds, 4 fonts, alignment, emoji), photo and video statuses with captions
- Disappear after 24 hours — enforced by the server on every request, plus a MongoDB TTL index for cleanup
- Privacy: My contacts / My contacts except… / Only share with…, enforced by the server
- Full-screen viewer with progress bars, swipes, hold to pause; "Viewed by N" with reactions; replies arrive as direct messages

**Calls**
- 1:1 calls: 720p HD video at 30fps and 48 kHz voice with echo cancellation and noise suppression (Agora)
- **Group voice & video calls** in any group: up to 8 people, participant grid, active-speaker highlight, join/leave any time, "Join" pill in the chat while a call is running. Only current members can join; removed members are dropped; deleting the group ends the call. Group video is 640×360 per person (not HD) so phones can decode up to 7 streams.
- Full-screen incoming call on phones, banner on desktop; ringtones, vibration and screen wake-lock
- Camera flip, camera on/off, mute, speaker, picture-in-picture self view, network quality bars; minimize a call to keep chatting
- **Works on restrictive networks**: some ISPs, mobile networks, VPNs and firewalls drop the large UDP packets video uses, so audio works but video never arrives. The app checks that the other person's media arrives within a few seconds. If it doesn't, both sides reconnect automatically through Agora's cloud proxy (TCP/TLS on port 443), and the device remembers this for 3 days. Poor connections switch to a smaller stream, then audio-only, and show "Video paused — poor connection" instead of a frozen picture.
- Missed, declined and completed calls (including group calls) are logged in the chat and on the **Calls** tab

**Notifications**
- In-app sound + system notification while the app is open in the background
- Web Push when the app is completely closed (requires VAPID keys, see below): messages, missed calls and friend requests; muted chats are skipped; only sent when you have no open app/tab

**Accounts & app**
- Several accounts on one device, Instagram-style; each browser tab can use a different account. Drafts and preferences are kept per account.
- Light, dark or system theme; WCAG AA text contrast; keyboard-friendly dialogs
- Installable PWA with an offline app shell and the phone back button handled inside the app
- Responsive from 320px phones to wide desktops, including notch and safe-area support

## Tech stack

- **Backend:** Node.js, Express 5, MongoDB/Mongoose, Socket.IO, JWT, Agora token builder, web-push
- **Frontend:** React 18, Vite, Socket.IO client, Agora Web SDK (loaded only when a call starts), lucide icons, emoji-picker-react, Giphy

## Setup

```bash
# Backend
cd backend
npm install
cp .env.example .env      # fill in the values (see below)
npm run dev               # http://localhost:5000

# Frontend (second terminal)
cd frontend
npm install
cp .env.example .env
npm run dev               # http://localhost:5173
```

In development, Vite proxies `/api` and `/socket.io` to the backend.

### Testing calls from a phone on the same Wi-Fi

Browsers only allow the camera and microphone on **HTTPS** pages (or `localhost`). On `http://<your-computer-ip>:5173`, calls cannot work, and the app says so. Instead:

```bash
cd frontend
npm run dev:https         # https://<your-computer-ip>:5173 with a self-signed certificate
```

Open `https://<your-computer-ip>:5173` on the phone and accept the certificate warning once. Your computer and phone must be on the same network, and the firewall must allow port 5173.

## Environment variables

### Backend (`backend/.env`)
| Variable | Description |
|---|---|
| `PORT` | Server port (default 5000) |
| `MONGO_URI` | MongoDB connection string: a local server (`mongodb://127.0.0.1:27017/chatapp`) or MongoDB Atlas (`mongodb+srv://…`). With Atlas, allow your backend host's IP under *Network Access*. |
| `JWT_SECRET` | **Long random string** used to sign logins (not an expiry like `7d`). Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Changing it signs everyone out once. |
| `AGORA_APP_ID` / `APP_CERTIFICATE` | From the [Agora console](https://console.agora.io). The project must have the App Certificate enabled (token authentication). |
| `FRONTEND_URL` | Comma-separated allowed origins, e.g. `http://localhost:5173,https://your-app.vercel.app` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | *Optional* — enables push notifications while the app is closed. Generate once with `npx web-push generate-vapid-keys` (run in `backend/`). Without them (or with invalid ones) push is turned off and the server still starts. |
| `VAPID_SUBJECT` | *Optional* — contact for push services, e.g. `mailto:you@example.com` |
| `RATE_LIMIT_MULTIPLIER` | *Optional* — multiplies every rate limit (e.g. `20` for load tests). Default 1. |

Never commit real `.env` files. They are git-ignored, and the `.env.example` files contain placeholders only.

### Frontend (`frontend/.env`)
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL in production (e.g. `https://your-api.onrender.com`). In dev, the proxy target. |
| `VITE_GIPHY_KEY` | Giphy API key for stickers & GIFs |
| `VITE_CALL_RELAY` | *Optional* — `auto` (default: direct, switch to Agora's TCP relay when media doesn't arrive), `always` (always relay; most reliable, slightly higher latency), or `never` |

Pusher is no longer used. Delete the `PUSHER_*` / `VITE_PUSHER_*` variables from your hosting dashboards. A Pusher secret was committed to this repository's history in the past, so revoke that Pusher app (or rotate its secret) in the Pusher dashboard.

## Rate limits

Per user when signed in, otherwise per IP address. Fixed windows, kept in memory (use a shared store such as Redis if you run several backend instances). Exceeding a limit returns `429` with a `Retry-After` header.

| Action | Limit |
|---|---|
| Sign in | 10 per 15 min per email + IP, and 50 per 15 min per IP |
| Sign up | 10 per hour per IP |
| Send message | 90 per minute |
| Upload | 60 per 10 min |
| Search | 90 per minute |
| Post status | 30 per hour |
| Create group / invite links / add members | 20 / 30 / 60 per hour |
| Friend requests | 50 per hour |
| Block / unblock | 60 per hour |
| Push subscribe | 20 per hour |
| Typing events (socket) | 40 per 10 s per connection |
| Start call / group call (socket) | 10 per minute each |
| Relay switch requests (socket) | 5 per minute |

## Production deployment

1. **Backend** (e.g. Render, Railway, a VPS): run `npm install` and `npm start` in `backend/`, and set the backend variables above. Socket.IO needs WebSocket support and a single instance, or sticky sessions if you scale out (rate limits and live calls are kept in memory).
2. **Frontend** (e.g. Vercel): build command `npm run build`, output `dist/`, and set `VITE_API_URL` to the backend's HTTPS URL. `vercel.json` already handles SPA routing and the service-worker and cache headers.
3. Add the frontend URL to `FRONTEND_URL` on the backend.
4. Deploy the backend and frontend **together**: this version adds new API routes and realtime events (friends, calls relay), so an old frontend cannot use them.
5. **Check the backend really updated:** open `https://<your-backend>/api/health`. It must return JSON with `apiVersion` and the deployed `commit`. If you get an HTML "Cannot GET" page, or the app shows "This feature needs a server update", the backend is still running an old build. On Render, open the service → **Events/Logs** and look for a failed deploy, check that *Auto-Deploy* is on for the `main` branch with root directory `backend`, then use **Manual Deploy → Deploy latest commit**. The backend needs Node 20.19 or newer (set in `package.json` `engines`).

**HTTPS is required** for camera, microphone, notifications and app install on phones. `localhost` is the only exception.

## Installing the app

- **Android / Chrome / Edge:** open the site and tap **Install** (in the chat list banner or under *Settings → App*), or use the browser menu → *Install app*.
- **iPhone / iPad:** open in Safari → Share → **Add to Home Screen**.
- **Desktop:** click the install icon in the address bar.

## Scripts

| Where | Command | What it does |
|---|---|---|
| backend | `npm run dev` | Start the API with auto-reload |
| frontend | `npm run dev` | Start the dev server (http) |
| frontend | `npm run dev:https` | Dev server over HTTPS, for testing calls on phones |
| frontend | `npm run build` | Build for production into `dist/` |
| frontend | `npm run lint` | Run ESLint |

## Troubleshooting calls

| Symptom | Cause and fix |
|---|---|
| "Calls need a secure connection…" | The page is on `http://` (not localhost). Use the HTTPS URL, or `npm run dev:https` for local testing. |
| You hear each other but there's no video | Your network drops large UDP packets. The app detects this and reconnects through Agora's relay within about 10 seconds. To relay from the start on such networks, set `VITE_CALL_RELAY=always`. |
| "Allow camera and microphone access…" | Permission was denied. Allow it in the browser's site settings, then call again. |
| "Calling is not available right now" | `AGORA_APP_ID` / `APP_CERTIFICATE` are missing on the backend, or the Agora project doesn't have the certificate enabled. |
| Calls stop working for everyone | Check the Agora console: project status, usage/billing and that the App Certificate hasn't been rotated. |

## Verification status

| Area | Implemented | Automated tests | Needs external config | Needs a real device |
|---|---|---|---|---|
| Direct messaging, receipts, presence, uploads | ✅ | ✅ backend + two-browser tests | — | — |
| Friends, requests, profiles | ✅ | ✅ backend (incl. attack tests) + browser | — | — |
| Archive, block, privacy, offline retry | ✅ | ✅ backend + browser | — | — |
| Group chats, admin, permissions, invite links | ✅ | ✅ backend (incl. attack tests) + browser | — | — |
| Status: create, view, privacy, expiry, replies | ✅ | ✅ backend (incl. attack tests) + browser | — | — |
| Search | ✅ | ✅ backend + browser | — | — |
| 1:1 and group calls (Agora), relay fallback | ✅ | ✅ signalling, tokens, and media flow with a synthetic 1280×720 camera through real Agora servers (direct and relay) | Agora App ID/Certificate | ✅ real camera video on phones |
| Web Push (app closed) | ✅ | ✅ server side (sending, encryption, no duplicates, muted chats, missing/invalid keys) and in Chrome: a push delivered to the real service worker shows the right notification, collapses per chat, survives a malformed payload, and opens the chat | VAPID keys | ✅ delivery through real push services on phones |
| Installable PWA | ✅ | ✅ Chrome installability check; app reloads fully offline | HTTPS hosting | install on iOS/Android |
| Offline outbox | ✅ | ✅ send offline → reload offline → reconnect: delivered exactly once; logout clears it | — | — |

## Verifying calls on real devices

Automated tests use a synthetic camera, so they confirm signalling and that media flows, but **not** real camera quality on phones. After every deploy that touches calls:

1. Open the deployed **HTTPS** site on two physical devices (e.g. an Android phone on mobile data and a laptop on Wi-Fi).
2. Sign in as two different users and make a voice call, then a video call.
3. Confirm both sides see the other person's camera and hear audio, and that mute, camera off/on, flip camera, minimize and hang-up work.
4. Repeat with a group video call between three devices.

## Verifying push notifications

1. Set the VAPID keys on the backend and deploy over HTTPS.
2. **Desktop Chrome/Edge/Firefox:** Settings → Notifications → turn on "When the app is closed". Close every ChatApp tab, send yourself a message from another account, and a system notification should appear.
3. **Android:** install the app (or use Chrome), enable notifications the same way, close the app, and send a message.
4. **iPhone/iPad (iOS 16.4+):** push only works once ChatApp is added to the Home Screen. Open it from the Home Screen icon, enable notifications, close it, and send a message.

## Notes & limitations

- **Uploads** are stored in MongoDB (`media` collection), **max 15 MB per file**. For heavy use, move them to object storage (S3, Cloudinary or R2).
- **Voice notes** recorded in Chrome, Edge or Firefox are WebM/Opus files, which may not play on older iPhones/iPads.
- Agora bills HD (720p) video at a higher tier than SD. To lower costs, change `HD_VIDEO` in `frontend/src/hooks/useAgoraCall.js`.
- When a call uses the relay, the browser console may show a CORS error from Agora's own analytics upload (`statscollector` via `webrtc-cloud-proxy.agora.io`). It is Agora's telemetry and does not affect the call.
- **Push on iPhone/iPad** only works once ChatApp is added to the Home Screen (iOS 16.4+).
- Group size is capped at 256 members, and group calls at 8 participants.

- Unsent **attachments** that were still uploading when the app closed are not kept (text, stickers and already-uploaded files are); send them again.
- Dependencies: `npm audit` reports 0 issues in the backend. The frontend has 4 moderate advisories left: React Router's open-redirect issues (fixed only in React Router 7, a major upgrade — not reachable here because the only user-supplied path, the post-login `?next=`, is restricted to `/join/<code>`) and a `uuid` issue inside the Giphy library that only applies when a buffer is passed, which it isn't.

**Not implemented:** end-to-end encryption, and native Play Store / App Store builds (the app installs as a PWA instead).
