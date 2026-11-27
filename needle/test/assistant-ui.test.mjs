import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const assistant = require('../../assistant-ui.js');

test('launcher docks to the left, right, and bottom within viewport bounds', () => {
  const viewport = { width: 900, height: 700 };
  const size = 56;
  for (const dock of ['left', 'right', 'bottom']) {
    const point = assistant.getDockPosition(dock, 0.5, viewport, size);
    assert.ok(point.x >= 12 && point.x <= viewport.width - size - 12);
    assert.ok(point.y >= 12 && point.y <= viewport.height - size - 12);
    if (dock === 'left') assert.equal(point.x, 12);
    if (dock === 'right') assert.equal(point.x, viewport.width - size - 12);
    if (dock === 'bottom') assert.equal(point.y, viewport.height - size - 12);
  }
});

test('dock offsets are clamped even when persisted values are out of range', () => {
  const viewport = { width: 360, height: 640 };
  const size = 56;
  const low = assistant.getDockPosition('bottom', -10, viewport, size);
  const high = assistant.getDockPosition('bottom', 10, viewport, size);
  assert.equal(low.x, 12);
  assert.equal(high.x, viewport.width - size - 12);
});

test('panel placement flips and clamps to stay inside the viewport', () => {
  const viewport = { width: 390, height: 700 };
  const panel = { width: 366, height: 540 };
  const launcher = { x: 322, y: 632, width: 56, height: 56 };
  for (const dock of ['left', 'right', 'bottom']) {
    const point = assistant.getPanelPosition(launcher, panel, viewport, dock);
    assert.ok(point.x >= 12);
    assert.ok(point.y >= 12);
    assert.ok(point.x + panel.width <= viewport.width - 12);
    assert.ok(point.y + panel.height <= viewport.height - 12);
  }
});

test('panel placement handles a viewport smaller than its requested panel dimensions', () => {
  const point = assistant.getPanelPosition(
    { x: 2, y: 2, width: 56, height: 56 },
    { width: 400, height: 550 },
    { width: 320, height: 480 },
    'right'
  );
  assert.ok(Number.isFinite(point.x));
  assert.ok(Number.isFinite(point.y));
  assert.equal(point.x, 12);
  assert.equal(point.y, 12);
});

test('clamp handles values below, within, and above a range', () => {
  assert.equal(assistant.clamp(-1, 0, 10), 0);
  assert.equal(assistant.clamp(5, 0, 10), 5);
  assert.equal(assistant.clamp(11, 0, 10), 10);
});
