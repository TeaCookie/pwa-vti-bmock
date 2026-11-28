import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');

test('service worker versions the app shell and caches assistant UI and adapter assets', () => {
  assert.match(source, /CACHE_NAME\s*=\s*['"]indicator-lights-v7['"]/);
  for (const asset of [
    '/index.html', '/assistant.css', '/assistant-ui.js', '/assistant-controller.js',
    '/adapter/validation.js', '/adapter/index.js', '/app-api.js'
  ]) assert.ok(source.includes("'" + asset + "'"), asset);
});

test('service worker does not precache large model or runtime assets', () => {
  const precache = source.slice(source.indexOf('const ASSETS_TO_CACHE'), source.indexOf('// Install event'));
  assert.doesNotMatch(precache, /needle\.cact|\.safetensors|wasm|model\.bin|exp1_20l/);
  assert.match(source, /startsWith\('\/needle\/'\)/);
});

test('service worker removes previous cache versions during activation', () => {
  assert.match(source, /filter\(\(name\) => name !== CACHE_NAME\)/);
  assert.match(source, /caches\.delete\(name\)/);
});
