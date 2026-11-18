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

const escapeTools = JSON.parse(readFileSync(new URL('../tools.escape.json', import.meta.url), 'utf8'));

test('a call to the noop escape-hatch tool means "no tool fits" and is not an action', () => {
  const r = parseResult(ok({ function_calls: [{ name: 'no_action', arguments: {} }], confidence: 0.8 }), escapeTools);
  assert.equal(r.ok, true);
  assert.deepEqual(r.calls, []);
  assert.equal(r.noAction, true);
});

test('noop calls are dropped from a mixed response but real calls are kept', () => {
  const r = parseResult(
    ok({ function_calls: [{ name: 'no_action' }, { name: 'toggle_light', arguments: { light: 'red', state: true } }] }),
    escapeTools
  );
  assert.equal(r.ok, true);
  assert.equal(r.calls.length, 1);
  assert.equal(r.noAction, true);
});

test('all tool-set variants are valid and differ only where intended', () => {
  for (const f of ['tools.tight.json', 'tools.escape.json', 'tools.both.json']) {
    const list = JSON.parse(readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
    for (const t of list) {
      assert.equal(typeof t.name, 'string');
      assert.equal(typeof t.description, 'string');
      assert.equal(t.parameters.type, 'object');
    }
    assert.equal(list.filter((t) => t.noop).length, f.includes('escape') || f.includes('both') ? 1 : 0, f);
  }
});

test('16-tool sets: every scored case is a valid call against the tool set', () => {
  const t16 = JSON.parse(readFileSync(new URL('../tools.16.json', import.meta.url), 'utf8'));
  const t16e = JSON.parse(readFileSync(new URL('../tools.16.escape.json', import.meta.url), 'utf8'));
  assert.equal(t16.length, 16);
  assert.equal(t16e.length, 17);
  assert.equal(new Set(t16.map((t) => t.name)).size, 16, 'names are unique');
  const cases = JSON.parse(readFileSync(new URL('../cases.16.json', import.meta.url), 'utf8'));
  for (const c of cases) {
    const r = parseResult(ok({ function_calls: c.expected }), t16);
    assert.equal(r.ok, true, c.text + ': ' + (r.message || ''));
    assert.equal(scoreCase(c.expected, r.calls), true, c.text);
  }
  const used = new Set(cases.flatMap((c) => c.expected.map((e) => e.name)));
  const untested = t16.map((t) => t.name).filter((n) => !used.has(n));
  assert.deepEqual(untested, ['import_logs'], 'import_logs takes a JSON blob, so it is only a distractor here');
});

test('lean experiment sets: each cases file validates against its own tool set', () => {
  const load = (f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
  const sets = [
    ['tools.lean.json', 'cases.lean.json', 15],
    ['tools.logs.json', 'cases.logs.json', 10],
    ['tools.merged.json', 'cases.merged.json', 11]
  ];
  for (const [tf, cf, count] of sets) {
    const t = load(tf);
    assert.equal(t.length, count, tf);
    assert.equal(new Set(t.map((x) => x.name)).size, count, tf + ' names unique');
    assert.equal(t.some((x) => x.name === 'import_logs'), false, tf + ' has no import_logs');
    for (const x of t) {
      assert.equal('confirm' in x.parameters.properties, false, tf + ' ' + x.name + ' hides confirm');
      assert.equal('dryRun' in x.parameters.properties, false, tf + ' ' + x.name + ' hides dryRun');
    }
    for (const c of load(cf)) {
      const r = parseResult(ok({ function_calls: c.expected }), t);
      assert.equal(r.ok, true, tf + ' / ' + c.text + ': ' + (r.message || ''));
      assert.equal(scoreCase(c.expected, r.calls), true, c.text);
    }
  }
  const merged = load('tools.merged.json').map((x) => x.name);
  assert.ok(merged.includes('create_log_entry') && merged.includes('update_log_entry'));
  assert.equal(merged.some((n) => /^(create|update)_(blue|yellow|red)_/.test(n)), false);
});

const { scoreCaseLenient, scoreNames } = require('../validate.js');

test('lenient scoring allows extra optional arguments, strict does not; names ignores arguments', () => {
  const exp = [{ name: 'get_terminal_history', arguments: {} }];
  const got = [{ name: 'get_terminal_history', arguments: { offset: 0, filterType: 'all' } }];
  assert.equal(scoreCase(exp, got), false);
  assert.equal(scoreCaseLenient(exp, got), true);
  const e2 = [{ name: 'update_log_entry', arguments: { column: 'blue', time: '14:30', left: true } }];
  assert.equal(scoreCaseLenient(e2, [{ name: 'update_log_entry', arguments: { column: 'blue', time: '14:30', left: true, on: true } }]), true);
  assert.equal(scoreCaseLenient(e2, [{ name: 'update_log_entry', arguments: { column: 'blue', time: '14:30' } }]), false, 'a missing expected argument fails');
  assert.equal(scoreCaseLenient(e2, [{ name: 'update_log_entry', arguments: { column: 'red', time: '14:30', left: true } }]), false, 'a wrong value fails');
  assert.equal(scoreNames(e2, [{ name: 'update_log_entry', arguments: {} }]), true);
  assert.equal(scoreNames(e2, [{ name: 'create_log_entry', arguments: {} }]), false);
});

test('v2 tool set: 11 tools, entries found by time, no ids or optional paging arguments, cases validate', () => {
  const load = (f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
  const t = load('tools.v2.json');
  assert.equal(t.length, 11);
  const byName = Object.fromEntries(t.map((x) => [x.name, x]));
  for (const n of ['update_log_entry', 'delete_log_entry']) {
    assert.equal('id' in byName[n].parameters.properties, false, n + ' has no id');
    assert.ok(byName[n].parameters.required.includes('time'), n + ' requires time');
  }
  assert.ok('newTime' in byName.update_log_entry.parameters.properties);
  assert.deepEqual(Object.keys(byName.read_logs.parameters.properties), ['column']);
  assert.deepEqual(Object.keys(byName.get_terminal_history.parameters.properties), []);
  assert.deepEqual(Object.keys(byName.export_logs.parameters.properties), ['format']);
  for (const x of t) for (const bad of ['limit', 'offset', 'filterType', 'includeMetadata', 'confirm', 'dryRun']) {
    assert.equal(bad in x.parameters.properties, false, x.name + ' hides ' + bad);
  }
  const cases = load('cases.v2.json');
  for (const c of cases) {
    const r = parseResult(ok({ function_calls: c.expected }), t);
    assert.equal(r.ok, true, c.text + ': ' + (r.message || ''));
    assert.equal(scoreCase(c.expected, r.calls), true, c.text);
  }
  const nonRepeat = cases.filter((c) => c.group !== 'independence');
  assert.equal(new Set(nonRepeat.map((c) => c.text)).size, nonRepeat.length, 'case texts are unique (independence cases repeat on purpose)');
});
