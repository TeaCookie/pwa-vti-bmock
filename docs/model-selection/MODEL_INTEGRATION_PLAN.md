# Model Integration Plan - Needle 3 WASM for Indicator Lights PWA

**Contract Version**: 1.0.0  
**Model**: Cactus Compute Needle 3 via `needle-rs` WASM  
**Target**: Browser embedding in pwa-vti-bmock PWA  
**Date**: 2026-11-14

---

## Overview

This plan details the integration of Needle 3 (via `needle-rs` WASM runtime) as the local LLM for tool-calling in the Indicator Lights PWA. The model will run entirely in the browser via WebAssembly, communicating with the tool adapter layer defined in `docs/tool-interface-design/`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (PWA)                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   UI / App   │───►│  Tool Adapter │◄──►│  Needle 3 WASM   │  │
│  │  (app.js)    │    │  (adapter.js) │    │  (needle-rs)     │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  index.html  │    │  Tool Schemas │    │  needle3.cact    │  │
│  │  styles.css  │    │  (JSON)       │    │  (35.3 MB)       │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                                              │                  │
│                                              ▼                  │
│                                     ┌──────────────────┐       │
│                                     │  Service Worker  │       │
│                                     │  (cache model)   │       │
│                                     └──────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integration Components

### 1. Needle 3 WASM Runtime (`needle-rs`)

**Package**: `npm install needle-rs`  
**Exports**: `NeedleV3Wasm`, `NeedleV2Wasm`, `NeedleWasm`, `init`

**Loading Pattern**:
```javascript
import init, { NeedleV3Wasm } from "needle-rs";

await init();  // Initialize WASM runtime

const response = await fetch("needle3.cact");  // From cache or HF
const modelBytes = new Uint8Array(await response.arrayBuffer());
const engine = NeedleV3Wasm.load(modelBytes);
```

### 2. Model Loading & Caching Strategy

**Primary**: Service Worker caches `needle3.cact` (35.3 MB) on first visit  
**Fallback**: Fetch from Hugging Face CDN if not cached  
**Storage**: IndexedDB or Cache API for persistent model storage

```javascript
// In SW install handler
const MODEL_URL = "https://huggingface.co/Cactus-Compute/needle3/resolve/main/needle3.cact";
await cache.add(MODEL_URL);  // Pre-cache on install

// In app initialization
async function loadModel() {
  const cached = await caches.match(MODEL_URL);
  if (cached) {
    return cached.arrayBuffer();
  }
  // Fallback to network
  const resp = await fetch(MODEL_URL);
  await caches.open('models').then(c => c.put(MODEL_URL, resp.clone()));
  return resp.arrayBuffer();
}
```

### 3. Tool Schema Adapter

**Purpose**: Map our 16-tool Needle 3 compatible schema (see compatibility report) to Needle 3's OpenAI-compatible format.

```javascript
// Schema format Needle 3 expects
const needleToolSchema = {
  name: "tool_name",
  description: "What this tool does",
  parameters: {
    type: "object",
    properties: { ... },
    required: [...]
  }
};
```

**Schema Mapping** (16 tools for Needle 3):

| Needle 3 Tool | Contract Origin | Schema Complexity |
|---------------|-----------------|-------------------|
| `get_light_status` | `get_light_status` | No args |
| `get_clock_time` | `get_clock_time` | No args |
| `read_logs` | `read_logs` | column enum, limit, offset |
| `get_terminal_history` | `get_terminal_history` | limit, offset, filterType |
| `toggle_light` | `toggle_light` | light enum, state boolean |
| `create_blue_log_entry` | `create_log_entry` (blue) | time?, left, right |
| `create_yellow_log_entry` | `create_log_entry` (yellow) | time?, on |
| `create_red_log_entry` | `create_log_entry` (red) | time?, transition enum |
| `update_blue_log_entry` | `update_log_entry` (blue) | id, data?, time? |
| `update_yellow_log_entry` | `update_log_entry` (yellow) | id, data?, time? |
| `update_red_log_entry` | `update_log_entry` (red) | id, data?, time? |
| `delete_log_entry` | `delete_log_entry` | id, confirm? |
| `clear_logs` | `clear_logs` | column enum, confirm: true, dryRun? |
| `set_yellow_timing` | `set_yellow_timing` | minMs, maxMs, confirm? |
| `export_logs` | `export_logs` | format enum, includeMetadata? |
| `import_logs` | `import_logs` | data object, mode enum, confirm: true, dryRun? |

### 4. Inference Loop

