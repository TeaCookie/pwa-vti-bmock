/**
 * Runs needle.worker.js in a vm sandbox against a FAKE Cactus runtime.
 * This proves the call sequence, argument types, caching and error handling.
 * It does NOT prove the real model's accuracy or speed: that needs a browser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const dir = new URL('../', import.meta.url);
const workerSrc = readFileSync(new URL('needle.worker.js', dir), 'utf8');
const validateSrc = readFileSync(new URL('validate.js', dir), 'utf8');
const tools = JSON.parse(readFileSync(new URL('tools.json', dir), 'utf8'));

const sha = (b) => createHash('sha256').update(b).digest('hex');
const enc = (s) => new TextEncoder().encode(s);
// Values created inside the vm sandbox have another realm's prototypes; compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));

function makeWorld({ modelBytes = enc('FAKE-MODEL-BYTES'), outputs = [], cacheHit = null } = {}) {
  const jsBytes = enc('/* fake cactus.js */');
  const wasmBytes = enc('FAKE-WASM');
  const manifest = {
    runtime: { files: {
      'cactus.js': { url: 'https://assets.test/cactus.js', sha256: sha(jsBytes), size: jsBytes.length },
      'cactus.wasm': { url: 'https://assets.test/cactus.wasm', sha256: sha(wasmBytes), size: wasmBytes.length }
    } },
    model: { url: 'https://assets.test/needle3.cact', sha256: sha(modelBytes), size: modelBytes.length }
  };
  const bodies = {
    'https://assets.test/cactus.js': jsBytes,
    'https://assets.test/cactus.wasm': wasmBytes,
    'https://assets.test/needle3.cact': modelBytes
  };

  const log = { fetches: [], calls: [], messages: [] };
  const store = new Map(cacheHit || []);
  const heap = new Uint8Array(1 << 20);
  let nextPtr = 1024;
  let completeIndex = 0;

  const fakeEngine = {
    HEAPU8: heap,
    _malloc(n) { const p = nextPtr; nextPtr += n + 8; log.calls.push(['_malloc', n]); return p; },
    _free(p) { log.calls.push(['_free', p]); },
    _cactus_load(ptr, len) { log.calls.push(['_cactus_load', ptr, typeof len, Number(len)]); return 0; },
    _cactus_reset() { log.calls.push(['_cactus_reset']); return 0; },
    ccall(name, ret, types, args) {
      log.calls.push([name, ret, types, args]);
      if (name === 'cactus_init') return 0;
      if (name === 'cactus_complete') {
        const out = outputs[completeIndex++] ?? JSON.stringify({ success: true, function_calls: [] });
        const bytes = enc(out);
        heap.set(bytes, args[4]);
        heap[args[4] + bytes.length] = 0;
        return 0;
      }
      throw new Error('unexpected ccall ' + name);
    },
    UTF8ToString(ptr) {
      let end = ptr;
      while (heap[end] !== 0) end++;
      return new TextDecoder().decode(heap.subarray(ptr, end));
    }
  };

  const messages = log.messages;
  const self = { postMessage: (m) => messages.push(m), onmessage: null };
  const context = vm.createContext({
    self, console, TextDecoder, TextEncoder, Uint8Array, BigInt, Blob, URL, Response, Promise, performance,
    crypto: globalThis.crypto,
    importScripts(arg) {
      if (typeof arg === 'string' && arg.endsWith('validate.js')) vm.runInContext(validateSrc, context);
      else context.createCactus = async (opts) => { log.calls.push(['createCactus', Object.keys(opts)]); return fakeEngine; };
    },
    caches: {
      async open() {
        return {
          async match(url) { return store.has(url) ? new Response(store.get(url)) : undefined; },
          async put(url, res) { store.set(url, new Uint8Array(await res.arrayBuffer())); },
          async delete(url) { return store.delete(url); }
        };
      }
    },
    async fetch(url) {
      log.fetches.push(url);
      if (url === 'https://app.test/manifest.json') {
        return { ok: true, status: 200, json: async () => manifest };
      }
      const body = bodies[url];
      if (!body) return { ok: false, status: 404 };
      let sent = false;
      return { ok: true, status: 200, body: { getReader: () => ({ async read() {
        if (sent) return { done: true };
        sent = true;
        return { done: false, value: body };
      } }) } };
    }
  });
  vm.runInContext(workerSrc, context);

  const post = (data) => self.onmessage({ data });
  const waitFor = async (pred, ms = 2000) => {
    const t0 = Date.now();
    for (;;) {
      const m = messages.find(pred);
      if (m) return m;
      if (Date.now() - t0 > ms) throw new Error('timeout waiting; messages: ' + JSON.stringify(messages));
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  return { post, waitFor, log, store, manifest, messages };
}

const initMsg = { type: 'init', manifestUrl: 'https://app.test/manifest.json', tools };
const call = (name, args) => ({ name, arguments: args });
const out = (calls, extra = {}) => JSON.stringify({ success: true, function_calls: calls, confidence: 0.9, ...extra });

test('init follows the demo call sequence and never frees the model buffer', async () => {
  const w = makeWorld();
  w.post(initMsg);
  await w.waitFor((m) => m.type === 'ready');

  const names = w.log.calls.map((c) => c[0]);
  assert.deepEqual(names.filter((n) => !n.startsWith('_malloc')), ['createCactus', '_cactus_load', 'cactus_init']);
  assert.equal(names.includes('_free'), false, 'model buffer must stay allocated');

  const load = w.log.calls.find((c) => c[0] === '_cactus_load');
  assert.equal(load[2], 'bigint', 'length must be a BigInt');

  const init = w.log.calls.find((c) => c[0] === 'cactus_init');
  assert.deepEqual(plain(init[2]), ['string', 'string', 'number']);
  assert.equal(init[3][0], '', 'first argument is empty: no system prompt');
  assert.equal(init[3][2], 0);
  assert.deepEqual(JSON.parse(init[3][1]), tools, 'tools registered exactly as in tools.json');
});

test('complete sends only the raw text, resets first, and runs once', async () => {
  const w = makeWorld({ outputs: [out([call('toggle_light', { light: 'red', state: true })])] });
  w.post(initMsg);
  await w.waitFor((m) => m.type === 'ready');
  w.post({ type: 'complete', id: 7, text: 'turn on the red light' });
  const res = await w.waitFor((m) => m.type === 'result' && m.id === 7);

  assert.deepEqual(plain(res.calls), [call('toggle_light', { light: 'red', state: true })]);
  assert.equal(res.confidence, 0.9);
  assert.ok(res.raw.includes('function_calls'));

  const idxReset = w.log.calls.findIndex((c) => c[0] === '_cactus_reset');
  const idxComplete = w.log.calls.findIndex((c) => c[0] === 'cactus_complete');
  assert.ok(idxReset >= 0 && idxReset < idxComplete, 'reset runs before complete');
  const completes = w.log.calls.filter((c) => c[0] === 'cactus_complete');
  assert.equal(completes.length, 1, 'exactly one inference per request');
  assert.equal(completes[0][3][0], 'turn on the red light', 'raw text, no wrapper');
  assert.deepEqual(plain(completes[0][2]), ['string', 'number', 'number', 'number', 'number', 'number']);
  assert.equal(completes[0][3][3], 384);
});

test('opts.reset=false skips reset and opts.maxTokens is passed through', async () => {
  const w = makeWorld();
  w.post(initMsg);
  await w.waitFor((m) => m.type === 'ready');
  w.post({ type: 'complete', id: 1, text: 'hello', opts: { reset: false, maxTokens: 96 } });
  await w.waitFor((m) => m.type === 'result' && m.id === 1);
  assert.equal(w.log.calls.some((c) => c[0] === '_cactus_reset'), false);
  assert.equal(w.log.calls.find((c) => c[0] === 'cactus_complete')[3][3], 96);
});

test('requests are answered in order with matching ids', async () => {
  const w = makeWorld({ outputs: [
    out([call('get_clock_time', {})]),
    out([]),
    out([call('get_light_status', {})])
  ] });
  w.post(initMsg);
  await w.waitFor((m) => m.type === 'ready');
  w.post({ type: 'complete', id: 1, text: 'what time is it' });
  w.post({ type: 'complete', id: 2, text: 'tell me a joke' });
  w.post({ type: 'complete', id: 3, text: 'which lights are on' });
  await w.waitFor((m) => m.type === 'result' && m.id === 3);
  const results = w.messages.filter((m) => m.type === 'result');
  assert.deepEqual(results.map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(results.map((r) => r.calls.length), [1, 0, 1]);
});

test('invalid model output becomes an invalid-output error carrying the raw text', async () => {
  const w = makeWorld({ outputs: [out([call('toggle_light', { light: 'green', state: true })])] });
  w.post(initMsg);
  await w.waitFor((m) => m.type === 'ready');
  w.post({ type: 'complete', id: 9, text: 'turn on green' });
  const err = await w.waitFor((m) => m.type === 'error' && m.id === 9);
  assert.equal(err.code, 'invalid-output');
  assert.match(err.raw, /green/);
});

test('complete before init finishes is rejected as not-ready', async () => {
  const w = makeWorld();
  w.post({ type: 'complete', id: 4, text: 'hi' });
  const err = await w.waitFor((m) => m.type === 'error' && m.id === 4);
  assert.equal(err.code, 'not-ready');
});

test('a second worker start uses the cache and does not refetch any asset', async () => {
  const first = makeWorld();
  first.post(initMsg);
  await first.waitFor((m) => m.type === 'ready');
  assert.equal(first.store.size, 3, 'runtime js, wasm and model are cached once each');

  const second = makeWorld({ cacheHit: first.store });
  second.post(initMsg);
  await second.waitFor((m) => m.type === 'ready');
  assert.deepEqual(second.log.fetches, ['https://app.test/manifest.json']);
});

test('a cached model with the wrong size is discarded and refetched', async () => {
  const seed = makeWorld();
  const url = seed.manifest.model.url;
  const w = makeWorld({ cacheHit: new Map([[url, enc('truncated')]]) });
  w.post(initMsg);
  await w.waitFor((m) => m.type === 'ready');
  assert.ok(w.log.fetches.includes(url));
  assert.equal(w.store.get(url).length, seed.manifest.model.size);
});

test('a download whose bytes do not match the pinned hash fails with hash-mismatch', async () => {
  const w = makeWorld();
  // Same size, different bytes than the manifest's hash.
  w.manifest.model.sha256 = '0'.repeat(64);
  w.post(initMsg);
  const err = await w.waitFor((m) => m.type === 'error');
  assert.equal(err.code, 'hash-mismatch');
  assert.equal(w.store.has(w.manifest.model.url), false, 'unverified bytes are never cached');
});

test('the local noop marker is never sent to the engine, but still drives validation', async () => {
  const escapeTools = JSON.parse(readFileSync(new URL('tools.escape.json', dir), 'utf8'));
  const w = makeWorld({ outputs: [out([call('no_action', {})], { confidence: 0.7 })] });
  w.post({ ...initMsg, tools: escapeTools });
  await w.waitFor((m) => m.type === 'ready');

  const init = w.log.calls.find((c) => c[0] === 'cactus_init');
  const sent = JSON.parse(init[3][1]);
  assert.equal(sent.length, escapeTools.length);
  assert.equal(sent.some((t) => 'noop' in t), false, 'noop must be stripped before cactus_init');
  assert.ok(sent.some((t) => t.name === 'no_action'), 'the escape-hatch tool itself is registered');

  w.post({ type: 'complete', id: 1, text: 'hello' });
  const res = await w.waitFor((m) => m.type === 'result' && m.id === 1);
  assert.deepEqual(plain(res.calls), []);
  assert.equal(res.noAction, true);
});

test('local-only markers (noop, localPattern) never reach the engine, and time args are validated', async () => {
  const v3 = JSON.parse(readFileSync(new URL('tools.v3.json', dir), 'utf8'));
  assert.ok(JSON.stringify(v3).includes('localPattern'), 'v3 really uses localPattern');
  const w = makeWorld({ outputs: [
    out([call('set_log_entry', { column: 'yellow', time: '09:15', on: true })]),
    out([call('set_log_entry', { column: 'yellow', time: 'off', on: true })])
  ] });
  w.post({ ...initMsg, tools: v3 });
  await w.waitFor((m) => m.type === 'ready');

  const sent = JSON.parse(w.log.calls.find((c) => c[0] === 'cactus_init')[3][1]);
  assert.equal(JSON.stringify(sent).includes('localPattern'), false);
  assert.equal(sent.length, v3.length);
  assert.equal(sent.find((t) => t.name === 'set_log_entry').parameters.properties.time.type, 'string');

  w.post({ type: 'complete', id: 1, text: 'log yellow on at 09:15' });
  const good = await w.waitFor((m) => m.type === 'result' && m.id === 1);
  assert.equal(good.calls[0].arguments.time, '09:15');
  w.post({ type: 'complete', id: 2, text: 'change the yellow entry to off' });
  const bad = await w.waitFor((m) => m.type === 'error' && m.id === 2);
  assert.equal(bad.code, 'invalid-output');
  assert.match(bad.message, /wrong format/);
});
