# ChatApp Frontend

React and Vite frontend for the ChatApp messaging application.

## Functionality

- User registration, login, logout, and profile editing
- Conversation search and one-to-one chats
- Real-time messages, typing indicators, online presence, and read receipts
- Image messages, stickers, GIFs, replies, and message previews
- Audio and video calls through Agora RTC
- Incoming call notifications and call controls

## Requirements

- Node.js 18 or later
- npm
- The ChatApp backend running on port `5000`
- A GIPHY API key for stickers and GIFs
- Matching Pusher Channels credentials used by the backend

## Setup

From the project root:

```powershell
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_PUSHER_KEY=your-pusher-key
VITE_PUSHER_CLUSTER=your-pusher-cluster
VITE_GIPHY_KEY=your-giphy-api-key
VITE_API_URL=http://localhost:5000
```

Only variables prefixed with `VITE_` are exposed to the browser. Do not put private Pusher secrets, JWT secrets, MongoDB credentials, or Agora certificates in this file.

## Run In Development

Start the backend first in another terminal, then start Vite:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The Vite proxy forwards `/api` requests to `http://127.0.0.1:5000`. Do not start two backend processes on port `5000`; a second process will fail with `EADDRINUSE`.

## Build And Preview

```powershell
cd frontend
npm run build
npm run preview
```

## Troubleshooting

- Blank page or module errors: stop duplicate Vite processes, clear `frontend/node_modules/.vite`, and run `npm run dev` again.
- API `404` or connection errors: confirm the backend is running on port `5000`.
- Agora token errors: confirm the backend `.env` contains `AGORA_APP_ID` and `APP_CERTIFICATE`, then restart the backend.
- Microphone or camera errors: allow browser permissions for `localhost` and use HTTPS in production.
- In production, set `VITE_API_URL` to the Render backend URL, including `https://` and no trailing slash.
