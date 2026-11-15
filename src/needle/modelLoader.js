/**
 * Needle 3 Model Loader
 * Handles loading the needle3.cact model with Service Worker cache fallback
 */

import { NEEDLE_CONFIG } from './config.js';

let modelCache = null;
let modelLoadPromise = null;

/**
 * Load model from Service Worker cache
 * @returns {Promise<Uint8Array|null>} Model bytes or null if not cached
 */
async function loadFromSWCache() {
  try {
    const cache = await caches.open(NEEDLE_CONFIG.cacheName);
    const cachedResponse = await cache.match(NEEDLE_CONFIG.modelUrl);

    if (cachedResponse) {
      console.log('[Needle] Model found in SW cache');
      const arrayBuffer = await cachedResponse.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }
  } catch (error) {
    console.warn('[Needle] SW cache access failed:', error);
  }
  return null;
}

/**
 * Load model from IndexedDB
 * @returns {Promise<Uint8Array|null>} Model bytes or null if not found
 */
async function loadFromIndexedDB() {
  if (!NEEDLE_CONFIG.useIndexedDB) return null;

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('NeedleModels', 1);

      request.onerror = () => {
        console.warn('[Needle] IndexedDB open failed');
        resolve(null);
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['models'], 'readonly');
        const store = transaction.objectStore('models');
        const getRequest = store.get(NEEDLE_CONFIG.modelCacheKey);

        getRequest.onsuccess = () => {
          if (getRequest.result) {
            console.log('[Needle] Model found in IndexedDB');
            resolve(new Uint8Array(getRequest.result));
          } else {
            resolve(null);
          }
        };

        getRequest.onerror = () => {
          console.warn('[Needle] IndexedDB get failed');
          resolve(null);
        };
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models');
        }
      };
    } catch (error) {
      console.warn('[Needle] IndexedDB not available:', error);
      resolve(null);
    }
  });
}

/**
 * Save model to IndexedDB
 * @param {Uint8Array} modelBytes - Model bytes to store
 */
async function saveToIndexedDB(modelBytes) {
  if (!NEEDLE_CONFIG.useIndexedDB) return;

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('NeedleModels', 1);

      request.onerror = () => {
        console.warn('[Needle] IndexedDB open failed for write');
        resolve();
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['models'], 'readwrite');
        const store = transaction.objectStore('models');
        store.put(Array.from(modelBytes), NEEDLE_CONFIG.modelCacheKey);
        transaction.oncomplete = () => {
          console.log('[Needle] Model saved to IndexedDB');
          resolve();
        };
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models');
        }
      };
    } catch (error) {
      console.warn('[Needle] IndexedDB write failed:', error);
      resolve();
    }
  });
}

/**
 * Fetch model from network (Hugging Face)
 * @returns {Promise<Uint8Array>} Model bytes
 */
async function fetchFromNetwork() {
  console.log('[Needle] Fetching model from network...');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NEEDLE_CONFIG.modelLoadTimeout);

  try {
    const response = await fetch(NEEDLE_CONFIG.modelUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/octet-stream',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`[Needle] Model downloaded: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Model load timeout (${NEEDLE_CONFIG.modelLoadTimeout}ms)`);
    }
    throw error;
  }
}

/**
 * Save model to Service Worker cache
 * @param {Uint8Array} modelBytes - Model bytes to cache
 */
async function saveToSWCache(modelBytes) {
  try {
    const cache = await caches.open(NEEDLE_CONFIG.cacheName);
    const response = new Response(modelBytes.buffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': modelBytes.length.toString(),
      },
    });
    await cache.put(NEEDLE_CONFIG.modelUrl, response);
    console.log('[Needle] Model cached in Service Worker');
  } catch (error) {
    console.warn('[Needle] Failed to cache model in SW:', error);
  }
}

/**
 * Main model loading function with fallback chain:
 * 1. Memory cache (if already loaded this session)
 * 2. IndexedDB (persistent across sessions)
 * 3. Service Worker cache (PWA offline support)
 * 4. Network (Hugging Face CDN)
 *
 * @returns {Promise<Uint8Array>} Model bytes
 */
export async function loadModel() {
  // Return cached model if already loaded
  if (modelCache) {
    console.log('[Needle] Using memory-cached model');
    return modelCache;
  }

  // Return existing load promise if in progress
  if (modelLoadPromise) {
    return modelLoadPromise;
  }

  // Start loading
  modelLoadPromise = (async () => {
    // Try IndexedDB first (fastest persistent storage)
    let modelBytes = await loadFromIndexedDB();
    if (modelBytes) {
      modelCache = modelBytes;
      return modelCache;
    }

    // Try Service Worker cache
    modelBytes = await loadFromSWCache();
    if (modelBytes) {
      modelCache = modelBytes;
      // Also save to IndexedDB for future
      await saveToIndexedDB(modelBytes);
      return modelCache;
    }

    // Fetch from network
    modelBytes = await fetchFromNetwork();

    // Cache in both SW and IndexedDB
    await Promise.all([
      saveToSWCache(modelBytes),
      saveToIndexedDB(modelBytes),
    ]);

    modelCache = modelBytes;
    return modelCache;
  })();

  return modelLoadPromise;
}

/**
 * Preload model in background (call on app init)
 * @returns {Promise<void>}
 */
export async function preloadModel() {
  try {
    await loadModel();
    console.log('[Needle] Model preloaded successfully');
  } catch (error) {
    console.error('[Needle] Model preload failed:', error);
  }
}

/**
 * Clear all model caches
 * @returns {Promise<void>}
 */
export async function clearModelCache() {
  modelCache = null;
  modelLoadPromise = null;

  // Clear IndexedDB
  if (NEEDLE_CONFIG.useIndexedDB) {
    return new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('NeedleModels');
      request.onsuccess = () => {
        console.log('[Needle] IndexedDB cleared');
        resolve();
      };
      request.onerror = () => {
        console.warn('[Needle] IndexedDB clear failed');
        resolve();
      };
    });
  }
}

/**
 * Get model info
 * @returns {Object} Model metadata
 */
export function getModelInfo() {
  return {
    url: NEEDLE_CONFIG.modelUrl,
    cacheKey: NEEDLE_CONFIG.modelCacheKey,
    cached: modelCache !== null,
    size: modelCache ? modelCache.length : 0,
  };
}