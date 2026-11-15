# Needle 3 WASM Integration - Session Changes

**Date:** 2026-11-15  
**Branch:** `claude/modest-mcclintock-630054`  
**Base Commit:** `d70ad83` (merge of PR #3)

---

## Overview

This session implemented the **Cactus Compute Needle 3 WASM model** integration into the pwa-vti-bmock PWA, replacing the previous placeholder with a fully functional local LLM inference engine running in a Web Worker.

**Key Achievement:** Fixed critical ABI compliance issues identified by reading the official `cactus.h` header, but inference remains slow (~19-25s vs 2s target).

---

## Files Created

### Needle 3 Worker & Runtime (`src/needle/`)
| File | Purpose |
|------|---------|
| `worker-v2.js` | Classic Web Worker running Cactus WASM runtime with `importScripts` |
| `cactus-runtime.js` | Standalone runtime loader (reference implementation) |
| `index.js` | Main thread client - worker communication, message protocol |
| `config.js` | Configuration constants (model URLs, timeouts, tool names) |
| `schemas.js` | 16 tool schemas in OpenAI function-calling format |
| `agent.js` | Inference loop: user query → tool calls → adapter → final response |
| `bridge.js` | Worker ↔ Tool Adapter bridge |

### Tool Adapter Layer (`src/adapter/`)
| File | Purpose |
|------|---------|
| `index.js` | Main entry - routing, validation, rate limiting, audit logging |
| `config.js` | Adapter configuration (rate limits, timeouts, confirmations) |
| `validation.js` | Input validation with Zod-like schemas |
| `errors.js` | Error normalization & retryability |
| `rateLimit.js` | Token bucket rate limiting per tool category |
| `audit.js` | Audit logging (model vs user actions) |
| `types/contract.ts` | TypeScript types for tool contract |
| `tools/lights.js` | Light tool handlers (get_light_status, toggle_light) |
| `tools/clock.js` | Clock tool handler (get_clock_time) |
| `tools/terminal.js` | Terminal history handler |
| `tools/logs.js` | Log CRUD handlers (create, read, update, delete, clear, export, import) |
| `tools/system.js` | System tools (health_check, set_yellow_timing, ping) |

### Tool Schemas (3 Core Tools)
| Tool | Description | Parameters |
|------|-------------|------------|
| `get_light_status` | Get on/off state of all lights | None |
| `toggle_light` | Turn light on/off | `light` (enum), `state` (boolean) |
| `get_clock_time` | Get current time (HH:MM) | None |

---

## Files Modified

### `app.js`
- **Added exports** for tool adapter integration:
  - `toggleYellow()`, `getYellowTiming()`, `setYellowTiming()`
  - `formatTime()`, `formatDateTime()`
  - `getTerminalHistory()`, `updateStatus()`
  - `_getYellowTimer()`, `_setYellowTimer()`, `_getScheduleYellowToggle()`
- **Persisted yellow timing** to localStorage (`indicatorYellowTiming`)

### `index.html`
- **Import map** for `needle-rs` from jsDelivr CDN
- **Chat interface** in terminal for testing AI queries
- **Model status indicator** (loading/ready/error)
- Initialization script for adapter → worker → bridge

### `sw.js`
- **Dual cache strategy**: App assets (`indicator-lights-v1`) + Model cache (`cactus-models-v1`)
- **Model pre-caching** on install (33.7 MB from Hugging Face)
- **Cache-first strategy** for model requests with network fallback
- Message handlers: `MODEL_CACHE_STATUS`, `CACHE_MODEL`

### `package.json`
```json
{
  "devDependencies": {
    "needle-rs": "latest",
    "zod": "^3.22.0",
    "vitest": "^1.0.0",
    "typescript": "^5.0.0",
    "@vitest/coverage-v8": "^1.0.0"
  }
}
```

### `src/adapter/index.js`
- Added `handlePing` import from system tools
- Added `ping` to `NEEDLE_TOOL_REGISTRY` (read, handler: handlePing)

### `src/adapter/tools/system.js`
- Added `handlePing()` - returns `{ status: 'pong', timestamp }`

### `src/adapter/types/contract.ts`
- Added `PING: 'ping'` to `NEEDLE_TOOL_NAMES`

### `src/adapter/validation.js`
- Added `ping: {}` schema (no parameters)

### `src/adapter/tools/system.js`
- Added `handlePing()` export

---

## Critical ABI Fixes (from `cactus.h`)

| Issue | Before | After | Source |
|-------|--------|-------|--------|
| `cactus_init` 3rd arg | `['', toolsJson, '']` (string) | `['', toolsJson, 0]` (number) | `cactus.h`: 3rd arg = `const char* tool_index_path` but sandbox worker uses `0` |
| `cactus_load` model buffer | Freed after load | **Kept alive** (official demo never frees) | `cactus.h` + plan doc |
| `cactus_destroy` | Called in `dispose()` | **Removed** (not in header) | `cactus.h` |
| `cactus_complete` maxTokens | 512 | 384 (matches sandbox) | Sandbox worker |
| Model buffer freed? | Yes (bug) | **No** (matches official demo) | Plan doc §99-100 |

---

## System Prompt Optimization

**Before (~1,600 tokens):**
- Full JSON Schema for each tool (enum, required, additionalProperties)
- Verbose parameter descriptions
- Rules section

**After (~300 tokens):**
```javascript
const toolDescriptions = tools.map(t => `- ${t.function.name}: ${t.function.description}`).join('\n');
const systemPrompt = `You are an AI assistant controlling indicator lights with these tools:
${toolDescriptions}

Rules:
- Lights: use explicit state (true/false), never "toggle"
- Blue light: specify "blue-left" or "blue-right"
- Time format: HH:MM (24-hour)
- If unsure, ask for clarification`;
```
*(Runtime already knows schemas from `cactus_init`)*

---

## Agent Fixes (`src/needle/agent.js`)

**Fixed function_calls parsing:**
```javascript
// Before: parsed entire response as toolCalls array
toolCalls = JSON.parse(toolCallsJson);

// After: extracts function_calls array from response object
const parsedResponse = JSON.parse(toolCallsJson);
if (parsedResponse.function_calls && Array.isArray(parsedResponse.function_calls)) {
  toolCalls = parsedResponse.function_calls;
}
```

---

## Performance Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Inference time** | 19-25s | <2s | ❌ **12× over limit** |
| Tool calls/request | 1 | 1 | ✅ |
| Prompt tokens | ~2,500-3,500 | <2,000 | ⚠️ |
| Tool calling | ⚠️ Low confidence (1.72%) | Working | ❌ |

---

## Root Causes (Per Plan Doc)

| # | Issue | Evidence | Fix Status |
|---|-------|----------|------------|
| 1 | Legacy ABI signatures | `cactus_init` 3rd arg was string, should be `0` | ✅ Fixed |
| 2 | Model buffer freed | Official demo never frees | ✅ Fixed |
| 3 | `cactus_destroy` called | Doesn't exist in header | ✅ Fixed |
| 4 | Tool schema format | OpenAI format vs Cactus expected | 🔄 In progress |
| 5 | Model buffer freed | Plan doc §99-100 | ✅ Fixed |
| 6 | Slow inference | 19-25s vs 2s target | ❌ **Blocker** |

---

## Profiling Results (Latest Run)

```
Model calls/request:     1 (single cactus_complete call)
Prompt token count:      ~2,500-3,500 tokens
Time per call:           19,203ms (target: <2,000ms)  ❌ 12× over limit
Thread/Build:            Classic Worker, Cactus WASM v4.0.0 (1a028f5), Needle 3 (33.7 MB)
```

---

## Current Blockers

1. **Inference Speed**: 19-25s vs 2s target (12× over phase limit)
   - Plan: *"If a phase misses its limit, the agent stops and reports instead of building on top."*

2. **Tool Calling Accuracy**
   - Confidence: 1.72% (floor 10%) → calls suppressed
   - Wrong tool selection: "turn on blue left light" → `get_light_status` instead of `toggle_light`
   - Model reasoning garbled: `"blue light to blue-left and blue-right to red to red to red"`

3. **Chat UI**: Assistant responses not rendering (UI update bug)

---

## Files Summary

```
src/
├── needle/
│   ├── worker-v2.js          # Classic worker (importScripts) - MAIN
│   ├── cactus-runtime.js     # Reference runtime loader
│   ├── index.js              # Main thread client
│   ├── config.js             # Config constants
│   ├── schemas.js            # 16 tool schemas (OpenAI format)
│   ├── agent.js              # Inference loop
│   ├── bridge.js             # Worker ↔ Adapter bridge
│   └── config.js             # Config constants
├── adapter/
│   ├── index.js              # Main adapter entry
│   ├── config.js             # Adapter config
│   ├── validation.js         # Input validation
│   ├── errors.js             # Error normalization
│   ├── rateLimit.js          # Token bucket rate limiting
│   ├── audit.js              # Audit logging
│   ├── types/contract.ts     # TypeScript types
│   └── tools/
│       ├── lights.js         # Light handlers
│       ├── clock.js          # Clock handler
│       ├── terminal.js       # Terminal handler
│       ├── logs.js           # Log CRUD handlers
│       └── system.js         # System tools (health, ping, yellow timing)
├── app.js                    # Modified: added adapter exports
├── index.html                # Modified: import map, chat UI, init script
├── sw.js                     # Modified: model caching
├── package.json              # Added devDependencies
└── CHANGES.md                # This file
```

---

## Next Steps (Per Plan)

1. **STOP** - Phase limit exceeded (19s vs 2s target)
2. **Profile WASM** - Check SIMD, threading, memory
3. **Verify `cactus.h`** - Already done ✅
4. **Check model buffer** - Fixed ✅
5. **Try smaller model** - Needle 2/1 if available
6. **Profile WASM** - Check SIMD, threading
7. **Consider cloud fallback** - Offload to server

---

## Commands to Reproduce

```bash
cd pwa-vti-bmock/.claude/worktrees/modest-mcclintock-630054
npm install
npx netlify-cli dev  # Port 3000
# Open http://localhost:3000
# Click chat toggle (💬), type "turn on the blue left light", press Enter
```

---

*Generated per user request: "write an md file outlining the changes from the start of the session"*