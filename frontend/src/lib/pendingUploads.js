// Attachments that haven't finished uploading, kept in IndexedDB (which stores files;
// localStorage can't). Once a file is uploaded, its message moves to the text outbox
// (lib/outbox.js) and the file is removed from here.
//
// Record: { clientId, myId, conversationId | null, receiverId | null, blob, name,
//           messageType, caption, replyTo, mediaExtra, message, queuedAt }

const DB_NAME = 'chatapp';
const STORE = 'pendingUploads';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Shared by the open chat and the background sender so a file is never uploaded twice at once.
export const uploading = new Set();

let dbPromise = null;
const db = () => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'clientId' });
        store.createIndex('myId', 'myId');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      dbPromise = null; // try again next time (e.g. private mode blocked it once)
      throw error;
    });
  }
  return dbPromise;
};

const run = async (mode, fn) => {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

export const putUpload = (record) => {
  // The preview URL is per page load; the blob itself is what survives.
  const { localUrl: _drop, uploadProgress: _p, ...message } = record.message || {};
  return run('readwrite', store => store.put({ ...record, message, queuedAt: record.queuedAt || Date.now() })).catch(() => {});
};

export const deleteUpload = (clientId) => run('readwrite', store => store.delete(clientId)).catch(() => {});

export const uploadsOf = async (myId) => {
  try {
    const all = (await run('readonly', store => store.index('myId').getAll(myId))) || [];
    const fresh = all.filter(r => Date.now() - (r.queuedAt || 0) < MAX_AGE_MS && r.blob);
    all.filter(r => !fresh.includes(r)).forEach(r => deleteUpload(r.clientId));
    return fresh.sort((a, b) => a.queuedAt - b.queuedAt);
  } catch {
    return [];
  }
};

export const uploadsFor = async (myId, { conversationId, receiverId }) =>
  (await uploadsOf(myId)).filter(r => (conversationId && r.conversationId === conversationId)
    || (receiverId && !r.conversationId && r.receiverId === receiverId));

export const clearUploads = async (myId) => {
  const all = await uploadsOf(myId);
  await Promise.all(all.map(r => deleteUpload(r.clientId)));
};

// Body for POST /api/messages/send once the file is uploaded.
export const sendBodyFor = (record, uploaded) => ({
  text: record.caption || '',
  messageType: record.messageType,
  replyTo: record.replyTo || undefined,
  media: { ...uploaded, ...record.mediaExtra }
});

// Upload failures worth retrying later (no connection / server busy) vs. permanent ones.
export const isUploadRetryable = (error) => {
  if (/too large/i.test(error?.message || '')) return false;
  const status = error?.response?.status;
  return !status || status >= 500 || status === 429;
};
