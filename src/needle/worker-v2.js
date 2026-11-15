/**
 * Needle 3 Web Worker - Cactus Runtime Version (Classic Worker)
 * Uses official Cactus WASM runtime with cactus_complete via importScripts
 * Based on the sandbox worker pattern from Cactus Compute
 * This is a CLASSIC worker (no ES module imports) to support importScripts
 */

// ============================================
// SINGLE TOOL FOR DEBUGGING - TOGGLE LIGHT ONLY
// ============================================

const TEST_TOOLS = [
  // toggle_light - ONLY TOOL FOR DEBUGGING
  {
    type: 'function',
    function: {
      name: 'toggle_light',
      description: 'TURN a light ON or OFF. Use this tool when user wants to CHANGE a light state. Examples: "turn on blue left", "turn off red", "switch on yellow", "toggle blue right". The light parameter: "blue-left" = LEFT blue light (user says "blue left"), "blue-right" = right blue, "yellow" = yellow, "red" = red. State: true=ON, false=OFF.',
      parameters: {
        type: 'object',
        properties: {
          light: {
            type: 'string',
            enum: ['blue-left', 'blue-right', 'yellow', 'red'],
            description: 'Which light to control. "blue-left" = LEFT blue (user says "blue left"), "blue-right" = right blue, "yellow" = yellow, "red" = red.',
          },
          state: {
            type: 'boolean',
            description: 'Target state: true = ON, false = OFF (REQUIRED). true = ON, false = OFF.',
          },
        },
        required: ['light', 'state'],
        additionalProperties: false,
      },
    },
  },
];

// Pinned Cactus runtime release (from cactuscompute.com)
const CACTUS_BASE = 'https://huggingface.co/Cactus-Compute/cactus/resolve/1a028f5a3972b67dd8d8752f882113d475e7ec4c/releases/4.0.0/wasm';
const NEEDLE_BASE = 'https://huggingface.co/Cactus-Compute/needle3/resolve/d6c7d6a2e9655505e0f8e23339356dd1705900eb';

const RUNTIME_JS_URL = 'https://huggingface.co/Cactus-Compute/cactus/resolve/1a028f5a3972b67dd8d8752f882113d475e7ec4c/releases/4.0.0/wasm/cactus.js';
const RUNTIME_WASM_URL = 'https://huggingface.co/Cactus-Compute/cactus/resolve/1a028f5a3972b67dd8d8752f882113d475e7ec4c/releases/4.0.0/wasm/cactus.wasm';
const MODEL_URL = 'https://huggingface.co/Cactus-Compute/needle3/resolve/d6c7d6a2e9655505e0f8e23339356dd1705900eb/needle3.cact';

let cactusModule = null;
let engine = null;
let modelLoaded = false;
let isWorkerInitialized = false;
let modelPointer = null;

console.log('[Worker] Classic worker started');

// ============================================
// UTILITY FUNCTIONS
// ============================================

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
    const response = await cache.match('https://huggingface.co/Cactus-Compute/needle3/resolve/d6c7d6a2e9655505e0f8e23339356dd1705900eb/needle3.cact');
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
    await cache.put('https://huggingface.co/Cactus-Compute/needle3/resolve/d6c7d6a2e9655505e0f8e23339356dd1705900eb/needle3.cact', response);
    console.log('[Cactus] Model cached in SW');
  } catch (e) {
    console.warn('[Cactus] Failed to cache model in SW:', e);
  }
}

/**
 * Save model to IndexedDB
 */
