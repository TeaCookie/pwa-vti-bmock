/**
 * Service Worker for Indicator Lights PWA
 * Provides offline support and caching
 */

const CACHE_NAME = 'indicator-lights-v10';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/app-api.js',
  '/yellow-light.js',
  '/adapter/errors.js',
  '/adapter/validation.js',
  '/adapter/confirmations.js',
  '/adapter/registry.js',
  '/adapter/index.js',
  '/adapter/confirmation-ui.js',
  '/assistant.css?v=10',
  '/assistant-ui.js?v=10',
  '/assistant-controller.js',
  '/needle/tool-examples.v5.jsonl?v=10',
  '/manifest.json'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // The Needle test page and worker manage their own caching (see needle/README.md)
  const requestPath = new URL(event.request.url).pathname;
  if (requestPath.startsWith('/needle/') && requestPath !== '/needle/tool-examples.v5.jsonl') {
    return;
  }

  // Keep navigations fresh so deployed HTML changes are not hidden indefinitely
  // by the cache-first strategy. Fall back to the app shell when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match('/index.html');
        }))
    );
    return;
  }

  // Static assets remain cache-first for fast repeat loads and offline support.
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache));

            return networkResponse;
          });
      })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
