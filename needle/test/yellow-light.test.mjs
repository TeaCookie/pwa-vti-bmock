import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const createController = require('../../yellow-light.js');
const createApi = require('../../app-api.js');

function lightElement() {
  const classes = new Set();
  const attributes = new Map();
  return {
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name)
    },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) => attributes.get(name)
  };
}

test('timer and assistant setter share yellow visual, status, and ARIA updates', () => {
  let yellow = false;
  let statusUpdates = 0;
  const light = lightElement();
  const controller = createController({
    getState: () => yellow,
    setState: (next) => { yellow = next; },
    light,
    updateStatus: () => { statusUpdates += 1; }
  });
  const legacy = {
    getState: () => ({
      blue: { left: false, right: false },
      yellow,
      red: false,
      logs: { blue: [], yellow: [], red: [] },
      terminalHistory: []
    }),
    setYellowState: (next) => controller.set(next)
  };
  const api = createApi(legacy);

  // The random timer uses the same controller's toggle operation.
  controller.toggle();
  assert.equal(yellow, true);
  assert.equal(light.classList.contains('on'), true);
  assert.match(light.getAttribute('aria-label'), /currently ON/);

  // Assistant API uses the same controller through the legacy application adapter.
  api.setLight('yellow', false);
  assert.equal(yellow, false);
  assert.equal(light.classList.contains('on'), false);
  assert.match(light.getAttribute('aria-label'), /currently OFF/);
  assert.equal(statusUpdates, 2);
});
