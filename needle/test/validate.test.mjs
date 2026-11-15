import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { parseResult, scoreCase } = require('../validate.js');
const tools = JSON.parse(readFileSync(new URL('../tools.json', import.meta.url), 'utf8'));

const ok = (o) => JSON.stringify({ success: true, ...o });

test('valid call passes and carries confidence and timings', () => {
  const r = parseResult(
    ok({
      function_calls: [{ name: 'toggle_light', arguments: { light: 'red', state: true } }],
      confidence: 0.93, prefill_tps: 800, decode_tps: 60, peak_ram_mb: 90
    }),
    tools
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.calls, [{ name: 'toggle_light', arguments: { light: 'red', state: true } }]);
  assert.equal(r.confidence, 0.93);
  assert.equal(r.timings.decode_tps, 60);
});

test('empty function_calls is a normal result, with suppressed calls kept', () => {
  const r = parseResult(ok({ function_calls: [], suppressed_calls: [{ name: 'toggle_light' }], confidence: 0.05 }), tools);
  assert.equal(r.ok, true);
  assert.deepEqual(r.calls, []);
  assert.equal(r.suppressed.length, 1);
});

test('missing function_calls is tolerated but flagged', () => {
  const r = parseResult(ok({}), tools);
  assert.equal(r.ok, true);
  assert.deepEqual(r.calls, []);
  assert.equal(r.warnings.length, 1);
});

test('no-argument tools accept missing or empty arguments', () => {
  const r = parseResult(ok({ function_calls: [{ name: 'get_clock_time' }, { name: 'get_light_status', arguments: {} }] }), tools);
  assert.equal(r.ok, true);
  assert.equal(r.calls.length, 2);
});

test('arguments given as a JSON string are parsed', () => {
  const r = parseResult(ok({ function_calls: [{ name: 'toggle_light', arguments: '{"light":"yellow","state":false}' }] }), tools);
  assert.equal(r.ok, true);
  assert.deepEqual(r.calls[0].arguments, { light: 'yellow', state: false });
});

for (const [label, call, fragment] of [
  ['unknown tool', { name: 'make_coffee', arguments: {} }, 'unknown tool'],
  ['missing required', { name: 'toggle_light', arguments: { light: 'red' } }, 'missing required'],
  ['wrong type', { name: 'toggle_light', arguments: { light: 'red', state: 'on' } }, 'should be boolean'],
  ['bad enum', { name: 'toggle_light', arguments: { light: 'green', state: true } }, 'must be one of'],
  ['extra argument', { name: 'get_clock_time', arguments: { zone: 'utc' } }, 'unexpected argument']
]) {
  test('invalid-output: ' + label, () => {
    const r = parseResult(ok({ function_calls: [call] }), tools);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid-output');
    assert.match(r.message, new RegExp(fragment));
  });
}

test('non-JSON output is invalid-output', () => {
  const r = parseResult('Sure, turning it on!', tools);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid-output');
});

test('engine failure is reported as inference', () => {
  const r = parseResult(JSON.stringify({ success: false, error: 'out of tokens' }), tools);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'inference');
  assert.match(r.message, /out of tokens/);
});

test('scoreCase is exact on names, arguments and order', () => {
  const a = { name: 'toggle_light', arguments: { light: 'red', state: true } };
  const b = { name: 'toggle_light', arguments: { light: 'yellow', state: false } };
  assert.equal(scoreCase([a, b], [a, b]), true);
  assert.equal(scoreCase([a, b], [b, a]), false);
  assert.equal(scoreCase([a], [a, b]), false);
  assert.equal(scoreCase([], []), true);
  assert.equal(scoreCase([a], [{ ...a, arguments: { light: 'red', state: false } }]), false);
});