async function saveModelToIndexedDB(bytes) {
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
 * Initialize Cactus runtime and load model
 */
async function initializeCactus(progress) {
  if (engine && modelLoaded) {
    return engine;
  }

  console.log('[Cactus] Initializing Cactus WASM runtime...');

  // 1. Load Cactus JS glue via importScripts (classic worker)
  console.log('[Cactus] Loading Cactus JS glue via importScripts...');
  const jsResponse = await fetch('https://huggingface.co/Cactus-Compute/cactus/resolve/1a028f5a3972b67dd8d8752f882113d475e7ec4c/releases/4.0.0/wasm/cactus.js');
  if (!jsResponse.ok) throw new Error(`Failed to fetch Cactus JS: ${jsResponse.status}`);
  const jsText = await jsResponse.text();

  console.log('[Cactus] Loading Cactus JS glue via importScripts...');
  const blob = new Blob([jsText], { type: 'text/javascript' });
  const jsUrl = URL.createObjectURL(blob);
  try {
    importScripts(jsUrl);
  } finally {
    URL.revokeObjectURL(jsUrl);
  }

  // 2. Load WASM binary
  console.log('[Cactus] Loading Cactus WASM...');
  const wasmBytes = await download('https://huggingface.co/Cactus-Compute/cactus/resolve/1a028f5a3972b67dd8d8752f882113d475e7ec4c/releases/4.0.0/wasm/cactus.wasm');

  // 3. Instantiate the Cactus module using the global createCactus function
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
  const pointer = cactusModule._malloc(modelBytes.length);
  if (!pointer) {
    throw new Error('Failed to allocate memory for model');
  }

  cactusModule.HEAPU8.set(modelBytes, pointer);

  const loadResult = cactusModule._cactus_load(pointer, BigInt(modelBytes.length));
  if (loadResult < 0) {
    // NOTE: Don't free pointer - official demo keeps model buffer alive
    throw new Error('Failed to load model into engine');
  }

  // KEEP model buffer alive (official demo never frees it)
  modelPointer = pointer;

  // 6. Initialize engine with tools
  const toolsJson = JSON.stringify(TEST_TOOLS);
  // System prompt to explicitly instruct model to use tools
  const systemPrompt = 'You are a helpful assistant that controls indicator lights. You MUST use the available tools to answer user requests. CRITICAL RULES:\n1. "turn on/off", "switch on/off", "toggle" -> ALWAYS call toggle_light\n2. "status", "check", "is on", "is off" -> ALWAYS call get_light_status\n3. "time", "what time" -> ALWAYS call get_clock_time\n4. NEVER answer directly without using tools.';
  const initResult = cactusModule.ccall('cactus_init', 'number', ['string', 'string', 'string'], [systemPrompt, toolsJson, '']);
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
    modelPointer: modelPointer,
  };

  modelLoaded = true;
  console.log('[Cactus] Cactus engine initialized successfully');

  return engine;
}

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
    const response = await cache.match('https://huggingface.co/Cactus-Compute/needle3/resolve/d6c7d6a2e9655505e0f8e23339356dd1705900eb/needle3.cact');
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
    await cache.put('https://huggingface.co/Cactus-Compute/needle3/resolve/d6c7d6a2e9655505e0f8e23339356dd1705900eb/needle3.cact', response);
    console.log('[Cactus] Model cached in SW');
  } catch (e) {
    console.warn('[Cactus] Failed to cache model in SW:', e);
  }
}

/**
 * Save model to IndexedDB
 */
async function saveModelToIndexedDB(bytes) {
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
 * Initialize Cactus runtime and load model
 */
async function initializeCactus(progress) {
  if (engine && modelLoaded) {
    return engine;
  }

  console.log('[Cactus] Initializing Cactus WASM runtime...');

  // 1. Load Cactus JS glue via importScripts (classic worker)
  console.log('[Cactus] Loading Cactus JS glue via importScripts...');
  const jsResponse = await fetch('https://huggingface.co/Cactus-Compute/cactus/resolve/1a028f5a3972b67dd8d8752f882113d475e7ec4c/releases/4.0.0/wasm/cactus.js');
  if (!jsResponse.ok) throw new Error(`Failed to fetch Cactus JS: ${jsResponse.status}`);
  const jsText = await jsResponse.text();

  console.log('[Cactus] Loading Cactus JS glue via importScripts...');
  const blob = new Blob([jsText], { type: 'text/javascript' });
  const jsUrl = URL.createObjectURL(blob);
  try {
    importScripts(jsUrl);
  } finally {
    URL.revokeObjectURL(jsUrl);
  }

  // 2. Load WASM binary
  console.log('[Cactus] Loading Cactus WASM...');
  const wasmBytes = await download('https://huggingface.co/Cactus-Compute/cactus/resolve/1a028f5a3972b67dd8d8752f882113d475e7ec4c/releases/4.0.0/wasm/cactus.wasm');

  // 3. Instantiate the Cactus module using the global createCactus function
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
  const pointer = cactusModule._malloc(modelBytes.length);
  if (!pointer) {
    throw new Error('Failed to allocate memory for model');
  }

  cactusModule.HEAPU8.set(modelBytes, pointer);

  const loadResult = cactusModule._cactus_load(pointer, BigInt(modelBytes.length));
  if (loadResult < 0) {
    // NOTE: Don't free pointer - official demo keeps model buffer alive
    throw new Error('Failed to load model into engine');
  }

  // KEEP model buffer alive (official demo never frees it)
  modelPointer = pointer;

  // 6. Initialize engine with tools
  const toolsJson = JSON.stringify(TEST_TOOLS);
  // System prompt to explicitly instruct model to use tools
  const systemPrompt = 'You are a helpful assistant that controls indicator lights. You MUST use the available tools to answer user requests. CRITICAL RULES:\n1. "turn on/off", "switch on/off", "toggle" -> ALWAYS call toggle_light\n2. "status", "check", "is on", "is off" -> ALWAYS call get_light_status\n3. "time", "what time" -> ALWAYS call get_clock_time\n4. NEVER answer directly without using tools.';
  const initResult = cactusModule.ccall('cactus_init', 'number', ['string', 'string', 'string'], [systemPrompt, toolsJson, '']);
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
    modelPointer: modelPointer,
  };

  modelLoaded = true;
  console.log('[Cactus] Cactus engine initialized successfully');

  return engine;
}

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
 * Run inference with tools using cactus_complete
 */
