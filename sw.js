/**
 * Service Worker for Indicator Lights PWA
 * Provides offline support and caching for app assets and Needle 3 model
 */

const APP_CACHE_NAME = 'indicator-lights-v1';
const MODEL_CACHE_NAME = 'needle-models-v1';
const MODEL_URL = 'https://huggingface.co/Cactus-Compute/needle3/resolve/main/needle3.cact';

const APP_ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json'
];

// Install event - cache app assets and pre-fetch model
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Cache app assets
      caches.open(APP_CACHE_NAME).then((cache) => {
        console.log('[SW] Caching app assets');
        return cache.addAll(APP_ASSETS_TO_CACHE);
      }),
      // Pre-cache Needle 3 model (non-blocking - don't fail install if model fetch fails)
      cacheModel().catch(err => {
        console.warn('[SW] Model pre-cache failed (will retry on first use):', err);
      })
    ]).then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== APP_CACHE_NAME && name !== MODEL_CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

/**
 * Cache the Needle 3 model from Hugging Face
 */
async function cacheModel() {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const cachedResponse = await cache.match(MODEL_URL);

  if (cachedResponse) {
    console.log('[SW] Model already cached');
    return;
  }

  console.log('[SW] Fetching and caching Needle 3 model...');
  try {
    const response = await fetch(MODEL_URL, {
      headers: { 'Accept': 'application/octet-stream' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Clone response for caching (stream can only be consumed once)
    const responseToCache = response.clone();
    await cache.put(MODEL_URL, responseToCache);
    console.log('[SW] Needle 3 model cached successfully');
  } catch (error) {
    console.error('[SW] Failed to cache model:', error);
    throw error;
  }
}

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle model requests specially (always try cache first)
  if (event.request.url === MODEL_URL || event.request.url.startsWith('https://huggingface.co/Cactus-Compute/needle3/')) {
    event.respondWith(handleModelRequest(event.request));
    return;
  }

  // Skip cross-origin requests (except model URL handled above)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Serve from cache
          return cachedResponse;
        }

        // Fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            // Don't cache non-successful responses
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone and cache the response
            const responseToCache = networkResponse.clone();
            caches.open(APP_CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          })
          .catch(() => {
            // Offline fallback for HTML pages
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

/**
 * Handle model requests - cache-first with network fallback
 */
async function handleModelRequest(request) {
  const cache = await caches.open(MODEL_CACHE_NAME);

  // Try cache first
  const cachedResponse = await cache.match(request.url);
  if (cachedResponse) {
    console.log('[SW] Serving model from cache');
    return cachedResponse;
  }

  // Fetch from network
  console.log('[SW] Fetching model from network...');
  try {
    const networkResponse = await fetch(request);

    if (!networkResponse.ok) {
      throw new Error(`HTTP ${networkResponse.status}`);
    }

    // Cache the model
    const responseToCache = networkResponse.clone();
    await cache.put(request.url, responseToCache);
    console.log('[SW] Model cached from network fetch');

    return networkResponse;
  } catch (error) {
    console.error('[SW] Model fetch failed:', error);
    // Return a proper error response
    return new Response('Model not available offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Handle model cache status request
  if (event.data && event.data.type === 'MODEL_CACHE_STATUS') {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const cachedResponse = await cache.match(MODEL_URL);
    event.ports[0].postMessage({
      cached: !!cachedResponse,
      size: cachedResponse ? parseInt(cachedResponse.headers.get('content-length') || '0') : 0,
    });
  }

  // Handle manual model cache trigger
  if (event.data && event.data.type === 'CACHE_MODEL') {
    cacheModel()
      .then(() => event.ports[0].postMessage({ success: true }))
      .catch(err => event.ports[0].postMessage({ success: false, error: err.message }));
  }
});