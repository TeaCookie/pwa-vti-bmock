# Needle 3 base integration (stage 1: model only)

Goal of this folder: the **untouched base Needle 3** returns correct tool calls from a Web Worker.
It is not wired into the app (`app.js`, `index.html`) on purpose. Wire it in only after the
numbers below look right on a real device.

## Run it

```bash
python3 -m http.server 8000        # or: npx serve .
# open http://localhost:8000/needle/test.html  (localhost counts as a secure context)
```

1. **Load model** downloads the pinned runtime and `needle3.cact` (35.3 MB), verifies SHA-256, caches them.
   Second load should show no network requests for them.
2. **Run once** sends one request and shows the validated calls, the raw engine JSON, `latencyMs`,
   `prefill_tps` and `decode_tps`.
3. **Run all cases** scores `cases.json` (37 cases, 8 groups) and prints a table per group, failures,
   and median/worst latency.

Record for every run: device, browser, group scores, median and worst `latencyMs`, `prefill_tps`, `decode_tps`.

## Files

| File | Role |
| --- | --- |
| `tools.json` | The only tool definitions: 3 tools, flat `{name, description, parameters}`, no `triggers` |
| `assets.manifest.json` | Pinned Cactus 4.0.0 runtime and `needle3.cact` with URL, SHA-256, size |
| `needle.worker.js` | Classic worker: runtime, model, `cactus_init`, `cactus_complete`, validation |
| `needle-client.js` | `init()` / `complete(text, opts)` promise API, request ids, timeouts |
| `validate.js` | Pure output parsing and scoring, shared by worker, page and tests |
| `test.html`, `cases.json` | Bare test page and scored cases |
| `test/*.test.mjs` | Node tests: `node --test "needle/test/*.test.mjs"` |

## Rules the worker follows (and why)

- `cactus_complete` gets the **raw user text only**: no system prompt, no history, no "User:/Assistant:" wrapper.
- **One** `cactus_complete` per request. Needle is a tool-calling model, not a chat model, so there is no
  "final response" inference.
- `cactus_reset` runs before each request. The test page can turn it off (`reset` box) to measure the difference.
- `cactus_init("", toolsJson, 0)`, as in the official demo worker. Tools use the flat shape from `tools.json`.
- The model buffer on the wasm heap is **never freed** after `cactus_load`, as in the official demo worker.
- Assets are fetched from pinned revisions, size and SHA-256 checked, stored once in the Cache API
  (`needle-assets-v1`). No cache-busting query strings; no IndexedDB copy.
- Output is validated against `tools.json`. An empty `calls` array is a normal answer ("no tool fits").
  A call to an unknown tool, a missing or wrongly typed argument, or non-JSON output is an
  `invalid-output` error that keeps the raw text.
- `sw.js` ignores `/needle/` so the app's cache-first service worker cannot serve stale worker files.

## What is and is not verified

Verified here (no network to Hugging Face from the build sandbox):
- Validator and scoring: unit tests.
- Worker call sequence, argument types, caching, hash-mismatch handling, ordering, error codes:
  Node tests against a **fake** Cactus runtime.
- Classic worker, `importScripts`, Cache API, client, test page and scoring in headless Chromium,
  again with a **fake** runtime and fake assets.

**Not verified: anything about the real model.** Accuracy, latency, whether `function_calls` /
`confidence` / `*_tps` are present exactly as parsed, and whether `cactus_reset` per request is needed.
Treat the first real run as the test of those. If the real output differs from what `validate.js`
expects, the page shows the raw text so `validate.js` can be adjusted in one place.

## Acceptance for this stage (proposed; change before the first run, not after)

| Group | Target |
| --- | --- |
| toggle-on, toggle-off, status, time | 95% each |
| speech variants | 90% |
| compound (two calls, in order) | 90% |
| none (empty list expected) | 95%, no invented calls |
| independence (same prompt after unrelated ones) | 100% |
| invalid-output errors | 0 unexplained |
| latency | log median and worst; target a few seconds or less per request on desktop |

37 cases is a starting set. Add cases for every new failure before changing anything else.

## If it is slow or wrong

1. Look at `prefill_tps` and `decode_tps` in the result. Low prefill means the prompt is long; low decode with a
   large output means it is generating until `maxTokens`. The raw output shows which.
2. Try `maxTokens` 96 and `reset` off, one change at a time, and re-run the cases.
3. Compare the same prompt in the official demo on the same device before blaming the code.
4. Change tool descriptions before adding anything else. Add a `triggers` regex only after a measured
   failure, written so it never matches words owned by another tool.

## Next stage (not done)

Add real tools (logs, timing) one at a time to `tools.json` and `cases.json`, re-running the cases after each.
Then an adapter from validated calls to `window.IndicatorLights`, and only then UI wiring.
