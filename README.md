# ChatApp

Real-time messaging with HD voice & video calls. Works in any browser and installs as an app on Android, iPhone, iPad and desktop.

## Features

**Messaging**
- Instant delivery over Socket.IO, with optimistic sending (messages appear immediately, with a clock until the server confirms them)
- WhatsApp-style receipts: ✓ sent, ✓✓ delivered, blue ✓✓ read
- Live "typing…" and "recording audio…" indicators, in the chat header and the chat list
- Online status and "last seen"
- Replies (swipe right on phone, double-click on desktop), reactions, edit within 15 minutes, delete for me / for everyone, forward to up to 5 chats, copy
- Photos & videos with captions (auto-compressed), documents, voice notes with waveform and 1×/1.5×/2× playback, stickers & GIFs, full emoji picker
- Paste or drag-and-drop files into a chat
- Drafts saved per chat, links are clickable, 1–3 emoji messages show large
- Pin, mute and clear chats; filter by All / Unread / Groups / Online / Pinned
- Unread counts come from the server and appear in the tab title and on the installed app's icon
- Search across chats, groups (by name or member), people and message text/sender; jumps to the matching message. Special characters such as `( ) [ ] * + ? . \` are matched literally.

**Group chats**
- Create a group (name, photo, optional description, 2–256 members); the creator becomes admin
- Everything from direct chats works in groups: media, voice notes, stickers, replies, reactions, edit/delete, forward, drafts, drag & drop
- Sender name (colour-coded) and avatar on the first message of each run; list previews like "John: 📷 Photo"
- Group receipts: ✓✓ once everyone has received it, blue once everyone has read it; **Message info** shows who read/received it and when
- "John is typing…", "John and Sarah are typing…", "3 people are typing…" — only sent to that group's members
- Header shows "5 members · John, Sarah and 3 others online" (reuses presence, no extra traffic)
- Admins: add/remove members, make/dismiss admins, edit name/description/photo, invite links (create, copy, share, reset, turn off), delete the group
- Permissions: who can edit group info / send messages / add members (everyone or admins only), enforced by the server
- Leave group; if the last admin leaves, the longest-standing member becomes admin automatically
- New members only see messages from after they joined; system messages record every change ("Alice added Bob", "Bob left", …)
- Invite links: `https://your-domain/join/<token>` — opaque token, no database ids; signed-out visitors log in or sign up and return to the invite

**Status (stories)**
- Text statuses (8 backgrounds, 4 fonts, alignment, emoji), photo and video statuses with captions
- Disappear after 24 hours — enforced by the server on every request, plus a MongoDB TTL index for cleanup; status media expires with it
- Privacy: My contacts / My contacts except… / Only share with… (contacts = people you have a direct chat with), enforced by the server
- Full-screen viewer: progress bars, tap left/right, swipe between people, swipe down to close, hold to pause, video mute
- "Viewed by N" with names, times and reactions; replies and quick reactions arrive as normal direct messages quoting the status

**Notifications**
- In-app sound + system notification while the app is open in the background
- Web Push when the app is completely closed (requires VAPID keys, see below): new messages, group messages and missed calls; muted chats are skipped; pushes are only sent when you have no open app/tab, so you are never notified twice; optional "hide message text" setting

**Calls**
- 720p HD video at 30fps and 48 kHz voice with echo cancellation and noise suppression (Agora)
- Full-screen incoming call on phones, banner on desktop; ringtones, vibration and screen wake-lock
- Camera flip, camera on/off, mute, speaker, picture-in-picture self view (tap to swap), network quality bars
- Minimize a call to keep chatting
- Missed, declined and completed calls are logged in the chat and on the **Calls** tab

**Accounts & app**
- Several accounts on one device, Instagram-style: add accounts and switch instantly. Each browser tab can use a different account.
- Light, dark or system theme
- Installable PWA with an offline app shell, notifications, and the phone back button handled inside the app
- Responsive from 320px phones to wide desktops, including notch and safe-area support

## Tech stack

- **Backend:** Node.js, Express 5, MongoDB/Mongoose, Socket.IO, JWT, Agora token builder
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

In development, Vite proxies `/api` and `/socket.io` to the backend. To test on a phone on the same Wi-Fi, open `http://<your-computer-ip>:5173`. Browsers only allow the camera, microphone and app install over **HTTPS** (or on `localhost`), so test calls on a deployed HTTPS URL or through a tunnel such as ngrok.

## Environment variables

