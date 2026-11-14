# Model Compatibility Report - Cactus Compute Needle 3

**Contract Version**: 1.0.0 (12 tools)  
**Model**: Needle 3 via `needle-rs` WASM  
**Assessment Date**: 2026-11-14  
**Overall Status**: compatible_with_constraints

---

## Application Requirements Summary

Our tool contract defines 12 tools for the Indicator Lights PWA:

| Category | Tools | Arg Complexity |
|----------|-------|----------------|
| **Read (4)** | `get_light_status`, `get_clock_time`, `read_logs`, `get_terminal_history` | Simple (no args or basic filters) |
| **Write - Simple (3)** | `toggle_light`, `create_log_entry`, `update_log_entry` | Moderate (discriminated unions, enums) |
| **Write - Destructive (3)** | `delete_log_entry`, `clear_logs`, `import_logs` | Moderate + confirmation flags |
| **Write - Config (2)** | `set_yellow_timing`, `export_logs` | Moderate |

**Key Schema Features Required**:
- Discriminated unions (log data varies by column: blue/yellow/red)
- Enum validation (light names, columns, transitions, formats)
- Required confirmation flags (`confirm: true` for destructive ops)
- Optional dry-run preview (`dryRun: true`)
- Optional pagination (limit/offset)
- Optional filtering (filterType)

---

## Compatibility Assessment

### ✅ Requirement: Tool-Calling Protocol Support

| Aspect | Needle 3 Support | Assessment |
|--------|------------------|------------|
| **Native tool calling** | Yes - `engine.run(query, toolsJson)` / `engine.run_json()` | ✅ Compatible |
| **Schema format** | OpenAI-compatible: `{name, description, parameters: {type, properties, required}}` | ✅ Compatible (direct mapping) |
| **Constrained decoding** | Yes - schema-constrained JSON output | ✅ Compatible |
| **Multiple tool calls** | Claims: "ask for two things and you get two calls in order" | ⚠️ **Needs verification** (max concurrent not documented) |
| **No-tool-call (abstention)** | Claims: "ask for something no tool covers and you get an empty list, not a guess" | ✅ Compatible |
| **Confidence scoring** | `confidence_for(query, tools, completion)` returns 0-1 | ✅ Bonus feature |
| **Reasoning traces** | `reasoning(output)` extracts `xyz`...`zyx` blocks (v3 only) | ✅ Bonus feature |

**Evidence**: Cactus Compute page, needle-rs crate API documentation

---

### ✅ Requirement: Argument Type Expressivity

| Type | Needle 3 Support | Mapping |
|------|------------------|---------|
| **String enums** | Yes - `parameters.properties.enum` | Direct |
| **Boolean** | Yes - `type: "boolean"` | Direct |
| **Number (with bounds)** | Yes - `type: "number", minimum, maximum` | Direct |
| **Object with required fields** | Yes - `required: [...]` | Direct |
| **Discriminated unions** | **Not natively supported** | ⚠️ **Constraint** |
| **Optional fields** | Yes - omit from `required` | Direct |
| **Arrays** | Yes - `type: "array", items: {...}` | Direct |

**Critical Gap - Discriminated Unions**:
Our contract uses discriminated unions for log data:
```typescript
// Blue: { left: boolean, right: boolean }
// Yellow: { on: boolean }
// Red: { transition: "on-to-off" | "off-to-on" }
```

OpenAI schema format (which Needle 3 uses) does not support `oneOf`/`anyOf` discriminated unions natively. Workarounds needed:

**Option A**: Flatten to single schema with all optional fields + description
```json
{
  "type": "object",
  "properties": {
    "left": {"type": "boolean", "description": "Blue left (only for blue column)"},
    "right": {"type": "boolean", "description": "Blue right (only for blue column)"},
    "on": {"type": "boolean", "description": "Yellow on/off (only for yellow column)"},
    "transition": {"type": "string", "enum": ["on-to-off", "off-to-on"], "description": "Red transition (only for red column)"}
  }
}
```

**Option B**: Separate tool per column (e.g., `create_blue_log`, `create_yellow_log`, `create_red_log`) - more tools but cleaner schemas

**Option C**: Use `retrieve_tools` (v1/v2) to pre-select relevant tool, then call specific tool

**Recommendation**: Option B (separate tools per column) aligns best with Needle 3's tool-calling design and provides clearest schema validation.

---

### ✅ Requirement: Context Window & Complexity

| Metric | Needle 3 | Our Need | Assessment |
|--------|----------|----------|------------|
| **Max sequence length** | Not published (check `engine.max_seq_len()`) | ~2000 tokens for 12 tool schemas + query | ⚠️ **Unknown - needs testing** |
| **Model size (v3 full)** | 35.3 MB (121M params, 20 layers) | Fits in browser memory | ✅ Compatible |
| **KV cache (512 tokens)** | 8.8 MB (FP16) / 2.3 MB (int8) | Acceptable for browser | ✅ Compatible |
| **Tool schema count** | Not limited explicitly | 12 tools + potential split = ~15-20 | ⚠️ **Likely OK but unverified** |

**Risk**: If context window is small (< 2048), 12 complex tool schemas + conversation history may exceed it. Need to test with actual schema size.

---

### ✅ Requirement: Browser Deployment

| Requirement | Needle 3 Support | Assessment |
|-------------|------------------|------------|
| **WASM runtime** | ~600 KB (200 KB brotli) | ✅ Excellent |
| **Model loading** | Fetch 35.3 MB `needle3.cact` from HF | ⚠️ **Large download** - needs caching strategy |
| **Init time** | WASM init + model load (async) | ⚠️ **Several seconds on first load** |
| **Memory usage** | ~45-55 MB total (model + WASM + KV cache) | ✅ Acceptable for desktop, ⚠️ mobile may struggle |
| **Mobile Safari/Chrome** | Demo exists, no explicit matrix | ⚠️ **Needs testing** |
| **Offline support** | Model can be cached via Service Worker | ✅ Compatible with our SW |
| **Streaming inference** | `run_stream` mentioned | ⚠️ **Partial - needs verification** |

