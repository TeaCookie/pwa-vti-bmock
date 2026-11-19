/**
 * Needle 3 worker (classic worker: needs importScripts).
 *
 * Call sequence follows the official Cactus demo worker:
 *   createCactus({ wasmBinary }) -> _malloc + HEAPU8.set + _cactus_load(ptr, BigInt(len))
 *   -> cactus_init("", toolsJson, 0) -> _malloc(output) -> cactus_complete(text, 0, 0, maxTokens, out, cap)
 *
 * Deliberate rules (each one fixes a mistake from the first project):
 *  - The model buffer on the wasm heap is never freed after cactus_load.
 *  - cactus_complete receives the raw user text, nothing else: no system prompt, no history.
 *  - One cactus_complete per request. No follow-up "final response" inference.
 *  - cactus_reset runs before each request by default (opts.reset === false disables it).
 *  - Assets are verified by SHA-256 when downloaded; the Cache API holds exactly one copy.
 *  - The page never sees raw model text unless the result is valid (raw is kept for logs).
 *
 * Messages in  : { type:'init', manifestUrl, tools }
 *                { type:'complete', id, text, opts?:{ reset?, maxTokens? } }
 * Messages out : { type:'progress', stage, loaded?, total? }
 *                { type:'ready', loadMs }
 *                { type:'result', id, calls, suppressed, confidence, timings, warnings, raw, latencyMs }
 *                { type:'error', id?, code, message, raw? }
 * Error codes  : asset-fetch | hash-mismatch | out-of-memory | model-load | tools-init |
 *                inference | invalid-output | not-ready
 */
'use strict';

importScripts('./validate.js');

const CACHE_NAME = 'needle-assets-v1';
const OUTPUT_CAPACITY = 1 << 18;
const DEFAULT_MAX_TOKENS = 384;

let engine = null;
let outputPtr = 0;
let tools = null;
let ready = false;
let initPromise = null;
let queue = Promise.resolve();

class NeedleError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function send(msg) { self.postMessage(msg); }
function progress(stage, loaded, total) { send({ type: 'progress', stage, loaded, total }); }

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stream a pinned asset into one pre-sized buffer, then verify size and hash. */
async function download(name, spec, stage) {
  let response;
  try {
    response = await fetch(spec.url);
  } catch (e) {
    throw new NeedleError('asset-fetch', name + ': ' + (e && e.message ? e.message : e));
  }
  if (!response.ok) throw new NeedleError('asset-fetch', name + ': HTTP ' + response.status);

  const bytes = new Uint8Array(spec.size);
  let received = 0;
  const reader = response.body.getReader();
  let lastReport = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    if (received + part.value.length > spec.size) {
      throw new NeedleError('hash-mismatch', name + ': larger than the pinned size ' + spec.size);
    }
    bytes.set(part.value, received);
    received += part.value.length;
    if (received - lastReport >= 1 << 20 || received === spec.size) {
      lastReport = received;
      progress(stage, received, spec.size);
    }
  }
  if (received !== spec.size) {
    throw new NeedleError('hash-mismatch', name + ': got ' + received + ' bytes, expected ' + spec.size);
  }
  progress('verify', 0, 1);
  const actual = await sha256Hex(bytes);
  if (actual !== spec.sha256) {
    throw new NeedleError('hash-mismatch', name + ': sha256 ' + actual + ' != ' + spec.sha256);
  }
  return bytes;
}

/** Cache hit (size must match) or verified download that is then cached. */
async function getAsset(name, spec, stage) {
  let cache = null;
  try { cache = await caches.open(CACHE_NAME); } catch (e) { cache = null; }

  if (cache) {
    const hit = await cache.match(spec.url);
    if (hit) {
      const bytes = new Uint8Array(await hit.arrayBuffer());
      if (bytes.length === spec.size) {
        progress(stage, spec.size, spec.size);
        return bytes;
      }
      await cache.delete(spec.url);
    }
  }

  const bytes = await download(name, spec, stage);
  if (cache) {
    try { await cache.put(spec.url, new Response(bytes)); } catch (e) { /* quota: keep going uncached */ }
  }
  return bytes;
}

