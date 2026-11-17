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
3. **Run all cases** scores `cases.json` (56 cases, 8 groups) and prints a table per group, a confidence
   threshold sweep, failures, and median/worst latency. Cases 1-37 are the first baseline set and are unchanged;
   cases 38-56 were appended later, mostly extra "no tool fits" cases. The `confidence threshold` box re-scores the
   last run without re-running the model.

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

56 cases is still a small set. Add cases for every new failure before changing anything else.

## Tool-set experiments (A/B in the same page)

`test.html?tools=<file>` picks the tool set; the file name is shown at the top and in the results line.
Change one thing per run and compare the group table and the threshold sweep.

| File | What differs from `tools.json` |
| --- | --- |
| `tools.json` | Baseline |
| `tools.tight.json` | Descriptions say "Only for ..." for each tool (wording only) |
| `tools.escape.json` | Adds an escape-hatch tool `no_action`, marked `"noop": true` |
| `tools.both.json` | Both of the above |

A tool marked `"noop": true` is an escape hatch: if the model calls it, the result is an empty `calls` array
(`noAction: true`), i.e. "no tool fits". The `noop` marker is stripped before the tools are sent to the engine.

## Results so far (real model, 56 cases, reset on, maxTokens 384)

| Tool set | Commands (39) | No tool fits (17) | Overall | Latency median / worst |
| --- | --- | --- | --- | --- |
| `tools.json` | 36 (92%) | 8 (47%) | 44/56 (79%) | 616 / 1243 ms |
| `tools.tight.json` | 35 (90%) | 8 (47%) | 43/56 (77%) | 671 / 1263 ms |
| `tools.escape.json` | 36 (92%) | 11 (65%) | 47/56 (84%) | 691 / 1369 ms |
| **`tools.both.json`** | **37 (95%)** | **12 (71%)** | **49/56 (88%)** | 666 / 1242 ms |

Reading it:
- The escape-hatch tool is the change that matters (+3 no-tool cases alone). Tighter descriptions alone did nothing
  (-1 case); the difference between `escape` and `both` is 2 cases, which is within noise at this size.
- A response-level confidence threshold does not help: with `both`, raising it from 0 to 0.4 trades no-tool accuracy
  (71% to 88%) for command accuracy (95% to 87%) and overall stays at 88%.
- Recommended tool set for now: `tools.both.json`. No invalid-output errors in any run.

Failures that appeared in all four runs (so they are not noise, and descriptions did not move them):
1. "switch off the right blue light" and "switch off right blue" return `blue-left`. The same wording with "turn off",
   or "switch on right blue", is correct, so it is specific to that phrasing.
2. "set the yellow timing to ten seconds" and "add a log entry for yellow" return `toggle_light yellow`
   (confidence 0.23-0.35). These become real tools later, so do not over-tune on them.
3. Questions about unrelated things (weather, battery, logs) go to a read-only `get_*` tool.

Proposed app policy (from this one 56-case set, so treat the numbers as a first estimate): run read-only calls
as returned; for `toggle_light` below confidence 0.5, ask "Did you mean ...?" first. On the `both` run all 4 wrong
toggles were under 0.5, and 7 of 29 correct toggle responses were too.

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

## 16-tool experiment

The 16 tools from the earlier branch, converted to the flat shape (no `additionalProperties`, `minimum`, `pattern` or `const`; ranges and formats are in descriptions instead).

| File | Contents |
|------|----------|
| `tools.16.json` | all 16 tools |
| `tools.16.escape.json` | the 16 plus the `no_action` escape hatch |
| `cases.16.json` | 80 cases: the 56 baseline cases minus 4 that now match real tools, plus 28 new ones covering 15 of the 16 tools (`import_logs` is a distractor only) |

Run each in the browser, loading the model once per page:

- `needle/test.html?tools=tools.16.json&cases=cases.16.json`
- `needle/test.html?tools=tools.16.escape.json&cases=cases.16.json`

Compare against the 3-tool numbers by group (toggle, status, time, none, compound) and look at median latency: prefill grows with the tool list.
