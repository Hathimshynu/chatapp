const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const initSocket = require('./socket');

dotenv.config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn(
    '⚠️  JWT_SECRET is missing or too short. Anyone who guesses it can forge login tokens. ' +
    'Set a long random value (e.g. `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"`).'
  );
}

connectDB();

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin is not allowed'));
  },
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
};

app.set('trust proxy', 1);
app.disable('x-powered-by');
// Baseline security headers for API responses.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer'
  });
  next();
});
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

app.get('/', (req, res) => {
  res.json({ service: 'ChatApp backend', status: 'ok' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/media', require('./routes/media'));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/status', require('./routes/status'));
app.use('/api/search', require('./routes/search'));
app.use('/api/push', require('./routes/push'));
app.use('/api/friends', require('./routes/friends'));

// Payload too large / bad JSON → clean JSON errors instead of HTML stack traces.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'File is too large (max 15 MB)' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid request body' });
  if (err.message === 'CORS origin is not allowed') return res.status(403).json({ message: 'Origin not allowed' });
  // Known client errors keep their status; anything else is a generic 500 (details only in the log).
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) return res.status(status).json({ message: err.expose ? err.message : 'Invalid request' });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

// Unknown API routes → JSON 404 (not an HTML page).
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

initSocket(server, allowedOrigins);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
