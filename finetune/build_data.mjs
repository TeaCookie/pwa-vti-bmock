#!/usr/bin/env node
// Build and check fine-tuning data for the v5 tool set.
//
//   node finetune/build_data.mjs tools                      write finetune/tools.train.json (the tools the engine sees)
//   node finetune/build_data.mjs seed [--n 1100]            write finetune/data/seed.jsonl from templates
//   node finetune/build_data.mjs check IN.jsonl [IN2 ...] [--out finetune/data/train.jsonl]
//                                                           validate, canonicalise tools, dedupe, drop prompts that are
//                                                           in the evaluation sets, print stats
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonicalTools, loadAppTools, problemWith, normalizeQuery, words, jaccard, loadEvalPrompts } from './lib.mjs';
import { generateSeed } from './seed.mjs';

const here = (p) => new URL(p, import.meta.url).pathname;
const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = rest.indexOf(name);
  return i === -1 ? fallback : rest[i + 1];
};
const writeJsonl = (file, rows) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
};

function cmdTools() {
  const tools = canonicalTools();
  writeFileSync(here('tools.train.json'), JSON.stringify(tools, null, 2) + '\n');
  console.log('wrote finetune/tools.train.json (' + tools.length + ' tools, ' + JSON.stringify(tools).length + ' chars)');
}

function cmdSeed() {
  const n = Number(flag('--n', 1100));
  const tools = canonicalTools();
  const rows = generateSeed(n).map((ex) => ({ query: ex.query, tools, answers: ex.answers, reasoning: ex.reasoning }));
  writeJsonl(here('data/seed.jsonl'), rows);
  console.log('wrote finetune/data/seed.jsonl (' + rows.length + ' examples)');
}

function cmdCheck() {
  const inputs = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--out');
  if (!inputs.length) throw new Error('give at least one input jsonl');
  const out = flag('--out', 'finetune/data/train.jsonl');
  const appTools = loadAppTools();
  const tools = canonicalTools();
  const evalPrompts = loadEvalPrompts();
  const evalKeys = new Map(evalPrompts.map((e) => [normalizeQuery(e.text), e.file]));

  const drops = {};
  const bump = (k) => { drops[k] = (drops[k] || 0) + 1; };
  const seen = new Set();
  const kept = [];
  let total = 0;
  for (const file of inputs) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      total++;
      let ex;
      try { ex = JSON.parse(line); } catch (e) { bump('not json'); continue; }
      if (ex.function_calls && !ex.answers) ex.answers = ex.function_calls;
      const bad = problemWith(ex, appTools);
      if (bad) { bump(bad.replace(/[0-9]{2}:[0-9]{2}/g, 'HH:MM').replace(/invalid call: .*(unknown tool).*/, 'invalid call: unknown tool').slice(0, 70)); continue; }
      const key = normalizeQuery(ex.query);
      if (evalKeys.has(key)) { bump('same prompt as an evaluation case'); continue; }
      const dk = key + '|' + JSON.stringify(ex.answers);
      if (seen.has(dk)) { bump('duplicate'); continue; }
      seen.add(dk);
      kept.push({ query: ex.query.trim(), tools, answers: ex.answers, reasoning: ex.reasoning.trim() });
    }
  }
  writeJsonl(here(out.replace(/^finetune\//, '')), kept);

  const count = (f) => kept.filter(f).length;
  const names = (ex) => ex.answers.map((a) => a.name);
  console.log('read ' + total + ', kept ' + kept.length + ', wrote ' + out);
  console.log('dropped:'); for (const [k, v] of Object.entries(drops).sort((a, b) => b[1] - a[1])) console.log('  ' + String(v).padStart(5) + '  ' + k);
  console.log('mix:');
  console.log('  no call (negatives)   ' + count((e) => e.answers.length === 0));
  console.log('  two or more calls     ' + count((e) => e.answers.length > 1));
  for (const n of new Set(kept.flatMap(names))) console.log('  ' + n.padEnd(22) + count((e) => names(e).includes(n)));
  console.log('  set_log_entry with time   ' + count((e) => e.answers.some((a) => a.name === 'set_log_entry' && 'time' in a.arguments)) +
    ' / without ' + count((e) => e.answers.some((a) => a.name === 'set_log_entry' && !('time' in a.arguments))));

  // How close are evaluation prompts to something we train on? High overlap means the eval flatters the model.
  const trainWords = kept.map((e) => words(e.query));
  const perGroup = {};
  let near = 0;
  for (const e of evalPrompts.filter((x) => x.file === 'cases.v5.json' || x.file === 'cases.holdout.v5.json')) {
    const w = words(e.text); let best = 0;
    for (const t of trainWords) { const j = jaccard(w, t); if (j > best) best = j; if (best === 1) break; }
    const g = perGroup[e.group] || (perGroup[e.group] = { near: 0, total: 0 });
    g.total++;
    if (best >= 0.8) { g.near++; near++; }
  }
  const v5Total = Object.values(perGroup).reduce((s, g) => s + g.total, 0);
  console.log('v5 dev + hold-out prompts with a training prompt at >= 0.8 word overlap: ' + near + ' of ' + v5Total + '  (high = the score will flatter the model)');
  for (const [g, v] of Object.entries(perGroup)) console.log('  ' + g.padEnd(18) + v.near + ' / ' + v.total);
}

if (cmd === 'tools') cmdTools();
else if (cmd === 'seed') cmdSeed();
else if (cmd === 'check') cmdCheck();
else { console.error('usage: build_data.mjs tools | seed [--n N] | check IN.jsonl... [--out PATH]'); process.exit(2); }
