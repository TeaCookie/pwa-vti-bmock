import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createAssistantController } = require('../../assistant-controller.js');

class FakeRoot extends EventTarget {
  constructor() {
    super();
    this.location = { href: 'https://example.test/app/' };
    this.CustomEvent = class extends Event {
      constructor(type, options = {}) { super(type); this.detail = options.detail; }
    };
    this.events = [];
    const dispatch = this.dispatchEvent.bind(this);
    this.dispatchEvent = (event) => {
      if (event.type.startsWith('needle:assistant-')) this.events.push(event);
      return dispatch(event);
    };
  }
  emit(type, detail) { this.dispatchEvent(new this.CustomEvent(type, { detail })); }
  details(type) { return this.events.filter((event) => event.type === type).map((event) => event.detail); }
}

function setup({ calls = [], outcomes = [], raw = 'original raw output', onExecute } = {}) {
  const root = new FakeRoot();
  let completions = 0;
  const order = [];
  class Client {
    constructor() { this.worker = null; }
    init() { this.worker = {}; return Promise.resolve({ type: 'ready' }); }
    async complete(input) {
      completions++;
      order.push('complete:' + input);
      return { raw, calls };
    }
    terminate() {}
  }
  const adapter = {
    async executeCalls(batch) {
      order.push('tool:' + (batch[0] && batch[0].name));
      if (onExecute) await onExecute(batch[0], root);
      const outcome = outcomes.shift();
      return [outcome || { success: true, tool: batch[0] && batch[0].name, result: { ok: true } }];
    }
  };
  const controller = createAssistantController({ root, Client, adapter });
  return { root, controller, order, completions: () => completions };
}

test('preserves raw output and dispatches structured calls sequentially', async () => {
  const calls = [
    { name: 'toggle_light', arguments: { light: 'red', state: true } },
    { name: 'get_light_status', arguments: {} }
  ];
  const { root, controller, order, completions } = setup({ calls });
  root.emit('needle:assistant-submit', { text: 'turn the red light on' });
  await controller.getQueue();
  assert.deepEqual(order, ['complete:turn the red light on', 'tool:toggle_light', 'tool:get_light_status']);
  assert.equal(completions(), 1);
  assert.equal(root.details('needle:assistant-response')[0].text, 'original raw output');
  assert.deepEqual(root.details('needle:assistant-tool-result').map((x) => x.state), ['succeeded', 'succeeded']);
  assert.deepEqual(root.details('needle:assistant-tool-summary')[0], { total: 2, succeeded: 2, failed: 0 });
  controller.dispose();
});

test('continues after a failed call and reports partial success', async () => {
  const calls = [{ name: 'toggle_light', arguments: { light: 'red', state: true } }, { name: 'get_light_status', arguments: {} }];
  const outcomes = [
    { success: false, tool: 'toggle_light', error: { code: 'execution_failed', message: 'failed' } },
    { success: true, tool: 'get_light_status', result: { red: true } }
  ];
  const { root, controller } = setup({ calls, outcomes });
  root.emit('needle:assistant-submit', { text: 'do both' });
  await controller.getQueue();
  assert.deepEqual(root.details('needle:assistant-tool-result').map((x) => x.state), ['failed', 'succeeded']);
  assert.deepEqual(root.details('needle:assistant-tool-summary')[0], { total: 2, succeeded: 1, failed: 1 });
  assert.equal(root.details('needle:assistant-status').at(-1).message, 'Completed with tool errors');
  controller.dispose();
});

test('confirmation-required operations expose a distinct pending state', async () => {
  const calls = [{ name: 'clear_logs', arguments: { column: 'red' } }];
  const { root, controller } = setup({
    calls,
    onExecute: async (call, target) => {
      target.emit('needle:assistant-confirmation', { request: { tool: call.name, description: 'Confirm clearing red logs' } });
      await Promise.resolve();
      target.emit('needle:assistant-confirmation', { request: null });
    }
  });
  root.emit('needle:assistant-submit', { text: 'clear red logs' });
  await controller.getQueue();
  const states = root.details('needle:assistant-tool-state').map((x) => x.state);
  assert.ok(states.includes('awaiting_confirmation'));
  assert.ok(states.includes('running'));
  controller.dispose();
});

test('malformed call collections fail safely without invoking the adapter', async () => {
  const root = new FakeRoot();
  class Client {
    constructor() { this.worker = null; }
    init() { this.worker = {}; return Promise.resolve(); }
    complete() { return Promise.resolve({ raw: 'raw', calls: null }); }
    terminate() {}
  }
  let invoked = false;
  const adapter = { async executeCalls() { invoked = true; return []; } };
  const controller = createAssistantController({ root, Client, adapter });
  root.emit('needle:assistant-submit', { text: 'invalid' });
  await controller.getQueue();
  assert.equal(invoked, false);
  assert.equal(root.details('needle:assistant-response')[0].text, 'raw');
  assert.equal(root.details('needle:assistant-tool-result')[0].result.error.code, 'invalid_calls');
  controller.dispose();
});

test('unknown and malformed individual calls are delegated unchanged to the allowlist adapter', async () => {
  const calls = [{ name: 'unlisted_tool', arguments: {} }, null];
  const outcomes = [
    { success: false, tool: 'unlisted_tool', error: { code: 'unknown_tool', message: 'unsupported' } },
    { success: false, tool: null, error: { code: 'invalid_call', message: 'invalid' } }
  ];
  let received;
  const root = new FakeRoot();
  class Client {
    constructor() { this.worker = null; }
    init() { this.worker = {}; return Promise.resolve(); }
    complete() { return Promise.resolve({ raw: 'unchanged', calls }); }
    terminate() {}
  }
  const adapter = { async executeCalls(batch) { received = batch[0]; return [outcomes.shift()]; } };
  const controller = createAssistantController({ root, Client, adapter });
  root.emit('needle:assistant-submit', { text: 'bad tools' });
  await controller.getQueue();
  assert.equal(received, null);
  assert.deepEqual(root.details('needle:assistant-tool-result').map((x) => x.state), ['failed', 'failed']);
  controller.dispose();
});
