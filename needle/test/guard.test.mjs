import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { guard, mentionsDomain } = require('../guard.js');
const load = (f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url), 'utf8'));

const call = (name, args) => ({ name, arguments: args });

test('domain gate drops every call when the prompt names nothing the app has', () => {
  for (const t of ['hello', 'thanks', 'tell me a joke', 'what is the weather today', 'set a timer for five minutes', 'the reddish sky']) {
    const r = guard(t, [call('get_clock_time', {})]);
    assert.deepEqual(r.calls, [], t);
    assert.equal(r.notes.length, 1, t);
  }
});

test('domain gate matches whole words only', () => {
  assert.equal(mentionsDomain('set a timer'), false, '"timer" is not "time"');
  assert.equal(mentionsDomain('the reddish sky'), false);
  assert.equal(mentionsDomain('What TIME is it'), true);
});

test('prompts that name something the app has pass through untouched', () => {
  const c = [call('toggle_light', { light: 'red', state: true })];
  const r = guard('turn on red', c);
  assert.deepEqual(r.calls, c);
  assert.deepEqual(r.notes, []);
});

test('set_log_entry keeps only the fields of its own column', () => {
  const blue = guard('log blue left on', [call('set_log_entry', { column: 'blue', left: true, right: false, on: true, transition: 'off-to-on', time: '14:30' })]);
  assert.deepEqual(blue.calls, [call('set_log_entry', { column: 'blue', left: true, right: false, time: '14:30' })]);
  const yellow = guard('log yellow on', [call('set_log_entry', { column: 'yellow', left: true, on: true })]);
  assert.deepEqual(yellow.calls, [call('set_log_entry', { column: 'yellow', on: true })]);
  const red = guard('log red off to on', [call('set_log_entry', { column: 'red', on: false, transition: 'off-to-on' })]);
  assert.deepEqual(red.calls, [call('set_log_entry', { column: 'red', transition: 'off-to-on' })]);
  assert.equal(blue.notes.length, 1);
});

test('guard never invents arguments and leaves other tools alone', () => {
  const missing = guard('log yellow at 09:15', [call('set_log_entry', { column: 'yellow', time: '09:15' })]);
  assert.deepEqual(missing.calls, [call('set_log_entry', { column: 'yellow', time: '09:15' })]);
  const del = [call('delete_log_entry', { column: 'red', time: '22:00' })];
  assert.deepEqual(guard('delete the red log at 22:00', del).calls, del);
  assert.deepEqual(guard('log', []).calls, []);
});

test('the gate never rejects a prompt that expects a call (all dev and hold-out sets)', () => {
  for (const f of ['cases.v5.json', 'cases.holdout.v5.json', 'cases.v3.json', 'cases.holdout.v3.json', 'cases.v2.json']) {
    for (const c of load(f)) {
      if (c.expected.length) assert.equal(mentionsDomain(c.text), true, f + ': ' + c.text);
    }
  }
});
