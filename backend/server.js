const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const io = new Server(server, {
  cors: {
    origin: frontendUrl,
    methods: ['GET', 'POST']
  }
});
app.set('io', io);

app.use(cors({ origin: frontendUrl }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/api/auth',    require('./routes/auth'));
app.use('/api/users',   require('./routes/users'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/calls', require('./routes/calls'));

// ── Socket.io ─────────────────────────────────────────────────────
const onlineUsers = new Map(); // userId → socketId

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // ── Online presence ──────────────────────────────────────────────
  socket.on('userOnline', (userId) => {
    const normalizedUserId = String(userId);
    socket.join(`user-${normalizedUserId}`);
    onlineUsers.set(normalizedUserId, socket.id);
    io.emit('onlineUsers', Array.from(onlineUsers.keys()));
  });

  // ── Typing ──────────────────────────────────────────────────────
  socket.on('typing', ({ receiverId }) => {
    const s = onlineUsers.get(receiverId);
    if (s) io.to(s).emit('userTyping');
  });

  socket.on('stopTyping', ({ receiverId }) => {
    const s = onlineUsers.get(receiverId);
    if (s) io.to(s).emit('userStopTyping');
  });

  // ── WebRTC Signaling ─────────────────────────────────────────────

  // 1. Caller initiates call
  socket.on('callUser', ({ receiverId, callType, callerName, callerId, callerAvatar, channelName }) => {
    const receiverSocket = onlineUsers.get(receiverId);
    if (receiverSocket) {
      io.to(receiverSocket).emit('incomingCall', {
        callerId,
        callerName,
        callerAvatar,
        callType: callType === 'video' ? 'video' : 'audio',
        channelName,
        socketId: socket.id
      });
    } else {
      // Receiver offline
      socket.emit('callRejected', { reason: 'User is offline' });
    }
  });

  // 2. Receiver accepts
  socket.on('acceptCall', ({ callerId, signal }) => {
    const callerSocket = onlineUsers.get(callerId);
    if (callerSocket) {
      io.to(callerSocket).emit('callAccepted', { signal, accepterId: socket.id });
    }
  });

  // 3. WebRTC offer from caller
  socket.on('sendOffer', ({ receiverId, offer }) => {
    const receiverSocket = onlineUsers.get(receiverId);
    if (receiverSocket) {
      io.to(receiverSocket).emit('receiveOffer', { offer, callerId: socket.id });
    }
  });

  // 4. WebRTC answer from receiver
  socket.on('sendAnswer', ({ callerId, answer }) => {
    const callerSocket = onlineUsers.get(callerId);
    if (callerSocket) {
      io.to(callerSocket).emit('receiveAnswer', { answer });
    }
  });

  // 5. ICE candidates exchange
  socket.on('sendIceCandidate', ({ receiverId, candidate }) => {
    const receiverSocket = onlineUsers.get(receiverId);
    if (receiverSocket) {
      io.to(receiverSocket).emit('receiveIceCandidate', { candidate });
    }
  });

  // 6. Reject call
  socket.on('rejectCall', ({ callerId }) => {
    const callerSocket = onlineUsers.get(callerId);
    if (callerSocket) {
      io.to(callerSocket).emit('callRejected', { reason: 'Call declined' });
    }
  });

  // 7. End call
  socket.on('endCall', ({ receiverId }) => {
    const receiverSocket = onlineUsers.get(receiverId);
    if (receiverSocket) {
      io.to(receiverSocket).emit('callEnded');
    }
  });

  // 8. Caller cancel (before pickup)
  socket.on('cancelCall', ({ receiverId }) => {
    const receiverSocket = onlineUsers.get(receiverId);
    if (receiverSocket) {
      io.to(receiverSocket).emit('callCancelled');
    }
  });

  // ── Disconnect ───────────────────────────────────────────────────
  socket.on('disconnect', () => {
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    io.emit('onlineUsers', Array.from(onlineUsers.keys()));
    console.log('Socket disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));