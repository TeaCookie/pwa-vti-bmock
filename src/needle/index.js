/**
 * Needle 3 Cactus Runtime Client
 * Communicates with Needle 3 Web Worker using Cactus WASM runtime
 */

import { NEEDLE_CONFIG } from './config.js';
import { NEEDLE_3_TOOL_SCHEMAS } from './schemas.js';

// Worker instance
let worker = null;
let workerReady = false;
let initPromise = null;
let messageId = 0;
const pendingMessages = new Map();

/**
 * Initialize the Needle 3 Cactus Web Worker
 * @returns {Promise<void>}
 */
export async function initializeNeedle() {
  if (workerReady) return;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[Needle] Creating Cactus Web Worker...');

      // Create worker from the worker-v2.js file (classic worker for importScripts)
      worker = new Worker(new URL('./worker-v2.js', import.meta.url));

      // Set up message handler
      worker.onmessage = handleWorkerMessage;
      worker.onerror = (error) => {
        console.error('[Needle] Worker error:', error);
      };

      // Wait for worker ready signal
      await waitForWorkerReady();

      console.log('[Needle] Cactus Web Worker initialized and ready');
    } catch (error) {
      console.error('[Needle] Worker initialization failed:', error);
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Wait for worker to be ready
 */
function waitForWorkerReady() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Worker initialization timeout'));
    }, NEEDLE_CONFIG.modelLoadTimeout);

    const checkReady = (event) => {
      if (event.data.type === 'worker_ready') {
        clearTimeout(timeout);
        workerReady = true;
        worker.onmessage = handleWorkerMessage;
        resolve();
      }
    };

    worker.onmessage = checkReady;
  });
}

/**
 * Handle messages from worker
 */
function handleWorkerMessage(event) {
  const { id, result, error } = event.data;

  if (pendingMessages.has(id)) {
    const { resolve, reject } = pendingMessages.get(id);
    pendingMessages.delete(id);

    if (error) {
      reject(new Error(error));
    } else {
      resolve(result);
    }
  }
}

/**
 * Send message to worker and wait for response
 */
function sendMessage(type, payload) {
  if (!worker || !workerReady) {
    return Promise.reject(new Error('Worker not ready'));
  }

  const id = ++messageId;

  return new Promise((resolve, reject) => {
    pendingMessages.set(id, { resolve, reject });

    // Set timeout
    const timeout = setTimeout(() => {
      pendingMessages.delete(id);
      reject(new Error(`Worker message timeout (${type})`));
    }, NEEDLE_CONFIG.inferenceTimeout);

    // Override resolve/reject to clear timeout
    const originalResolve = resolve;
    const originalReject = reject;
    resolve = (value) => {
      clearTimeout(timeout);
      originalResolve(value);
    };
    reject = (error) => {
      clearTimeout(timeout);
      originalReject(error);
    };
    pendingMessages.set(id, { resolve, reject });

    worker.postMessage({ id, type, payload });
  });
}

/**
 * Run inference with tool calling (constrained JSON output)
 * @param {string} prompt - User prompt
 * @param {Array} tools - Tool schemas (OpenAI format)
 * @returns {Promise<string>} JSON string of tool calls
 */
export async function runWithTools(prompt, tools = NEEDLE_3_TOOL_SCHEMAS) {
  if (!workerReady) {
    await initializeNeedle();
  }

  return sendMessage('run_with_tools', { prompt, tools });
}

/**
 * Run inference without tool calling (free-form text)
 * @param {string} prompt - User prompt
 * @returns {Promise<string>} Model response
 */
export async function runFreeform(prompt) {
  if (!workerReady) {
    await initializeNeedle();
  }

  return sendMessage('run_freeform', { prompt });
}

/**
 * Get confidence score for a completion
 * @param {string} prompt - Original prompt
 * @param {Array} tools - Tool schemas
 * @param {string} completion - Model completion
 * @returns {number} Confidence score (0-1)
 */
export async function getConfidence(prompt, tools, completion) {
  if (!workerReady) {
    await initializeNeedle();
  }

  return sendMessage('get_confidence', { prompt, tools, completion });
}

/**
 * Check if Needle 3 is initialized and ready
 * @returns {boolean}
 */
export function isReady() {
  return workerReady && worker !== null;
}

/**
 * Get worker status
 * @returns {Promise<Object>}
 */
export async function getStatus() {
  if (!workerReady) {
    return { initialized: false, engineReady: false };
  }

  return sendMessage('get_status', {});
}

/**
 * Reset worker (for testing/recovery)
 */
export function reset() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  workerReady = false;
  initPromise = null;
  pendingMessages.clear();
  messageId = 0;
}

/**
 * Check worker health
 */
export async function healthCheck() {
  try {
    const status = await getStatus();
    return {
      status: status.initialized && status.engineReady ? 'ok' : 'degraded',
      details: status,
    };
  } catch (error) {
    return { status: 'error', details: error.message };
  }
}