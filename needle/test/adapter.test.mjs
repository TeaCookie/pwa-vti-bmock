import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { createToolAdapter, TOOL_NAMES } = require('../../adapter/index.js');
const schema = JSON.parse(readFileSync(new URL('../tools.v5.json', import.meta.url), 'utf8'));

function harness(options = {}) {
  const calls = [];
  const state = {
    lights: { blue: { left: false, right: false }, yellow: false, red: false },
    logs: { blue: [], yellow: [], red: [] },
    history: [{ text: 'help', type: 'command' }]
  };
  const api = {
    getLightStatus() { calls.push('getLightStatus'); return structuredClone(state.lights); },
    getClockTime() { calls.push('getClockTime'); return { time: '09:30' }; },
    readLogs(column) { calls.push('readLogs'); return column ? structuredClone(state.logs[column]) : structuredClone(state.logs); },
    getTerminalHistory() { calls.push('getTerminalHistory'); return structuredClone(state.history); },
    setLight(light, value) {
      calls.push('setLight');
      const previousState = light === 'blue-left' ? state.lights.blue.left : light === 'blue-right' ? state.lights.blue.right : state.lights[light];
      if (light === 'blue-left') state.lights.blue.left = value;
      else if (light === 'blue-right') state.lights.blue.right = value;
      else state.lights[light] = value;
      return { light, previousState, currentState: value };
    },
    setLogEntry(args) {
      calls.push('setLogEntry');
      const time = args.time || '09:30';
      const entry = { id: 'log-1', ...args, time };
      state.logs[args.column] = [entry];
      return { entry, action: 'created' };
    },
    deleteLogEntry(column, time) {
      calls.push('deleteLogEntry');
      const found = state.logs[column].findIndex((entry) => entry.time === time);
      if (found < 0) return { success: false, reason: 'not-found', column, time };
      const [entry] = state.logs[column].splice(found, 1);
      return { success: true, column, time, deletedId: entry.id };
    },
    clearLogs(column) { calls.push('clearLogs'); const deletedCount = state.logs[column].length; state.logs[column] = []; return { column, deletedCount }; },
    exportLogs(format = 'json') { calls.push('exportLogs'); return { format, data: '', entryCounts: { blue: 0, yellow: 0, red: 0, total: 0 } }; }
  };
  return { adapter: createToolAdapter({ appApi: api, ...options }), calls, state };
}

test('registry exposes exactly the nine trained v5 tools', () => {
  assert.deepEqual(TOOL_NAMES, schema.map((tool) => tool.name));
});

test('dispatches known tools through explicit application API mappings', async () => {
  const { adapter, calls } = harness();
  const result = await adapter.execute('get_light_status', {});
  assert.equal(result.success, true);
  assert.deepEqual(result.result, { blue: { left: false, right: false }, yellow: false, red: false });
  assert.deepEqual(calls, ['getLightStatus']);
});

test('rejects unknown names without invoking application code', async () => {
  const { adapter, calls } = harness();
  const result = await adapter.execute('deleteEverything', {});
  assert.equal(result.success, false);
  assert.equal(result.error.code, 'unknown_tool');
  assert.deepEqual(calls, []);
});

test('validates arguments before invoking side effects', async () => {
  const { adapter, calls } = harness();
  const result = await adapter.execute('toggle_light', { light: 'red', state: 'on' });
  assert.equal(result.success, false);
  assert.equal(result.error.code, 'invalid_args');
  assert.deepEqual(calls, []);
});

test('enforces cross-field set_log_entry rules and rejects extra fields', async () => {
  const { adapter, calls } = harness();
  for (const args of [
    { column: 'blue', left: true },
    { column: 'yellow', on: true, transition: 'off-to-on' },
    { column: 'red', transition: 'invalid' },
    { column: 'yellow', on: true, unexpected: true }
  ]) {
    const result = await adapter.execute('set_log_entry', args);
    assert.equal(result.success, false);
    assert.equal(result.error.code, 'invalid_args');
  }
  assert.deepEqual(calls, []);
});

test('normalizes application exceptions without exposing stack traces', async () => {
  const { adapter } = harness();
  const result = await adapter.execute('get_clock_time', {});
  assert.equal(result.success, true);
  const broken = createToolAdapterWithBrokenApi();
  const failure = await broken.execute('get_clock_time', {});
  assert.equal(failure.success, false);
  assert.equal(failure.error.code, 'execution_failed');
  assert.equal(failure.error.message.includes('secret internal detail'), false);
  assert.equal('stack' in failure.error, false);
});

function createToolAdapterWithBrokenApi() {
  const base = harness().adapter;
  const api = {
    getLightStatus() {}, getClockTime() { throw new Error('secret internal detail'); },
    readLogs() {}, getTerminalHistory() {}, setLight() {}, setLogEntry() {},
    deleteLogEntry() {}, clearLogs() {}, exportLogs() {}
  };
  return createToolAdapter({ appApi: api });
}
const { createToolAdapter } = require('../../adapter/index.js');

test('destructive tools fail closed without an application confirmation callback', async () => {
  const { adapter, state } = harness();
  state.logs.blue.push({ id: 'a', time: '10:00' });
  const result = await adapter.execute('clear_logs', { column: 'blue' });
  assert.equal(result.success, false);
  assert.equal(result.error.code, 'confirmation_required');
  assert.equal(state.logs.blue.length, 1);
});

test('delete and clear require confirmation and execute only after approval', async () => {
  const requests = [];
  const { adapter, state, calls } = harness({ confirmAction: async (request) => { requests.push(request); return true; } });
  state.logs.red.push({ id: 'r1', time: '12:00' });
  const deleted = await adapter.execute('delete_log_entry', { column: 'red', time: '12:00' });
  assert.equal(deleted.success, true);
  assert.equal(deleted.result.deletedId, 'r1');
  state.logs.blue.push({ id: 'b1', time: '08:00' });
  const cleared = await adapter.execute('clear_logs', { column: 'blue' });
  assert.equal(cleared.success, true);
  assert.equal(cleared.result.deletedCount, 1);
  assert.deepEqual(requests.map((item) => item.tool), ['delete_log_entry', 'clear_logs']);
  assert.equal(calls.includes('deleteLogEntry'), true);
  assert.equal(calls.includes('clearLogs'), true);
});

test('executes call arrays sequentially and returns ordered results', async () => {
  const order = [];
  const api = {
    getLightStatus: async () => { order.push('start-read'); await Promise.resolve(); order.push('end-read'); return {}; },
    getClockTime: () => { order.push('clock'); return { time: '09:30' }; },
    readLogs() {}, getTerminalHistory() {}, setLight() {}, setLogEntry() {},
    deleteLogEntry() {}, clearLogs() {}, exportLogs() {}
  };
  const adapter = createToolAdapter({ appApi: api });
  const results = await adapter.executeCalls([{ name: 'get_light_status', arguments: {} }, { name: 'get_clock_time', arguments: {} }]);
  assert.deepEqual(order, ['start-read', 'end-read', 'clock']);
  assert.deepEqual(results.map((item) => item.success), [true, true]);
});