**Model Size Concern**: 35.3 MB is large for browser embedding. Consider:
- Needle 2 (13.7 MB, 45M params) - smaller, has retrieval head but no reasoning/confidence
- Needle 1 (22 MB) - encoder-decoder, retrieval only
- Sub-network extraction (website claims 8-29 MB CQ2-bit sub-networks)

---

### ✅ Requirement: Licensing & Privacy

| Aspect | Needle 3 | Assessment |
|--------|----------|------------|
| **Runtime license** | Apache 2.0 | ✅ Permissive, commercial OK |
| **Model license** | Apache 2.0 (HF card) | ✅ Permissive, commercial OK |
| **Telemetry** | Opt-out via `CACTUS_TELEMETRY=0` | ✅ Controllable |
| **Data residency** | Fully local (browser WASM) | ✅ No external calls after model load |
| **Model downloads** | From Hugging Face on first load | ⚠️ **External dependency** - can be pre-cached |

---

### ⚠️ Constraints & Caveats

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| **No discriminated union support** | Cannot directly express per-column log schemas | Split into column-specific tools (recommended) |
| **Large model (35 MB)** | Slow first load, high memory | Pre-cache via SW; consider Needle 2 for lighter use |
| **Context window unknown** | May limit tool count + history | Test `engine.max_seq_len()`; limit active tools |
| **Max concurrent tool calls unknown** | May not handle multi-step operations | Design for single-tool-per-turn; chain via adapter |
| **No streaming JSON output documented** | Can't parse partial tool calls | Use `run_json` for complete calls only |
| **No fine-tuning path documented** | Can't specialize for our domain | Use few-shot in prompt / tool descriptions |
| **WASM init async** | Must await before first call | Handle in adapter initialization |

---

## Requirement-by-Requirement Verdict

| # | Contract Requirement | Verdict | Notes |
|---|---------------------|---------|-------|
| 1 | Represent all 12 tool calls | ⚠️ **With schema redesign** | Split discriminated unions into per-column tools |
| 2 | Express all argument types | ⚠️ **With schema redesign** | Enums, objects, optional fields all supported |
| 3 | Handle multi-tool sequences | ⚠️ **Unverified** | Claims ordered calls; max concurrency unknown |
| 4 | Return no tool call appropriately | ✅ Compatible | Empty list for no-match |
| 5 | Ask for clarification | ⚠️ **Via confidence threshold** | Can use confidence < 0.5 to trigger clarification |
| 6 | Respect constraints/descriptions | ✅ Compatible | Schema descriptions passed to model |
| 7 | Operate in browser WASM | ✅ Compatible | Primary target platform |
| 8 | Parse with target runtime/parser | ✅ Compatible | `run_json` returns parsed JSON |

---

## Compatibility Scorecard

| Dimension | Score | Evidence |
|-----------|-------|----------|
| Tool-calling correctness | 8/10 | Native support, constrained decoding, confidence |
| Argument expressivity | 7/10 | Missing discriminated unions; workaround needed |
| Context handling | ?/10 | Unknown max seq len; needs testing |
| Latency (browser) | 7/10 | 35 MB model load; inference speed unknown |
| Memory footprint | 8/10 | ~45-55 MB acceptable for desktop |
| Privacy | 10/10 | Fully local, Apache 2.0, no telemetry by default |
| License | 10/10 | Apache 2.0 for both runtime and model |
| Deployment compatibility | 9/10 | WASM + browser demo proven; mobile unverified |

**Overall**: **Compatible with constraints** - Requires schema redesign for discriminated unions and validation of context window limits.

---

## Recommended Schema Redesign for Needle 3

### Current Contract (12 tools) → Needle 3 Compatible (16 tools)

**Split discriminated unions into column-specific tools:**

| Current Tool | Needle 3 Tools |
|--------------|----------------|
| `create_log_entry` | `create_blue_log_entry`, `create_yellow_log_entry`, `create_red_log_entry` |
| `update_log_entry` | `update_blue_log_entry`, `update_yellow_log_entry`, `update_red_log_entry` |
| `delete_log_entry` | (keep single - ID-based, no schema issue) |
| `read_logs` | (keep single - column filter is simple enum) |
| Others | (unchanged) |

**Benefits**:
- Each tool has simple, flat schema (no unions)
- Clearer validation per column
- Better model understanding (explicit tool per intent)
- Needle 3's `retrieve_tools` can help select relevant tool if many

**Trade-off**: More tools (16 vs 12) but each is simpler and more reliable.

---

## Next Steps

1. **Test context window** - Run `engine.max_seq_len()` in browser console
2. **Benchmark inference latency** - Measure `run_json` time for typical queries
3. **Validate multi-tool calls** - Test "turn on blue left and log it" type prompts
4. **Test mobile** - Verify memory and performance on iOS/Android
5. **Implement schema adapter** - Map contract tools to Needle 3 schemas
6. **Add caching strategy** - Pre-cache `needle3.cact` via Service Worker

---

## Unresolved Questions for Implementation

1. What is the actual max sequence length? (Run `engine.max_seq_len()`)
2. How many concurrent tool calls work reliably? (Test 2-3 simultaneous)
3. Does `run_stream` emit partial JSON or only complete calls?
4. What is the inference latency on target devices (desktop/mobile)?
5. Can the model be loaded from local cache (IndexedDB) to avoid HF fetch?
6. Does Needle 2's retrieval head provide any advantage for tool selection?