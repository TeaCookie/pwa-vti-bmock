import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forEngine, canonicalTools, loadAppTools, problemWith, timesIn } from '../../finetune/lib.mjs';
import { generateSeed } from '../../finetune/seed.mjs';
import { buildManifest } from '../../finetune/make_manifest.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const appTools = loadAppTools();

test('training tools are exactly what the worker registers (forEngine matches needle.worker.js)', () => {
  const src = read('../needle.worker.js');
  const m = src.match(/function forEngine\(tool\) \{[\s\S]*?\n\}\n/);
  assert.ok(m, 'forEngine found in the worker');
  const workerFn = new Function(m[0] + '; return forEngine;')();
  for (const t of appTools) assert.deepEqual(forEngine(t), workerFn(t), t.name);
  assert.ok(!JSON.stringify(canonicalTools()).includes('localPattern'));
});

test('finetune/tools.train.json is up to date with needle/tools.v5.json', () => {
  assert.deepEqual(JSON.parse(read('../../finetune/tools.train.json')), canonicalTools(), 'run: node finetune/build_data.mjs tools');
});

test('seed generation is deterministic and every example passes the checker', () => {
  const a = generateSeed(600, 7);
  assert.deepEqual(a, generateSeed(600, 7));
  assert.notDeepEqual(a, generateSeed(600, 8));
  const bad = a.map((e) => [e, problemWith(e, appTools)]).filter(([, p]) => p);
  assert.deepEqual(bad.slice(0, 3), []);
  const negatives = a.filter((e) => e.answers.length === 0).length;
  assert.ok(negatives / a.length > 0.12, 'enough no-call examples: ' + negatives);
  for (const e of a) assert.ok(e.reasoning.length > 10 && e.reasoning.length <= 300, e.query);
});

test('checker rejects wrong examples', () => {
  const ok = { query: 'log yellow on at 09:15', reasoning: 'x', answers: [{ name: 'set_log_entry', arguments: { column: 'yellow', on: true, time: '09:15' } }] };
  assert.equal(problemWith(ok, appTools), null);
  const bad = (answers, query = ok.query, reasoning = 'x') => problemWith({ query, reasoning, answers }, appTools);
  assert.match(bad([{ name: 'set_log_entry', arguments: { column: 'yellow', on: true, left: true } }]), /not a yellow field/);
  assert.match(bad([{ name: 'set_log_entry', arguments: { column: 'yellow', on: true, time: '10:00' } }]), /not in the query/);
  assert.match(bad([{ name: 'delete_log_entry', arguments: { column: 'red' } }], 'delete red'), /invalid call/);
  assert.match(bad([{ name: 'nope', arguments: {} }]), /unknown tool/);
  assert.match(bad([{ name: 'set_log_entry', arguments: { column: 'red' } }], 'log red'), /no transition/);
  assert.match(bad([], 'hello', ''), /no reasoning/);
  assert.equal(bad([], 'hello', 'nothing applies'), null);
});

test('times in prompts are normalised to HH:MM', () => {
  assert.deepEqual([...timesIn('log yellow at 14:30')], ['14:30']);
  assert.deepEqual([...timesIn('at 2:30 pm')], ['14:30']);
  assert.deepEqual([...timesIn('at 9 am')], ['09:00']);
  assert.deepEqual([...timesIn('12:05 am')], ['00:05']);
  assert.deepEqual([...timesIn('no time here')], []);
});

test('manifest keeps the runtime and swaps only the model, with a content hash in the URL', () => {
  const base = JSON.parse(read('../assets.manifest.json'));
  const dir = mkdtempSync(join(tmpdir(), 'cact-'));
  const bytes = Buffer.from('pretend model bytes');
  const m = buildManifest(base, join(dir, 'x.cact'), bytes, dir);
  assert.deepEqual(m.runtime, base.runtime);
  assert.equal(m.model.size, bytes.length);
  assert.match(m.model.url, /^x\.cact\?v=[0-9a-f]{12}$/);
  assert.equal(m.model.url.split('=')[1], m.model.sha256.slice(0, 12));
  const other = buildManifest(base, join(dir, 'x.cact'), Buffer.from('pretend model bytez'), dir);
  assert.notEqual(other.model.url, m.model.url, 'same name and size, different bytes: different cache key');
});
