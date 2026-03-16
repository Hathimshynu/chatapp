# 💬 ChatApp — Real-time Chat Application

A WhatsApp-like chat app built with MERN stack + Socket.io + Pusher.

## Features
- 🔐 JWT Authentication
- 💬 Real-time messaging (Pusher)
- 🟢 Online/offline status (Socket.io)
- ✓✓ Read receipts (blue double tick)
- 🔔 Browser notifications
- 📷 Image sharing
- 🎭 Stickers & GIFs (Giphy)
- 📞 Audio calling (WebRTC)
- 😊 Emoji picker
- 👤 Profile picture + edit profile
- 📱 Mobile responsive

## Tech Stack

### Backend
- Node.js + Express
- MongoDB + Mongoose
- Socket.io
- Pusher
- JWT + bcryptjs

### Frontend
- React 18 + Vite
- React Router v6
- Axios
- Pusher JS
- Socket.io Client
- WebRTC

## Setup

### 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/chatapp.git
cd chatapp

### 2. Backend setup
cd backend
npm install
cp .env.example .env
# Fill in your .env values
npm run dev

### 3. Frontend setup
cd frontend
npm install
cp .env.example .env
# Fill in your .env values
npm run dev

### 4. Open
http://localhost:5173

## Environment Variables

### Backend (`backend/.env`)
| Variable | Description |
|---|---|
| PORT | Server port (5000) |
| MONGO_URI | MongoDB connection string |
| JWT_SECRET | Secret key for JWT tokens |
| PUSHER_APP_ID | Pusher app ID |
| PUSHER_KEY | Pusher key |
| PUSHER_SECRET | Pusher secret |
| PUSHER_CLUSTER | Pusher cluster (e.g. ap2) |

### Frontend (`frontend/.env`)
| Variable | Description |
|---|---|
| VITE_PUSHER_KEY | Pusher public key |
| VITE_PUSHER_CLUSTER | Pusher cluster |
| VITE_GIPHY_KEY | Giphy API key |