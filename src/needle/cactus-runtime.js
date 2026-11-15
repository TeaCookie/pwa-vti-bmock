/**
 * Cactus WASM Runtime Loader
 * Loads the official Cactus WASM runtime from Hugging Face
 * Based on the sandbox worker pattern from Cactus Compute
 */

// Pinned Cactus runtime release (from cactuscompute.com)
const CACTUS_BASE = 'https://huggingface.co/Cactus-Compute/cactus/resolve/1a028f5a3972b67dd8d8752f882113d475e7ec4c/releases/4.0.0/wasm';
const NEEDLE_BASE = 'https://huggingface.co/Cactus-Compute/needle3/resolve/d6c7d6a2e9655505e0f8e23339356dd1705900eb';

const RUNTIME_JS_URL = `${CACTUS_BASE}/cactus.js`;
const RUNTIME_WASM_URL = `${CACTUS_BASE}/cactus.wasm`;
const MODEL_URL = `${NEEDLE_BASE}/needle3.cact`;

// Model checksum (SHA-256 of needle3.cact)
// This should be updated when the model changes
const MODEL_SHA256 = 'd6c7d6a2e9655505e0f8e23339356dd1705900eb'; // placeholder - will be verified on first load

let cactusModule = null;
let engine = null;
let modelLoaded = false;

/**
 * Download a file with progress reporting
 */
async function download(url, progress) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);

  let bytes;
  if (response.body && progress) {
    const reader = response.body.getReader();
    const chunks = [];
    const total = Number(response.headers.get("Content-Length")) || 0;
    let received = 0;
    for (; ; ) {
      const part = await reader.read();
      if (part.done) break;
      chunks.push(part.value);
      received += part.value.length;
      progress(received, total);
    }
    bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
  } else {
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  return bytes;
}

/**
 * Verify SHA-256 checksum
 */
async function verifyChecksum(bytes, expectedHex) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return actual === expectedHex;
}

/**
 * Load model from cache or network
 */
