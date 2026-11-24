// Shared helpers for building and checking fine-tuning data. Pure functions, no I/O except loading the tool file.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const V = require('../needle/validate.js');
const G = require('../needle/guard.js');

const here = (p) => new URL(p, import.meta.url);

/** The tools exactly as the worker registers them with the engine (see forEngine in needle/needle.worker.js). */
export function forEngine(tool) {
  const { noop, localAllowed, ...rest } = tool;
  const copy = JSON.parse(JSON.stringify(rest));
  const props = (copy.parameters && copy.parameters.properties) || {};
  for (const key of Object.keys(props)) delete props[key].localPattern;
  return copy;
}

export function loadAppTools(file = '../needle/tools.v5.json') {
  return JSON.parse(readFileSync(here(file), 'utf8'));
}

export function canonicalTools(file) {
  return loadAppTools(file).map(forEngine);
}

/** "9:15 pm" / "9:15" / "09:15" style times found in a prompt, normalised to HH:MM. */
export function timesIn(text) {
  const out = new Set();
  const re = /\b(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?|\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/gi;
  let m;
  while ((m = re.exec(text))) {
    let h = Number(m[1] !== undefined ? m[1] : m[4]);
    const min = m[2] !== undefined ? Number(m[2]) : 0;
    const ap = (m[3] || m[5] || '').toLowerCase().replace(/\./g, '');
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    out.add(String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0'));
  }
  return out;
}

export const normalizeQuery = (q) => String(q).toLowerCase().replace(/[^a-z0-9: ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Returns null when the example is usable, else a short reason.
 * `appTools` are the tools WITH local markers (localPattern), so the same HH:MM rule as the app applies.
 */
export function problemWith(example, appTools) {
  if (!example || typeof example.query !== 'string' || !example.query.trim()) return 'no query';
  if (example.query.length > 200) return 'query too long';
  if (!Array.isArray(example.answers)) return 'answers is not an array';
  if (example.answers.length > 3) return 'more than 3 calls';
  const reasoning = (example.reasoning || '').trim();
  if (!reasoning) return 'no reasoning line';
  if (reasoning.length > 300) return 'reasoning too long';

  const parsed = V.parseResult(JSON.stringify({ success: true, function_calls: example.answers }), appTools);
  if (!parsed.ok) return 'invalid call: ' + parsed.message;

  const wanted = timesIn(example.query);
  for (const call of example.answers) {
    const a = call.arguments || {};
    if (call.name === 'set_log_entry') {
      const allowed = G.COLUMN_FIELDS[a.column] || [];
      for (const k of ['left', 'right', 'on', 'transition']) {
        if (k in a && allowed.indexOf(k) === -1) return 'set_log_entry: ' + k + ' is not a ' + a.column + ' field';
      }
      if (a.column === 'blue' && !('left' in a) && !('right' in a)) return 'set_log_entry blue with no left or right';
      if (a.column === 'yellow' && !('on' in a)) return 'set_log_entry yellow with no on';
      if (a.column === 'red' && !('transition' in a)) return 'set_log_entry red with no transition';
    }
    if ('time' in a && !wanted.has(a.time)) return 'time ' + a.time + ' is not in the query';
    if (call.name === 'delete_log_entry' && !('time' in a)) return 'delete_log_entry without time';
  }
  return null;
}

/** Keys used to compare training prompts with evaluation prompts. */
export function words(q) {
  return new Set(normalizeQuery(q).split(' ').filter(Boolean));
}

export function jaccard(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

export function loadEvalPrompts() {
  const names = ['cases.v5.json', 'cases.holdout.v5.json', 'cases.v3.json', 'cases.holdout.v3.json', 'cases.v2.json'];
  const out = [];
  for (const f of names) {
    for (const c of JSON.parse(readFileSync(here('../needle/' + f), 'utf8'))) out.push({ text: c.text, file: f, group: c.group });
  }
  return out;
}
