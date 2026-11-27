import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const createAppApi = require('../../app-api.js');
const { createToolAdapter } = require('../../adapter/index.js');
const { LIMITS } = require('../../adapter/registry.js');

function harness(options = {}) {
  const state = {
    blue: { left: false, right: false },
    yellow: false,
    red: false,
    logs: { blue: [], yellow: [], red: [] },
    terminalHistory: [{ text: 'status', type: 'command', time: 1 }]
  };
  let nextId = 0;
  const legacy = {
    getState: () => ({
      blue: { ...state.blue },
      yellow: state.yellow,
      red: state.red,
      logs: Object.fromEntries(Object.entries(state.logs).map(([key, value]) => [key, value.slice()])),
      terminalHistory: state.terminalHistory.slice()
    }),
    toggleBlueLeft() { state.blue.left = !state.blue.left; },
    toggleBlueRight() { state.blue.right = !state.blue.right; },
    toggleRed() { state.red = !state.red; },
    setYellowState(value) { state.yellow = value; },
    createLogEntry(column, data, time = '09:30') {
      const entry = { id: String(++nextId), time, ...data };
      const index = state.logs[column].findIndex((item) => item.time === time);
      if (index < 0) state.logs[column].unshift(entry);
      else state.logs[column][index] = { ...state.logs[column][index], ...entry };
      return entry;
    },
    deleteLogEntry(column, id) {
      const index = state.logs[column].findIndex((item) => item.id === id);
      if (index < 0) return false;
      state.logs[column].splice(index, 1);
      return true;
    },
    clearLogs(column) { state.logs[column] = []; }
  };
  const appApi = createAppApi(legacy, { getClockText: () => '09:30' });
  const adapter = createToolAdapter({
    appApi,
    confirmAction: options.confirmAction || (async () => true)
  });
  return { adapter, appApi, state };
}

test('all nine tools execute through the real public application API', async () => {
  const confirmations = [];
  const { adapter, appApi, state } = harness({
    confirmAction: async (request) => { confirmations.push(request.tool); return true; }
  });

  assert.deepEqual((await adapter.execute('get_light_status', {})).result, {
    blue: { left: false, right: false }, yellow: false, red: false
  });
  assert.deepEqual((await adapter.execute('get_clock_time', {})).result, { time: '09:30' });

  const logs = await adapter.execute('read_logs', {});
  assert.equal(logs.success, true);
  assert.deepEqual(logs.result.columns, { blue: [], yellow: [], red: [] });
  assert.equal(logs.result.totalCount, 0);

  const history = await adapter.execute('get_terminal_history', {});
  assert.deepEqual(history.result.entries[0], { text: 'status', type: 'command', time: 1 });

  assert.deepEqual((await adapter.execute('toggle_light', { light: 'red', state: true })).result, {
    light: 'red', previousState: false, currentState: true
  });
  assert.equal(state.red, true);

  const write = await adapter.execute('set_log_entry', {
    column: 'blue', left: true, right: false, time: '10:15'
  });
  assert.equal(write.success, true);
  assert.equal(write.result.action, 'created');
  assert.equal(write.result.entry.time, '10:15');

  const deletion = await adapter.execute('delete_log_entry', { column: 'blue', time: '10:15' });
  assert.equal(deletion.success, true);
  assert.equal(deletion.result.success, true);

  appApi.setLogEntry({ column: 'yellow', on: true, time: '11:00' });
  const cleared = await adapter.execute('clear_logs', { column: 'yellow' });
  assert.equal(cleared.success, true);
  assert.deepEqual(cleared.result, { column: 'yellow', deletedCount: 1 });

  appApi.setLogEntry({ column: 'red', transition: 'off-to-on', time: '12:00' });
  const exported = await adapter.execute('export_logs', { format: 'json' });
  assert.equal(exported.success, true);
  assert.deepEqual(JSON.parse(exported.result.data), {
    blue: [], yellow: [], red: [{ id: '3', time: '12:00', transition: 'off-to-on' }]
  });
  assert.deepEqual(confirmations, ['delete_log_entry', 'clear_logs']);
});

test('every tool rejects invalid input before invoking application methods', async () => {
  const cases = [
    ['get_light_status', { extra: true }],
    ['get_clock_time', { timezone: 'UTC' }],
    ['read_logs', { column: 'all' }],
    ['get_terminal_history', { limit: 10 }],
    ['toggle_light', { light: 'red', state: 'on' }],
    ['set_log_entry', { column: 'blue', left: true }],
    ['delete_log_entry', { column: 'blue', time: '24:00' }],
    ['clear_logs', { column: 'green' }],
    ['export_logs', { format: 'xml' }]
  ];
  const { adapter, state } = harness();
  const before = JSON.stringify(state);
  for (const [name, args] of cases) {
    const result = await adapter.execute(name, args);
    assert.equal(result.success, false, name);
    assert.equal(result.error.code, 'invalid_args', name);
  }
  assert.equal(JSON.stringify(state), before);
});