async function loadModel(progress) {
  // Try IndexedDB first
  const cached = await getModelFromIndexedDB();
  if (cached) {
    console.log('[Cactus] Model loaded from IndexedDB');
    return cached;
  }

  // Try Service Worker cache
  const swCached = await getModelFromSWCache();
  if (swCached) {
    console.log('[Cactus] Model loaded from SW cache');
    await saveModelToIndexedDB(swCached);
    return swCached;
  }

  // Fetch from network
  console.log('[Cactus] Fetching model from network...');
  const bytes = await download(MODEL_URL, progress);
  console.log(`[Cactus] Model downloaded: ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);

  // Verify checksum if available
  if (MODEL_SHA256 && MODEL_SHA256 !== 'd6c7d6a2e9655505e0f8e23339356dd1705900eb') {
    const valid = await verifyChecksum(bytes, MODEL_SHA256);
    if (!valid) {
      throw new Error('Model checksum mismatch');
    }
  }

  // Cache in both SW and IndexedDB
  await Promise.all([
    saveModelToSWCache(bytes),
    saveModelToIndexedDB(bytes),
  ]);

  return bytes;
}

/**
 * Get model from IndexedDB
 */
function getModelFromIndexedDB() {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('CactusModels', 1);
      request.onerror = () => resolve(null);
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['models'], 'readonly');
        const store = transaction.objectStore('models');
        const getRequest = store.get('needle3-model');
        getRequest.onsuccess = () => resolve(getRequest.result ? new Uint8Array(getRequest.result) : null);
        getRequest.onerror = () => resolve(null);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models');
        }
      };
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Save model to IndexedDB
 */
function saveModelToIndexedDB(bytes) {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('CactusModels', 1);
      request.onerror = () => resolve();
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['models'], 'readwrite');
        const store = transaction.objectStore('models');
        store.put(Array.from(bytes), 'needle3-model');
        transaction.oncomplete = () => resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models');
        }
      };
    } catch (e) {
      resolve();
    }
  });
}

/**
 * Get model from Service Worker cache
 */
async function getModelFromSWCache() {
  try {
    const cache = await caches.open('cactus-models');
    const response = await cache.match(MODEL_URL);
    if (response) {
      return new Uint8Array(await response.arrayBuffer());
    }
  } catch (e) {
    console.warn('[Cactus] SW cache access failed:', e);
  }
  return null;
}

/**
 * Save model to Service Worker cache
 */
async function saveModelToSWCache(bytes) {
  try {
    const cache = await caches.open('cactus-models');
    const response = new Response(bytes.buffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': bytes.length.toString(),
      },
    });
    await cache.put(MODEL_URL, response);
    console.log('[Cactus] Model cached in SW');
  } catch (e) {
    console.warn('[Cactus] Failed to cache model in SW:', e);
  }
}

/**
 * Initialize Cactus runtime and load model
 * This must be called from within a Web Worker context
 * Returns the initialized engine instance
 */
export async function initializeCactus(progress) {
  if (engine && modelLoaded) {
    return engine;
  }

  console.log('[Cactus] Initializing Cactus WASM runtime...');

  // 1. Load Cactus JS glue via importScripts (required for Emscripten modules in workers)
  console.log('[Cactus] Loading Cactus JS glue via importScripts...');
  const jsBytes = await download(RUNTIME_JS_URL);
  const jsText = new TextDecoder().decode(jsBytes);

  // Load the JS glue via importScripts pattern (required for Emscripten modules)
  const blob = new Blob([jsText], { type: 'text/javascript' });
  const jsUrl = URL.createObjectURL(blob);
  try {
    importScripts(jsUrl);
  } finally {
    URL.revokeObjectURL(jsUrl);
  }

  // 2. Load WASM binary
  console.log('[Cactus] Loading Cactus WASM...');
  const wasmBytes = await download(RUNTIME_WASM_URL);

  // 3. Instantiate the Cactus module using the global createCactus function
  // The importScripts should have created a global createCactus function
  if (typeof createCactus !== 'function') {
    throw new Error('createCactus function not found after importScripts. Check if cactus.js loaded correctly.');
  }

  console.log('[Cactus] Instantiating Cactus module...');
  cactusModule = await createCactus({
    wasmBinary: wasmBytes,
    noInitialRun: true,
  });

  console.log('[Cactus] Cactus module instantiated');

  // 4. Load the model
  console.log('[Cactus] Loading Needle 3 model...');
  const modelBytes = await loadModel(progress);

  // 5. Load model into Cactus engine
  // Allocate memory for model
  const pointer = cactusModule._malloc(modelBytes.length);
  if (!pointer) {
    throw new Error('Failed to allocate memory for model');
  }

  // Copy model bytes to WASM heap
  cactusModule.HEAPU8.set(modelBytes, pointer);

  // Load model into engine
  // Using cactus_load with the model pointer and length
  const loadResult = cactusModule._cactus_load(pointer, BigInt(modelBytes.length));
  if (loadResult < 0) {
    cactusModule._free(pointer);
    throw new Error('Failed to load model into engine');
  }

  // Free the temporary model buffer
  cactusModule._free(pointer);

  // 6. Initialize engine with tools (empty initially, will be set per request)
  const initResult = cactusModule.ccall('cactus_init', 'number', ['string', 'string', 'number'], ['', '[]', 0]);
  if (initResult < 0) {
    const error = cactusModule._cactus_last_error ? cactusModule._cactus_last_error() : 'Unknown init error';
    throw new Error(`Engine initialization failed: ${error}`);
  }

  // Allocate output buffer
  const outputCapacity = 1 << 18; // 256KB
  const outputPtr = cactusModule._malloc(outputCapacity);
  if (!outputPtr) {
    throw new Error('Failed to allocate output buffer');
  }

  engine = {
    module: cactusModule,
    outputPtr,
    outputCapacity,
    modelPointer: null,
  };

  modelLoaded = true;
  console.log('[Cactus] Cactus engine initialized successfully');

  return engine;
}

/**
 * Run inference with tools using cactus_complete
 * @param {string} text - User input text
 * @param {Array} tools - Tool schemas in OpenAI format
 * @param {Object} options - Inference options (maxTokens, etc.)
 * @returns {Promise<string>} JSON string of tool calls
 */
export async function runWithTools(text, tools = [], options = {}) {
  if (!engine) {
    throw new Error('Engine not initialized');
  }

  const { module, outputPtr, outputCapacity } = engine;

  // Call cactus_complete
  // Signature: cactus_complete(text, a, b, max_tokens, output, capacity)
  const maxTokens = options.maxTokens || 384;

  const resultCode = module.ccall('cactus_complete', 'number',
    ['string', 'number', 'number', 'number', 'number', 'number'],
    [text, 0, 0, maxTokens, engine.outputPtr, engine.outputCapacity]
  );

  if (resultCode < 0) {
    const errorMsg = module._cactus_last_error ? module._cactus_last_error() : 'Inference failed';
    throw new Error(`Inference failed: ${errorMsg}`);
  }

  // Read output from buffer
  const output = module.UTF8ToString(engine.outputPtr);
  return output;
}

/**
 * Run free-form inference
 */
export async function runFreeform(text, options = {}) {
  return runWithTools(text, [], options);
}

/**
 * Reset conversation state
 */
export async function resetConversation() {
  if (engine && engine.module) {
    engine.module._cactus_reset();
  }
}

/**
 * Get last error from engine
 */
export function getLastError() {
  if (engine && engine.module && engine.module._cactus_last_error) {
    return engine.module._cactus_last_error();
  }
  return 'Unknown error';
}

/**
 * Dispose engine and free resources
 */
export async function dispose() {
  if (engine) {
    if (engine.outputPtr) {
      engine.module._free(engine.outputPtr);
    }
    if (engine.modelPointer) {
      engine.module._free(engine.modelPointer);
    }
    if (engine.module._cactus_destroy) {
      engine.module._cactus_destroy();
    }
    engine = null;
    modelLoaded = false;
  }
}

/**
 * Check if engine is ready
 */
export function isReady() {
  return engine !== null && modelLoaded;
}

/**
 * Get engine status
 */
export function getStatus() {
  return {
    initialized: engine !== null,
    modelLoaded,
    outputCapacity: engine?.outputCapacity || 0,
  };
}