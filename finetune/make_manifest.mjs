#!/usr/bin/env node
// Make a test-page manifest for a locally built .cact:
//   node finetune/make_manifest.mjs finetune/models/exp1_20l.cact
// writes needle/assets.exp1_20l.json, to open as  needle/test.html?tools=tools.v5.json&cases=cases.v5.json&manifest=assets.exp1_20l.json
//
// The runtime files and everything else come from needle/assets.manifest.json; only the model entry changes.
// The URL carries ?v=<hash prefix>: the worker caches by URL and size only, so without it a retrained
// model of the same size would be served from the cache of the previous one.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, relative, resolve, dirname } from 'node:path';

export function buildManifest(base, cactPath, fileBytes, needleDir) {
  const sha256 = createHash('sha256').update(fileBytes).digest('hex');
  const rel = relative(needleDir, cactPath).split('\\').join('/');
  return {
    ...base,
    model: { file: 'needle3.cact', url: rel + '?v=' + sha256.slice(0, 12), sha256, size: fileBytes.length, source: basename(cactPath) }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const target = process.argv[2];
  if (!target) { console.error('usage: make_manifest.mjs path/to/model.cact'); process.exit(2); }
  const cactPath = resolve(target);
  const needleDir = resolve(dirname(new URL(import.meta.url).pathname), '../needle');
  const base = JSON.parse(readFileSync(resolve(needleDir, 'assets.manifest.json'), 'utf8'));
  const bytes = readFileSync(cactPath);
  const name = basename(cactPath).replace(/\.cact$/, '');
  const manifest = buildManifest(base, cactPath, bytes, needleDir);
  const out = resolve(needleDir, 'assets.' + name + '.json');
  writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
  console.log('wrote needle/assets.' + name + '.json  (' + (statSync(cactPath).size / 1048576).toFixed(1) + ' MB, sha256 ' + manifest.model.sha256.slice(0, 12) + ')');
  console.log('open: needle/test.html?tools=tools.v5.json&cases=cases.v5.json&manifest=assets.' + name + '.json');
}