```javascript
class NeedleAgent {
  constructor(engine, tools, adapter) {
    this.engine = engine;
    this.tools = tools;  // Array of needleToolSchema
    this.adapter = adapter;  // Our tool adapter
    this.conversationHistory = [];
  }

  async processUserQuery(userInput) {
    // Build prompt with conversation history
    const prompt = this.buildPrompt(userInput);
    
    // Call Needle 3 with constrained decoding
    const result = this.engine.run_json(prompt, JSON.stringify(this.tools));
    
    // Parse tool calls
    const toolCalls = JSON.parse(result);
    
    // Execute each tool via adapter
    const results = [];
    for (const call of toolCalls) {
      const toolResult = await this.adapter.execute(call.name, call.arguments);
      results.push({ call, result: toolResult });
    }
    
    // If no tool calls, return model's direct response
    if (toolCalls.length === 0) {
      const fullOutput = this.engine.run(prompt, JSON.stringify(this.tools));
      return this.extractResponse(fullOutput);
    }
    
    // Build follow-up prompt with results
    const followUp = this.buildFollowUpPrompt(results);
    const finalResult = this.engine.run_json(followUp, JSON.stringify(this.tools));
    
    return this.extractResponse(finalResult);
  }
  
  // Confidence-based clarification
  async maybeClarify(query, toolCalls, completion) {
    const confidence = this.engine.confidence_for(query, this.tools, completion);
    if (confidence < 0.5) {
      return "I'm not confident about that. Could you clarify?";
    }
    return null;
  }
}
```

### 5. Tool Adapter Integration

The adapter from `docs/tool-interface-design/ADAPTER_DESIGN.md` needs a Needle 3 wrapper:

```javascript
// adapter/needleBridge.js
import { ToolAdapter } from './index.js';

export class NeedleBridge {
  constructor() {
    this.adapter = new ToolAdapter();
  }

  async executeToolCall(call) {
    const context = { source: "model", timestamp: Date.now() };
    return this.adapter.execute(call.name, call.arguments, context);
  }

  getToolSchemas() {
    // Return Needle 3 formatted schemas for all 16 tools
    return NEEDLE_3_TOOL_SCHEMAS;
  }
}
```

---

## File Structure Changes

### New Files
```
/src/
  needle/
    index.js              # Needle 3 initialization & engine management
    modelLoader.js        # Model loading with SW cache fallback
    schemas.js            # 16 Needle 3 tool schemas (OpenAI format)
    agent.js              # Inference loop, conversation management
    bridge.js             # Adapter bridge (Needle 3 ↔ Tool Adapter)
  adapter/
    index.js              # Tool adapter (from tool-interface-design)
    needleBridge.js       # Needle-specific adapter wrapper
```

### Modified Files
| File | Changes |
|------|---------|
| `index.html` | Add Needle 3 initialization script, model loading UI |
| `app.js` | Integrate NeedleBridge for model-initiated tool calls |
| `sw.js` | Add `needle3.cact` to cache-on-install list |
| `manifest.json` | No changes needed |
| `package.json` | Add `needle-rs` dependency (dev) |

### Build Process
Since the main app has no build step, Needle 3 integration options:

**Option A: ES Modules (Recommended)**
- Use `needle-rs` as ES module via importmap or direct import
- Vite/esbuild only for bundling Needle 3 code (optional)
- Keep main app vanilla

**Option B: CDN/Import Map**
```html
<script type="importmap">
{
  "imports": {
    "needle-rs": "https://cdn.jsdelivr.net/npm/needle-rs@latest/+esm"
  }
}
</script>
```

**Option C: Local Copy**
- Download `needle-rs` npm package, copy `pkg/` to `/needle-wasm/`
- Import from local path

---

## Implementation Phases

### Phase 1: Core Integration (Week 1)
- [ ] Add `needle-rs` dependency
- [ ] Implement `modelLoader.js` with SW caching
- [ ] Implement `schemas.js` with 16 Needle 3 tool schemas
- [ ] Implement `index.js` - engine initialization
- [ ] Test model load + basic `run_json` call

### Phase 2: Agent Loop (Week 2)
- [ ] Implement `agent.js` - conversation management, prompt building
- [ ] Implement `bridge.js` - adapter integration
- [ ] Connect to existing `ToolAdapter` from tool-interface-design
- [ ] Test full loop: user query → tool call → adapter → result → model response

### Phase 3: UI Integration (Week 3)
- [ ] Add model status indicator (loading, ready, error)
- [ ] Add conversation UI (optional - can reuse terminal)
- [ ] Handle model errors gracefully (fallback to manual UI)
- [ ] Add confidence-based clarification UI

### Phase 4: Optimization & Testing (Week 4)
- [ ] Benchmark inference latency
- [ ] Test mobile performance
- [ ] Optimize model caching (IndexedDB vs Cache API)
- [ ] Test offline mode (model in cache)
- [ ] Load test with concurrent users (if applicable)

---

## Configuration

