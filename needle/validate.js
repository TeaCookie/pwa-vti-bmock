/**
 * Pure helpers shared by the worker, the test page and the Node tests.
 * Loads as a classic script (importScripts / <script>) and as CommonJS.
 *
 * parseResult(raw, tools)  -> { ok:true, calls, suppressed, confidence, timings, warnings }
 *                           | { ok:false, code, message }
 * scoreCase(expected, calls) -> boolean (exact match on names + arguments, in order)
 */
(function (root) {
  'use strict';

  function typeOk(schema, value) {
    switch (schema.type) {
      case 'string': return typeof value === 'string';
      case 'boolean': return typeof value === 'boolean';
      case 'integer': return Number.isInteger(value);
      case 'number': return typeof value === 'number' && Number.isFinite(value);
      case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
      case 'array': return Array.isArray(value);
      default: return true;
    }
  }

  function validateCall(call, toolsByName) {
    if (!call || typeof call !== 'object') return 'call is not an object';
    if (typeof call.name !== 'string') return 'call has no name';
    const tool = toolsByName.get(call.name);
    if (!tool) return 'unknown tool "' + call.name + '"';

    let args = call.arguments;
    if (args === undefined || args === null) args = {};
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch (e) { return call.name + ': arguments is not valid JSON'; }
    }
    if (!typeOk({ type: 'object' }, args)) return call.name + ': arguments is not an object';

    const params = (tool.parameters && tool.parameters.properties) || {};
    const required = (tool.parameters && tool.parameters.required) || [];
    for (const key of required) {
      if (!(key in args)) return call.name + ': missing required argument "' + key + '"';
    }
    for (const key of Object.keys(args)) {
      const schema = params[key];
      if (!schema) return call.name + ': unexpected argument "' + key + '"';
      if (!typeOk(schema, args[key])) {
        return call.name + ': argument "' + key + '" should be ' + schema.type;
      }
      if (schema.enum && !schema.enum.includes(args[key])) {
        return call.name + ': argument "' + key + '" must be one of ' + schema.enum.join(', ');
      }
    }
    return { name: call.name, arguments: args };
  }

  function parseResult(raw, tools) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { ok: false, code: 'invalid-output', message: 'output is not JSON: ' + String(raw).slice(0, 200) };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, code: 'invalid-output', message: 'output is not a JSON object' };
    }
    if (parsed.success === false) {
      return {
        ok: false,
        code: 'inference',
        message: String(parsed.error || parsed.error_code || 'engine reported failure')
      };
    }

    const warnings = [];
    let rawCalls = parsed.function_calls;
    if (rawCalls === undefined) {
      warnings.push('function_calls missing; treated as empty');
      rawCalls = [];
    }
    if (!Array.isArray(rawCalls)) {
      return { ok: false, code: 'invalid-output', message: 'function_calls is not an array' };
    }

    const byName = new Map(tools.map(function (t) { return [t.name, t]; }));
    const calls = [];
    for (const c of rawCalls) {
      const result = validateCall(c, byName);
      if (typeof result === 'string') {
        return { ok: false, code: 'invalid-output', message: result };
      }
      calls.push(result);
    }

    return {
      ok: true,
      calls: calls,
      suppressed: Array.isArray(parsed.suppressed_calls) ? parsed.suppressed_calls : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      timings: {
        prefill_tps: parsed.prefill_tps != null ? parsed.prefill_tps : null,
        decode_tps: parsed.decode_tps != null ? parsed.decode_tps : null,
        peak_ram_mb: parsed.peak_ram_mb != null ? parsed.peak_ram_mb : null
      },
      warnings: warnings
    };
  }

  function scoreCase(expected, calls) {
    if (!Array.isArray(expected) || !Array.isArray(calls)) return false;
    if (expected.length !== calls.length) return false;
    for (let i = 0; i < expected.length; i++) {
      if (expected[i].name !== calls[i].name) return false;
      const a = expected[i].arguments || {};
      const b = calls[i].arguments || {};
      const ka = Object.keys(a);
      if (ka.length !== Object.keys(b).length) return false;
      for (const k of ka) if (a[k] !== b[k]) return false;
    }
    return true;
  }

  const api = { parseResult: parseResult, scoreCase: scoreCase };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NeedleValidate = api;
})(typeof self !== 'undefined' ? self : globalThis);
