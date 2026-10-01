// Messages waiting to be sent, kept per account in localStorage so they survive a
// reload or the app being closed while offline. Each entry is resent until the
// server accepts it; the server de-duplicates by clientId, so a resend never
// creates a second copy.
//
// Entry: { clientId, conversationId | null, receiverId | null, body, message, queuedAt }
//   body    — what POST /api/messages/send receives (media already uploaded)
//   message — the optimistic bubble, so the chat can show it again after a reload

const MAX_ENTRIES = 200;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const key = (myId) => `chatOutbox:${myId}`;

// Shared by the open chat and the background flusher so one message is never posted twice at once.
export const inFlight = new Set();

export const readOutbox = (myId) => {
  try {
    const list = JSON.parse(localStorage.getItem(key(myId)) || '[]');
    if (!Array.isArray(list)) return [];
    const fresh = list.filter(e => e?.clientId && e.body && Date.now() - (e.queuedAt || 0) < MAX_AGE_MS);
    if (fresh.length !== list.length) writeOutbox(myId, fresh);
    return fresh;
  } catch {
    return [];
  }
};

const writeOutbox = (myId, list) => {
  try {
    if (list.length) localStorage.setItem(key(myId), JSON.stringify(list.slice(-MAX_ENTRIES)));
    else localStorage.removeItem(key(myId));
  } catch {
    // storage full or unavailable — the message still retries while the page is open
  }
};

export const queueMessage = (myId, entry) => {
  const list = readOutbox(myId).filter(e => e.clientId !== entry.clientId);
  // Local blob previews can't survive a reload; the uploaded URL in the body can.
  const { localUrl: _drop, uploadProgress: _p, ...message } = entry.message || {};
  list.push({ ...entry, message: { ...message, status: 'failed', autoRetry: true }, queuedAt: entry.queuedAt || Date.now() });
  writeOutbox(myId, list);
};

// The server refused it for good (blocked, too long, …): stop auto-retrying, but keep it
// so the chat still shows it as "Not sent · Tap to retry" instead of losing it.
export const markRejected = (myId, clientId) => {
  const list = readOutbox(myId);
  const entry = list.find(e => e.clientId === clientId);
  if (!entry) return;
  entry.rejected = true;
  writeOutbox(myId, list);
};

export const dequeueMessage = (myId, clientId) => {
  const list = readOutbox(myId);
  const next = list.filter(e => e.clientId !== clientId);
  if (next.length !== list.length) writeOutbox(myId, next);
};

// Entries that belong to a given chat (by conversation id, or by recipient for a chat not created yet).
export const outboxFor = (myId, { conversationId, receiverId }) =>
  readOutbox(myId).filter(e => (conversationId && e.conversationId === conversationId)
    || (receiverId && !e.conversationId && e.receiverId === receiverId));

// Worth retrying automatically (no response, server error or rate limit).
export const isRetryable = (error) => !error?.response || error.response.status >= 500 || error.response.status === 429;
