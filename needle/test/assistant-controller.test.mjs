import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createAssistantController, formatProgress, MODEL_MANIFEST, TOOL_SCHEMA } = require('../../assistant-controller.js');

class FakeRoot extends EventTarget {
  constructor() {
    super();
    this.location = { href: 'https://example.test/app/' };
    this.CustomEvent = class extends Event {
      constructor(type, options = {}) {
        super(type);
        this.detail = options.detail;
      }
    };
    this.events = [];
    this.addEventListener = this.addEventListener.bind(this);
    const dispatch = this.dispatchEvent.bind(this);
    this.dispatchEvent = (event) => {
      if (event.type.startsWith('needle:assistant-')) this.events.push(event);
      return dispatch(event);
    };
  }
  emit(type, detail) { this.dispatchEvent(new this.CustomEvent(type, { detail })); }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('uses the fine-tuned manifest and reconciled v5 tool schema explicitly', async () => {
  const root = new FakeRoot();
  let options;
  class Client {
    constructor(value) { options = value; this.worker = null; }
    init() { this.worker = {}; return Promise.resolve({ type: 'ready' }); }
    complete() { return Promise.resolve({ raw: '{"calls":[]}' }); }
    terminate() {}
  }
  const controller = createAssistantController({ root, Client });
  await controller.initialize();
  assert.equal(options.manifestUrl, new URL(MODEL_MANIFEST, root.location.href).href);
  assert.equal(options.toolsUrl, new URL(TOOL_SCHEMA, root.location.href).href);
  controller.dispose();
});

test('lazy initialization occurs only after the first submit and is shared by rapid submissions', async () => {
  const root = new FakeRoot();
  const init = deferred();
  let initCalls = 0;
  let completeCalls = 0;
  class Client {
    constructor() { this.worker = null; }
    init() { initCalls++; this.worker = {}; return init.promise; }
    async complete(text) { completeCalls++; return { raw: 'raw:' + text }; }
    terminate() {}
  }
  const controller = createAssistantController({ root, Client });
  assert.equal(initCalls, 0);
  root.emit('needle:assistant-submit', { text: 'first' });
  root.emit('needle:assistant-submit', { text: 'second' });
  await Promise.resolve();
  assert.equal(initCalls, 1);
  assert.equal(completeCalls, 0);
  init.resolve({ type: 'ready' });
  await controller.getQueue();
  assert.equal(completeCalls, 2);
  controller.dispose();
});

test('completion raw output is emitted unchanged and is not rewritten from parsed calls', async () => {
  const root = new FakeRoot();
  const raw = '  { "calls" : [], "confidence" : 0.91 }\n';
  class Client {
    constructor() { this.worker = null; }
    init() { this.worker = {}; return Promise.resolve({ type: 'ready' }); }
    complete() { return Promise.resolve({ raw, calls: [] }); }
    terminate() {}
  }
  const controller = createAssistantController({ root, Client });
  root.emit('needle:assistant-submit', { text: 'hello' });
  await controller.getQueue();
  const completion = root.events.find((event) => event.type === 'needle:assistant-completion');
  const response = root.events.find((event) => event.type === 'needle:assistant-response');
  assert.equal(completion.detail.raw, raw);
  assert.equal(response.detail.text, raw);
  controller.dispose();
});

test('progress is surfaced with byte percentage and stage', () => {
  assert.equal(formatProgress({ stage: 'model-download', loaded: 50, total: 100 }), 'Downloading fine-tuned model · 50%');
  assert.equal(formatProgress({ stage: 'runtime' }), 'Loading inference runtime');
});

test('failed initialization can be retried on the next submission', async () => {
  const root = new FakeRoot();
  let attempts = 0;
  class Client {
    constructor() { this.worker = null; }
    init() {
      attempts++;
      if (attempts === 1) return Promise.reject(Object.assign(new Error('network unavailable'), { code: 'asset-fetch' }));
      this.worker = {};
      return Promise.resolve({ type: 'ready' });
    }
    complete() { return Promise.resolve({ raw: 'ok' }); }
    terminate() {}
  }
  const controller = createAssistantController({ root, Client });
  root.emit('needle:assistant-submit', { text: 'first' });
  await controller.getQueue();
  root.emit('needle:assistant-submit', { text: 'retry' });
  await controller.getQueue();
  assert.equal(attempts, 2);
  assert.ok(root.events.some((event) => event.type === 'needle:assistant-error'));
  controller.dispose();
});
