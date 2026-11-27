import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createConfirmationManager } = require('../../adapter/confirmations.js');

const operation = Object.freeze({
  tool: 'clear_logs',
  column: 'blue',
  deletedCount: 2
});

test('confirmation approval is bound to the exact pending operation', async () => {
  let shown;
  const manager = createConfirmationManager({ onPending: (request) => { shown = request; } });
  let settled = false;
  const result = manager.request(operation).then((value) => { settled = true; return value; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.match(shown.description, /2 entries from the blue log/);
  assert.equal(manager.confirm(shown.id, shown.operation), true);
  assert.equal(await result, true);
  assert.equal(manager.getPending(), null);
});

test('cancel rejects the request without authorizing an operation', async () => {
  let shown;
  const manager = createConfirmationManager({ onPending: (request) => { shown = request; } });
  const result = manager.request(operation);
  await Promise.resolve();
  assert.equal(manager.cancel(shown.id), true);
  await assert.rejects(result, { code: 'confirmation_cancelled' });
  assert.equal(manager.getPending(), null);
});

test('expired confirmations are rejected and cannot be approved later', async () => {
  let shown;
  const manager = createConfirmationManager({
    ttlMs: 10,
    onPending: (request) => { shown = request; }
  });
  const result = manager.request(operation);
  await assert.rejects(result, { code: 'confirmation_expired' });
  assert.throws(() => manager.confirm(shown.id, shown.operation), { code: 'confirmation_mismatch' });
});

test('a mismatched operation or confirmation identifier is rejected', async () => {
  let shown;
  const manager = createConfirmationManager({ onPending: (request) => { shown = request; } });
  const result = manager.request(operation);
  await Promise.resolve();
  assert.throws(() => manager.confirm(shown.id, { ...operation, column: 'red' }), {
    code: 'confirmation_mismatch'
  });
  assert.throws(() => manager.confirm('another-confirmation', shown.operation), {
    code: 'confirmation_mismatch'
  });
  assert.equal(manager.getPending().id, shown.id);
  manager.cancel(shown.id);
  await assert.rejects(result, { code: 'confirmation_cancelled' });
});

test('session reset invalidates and rejects a pending confirmation', async () => {
  let shown;
  const manager = createConfirmationManager({ onPending: (request) => { shown = request; } });
  const result = manager.request(operation);
  await Promise.resolve();
  manager.reset();
  await assert.rejects(result, { code: 'confirmation_cancelled' });
  assert.throws(() => manager.confirm(shown.id, shown.operation), { code: 'confirmation_mismatch' });
});

test('delete-entry confirmation describes the exact target', async () => {
  let shown;
  const manager = createConfirmationManager({ onPending: (request) => { shown = request; } });
  const target = { tool: 'delete_log_entry', column: 'red', time: '12:30', entry: { id: 'entry-7', time: '12:30' } };
  const result = manager.request(target);
  await Promise.resolve();
  assert.match(shown.description, /red log entry at 12:30/);
  assert.deepEqual(shown.entry, target.entry);
  manager.confirm(shown.id, shown.operation);
  await result;
});