async function runWithTools(text, tools = [], options = {}) {
  if (!engine) {
    throw new Error('Engine not initialized');
  }

  const { module, outputPtr, outputCapacity } = engine;

  // Call cactus_complete - pass user text directly like sandbox worker
  // The Cactus runtime handles system prompt internally via cactus_init
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
async function runFreeform(text, options = {}) {
  return runWithTools(text, [], options);
}

/**
 * Reset conversation state
 */
async function resetConversation() {
  if (engine && engine.module) {
    engine.module._cactus_reset();
  }
}

/**
 * Get last error from engine
 */
function getLastError() {
  if (engine && engine.module && engine.module._cactus_last_error) {
    return engine.module._cactus_last_error();
  }
  return 'Unknown error';
}

/**
 * Dispose engine and free resources
 */
async function dispose() {
  if (engine) {
    if (engine.outputPtr) {
      engine.module._free(engine.outputPtr);
    }
    // NOTE: Don't free modelPointer - official demo keeps model buffer alive
    // if (engine.modelPointer) {
    //   engine.module._free(engine.modelPointer);
    // }
    // NOTE: cactus_destroy doesn't exist in the header (verified from cactus.h)
    // if (engine.module._cactus_destroy) {
    //   engine.module._cactus_destroy();
    // }
    engine = null;
    modelLoaded = false;
  }
}

/**
 * Check if engine is ready
 */
function isReady() {
  return engine !== null && modelLoaded;
}

/**
 * Get engine status
 */
function getStatus() {
  return {
    initialized: engine !== null,
    modelLoaded,
    outputCapacity: engine?.outputCapacity || 0,
  };
}

// ============================================
// WORKER MESSAGE HANDLING
// ============================================

async function doInitialize() {
  if (isWorkerInitialized) return;

  console.log('[Worker] Initializing Cactus runtime...');

  try {
    await initializeCactus((loaded, total) => {
      self.postMessage({
        type: 'progress',
        stage: 'downloading-model',
        loaded,
        total
      });
    });

    isWorkerInitialized = true;
    console.log('[Worker] Cactus runtime initialized successfully');
    self.postMessage({ type: 'worker_ready' });
  } catch (error) {
    console.error('[Worker] Initialization failed:', error);
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

// Error handler for the worker
self.onerror = (event) => {
  console.error('[Worker] Uncaught error:', event.message, event.filename, event.lineno, event.colno, event.error);
  self.postMessage({
    type: 'error',
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
  return true; // Prevent default error handling
};

// Message handler
self.onmessage = async (event) => {
  const { id, type, payload } = event.data;

  try {
    let result;

    switch (type) {
      case 'initialize':
        if (isWorkerInitialized) {
          result = { status: 'ready' };
        } else {
          await doInitialize();
          result = { status: 'ready' };
        }
        break;

      case 'run_with_tools':
        if (!isWorkerInitialized) {
          await doInitialize();
        }
        console.log('[Worker] Running inference with tools...');
        const startTime = Date.now();
        result = await runWithTools(payload.prompt, payload.tools || TEST_TOOLS);
        console.log(`[Worker] Inference completed in ${Date.now() - startTime}ms`);
        break;

      case 'run_freeform':
        if (!isWorkerInitialized) {
          await doInitialize();
        }
        result = await runFreeform(payload.prompt);
        break;

      case 'get_confidence':
        result = 1.0;
        break;

      case 'get_status':
        result = getStatus();
        break;

      case 'reset':
        await resetConversation();
        result = { status: 'reset' };
        break;

      case 'dispose':
        await dispose();
        isWorkerInitialized = false;
        result = { status: 'disposed' };
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ id, result });
  } catch (error) {
    console.error(`[Worker] Error in ${type}:`, error);
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// Signal that worker script loaded
console.log('[Worker] Classic worker script loaded, sending ready signal');
self.postMessage({ type: 'worker_ready' });