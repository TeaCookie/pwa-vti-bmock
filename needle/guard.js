/**
 * App-side guard that runs on already-validated calls, before anything is executed.
 * Loads as a classic script (importScripts / <script>) and as CommonJS.
 *
 * guard(text, calls) -> { calls, notes }
 *   1. Domain gate: if the prompt names nothing this app has (no light, log, time, terminal... word),
 *      every call is dropped. The model always picks some tool, so "hello" would otherwise run get_clock_time.
 *   2. Column cleanup: set_log_entry keeps only the state fields that belong to its column
 *      (blue: left/right, yellow: on, red: transition). The model often fills fields from other columns.
 *
 * The vocabulary comes from the app's own nouns (light names, column names, tool subjects), not from
 * any test prompt that failed. Paraphrases that avoid every word here will be rejected: extend DOMAIN_WORDS.
 */
(function (root) {
  'use strict';

  const DOMAIN_WORDS = [
    'light', 'lights', 'led', 'leds', 'lamp', 'lamps', 'indicator', 'indicators',
    'blue', 'yellow', 'red', 'left', 'right', 'both', 'halves', 'half',
    'log', 'logs', 'logged', 'logging', 'entry', 'entries', 'column', 'columns', 'record', 'records',
    'time', 'clock', 'status', 'state',
    'terminal', 'history', 'command', 'commands',
    'export', 'csv', 'json'
  ];
  const DOMAIN_RE = new RegExp('\\b(?:' + DOMAIN_WORDS.join('|') + ')\\b', 'i');

  const COLUMN_FIELDS = { blue: ['left', 'right'], yellow: ['on'], red: ['transition'] };

  function mentionsDomain(text) {
    return DOMAIN_RE.test(String(text || ''));
  }

  function cleanColumns(call, notes) {
    if (call.name !== 'set_log_entry' || !call.arguments) return call;
    const allowed = COLUMN_FIELDS[call.arguments.column];
    if (!allowed) return call;
    const keep = ['column', 'time'].concat(allowed);
    const args = {};
    const dropped = [];
    for (const k of Object.keys(call.arguments)) {
      if (keep.indexOf(k) !== -1) args[k] = call.arguments[k];
      else dropped.push(k);
    }
    if (dropped.length) notes.push('set_log_entry: dropped ' + dropped.join(', ') + ' (not a ' + call.arguments.column + ' field)');
    return { name: call.name, arguments: args };
  }

  function guard(text, calls) {
    const notes = [];
    if (!Array.isArray(calls) || !calls.length) return { calls: [], notes: notes };
    if (!mentionsDomain(text)) {
      notes.push('domain gate: prompt mentions nothing this app has, ' + calls.length + ' call(s) dropped');
      return { calls: [], notes: notes };
    }
    return { calls: calls.map((c) => cleanColumns(c, notes)), notes: notes };
  }

  const api = { guard: guard, mentionsDomain: mentionsDomain, DOMAIN_WORDS: DOMAIN_WORDS, COLUMN_FIELDS: COLUMN_FIELDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NeedleGuard = api;
})(typeof self !== 'undefined' ? self : globalThis);