```javascript
// needle/config.js
export const NEEDLE_CONFIG = {
  // Model
  modelUrl: "https://huggingface.co/Cactus-Compute/needle3/resolve/main/needle3.cact",
  modelCacheKey: "needle3-model",
  
  // Inference
  maxTokens: 512,
  temperature: 0.0,  // Greedy for tool calling
  seed: 0,
  constrained: true,
  
  // v3 specific
  depth: 20,  // Full 20 layers
  int8KvCache: true,  // 2.3 MB vs 8.8 MB
  
  // Behavior
  confidenceThreshold: 0.5,  // Below this → clarification
  maxToolCallsPerTurn: 3,
  
  // Timeouts
  modelLoadTimeout: 60000,
  inferenceTimeout: 30000,
};
```

---

## Error Handling

| Error Scenario | Handling |
|----------------|----------|
| Model load fails (network) | Show error, allow retry, fallback to manual UI |
| Model load fails (quota) | Clear cache, retry, show storage warning |
| WASM init fails | Show browser compatibility message |
| Inference timeout | Cancel, return partial/error, allow retry |
| Tool call fails (adapter) | Return error to model, let model decide next step |
| Confidence low | Trigger clarification prompt |
| No tool match | Model returns direct response (no tool call) |

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Model load (cached) | < 2 seconds | `performance.now()` |
| Model load (first visit) | < 10 seconds | Includes 35 MB download |
| Inference latency (tool call) | < 2 seconds | `engine.run_json()` |
| Memory usage | < 100 MB | DevTools memory profiler |
| First meaningful paint | < 3 seconds | Lighthouse |

---

## Testing Checklist

### Functional
- [ ] Model loads from cache on repeat visits
- [ ] All 16 tools callable via Needle 3
- [ ] Tool arguments validated by adapter
- [ ] Confirmation flags enforced
- [ ] Dry-run preview works
- [ ] Confidence threshold triggers clarification
- [ ] Multi-tool sequences work (ordered calls)
- [ ] No-tool-call abstention works

### Performance
- [ ] Model load time (cached/uncached)
- [ ] Inference latency (p50, p95)
- [ ] Memory usage over session
- [ ] Mobile Safari / Chrome Android

### Resilience
- [ ] Offline mode (cached model)
- [ ] Network failure during load
- [ ] Storage quota exceeded
- [ ] WASM compilation failure
- [ ] Concurrent user queries

---

## Rollback Plan

If Needle 3 integration fails or performs poorly:

1. **Feature flag** - `ENABLE_NEEDLE_3` in localStorage/config
2. **Fallback** - Manual UI (existing terminal, modal, click handlers) remains fully functional
3. **Alternative models** - Needle 2 (13.7 MB) or Needle 1 (22 MB) as lighter alternatives
4. **Cloud fallback** - Optional API endpoint for tool-calling (not implemented)

---

## Dependencies

### Runtime (Production)
- `needle-rs` (WASM + JS glue) - ~600 KB
- `needle3.cact` (model) - 35.3 MB (cached)

### Development
```json
{
  "devDependencies": {
    "needle-rs": "^latest",
    // Tool adapter deps from previous phase
    "zod": "^3.22.0",
    "vitest": "^1.0.0"
  }
}
```

---

## Security Considerations

- **Model integrity**: Verify `needle3.cact` hash against known good value
- **CSP**: Allow `wasm-eval` for WASM instantiation
- **No external calls**: All inference local after model load
- **Input sanitization**: Adapter validates all tool args before execution
- **Rate limiting**: Per-tool limits in adapter prevent abuse

---

## Open Questions

1. **Exact max_seq_len** - Need to test `engine.max_seq_len()` to confirm context capacity
2. **Mobile memory** - 35 MB model + WASM + KV cache may exceed mobile limits; test needed
3. **Streaming support** - `run_stream` capability unclear; may need to implement token-by-token UI
4. **Model updates** - How to handle `needle3.cact` version updates (cache invalidation)
5. **Concurrent inference** - Single engine instance or pool? (JS is single-threaded)
6. **Web Worker** - Move inference off main thread? (WASM supports but needs testing)

---

## Approval Checkpoints

| Checkpoint | Criteria | Approver |
|------------|----------|----------|
| Phase 1 Complete | Model loads, basic inference works | Tech Lead |
| Phase 2 Complete | Full tool loop works, adapter integrated | Tech Lead |
| Phase 3 Complete | UI integrated, error handling complete | Product |
| Phase 4 Complete | Performance targets met, mobile tested | Tech Lead |
| Production Ready | All checkpoints passed, rollback tested | Stakeholder |

---

## Next Steps

1. **Immediate**: Run `npm install needle-rs` and test model loading in browser console
2. **This Week**: Implement Phase 1 (model loading + schemas)
3. **Decision Point**: After Phase 1, measure actual inference latency and memory
4. **Go/No-Go**: If latency > 5s or memory > 150 MB on mobile, evaluate Needle 2