### Backend (`backend/.env`)
| Variable | Description |
|---|---|
| `PORT` | Server port (default 5000) |
| `MONGO_URI` | MongoDB connection string: a local server (`mongodb://127.0.0.1:27017/chatapp`) or MongoDB Atlas (`mongodb+srv://…`). With Atlas, allow your backend host's IP under *Network Access*. |
| `JWT_SECRET` | **Long random string** used to sign logins (not an expiry like `7d`). Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Changing it signs everyone out once. The server prints a warning on startup if it is shorter than 32 characters. |
| `AGORA_APP_ID` / `APP_CERTIFICATE` | From the [Agora console](https://console.agora.io). The project must have the App Certificate enabled (token authentication). |
| `FRONTEND_URL` | Comma-separated allowed origins, e.g. `http://localhost:5173,https://your-app.vercel.app` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | *Optional* — enables push notifications while the app is closed. Generate once with `npx web-push generate-vapid-keys` (run in `backend/`). Keep the private key secret; changing the pair invalidates existing subscriptions. Without them, push is simply turned off. |
| `VAPID_SUBJECT` | *Optional* — contact for push services, e.g. `mailto:you@example.com` |

Never commit real `.env` files. They are git-ignored, and the `.env.example` files contain placeholders only.

### Frontend (`frontend/.env`)
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL in production (e.g. `https://your-api.onrender.com`). In dev, the proxy target. |
| `VITE_GIPHY_KEY` | Giphy API key for stickers & GIFs |

Pusher is no longer used. Delete the `PUSHER_*` / `VITE_PUSHER_*` variables from your hosting dashboards. A Pusher secret was committed to this repository's history in the past, so revoke that Pusher app (or rotate its secret) in the Pusher dashboard.

## Production deployment

1. **Backend** (e.g. Render, Railway, a VPS): run `npm install` and `npm start` in `backend/`, and set the backend variables above. Socket.IO needs WebSocket support and a single instance, or sticky sessions if you scale out.
2. **Frontend** (e.g. Vercel): build command `npm run build`, output `dist/`, and set `VITE_API_URL` to the backend's HTTPS URL. `vercel.json` already handles SPA routing and the service-worker and cache headers.
3. Add the frontend URL to `FRONTEND_URL` on the backend.
4. Deploy the backend and frontend **together**. The realtime event names changed in this version, so an old frontend cannot talk to a new backend.

**HTTPS is required** for camera, microphone, notifications and app install on phones. `localhost` is the only exception.

## Installing the app

- **Android / Chrome / Edge:** open the site and tap **Install** (in the chat list banner or under *Settings → App*), or use the browser menu → *Install app*.
- **iPhone / iPad:** open in Safari → Share → **Add to Home Screen**.
- **Desktop:** click the install icon in the address bar.

## Scripts

| Where | Command | What it does |
|---|---|---|
| backend | `npm run dev` | Start the API with auto-reload |
| frontend | `npm run dev` | Start the dev server |
| frontend | `npm run build` | Build for production into `dist/` |
| frontend | `npm run lint` | Run ESLint |

## Verification status

| Area | Implemented | Automated tests | Needs external config | Needs a real device |
|---|---|---|---|---|
| Direct messaging, receipts, presence, uploads | ✅ | ✅ backend + two-browser tests | — | — |
| Group chats, admin, permissions, invite links | ✅ | ✅ backend (incl. attack tests) + browser | — | — |
| Status: create, view, privacy, expiry, replies | ✅ | ✅ backend (incl. attack tests) + browser | — | — |
| Search | ✅ | ✅ backend + browser | — | — |
| HD calls (Agora) | ✅ | ✅ signalling + 720p transport with a synthetic camera | Agora App ID/Certificate | ✅ real camera video |
| Web Push (app closed) | ✅ | ✅ server side (sending, encryption, no duplicates, muted chats) | VAPID keys | ✅ delivery on real phones/browsers |
| Installable PWA | ✅ | ✅ Chrome installability check, offline shell | HTTPS hosting | install on iOS/Android |

## Verifying video calls on real devices

Automated/headless browsers use a fake camera that produces black or tiny synthetic frames, so automated tests can confirm call signalling and media connection but **not** real camera video. After every deploy that touches calls:

1. Open the deployed **HTTPS** site on two physical devices (e.g. an Android phone and a laptop).
2. Sign in as two different users and start a video call.
3. Confirm that both sides show the other person's real camera, that audio works both ways, and that mute, camera off/on, flip camera and hang-up all work.

## Notes & limitations

- **Uploads** (photos, videos, voice notes, documents, avatars) are stored in MongoDB in a separate `media` collection, **max 15 MB per file**. Larger or empty files are rejected. Media URLs are unguessable, so `<img>` and `<video>` tags can load them without a login header. For heavy use, move uploads to object storage (S3, Cloudinary or R2).
- Messages sent before this update (inline base64 images, voice notes and avatars) still display.
- **Voice notes** recorded in Chrome, Edge or Firefox are WebM/Opus files, which may not play on older iPhones/iPads. Notes recorded on iPhone (MP4/AAC) play everywhere.
- Agora bills HD (720p) video at a higher tier than SD. To lower costs, change `HD_VIDEO` in `frontend/src/hooks/useAgoraCall.js`.

- **Push on iPhone/iPad** only works once ChatApp is added to the Home Screen (iOS 16.4+); Apple does not deliver web push to Safari tabs.
- **Contacts** are people you have a direct chat with; there is no separate address book or blocking yet.
- Group size is capped at 256 members; each member's receipts are stored per message, so very large groups would need a different receipt model.

**Not implemented yet:** group voice/video calls, archived chats, blocking users, end-to-end encryption, and native Play Store / App Store builds (the app installs as a PWA instead).
