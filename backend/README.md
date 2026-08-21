# Chat Server

Backend API and real-time server for the chat application.

## Features

- User registration and login with JWT authentication
- MongoDB persistence with Mongoose
- REST API for users, conversations, and messages
- Real-time messaging and presence with Socket.IO
- Pusher integration for chat events
- WebRTC signaling for audio and video calls

## Requirements

Install these before starting:

- Node.js 18 or later
- npm
- MongoDB, either locally or through MongoDB Atlas
- A Pusher Channels application
- Git

## Setup

Run the following commands one line at a time:

```bash
git clone <your-github-repository-url>
cd chatapp/backend
npm install
```

Create a file named `.env` in the `backend` directory and add:

```env
MONGO_URI=mongodb://127.0.0.1:27017/chatapp
JWT_SECRET=replace-with-a-long-random-secret
PUSHER_APP_ID=your-pusher-app-id
PUSHER_KEY=your-pusher-key
PUSHER_SECRET=your-pusher-secret
PUSHER_CLUSTER=your-pusher-cluster
PORT=5000
```

Replace each placeholder with your own MongoDB and Pusher values. Keep `.env` private and do not commit it to GitHub.

Start the server in development mode:

```bash
npm run dev
```

Start the server normally:

```bash
npm start
```

The API runs at `http://localhost:5000` by default.

## API Routes

- `POST /api/auth/register` - Register a user
- `POST /api/auth/login` - Log in and receive a JWT
- `/api/users` - User endpoints
- `/api/messages` - Message endpoints

Protected routes require this header:

```http
Authorization: Bearer <your-jwt-token>
```

## Socket.IO

The server accepts Socket.IO connections and supports online presence, typing indicators, and WebRTC call signaling.

During local development, the Socket.IO CORS configuration expects the frontend at:

```text
http://localhost:5173
```

## GitHub Checklist

Before pushing the project:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-github-repository-url>
git push -u origin main
```

Confirm that secrets, `.env`, `node_modules`, and build output are excluded by `.gitignore` before running `git add .`.
