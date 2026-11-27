import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseResult } = require('../validate.js');
const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const tools = load('../tools.v5.json');
const fixtures = load('../fixtures/tool-contract.v5.json');
const envelope = (call) => JSON.stringify({ success: true, function_calls: [call] });

test('v5 contract fixtures cover every trained tool with valid and invalid calls', () => {
  const schemaNames = tools.map((tool) => tool.name).sort();
  const fixtureNames = fixtures.tools.map((tool) => tool.name).sort();
  assert.deepEqual(fixtureNames, schemaNames);
  assert.equal(new Set(fixtureNames).size, 9, 'tool names are unique');

  for (const fixture of fixtures.tools) {
    const valid = parseResult(envelope({ name: fixture.name, arguments: fixture.valid }), tools);
    assert.equal(valid.ok, true, fixture.name + ' valid fixture: ' + (valid.message || ''));
    assert.equal(valid.calls.length, 1);
    assert.equal(valid.calls[0].name, fixture.name);

    const invalid = parseResult(envelope({ name: fixture.name, arguments: fixture.invalid }), tools);
    assert.equal(invalid.ok, false, fixture.name + ' invalid fixture should fail');
    assert.equal(invalid.code, 'invalid-output');
  }
});

test('v5 contract edge cases match the trained schema validator', () => {
  for (const edge of fixtures.edgeCases) {
    const result = parseResult(envelope({ name: edge.name, arguments: edge.arguments }), tools);
    const shouldPass = edge.expected.startsWith('Valid');
    assert.equal(result.ok, shouldPass, edge.name + ': ' + edge.expected + (result.message ? ' (' + result.message + ')' : ''));
  }
});

test('trained schema exposes exactly nine tools and no broader-contract-only operations', () => {
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['get_light_status', 'get_clock_time', 'read_logs', 'get_terminal_history', 'toggle_light', 'set_log_entry', 'delete_log_entry', 'clear_logs', 'export_logs']
  );
  for (const deferred of ['create_log_entry', 'update_log_entry', 'set_yellow_timing', 'import_logs']) {
    assert.equal(tools.some((tool) => tool.name === deferred), false, deferred + ' must remain deferred');
  }
});

test('model manifest pins the Experiment 1 artifact identified by the contract', () => {
  const manifest = load('../assets.exp1_20l.json');
  assert.equal(manifest.runtime.release, '4.0.0');
  assert.equal(manifest.model.sha256, '55021a3c9bc334c4c58e2c7131b292a8013beac4d1c1da1f1530aa47c1ef036a');
  assert.equal(manifest.model.file, 'needle3.cact', 'runtime alias is distinct from repository artifact path');
  assert.equal(manifest.model.source, 'exp1_20l.cact');
  assert.match(manifest.model.url, /\.\.\/finetune\/models\/exp1_20l\.cact(?:\?|$)/);
  assert.equal(fixtures.contractVersion, 'needle-tools-v5');
});