async function loadRuntime(manifest) {
  const files = manifest.runtime.files;
  const jsBytes = await getAsset('cactus.js', files['cactus.js'], 'runtime');
  const wasmBytes = await getAsset('cactus.wasm', files['cactus.wasm'], 'runtime');

  const source = new TextDecoder().decode(jsBytes);
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    importScripts(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  if (typeof createCactus !== 'function') {
    throw new NeedleError('model-load', 'createCactus is not defined after importScripts');
  }
  return createCactus({ wasmBinary: wasmBytes });
}

function loadModel(modelBytes) {
  const pointer = engine._malloc(modelBytes.length);
  if (!pointer) throw new NeedleError('out-of-memory', 'could not allocate ' + modelBytes.length + ' bytes for the model');
  engine.HEAPU8.set(modelBytes, pointer);
  // The wasm-side copy is intentionally kept for the life of the worker (never _free(pointer)).
  const code = engine._cactus_load(pointer, BigInt(modelBytes.length));
  if (code < 0) throw new NeedleError('model-load', 'cactus_load returned ' + code);
}

/** What the engine is allowed to see: no local-only markers ("noop" on a tool, "localPattern" on a property). */
function forEngine(tool) {
  const { noop, localAllowed, ...rest } = tool;
  const copy = JSON.parse(JSON.stringify(rest));
  const props = (copy.parameters && copy.parameters.properties) || {};
  for (const key of Object.keys(props)) delete props[key].localPattern;
  return copy;
}

function registerTools(toolList) {
  const code = engine.ccall(
    'cactus_init', 'number',
    ['string', 'string', 'number'],
    ['', JSON.stringify(toolList), 0]
  );
  if (Number(code) < 0) throw new NeedleError('tools-init', 'cactus_init returned ' + code);
}

async function init(manifestUrl, toolList) {
  const started = Date.now();
  let response;
  try {
    response = await fetch(manifestUrl);
  } catch (e) {
    throw new NeedleError('asset-fetch', 'manifest: ' + (e && e.message ? e.message : e));
  }
  if (!response.ok) throw new NeedleError('asset-fetch', 'manifest: HTTP ' + response.status);
  const manifest = await response.json();

  progress('runtime');
  engine = await loadRuntime(manifest);
  if (!engine) throw new NeedleError('model-load', 'createCactus returned nothing');

  let modelBytes = await getAsset('needle3.cact', manifest.model, 'model-download');
  progress('load');
  loadModel(modelBytes);
  modelBytes = null; // drop the JS copy; the engine holds its own

  progress('tools');
  tools = toolList;
  // "noop" and "localPattern" are local markers for validate.js; the engine only gets the plain schema.
  registerTools(tools.map(forEngine));

  outputPtr = engine._malloc(OUTPUT_CAPACITY);
  if (!outputPtr) throw new NeedleError('out-of-memory', 'could not allocate the output buffer');

  ready = true;
  send({ type: 'ready', loadMs: Date.now() - started });
}

function complete(id, text, opts) {
  if (!ready) throw new NeedleError('not-ready', 'init has not finished');
  const options = opts || {};
  if (options.reset !== false) engine._cactus_reset();

  const started = performance.now();
  const code = engine.ccall(
    'cactus_complete', 'number',
    ['string', 'number', 'number', 'number', 'number', 'number'],
    [String(text), 0, 0, options.maxTokens || DEFAULT_MAX_TOKENS, outputPtr, OUTPUT_CAPACITY]
  );
  const latencyMs = Math.round(performance.now() - started);
  if (code < 0) throw new NeedleError('inference', 'cactus_complete returned ' + code);

  const raw = engine.UTF8ToString(outputPtr);
  const parsed = self.NeedleValidate.parseResult(raw, tools);
  if (!parsed.ok) {
    const err = new NeedleError(parsed.code, parsed.message);
    err.raw = raw;
    throw err;
  }
  send({
    type: 'result', id,
    calls: parsed.calls, noAction: parsed.noAction, suppressed: parsed.suppressed, confidence: parsed.confidence,
    timings: parsed.timings, warnings: parsed.warnings, raw, latencyMs
  });
}

function handle(data) {
  switch (data.type) {
    case 'init':
      if (!initPromise) initPromise = init(data.manifestUrl, data.tools);
      return initPromise;
    case 'complete':
      return complete(data.id, data.text, data.opts);
    default:
      throw new NeedleError('invalid-output', 'unknown message type ' + data.type);
  }
}

// Requests are handled strictly one at a time: the engine has a single inference state.
self.onmessage = (event) => {
  const data = event.data || {};
  queue = queue.then(() => handle(data)).catch((err) => {
    send({
      type: 'error',
      id: data.id,
      code: (err && err.code) || 'inference',
      message: err && err.message ? err.message : String(err),
      raw: err && err.raw
    });
  });
};
