/**
 * Needle 3 Web Worker
 * Runs Needle 3 inference off the main thread
 * Based on Cactus Compute sandbox worker pattern
 */

// Configuration
const NEEDLE_BASE = 'https://huggingface.co/Cactus-Compute/needle3/resolve/main';
const NEEDLE_RUNTIME_BASE = 'https://cdn.jsdelivr.net/npm/needle-rs@latest/+esm';

// Worker state
let needleModule = null;
let engine = null;
let isInitialized = false;
let initPromise = null;

/**
 * Load needle-rs WASM module
 */
async function loadNeedleModule() {
  if (needleModule) return needleModule;

  // Dynamic import of needle-rs ESM
  needleModule = await import(NEEDLE_RUNTIME_BASE);

  // Initialize WASM - init is the default export
  await needleModule.default();

  return needleModule;
}

/**
 * Load model from cache or network
 */
async function loadModel() {
  const modelUrl = `${NEEDLE_BASE}/needle3.cact`;

  // Try IndexedDB first
  const cached = await getModelFromIndexedDB();
  if (cached) {
    console.log('[Worker] Model loaded from IndexedDB');
    return cached;
  }

  // Try Service Worker cache
  const swCached = await getModelFromSWCache();
  if (swCached) {
    console.log('[Worker] Model loaded from SW cache');
    await saveModelToIndexedDB(swCached);
    return swCached;
  }

  // Fetch from network
  console.log('[Worker] Fetching model from network...');
  const response = await fetch(modelUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch model: ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  console.log(`[Worker] Model downloaded: ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);

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
      const request = indexedDB.open('NeedleModels', 1);
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
      const request = indexedDB.open('NeedleModels', 1);
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
    const cache = await caches.open('needle-models');
    const response = await cache.match('https://huggingface.co/Cactus-Compute/needle3/resolve/main/needle3.cact');
    if (response) {
      return new Uint8Array(await response.arrayBuffer());
    }
  } catch (e) {
    console.warn('[Worker] SW cache access failed:', e);
  }
  return null;
}

/**
 * Save model to Service Worker cache
 */
async function saveModelToSWCache(bytes) {
  try {
    const cache = await caches.open('needle-models');
    const response = new Response(bytes.buffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': bytes.length.toString(),
      },
    });
    await cache.put('https://huggingface.co/Cactus-Compute/needle3/resolve/main/needle3.cact', response);
    console.log('[Worker] Model cached in SW');
  } catch (e) {
    console.warn('[Worker] Failed to cache model in SW:', e);
  }
}

/**
 * Initialize Needle 3 engine
 */
async function initializeEngine() {
  if (isInitialized && engine) return engine;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[Worker] Initializing Needle 3...');

      // Load WASM module
      await loadNeedleModule();

      // Load model
      const modelBytes = await loadModel();

      // Create engine
      const NeedleV3Wasm = needleModule.NeedleV3Wasm;
      if (!NeedleV3Wasm) {
        throw new Error('NeedleV3Wasm not exported from needle-rs');
      }

      engine = NeedleV3Wasm.load(modelBytes);
      console.log('[Worker] Engine created');

      // Configure engine
      if (engine.set_config) {
        engine.set_config({
          max_seq_len: 2048,
          temperature: 0.0,
          seed: 0,
        });
      }

      isInitialized = true;
      console.log('[Worker] Needle 3 initialized successfully');

      return engine;
    } catch (error) {
      console.error('[Worker] Initialization failed:', error);
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Run inference with tools (constrained JSON)
 */
async function runWithTools(prompt, tools) {
  if (!engine) await initializeEngine();

  // Build system prompt with tool descriptions
  const systemPrompt = buildSystemPrompt(tools);
  const fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`;

  console.log('[Worker] Running inference with tools...');
  const startTime = Date.now();

  // Run with constrained decoding
  const result = engine.run_json(fullPrompt, JSON.stringify(tools));

  console.log(`[Worker] Inference completed in ${Date.now() - startTime}ms, result length: ${result.length}`);
  return result;
}

/**
 * Run free-form inference
 */
async function runFreeform(prompt) {
  if (!engine) await initializeEngine();

  const systemPrompt = `You are a helpful assistant controlling indicator lights. Be concise.`;
  const fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`;

  const result = engine.run(fullPrompt);
  return result;
}

/**
 * Get confidence score
 */
function getConfidence(prompt, tools, completion) {
  if (!engine || !engine.confidence_for) return 1.0;
  try {
    return engine.confidence_for(prompt, JSON.stringify(tools), completion);
  } catch {
    return 1.0;
  }
}

/**
 * Build system prompt
 */
function buildSystemPrompt(tools) {
  const toolDescriptions = tools.map(t => {
    const fn = t.function;
    const params = fn.parameters.properties;
    const paramStr = Object.entries(params).map(([name, schema]) => {
      const req = fn.parameters.required?.includes(name) ? ' (required)' : ' (optional)';
      return `  ${name}: ${schema.type}${req} - ${schema.description || ''}`;
    }).join('\n');
    return `${fn.name}:\n  ${fn.description}\n${paramStr}`;
  }).join('\n\n');

  return `You are an AI assistant controlling an Indicator Lights PWA with:
- Three lights: Blue (split left/right), Yellow (auto-toggles), Red (manual toggle)
- Digital clock (HH:MM format)
- Manual logging system with 3 columns (Blue, Yellow, Red) - each has different data schema
- Command terminal with history

AVAILABLE TOOLS:
${toolDescriptions}

RULES:
- For light control: ALWAYS use explicit state (true/false), never "toggle" without state
- Blue light: use "blue-left" or "blue-right" for toggle_light
- Logging: each column has different schema:
  * Blue: {left: boolean, right: boolean}
  * Yellow: {on: boolean}
  * Red: {transition: "on-to-off" | "off-to-on"}
- Time format: HH:MM (24-hour)
- Confirm destructive ops: clear_logs and import_logs require confirm: true
- You can call multiple tools in sequence
- If unsure, ask for clarification`;
}

// Message handler
self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  const startTime = Date.now();

  try {
    let result;

    console.log(`[Worker] Received message: ${type} (id: ${id})`);

    switch (type) {
      case 'initialize':
        await initializeEngine();
        result = { status: 'ready' };
        break;

      case 'run_with_tools':
        await initializeEngine();
        result = await runWithTools(payload.prompt, payload.tools);
        break;

      case 'run_freeform':
        await initializeEngine();
        result = await runFreeform(payload.prompt);
        break;

      case 'get_confidence':
        result = getConfidence(payload.prompt, payload.tools, payload.completion);
        break;

      case 'get_status':
        result = {
          initialized: isInitialized,
          engineReady: engine !== null,
        };
        break;

      case 'reset':
        engine = null;
        isInitialized = false;
        initPromise = null;
        result = { status: 'reset' };
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    console.log(`[Worker] Completed ${type} in ${Date.now() - startTime}ms`);
    self.postMessage({ id, result });
  } catch (error) {
    console.error(`[Worker] Error in ${type}:`, error);
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// Send ready signal
self.postMessage({ type: 'worker_ready' });