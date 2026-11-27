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
    createLogEntry(column, data, time = '12:00') {
      const entry = { id: String(++id), time, ...data };
      const existing = state.logs[column].findIndex((item) => item.time === time);
      if (existing >= 0) state.logs[column][existing] = entry;
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

test('read APIs return detached snapshots', () => {
  const { api, state } = harness();
  const snapshot = api.getState();
  snapshot.blue.left = true;
  snapshot.logs.blue.push({ time: '01:00' });
  assert.equal(state.blue.left, false);
  assert.equal(state.logs.blue.length, 0);
  const history = api.getTerminalHistory();
  history[0].text = 'changed';
  assert.equal(state.terminalHistory[0].text, 'status');
});

test('setLight is idempotent for every supported light', () => {
  const { api, calls } = harness();
  api.setLight('blue-left', true);
  api.setLight('blue-left', true);
  api.setLight('blue-right', false);
  api.setLight('yellow', true);
  api.setLight('yellow', true);
  api.setLight('red', true);
  api.setLight('red', true);
  assert.deepEqual(calls, ['blue-left', 'toggle yellow', 'red']);
});

test('setLogEntry validates column-specific data and upserts by time', () => {
  const { api, state } = harness();
  api.setLogEntry({ column: 'blue', left: true, right: false, time: '14:30' });
  api.setLogEntry({ column: 'blue', left: false, right: true, time: '14:30' });
  api.setLogEntry({ column: 'yellow', on: true });
  api.setLogEntry({ column: 'red', transition: 'off-to-on' });
  assert.equal(state.logs.blue.length, 1);
  assert.deepEqual(state.logs.blue[0], { id: '2', time: '14:30', left: false, right: true });
  assert.throws(() => api.setLogEntry({ column: 'blue', left: true, right: false, time: '25:00' }), /HH:MM/);
  assert.throws(() => api.setLogEntry({ column: 'yellow', left: false }), /boolean on/);
});

test('deleteLogEntry deletes by column and timestamp', () => {
  const { api, state } = harness();
  api.setLogEntry({ column: 'yellow', on: true, time: '08:15' });
  assert.equal(api.deleteLogEntry('yellow', '08:15'), true);
  assert.equal(api.deleteLogEntry('yellow', '08:15'), false);
  assert.equal(state.logs.yellow.length, 0);
});

test('clearLogs is scoped to one column', () => {
  const { api, state } = harness();
  api.setLogEntry({ column: 'blue', left: true, right: true });
  api.setLogEntry({ column: 'red', transition: 'on-to-off' });
  api.clearLogs('blue');
  assert.equal(state.logs.blue.length, 0);
  assert.equal(state.logs.red.length, 1);
});

test('exportLogs supports empty and populated JSON and CSV output', () => {
  const { api } = harness();
  const empty = api.exportLogs('json');
  assert.deepEqual(JSON.parse(empty.content), { blue: [], yellow: [], red: [] });
  api.setLogEntry({ column: 'red', transition: 'off-to-on', time: '11:00' });
  const csv = api.exportLogs('csv');
  assert.match(csv.content, /column,id,time/);
  assert.match(csv.content, /"red","3","11:00"/);
  assert.equal(csv.mimeType, 'text/csv;charset=utf-8');
  assert.throws(() => api.exportLogs('xml'), /json or csv/);
});
