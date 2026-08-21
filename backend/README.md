# ChatApp Backend

Express, MongoDB, Socket.IO, Pusher, and Agora token service for ChatApp.

## Functionality

- JWT authentication for registration and login
- MongoDB persistence for users, conversations, and messages
- REST APIs for users, conversations, messages, and Agora call tokens
- Real-time messaging, typing indicators, online presence, and read receipts
- Pusher events for message delivery and sidebar updates
- Socket.IO signaling for call invitations, acceptance, rejection, and hang-up
- Agora RTC token generation for browser audio and video calls

## Requirements

- Node.js 18 or later
- npm
- MongoDB running locally or a MongoDB Atlas connection
- A Pusher Channels application
- An Agora project with an App ID and App Certificate

## Setup

From the project root:

```powershell
cd backend
npm install
```

Create `backend/.env`:

```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/chatapp
JWT_SECRET=replace-with-a-long-random-secret

PUSHER_APP_ID=your-pusher-app-id
PUSHER_KEY=your-pusher-key
PUSHER_SECRET=your-pusher-secret
PUSHER_CLUSTER=your-pusher-cluster

AGORA_APP_ID=your-agora-app-id
APP_CERTIFICATE=your-agora-app-certificate
FRONTEND_URL=http://localhost:5173
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | API and Socket.IO port. Defaults to `5000`. |
| `NODE_ENV` | No | Runtime environment. |
| `MONGO_URI` | Yes | MongoDB connection string. |
| `JWT_SECRET` | Yes | Secret used to sign login tokens. |
| `PUSHER_APP_ID` | Yes | Pusher application ID. |
| `PUSHER_KEY` | Yes | Pusher server key; match the frontend key. |
| `PUSHER_SECRET` | Yes | Private Pusher server secret. |
| `PUSHER_CLUSTER` | Yes | Pusher cluster, for example `ap2`. |
| `AGORA_APP_ID` | Yes | Agora project App ID. |
| `APP_CERTIFICATE` | Yes | Private Agora certificate used to sign RTC tokens. |
| `FRONTEND_URL` | Yes | Allowed frontend origin for CORS and Socket.IO. |

Never commit `.env`, database credentials, Pusher secrets, Agora certificates, or JWT secrets.

## Run In Development

Start MongoDB first, then run:

```powershell
cd backend
npm run dev
```

The API and Socket.IO server run at [http://localhost:5000](http://localhost:5000).

For a normal Node process use `npm start`. Run only one backend process on port `5000`; otherwise Node reports `EADDRINUSE`.

## API Routes

- `POST /api/auth/register` - Create an account
- `POST /api/auth/login` - Log in and receive a JWT
- `GET /api/users/search` - Search users
- `GET /api/messages/conversations` - List conversations
- `GET /api/messages/:conversationId` - Load messages and mark incoming messages read
- `POST /api/messages/send` - Send text, image, or sticker messages
- `GET /api/messages/single/:messageId` - Load one complete message
- `DELETE /api/messages/:messageId` - Delete a message sent by the current user
- `GET /api/calls/token?channel=<channel>` - Generate an authenticated Agora RTC token

Protected routes require `Authorization: Bearer <jwt-token>`.

## Frontend Connection

The frontend expects REST and Agora token requests through Vite's `/api` proxy to port `5000`, Socket.IO at `http://localhost:5000`, and frontend origin `http://localhost:5173` for CORS.

Start the frontend in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

## Production Notes

- Use hosted MongoDB and HTTPS.
- Restrict CORS to the deployed frontend origin.
- Keep Agora certificates and all server secrets on the backend only.