test('each handler normalizes application failures without leaking exception details', async () => {
  const cases = [
    ['get_light_status', 'getLightStatus', {}],
    ['get_clock_time', 'getClockTime', {}],
    ['read_logs', 'readLogs', {}],
    ['get_terminal_history', 'getTerminalHistory', {}],
    ['toggle_light', 'setLight', { light: 'red', state: true }],
    ['set_log_entry', 'setLogEntry', { column: 'yellow', on: true }],
    ['delete_log_entry', 'deleteLogEntry', { column: 'blue', time: '10:00' }],
    ['clear_logs', 'clearLogs', { column: 'blue' }],
    ['export_logs', 'exportLogs', { format: 'json' }]
  ];

  for (const [tool, method, args] of cases) {
    const { appApi } = harness();
    if (tool === 'delete_log_entry') appApi.setLogEntry({ column: 'blue', left: false, right: false, time: '10:00' });
    const brokenApi = {
      ...appApi,
      [method]: () => { throw new Error('private application internals'); }
    };
    const adapter = createToolAdapter({ appApi: brokenApi, confirmAction: async () => true });
    const result = await adapter.execute(tool, args);
    assert.equal(result.success, false, tool);
    assert.equal(result.error.code, 'execution_failed', tool);
    assert.equal(result.error.message.includes('private application internals'), false, tool);
    assert.equal('stack' in result.error, false, tool);
  }
});

test('read-only tools do not mutate application state', async () => {
  const { adapter, state } = harness();
  const before = JSON.stringify(state);
  for (const [tool, args] of [
    ['get_light_status', {}],
    ['get_clock_time', {}],
    ['read_logs', {}],
    ['read_logs', { column: 'blue' }],
    ['get_terminal_history', {}],
    ['export_logs', { format: 'csv' }]
  ]) {
    const result = await adapter.execute(tool, args);
    assert.equal(result.success, true, tool);
  }
  assert.equal(JSON.stringify(state), before);
});

test('log and terminal reads are bounded and disclose truncation', async () => {
  const { adapter, state } = harness();
  for (let i = 0; i < LIMITS.maxLogEntriesPerColumn + 5; i++) {
    state.logs.blue.push({ id: String(i), time: '09:30', left: true, right: false, privateField: 'not exposed' });
  }
  for (let i = 0; i < LIMITS.maxTerminalEntries + 5; i++) {
    state.terminalHistory.push({ text: 'x'.repeat(LIMITS.maxTerminalTextLength + 10), type: 'command', time: i, privateField: 'not exposed' });
  }

  const logs = await adapter.execute('read_logs', { column: 'blue' });
  assert.equal(logs.result.entries.length, LIMITS.maxLogEntriesPerColumn);
  assert.equal(logs.result.totalCount, LIMITS.maxLogEntriesPerColumn + 5);
  assert.equal(logs.result.truncated, true);
  assert.equal('privateField' in logs.result.entries[0], false);

  const history = await adapter.execute('get_terminal_history', {});
  assert.equal(history.result.entries.length, LIMITS.maxTerminalEntries);
  assert.equal(history.result.totalCount, LIMITS.maxTerminalEntries + 5);
  assert.equal(history.result.truncated, true);
  assert.equal(history.result.entries[0].text.length, LIMITS.maxTerminalTextLength);
  assert.equal('privateField' in history.result.entries[0], false);
});

test('export handles empty data and refuses an oversized panel result', async () => {
  const { adapter } = harness();
  const empty = await adapter.execute('export_logs', {});
  assert.equal(empty.success, true);
  assert.deepEqual(JSON.parse(empty.result.data), { blue: [], yellow: [], red: [] });
  assert.deepEqual(empty.result.entryCounts, { blue: 0, yellow: 0, red: 0, total: 0 });

  const { appApi } = harness();
  const oversizedApi = {
    ...appApi,
    exportLogs: () => ({
      format: 'json',
      data: 'x'.repeat(LIMITS.maxExportCharacters + 1),
      entryCounts: { blue: 0, yellow: 0, red: 0, total: 0 }
    })
  };
  const oversized = await createToolAdapter({ appApi: oversizedApi }).execute('export_logs', {});
  assert.equal(oversized.success, false);
  assert.equal(oversized.error.code, 'result_too_large');
});
