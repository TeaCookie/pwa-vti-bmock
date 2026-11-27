import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const createApi = require('../../app-api.js');

function harness() {
  const state = {
    blue: { left: false, right: false },
    yellow: false,
    red: false,
    logs: { blue: [], yellow: [], red: [] },
    terminalHistory: [{ text: 'status', type: 'command', time: 1 }]
  };
  let id = 0;
  const calls = [];
  const legacy = {
    getState: () => ({ ...state }),
    toggleBlueLeft() { state.blue.left = !state.blue.left; calls.push('blue-left'); },
    toggleBlueRight() { state.blue.right = !state.blue.right; calls.push('blue-right'); },
    toggleRed() { state.red = !state.red; calls.push('red'); },
    processCommand(command) {
      if (command === 'toggle yellow') state.yellow = !state.yellow;
      calls.push(command);
    },
    createLogEntry(column, data, time = '09:41') {
      const entry = { id: String(++id), time, ...data };
      const existing = state.logs[column].findIndex((item) => item.time === time);
      if (existing >= 0) state.logs[column][existing] = { ...state.logs[column][existing], ...entry };
      else state.logs[column].unshift(entry);
      return entry;
    },
    deleteLogEntry(column, entryId) {
      const index = state.logs[column].findIndex((item) => item.id === entryId);
      if (index < 0) return false;
      state.logs[column].splice(index, 1);
      return true;
    },
    clearLogs(column) { state.logs[column] = []; }
  };
  return { api: createApi(legacy, { getClockText: () => '09:41' }), state, calls };
}

test('read APIs return detached snapshots with contract-shaped values', () => {
  const { api, state } = harness();
  const snapshot = api.getState();
  snapshot.blue.left = true;
  snapshot.logs.blue.push({ time: '01:00' });
  assert.equal(state.blue.left, false);
  assert.equal(state.logs.blue.length, 0);
  assert.deepEqual(api.getLightStatus(), { blue: { left: false, right: false }, yellow: false, red: false });
  assert.deepEqual(api.getClockTime(), { time: '09:41' });
  assert.deepEqual(api.readLogs(), { blue: [], yellow: [], red: [] });
  const history = api.getTerminalHistory();
  history[0].text = 'changed';
  assert.equal(state.terminalHistory[0].text, 'status');
});

test('setLight is idempotent and reports previous and current state', () => {
  const { api, calls } = harness();
  assert.deepEqual(api.setLight('blue-left', true), { light: 'blue-left', previousState: false, currentState: true });
  api.setLight('blue-left', true);
  api.setLight('blue-right', false);
  api.setLight('yellow', true);
  api.setLight('yellow', true);
  api.setLight('red', true);
  api.setLight('red', true);
  assert.deepEqual(calls, ['blue-left', 'toggle yellow', 'red']);
});

test('setLogEntry validates exact column fields and upserts by time', () => {
  const { api, state } = harness();
  const first = api.setLogEntry({ column: 'blue', left: true, right: false, time: '14:30' });
  const second = api.setLogEntry({ column: 'blue', left: false, right: true, time: '14:30' });
  assert.equal(first.action, 'created');
  assert.equal(second.action, 'updated');
  api.setLogEntry({ column: 'yellow', on: true });
  api.setLogEntry({ column: 'red', transition: 'off-to-on' });
  assert.equal(state.logs.blue.length, 1);
  assert.deepEqual(state.logs.blue[0], { id: '2', time: '14:30', left: false, right: true });
  assert.throws(() => api.setLogEntry({ column: 'blue', left: true, right: false, time: '25:00' }), /HH:MM/);
  assert.throws(() => api.setLogEntry({ column: 'yellow', left: false }), /do not belong/);
  assert.throws(() => api.setLogEntry({ column: 'red', transition: 'off-to-on', extra: 1 }), /unsupported/);
});

test('deleteLogEntry rejects missing and ambiguous timestamps without mutation', () => {
  const { api, state } = harness();
  api.setLogEntry({ column: 'yellow', on: true, time: '08:15' });
  assert.deepEqual(api.deleteLogEntry('yellow', '08:15'), { success: true, column: 'yellow', time: '08:15', deletedId: '1' });
  assert.deepEqual(api.deleteLogEntry('yellow', '08:15'), { success: false, reason: 'not-found', column: 'yellow', time: '08:15' });
  state.logs.yellow.push({ id: 'duplicate-a', time: '08:15', on: false });
  state.logs.yellow.push({ id: 'duplicate-b', time: '08:15', on: true });
  assert.deepEqual(api.deleteLogEntry('yellow', '08:15'), { success: false, reason: 'ambiguous', column: 'yellow', time: '08:15' });
  assert.equal(state.logs.yellow.length, 2);
});

test('clearLogs reports count and is scoped to one column', () => {
  const { api, state } = harness();
  api.setLogEntry({ column: 'blue', left: true, right: true });
  api.setLogEntry({ column: 'red', transition: 'on-to-off' });
  assert.deepEqual(api.clearLogs('blue'), { column: 'blue', deletedCount: 1 });
  assert.equal(state.logs.blue.length, 0);
  assert.equal(state.logs.red.length, 1);
});

test('exportLogs returns normalized JSON and CSV data with counts', () => {
  const { api } = harness();
  const empty = api.exportLogs('json');
  assert.deepEqual(JSON.parse(empty.data), { blue: [], yellow: [], red: [] });
  assert.deepEqual(empty.entryCounts, { blue: 0, yellow: 0, red: 0, total: 0 });
  api.setLogEntry({ column: 'red', transition: 'off-to-on', time: '11:00' });
  const csv = api.exportLogs('csv');
  assert.match(csv.data, /"column","id","time"/);
  assert.match(csv.data, /"red","1","11:00"/);
  assert.equal(csv.entryCounts.total, 1);
  assert.throws(() => api.exportLogs('xml'), /json or csv/);
});
