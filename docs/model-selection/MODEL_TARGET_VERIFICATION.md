# Model Target Verification - Cactus Compute Needle 3

**Selection Mode**: user_directed  
**User Selected Target**: Cactus Compute Needle 3 (WASM, browser embedding)  
**Alternatives Requested**: false  
**Selection Status**: compatible_with_constraints  
**Verification Date**: 2026-11-14  
**Researcher**: Claude (via WebFetch/WebSearch)

---

## Target Identity

| Field | Value |
|-------|-------|
| **Model Name** | Needle 3 (v3) |
| **Publisher** | Cactus Compute |
| **Model Repository** | `Cactus-Compute/needle3` on Hugging Face |
| **Runtime Repository** | `Geekgineer/needle-rs` (Rust → WASM) |
| **NPM Package** | `needle-rs` |
| **Primary Documentation** | https://cactuscompute.com/needle |
| **Browser Demo** | https://needle-rs.pages.dev |
| **Source Code** | https://github.com/Geekgineer/needle-rs |

---

## Exact Version & Release Information

| Component | Version/Revision | Source |
|-----------|-----------------|--------|
| **Needle 3 Model** | `needle3.cact` (35.3 MB) | Hugging Face: `Cactus-Compute/needle3/resolve/main/needle3.cact` |
| **Needle 3 Checkpoints** | `needle3.safetensors` | Hugging Face: `Cactus-Compute/needle3/resolve/main/checkpoints/needle3.safetensors` |
| **WASM Runtime (needle-rs)** | Latest main branch | GitHub: `Geekgineer/needle-rs` (crates/needle-wasm) |
| **NPM Package** | Published from `needle-rs` crate | npm: `needle-rs` |
| **Python Package** | `cactus-compute` | PyPI |

**Note**: The Cactus Compute website and GitHub repos do not display a specific semantic version number for Needle 3 (e.g., "v3.1.0"). The model is referred to as "Needle 3" or "v3" generation. The exact artifact is the `needle3.cact` file on Hugging Face.

---

## Documentation Sources Verified

### Primary Sources (Accessed 2026-11-14)

| Source | URL | Content Verified |
|--------|-----|------------------|
| Cactus Compute Needle 3 Page | https://cactuscompute.com/needle | Model sizes, architecture, WASM targets, tool-calling claims, API, browser embedding |
| needle-rs GitHub | https://github.com/Geekgineer/needle-rs | WASM runtime size, JS API, model loading patterns, tool-calling interface |
| needle-rs WASM Crate | https://github.com/Geekgineer/needle-rs/tree/main/crates/needle-wasm | Detailed JS API (`NeedleV3Wasm`), browser demo reference |
| Browser Demo Source | https://github.com/Geekgineer/needle-rs/tree/main/examples/browser-demo | Model picker, WASM loader, query panel, inference controls |
| Cactus Compute Main Repo | https://github.com/cactus-compute/cactus | **License: Apache 2.0**, commercial use terms, telemetry |
| Hugging Face Model Card | https://huggingface.co/Cactus-Compute/needle3 | License: apache-2.0, purpose, tags, download count |

### Secondary Sources (Supplementary)

| Source | URL | Content Verified |
|--------|-----|------------------|
| Live Browser Demo | https://needle-rs.pages.dev | UI flow, model loading, tool definitions, inference controls (source not directly viewable) |

---

## Resolved Documentation Conflicts

| Conflict | Resolution | Evidence |
|----------|------------|----------|
| **Package name**: `cactus-compute` (Python) vs `needle-rs` (WASM/JS) | **Resolved**: Two separate packages for different runtimes. `cactus-compute` is Python SDK with decorator-based API. `needle-rs` is the WASM runtime published to npm for browser/Node.js/WASI use. | Cactus Compute page shows `pip install cactus-compute`; needle-rs GitHub shows `npm install needle-rs` |
| **Import path**: `cactus` vs `needle-rs` | **Resolved**: `cactus` appears in Python SDK (`import cactus`). `needle-rs` is the npm package for WASM (`import { NeedleV3Wasm } from "needle-rs"`). Different ecosystems. | needle-rs crate README explicitly uses `needle-rs` |
| **Model loading**: `load(weights, vocab)` (v1) vs `load(cactBytes)` (v2/v3) | **Resolved**: Different model generations use different container formats. v1 uses separate `safetensors` + `vocab.txt`. v2/v3 use single `.cact` container with embedded tokenizer/geometry. | needle-rs crate examples show distinct patterns for v1, v2, v3 |
| **Model size claims**: "8-29 MB" (website) vs "35.3 MB" (Hugging Face `needle3.cact`) | **Resolved**: "8-29 MB CQ2-bit" refers to individual sub-network binaries (2-layer up to full). The full `needle3.cact` container (35.3 MB) includes all sub-networks + tokenizer + geometry for the full 20-layer model. | Website: "Sub-networks: 9 to 29 MB CQ2-bit binaries from 2-layer up to full 20-layer"; HF: `needle3.cact` 35.3 MB |
| **Tool-calling API**: Python decorator vs JS `run(query, toolsJson)` | **Resolved**: Different interfaces for different runtimes. Python uses `@cactus.tool` decorators and `agent.complete()`. WASM/JS uses direct schema passing to `engine.run(query, toolsJson)`. | Both documented in respective primary sources |

---

## Unresolved / Unverified Items

| Item | Status | Action Needed |
|------|--------|---------------|
| Exact semantic version of `needle3.cact` artifact | **Unverified** | Check Hugging Face repo tags or `needle3.cact` metadata for version/revision hash |
| WASM runtime npm package version | **Unverified** | Check `npm view needle-rs version` or package.json in crate |
| Context window size (max tokens) | **Not published** | Need to test or check source code (`engine.max_seq_len()`) |
| Maximum concurrent tool calls | **Not published** | Not specified in docs; Needle 3 claims "ask for two things and you get two calls in order" |
| Streaming/chunked output support | **Partial** | `run_stream` mentioned in browser demo README but not detailed in crate docs |
| Browser memory requirements for 35 MB model + WASM | **Estimated** | ~35 MB model + ~600 KB WASM + KV cache (8.8 MB at 512 seq len, 2.3 MB int8) = ~45-55 MB total |
| Mobile browser compatibility (iOS Safari, Chrome Android) | **Unverified** | Demo exists but no explicit compatibility matrix |
| WASI / Node.js / Cloudflare Workers support parity | **Claimed** | README says "runs in browsers, Cloudflare Workers, Node.js" but no version matrix |
| Fine-tuning path for Needle 3 | **Not documented** | Python SDK mentions training but no public fine-tuning guide for Needle 3 specifically |
| Model quantization options beyond CQ2-bit | **Unverified** | Only CQ2-bit mentioned; `int8` KV cache is runtime optimization, not weight quantization |

---

## Verification Summary

**Target**: Cactus Compute Needle 3 via `needle-rs` WASM runtime in browser  
**Identity Confirmed**: Yes - model artifact (`needle3.cact`), runtime (`needle-rs`), and API are clearly documented across primary sources  
**Version Specificity**: Generation-level (v3), not semantic version - artifact is `needle3.cact` from Hugging Face  
**License Confirmed**: Apache 2.0 for both runtime and model  
**Deployment Target Confirmed**: Browser via WASM with documented patterns  
**Tool-Calling Confirmed**: Native support with JSON schema, constrained decoding, confidence scoring, reasoning traces  

**Selection Status**: `compatible_with_constraints` - see compatibility report for details.