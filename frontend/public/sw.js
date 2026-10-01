/* ChatApp service worker — makes the app installable, loads instantly and
   shows notifications. API calls and sockets always go to the network. */
const VERSION = 'v4';
const SHELL_CACHE = `chatapp-shell-${VERSION}`;
const ASSET_CACHE = `chatapp-assets-${VERSION}`;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.png', '/icons/icon-192.png', '/icons/icon-512.png'];

// The page loads its main JS/CSS before this worker controls it, so those files would
// never pass through the fetch handler below. Cache the bundles index.html references
// at install time, otherwise an offline reload finds the page but not its scripts.
const cacheEntryAssets = async () => {
  try {
    const html = await (await fetch('/index.html', { cache: 'no-cache' })).text();
    const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]))];
    if (assets.length) await (await caches.open(ASSET_CACHE)).addAll(assets);
  } catch {
    // offline during install — the fetch handler caches assets as they load
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(cacheEntryAssets)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![SHELL_CACHE, ASSET_CACHE].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  // Pages: network first so deploys show up immediately, cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html', { ignoreVary: true }))
    );
    return;
  }

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      // ignoreVary: module scripts carry an Origin header the install-time copies don't; hashed files are immutable.
      caches.match(request, { ignoreVary: true }).then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(ASSET_CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }))
    );
    return;
  }

  // Everything else (icons, manifest): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// Web Push: the server only pushes when the account has no open app/tab.
// The payload arrives decrypted here (it is encrypted in transit).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'ChatApp', {
    body: data.body || 'New message',
    tag: data.tag,
    renotify: !!data.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { conversationId: data.conversationId }
  }));
});

// Tapping a notification focuses the app and opens that chat.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows[0];
    if (client) {
      await client.focus();
      if (conversationId) client.postMessage({ type: 'open-conversation', conversationId });
      return;
    }
    await self.clients.openWindow('/');
  })());
});
