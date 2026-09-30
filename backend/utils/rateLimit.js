// Small fixed-window rate limiter (in memory — fine for a single server instance;
// use a shared store such as Redis if you run several instances).
// RATE_LIMIT_MULTIPLIER (default 1) scales every limit, e.g. for load tests.
const buckets = new Map();

const multiplier = () => Math.max(Number(process.env.RATE_LIMIT_MULTIPLIER) || 1, 1);

// Returns { ok, remaining, retryAfter } and counts the hit.
const hit = (key, max, windowMs) => {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const limit = Math.ceil(max * multiplier());
  return {
    ok: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter: Math.ceil((bucket.resetAt - now) / 1000)
  };
};

// Express middleware. `key(req)` defaults to the logged-in user, else the IP.
const rateLimit = ({ name, windowMs, max, key, message }) => (req, res, next) => {
  const id = key ? key(req) : (req.user?._id ? `u:${req.user._id}` : `ip:${req.ip}`);
  const result = hit(`${name}:${id}`, max, windowMs);
  res.set('RateLimit-Limit', String(result.limit));
  res.set('RateLimit-Remaining', String(result.remaining));
  if (result.ok) return next();
  res.set('Retry-After', String(result.retryAfter));
  return res.status(429).json({ message: message || 'Too many requests. Please wait a moment and try again.' });
};

// For socket events: true if allowed.
const allowSocketEvent = (name, id, max, windowMs) => hit(`${name}:${id}`, max, windowMs).ok;

// Drop expired buckets so memory stays bounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60 * 1000).unref();

// The documented limits (see README "Rate limits").
const LIMITS = {
  login: { name: 'login', windowMs: 15 * 60 * 1000, max: 10, message: 'Too many sign-in attempts. Please wait 15 minutes.' },
  loginIp: { name: 'login-ip', windowMs: 15 * 60 * 1000, max: 50, message: 'Too many sign-in attempts from this network. Please wait.' },
  register: { name: 'register', windowMs: 60 * 60 * 1000, max: 10, message: 'Too many accounts created from this network. Please try later.' },
  search: { name: 'search', windowMs: 60 * 1000, max: 90 },
  send: { name: 'send', windowMs: 60 * 1000, max: 90, message: 'You are sending messages too quickly. Please slow down.' },
  upload: { name: 'upload', windowMs: 10 * 60 * 1000, max: 60, message: 'Too many uploads. Please wait a few minutes.' },
  status: { name: 'status', windowMs: 60 * 60 * 1000, max: 30, message: 'Too many status updates. Please try again later.' },
  groupCreate: { name: 'group-create', windowMs: 60 * 60 * 1000, max: 20 },
  groupInvite: { name: 'group-invite', windowMs: 60 * 60 * 1000, max: 30 },
  groupMembers: { name: 'group-members', windowMs: 60 * 60 * 1000, max: 60 },
  pushSubscribe: { name: 'push-subscribe', windowMs: 60 * 60 * 1000, max: 20 },
  block: { name: 'block', windowMs: 60 * 60 * 1000, max: 60 },
  friendRequest: { name: 'friend-request', windowMs: 60 * 60 * 1000, max: 50, message: 'You are sending too many friend requests. Please try later.' }
};

module.exports = { rateLimit, allowSocketEvent, LIMITS };
