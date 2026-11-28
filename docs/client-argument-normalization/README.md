# Client-Side Tool Argument Normalization

> Status: proposed implementation spec  
> Scope: browser-side UX layer between Needle model output and the existing strict tool adapter  
> Related implementation: `assistant-controller.js`, `adapter/index.js`, `adapter/validation.js`, `app-api.js`

## 1. Problem and objective

The model integration and nine-tool contract are working. The remaining UX gap is that the model often emits valid but incomplete arguments for terse natural-language requests. For example, a user may say **"record blue left"**, while the tool contract requires both `left` and `right` booleans.

The client should fill safe, deterministic defaults and resolve context-dependent values before dispatch. The model should not need to learn every shorthand, and the adapter's strict validation must remain the final authority.

### Target pipeline

```text
User request
  -> Needle model
  -> client argument normalizer
  -> existing adapter + strict validation
  -> application API (window.IndicatorLights)
  -> formatted result in assistant UI
```

Example:

- Model output: `set_log_entry({ column: "blue", left: true })`
- Normalizer reads the app clock through the supported application API.
- Normalized call: `set_log_entry({ column: "blue", left: true, right: false, time: "<app-clock>" })`
- The existing validator validates the complete arguments before the app is changed.

The normalizer is a deterministic compatibility/UX layer, not a second natural-language model. It operates on structured tool calls and narrowly defined aliases/context.

## 2. Non-negotiable design rules

1. **Do not weaken the tool schema or validator.** Normalization happens before the existing validation boundary; malformed or unsupported arguments still fail.
2. **Explicit arguments win.** Never overwrite an explicit value, including `false`, `0`, or an explicitly supplied timestamp.
3. **Use the application as the source of truth.** Obtain current time and state through the supported `window.IndicatorLights` API. Never use the browser/system clock as a substitute for the app clock.
4. **Do not guess destructive targets.** Delete and clear operations require a uniquely resolved target and retain the existing confirmation/stale-target protections.
5. **Clarify genuinely ambiguous requests.** Do not turn a missing state into an arbitrary on/off choice.
6. **Preserve provenance.** Keep the original model arguments and expose which values were inferred/defaulted so the UI can explain the normalization.
7. **Do not duplicate model responsibilities.** No second LLM, broad regex-based natural-language parser, or changes to fine-tuning are required for this work.
8. **Preserve partial success.** For multi-call requests, report each call's outcome; do not silently retry a call that may already have caused a side effect.

## 3. Tool-by-tool normalization contract

### `get_light_status`

- No arguments are required.
- Recognize status/state/current-light-state phrasing as this tool.
- Present the returned state in a concise, human-readable form.

### `get_clock_time`

- No arguments are required.
- Use the application's clock, not `Date.now()` or a local system-time fallback.
- Format the returned value naturally in the UI without changing the underlying value.

### `read_logs`

- Omitted `column` means all columns, matching the existing contract.
- Normalize unambiguous aliases (e.g. blue log/blue entries -> `blue`).
- A request for multiple columns can use one all-column read and filter client-side, or a small adapter-supported extension if needed; do not invent unsupported schema values.
- Sort and group results consistently and indicate when the result is truncated.

### `get_terminal_history`

- No arguments are required.
- Recognize command-history/terminal-history phrasing.
- Keep terminal command history distinct from the manual indicator log.

### `toggle_light`

- Required contract remains `{ light, state }`.
- Infer the target from clear phrases: left -> `blue-left`; right -> `blue-right`; yellow -> `yellow`; red -> `red`.
- "Turn on left" -> state `true`; "turn off left" -> `false`.
- "Both blue lights" expands to two explicit calls, one for `blue-left` and one for `blue-right`.
- Distinguish **set** from **toggle**. "Turn on/off" has an explicit desired state. "Toggle" requires reading current state and inverting it; do not treat it as a synonym for "turn on".
- Resolve "both" only when the referent is clear (normally the two blue halves). If the user says "both lights" with no safe interpretation, clarify.

### `set_log_entry`

This is the highest-value normalization target.

**Blue**
- "Record blue left" -> `{ column: "blue", left: true, right: false }`.
- "Record blue right" -> `{ column: "blue", left: false, right: true }`.
- "Record both blue" -> `{ column: "blue", left: true, right: true }`.
- An explicit "blue off/neither" request -> both booleans `false`.
- Explicit booleans take precedence over shorthand defaults.

**Yellow**
- Explicit on/off phrasing maps to `on: true/false`.
- Bare "record yellow" is ambiguous unless the immediate context explicitly supplies the state; ask for clarification rather than assuming on.

**Red**
- "Red on" maps to `transition: "off-to-on"`.
- "Red off" maps to `transition: "on-to-off"`.
- Bare "record red" is ambiguous; ask for clarification.

**Time**
- If omitted, use the application clock. The app API already supports defaulting an omitted log time to its current clock.
- Preserve explicit times exactly after validation.
- Relative times may be resolved only against the application clock and only when unambiguous.
- Invalid or ambiguous time expressions require clarification; do not silently substitute the current time when the user supplied an unclear time.

### `delete_log_entry`

- Requires a column and exact time under the current contract.
- If the user specifies a column and time, preserve them and let existing validation/confirmation protections run.
- "Delete the latest blue entry" may read logs and resolve the latest entry only if there is exactly one unambiguous target; show the resolved target and obtain confirmation.
- Missing, duplicate, stale, or ambiguous targets require clarification. Never choose an arbitrary matching entry.

### `clear_logs`

- A column is required.
- "Clear blue logs" can resolve to `column: "blue"`.
- "Clear logs" is ambiguous; ask which column.
- "Clear everything" must ask whether the user means all three log columns, then execute explicit per-column operations only after confirmation.
- Preserve the existing destructive confirmation flow. Never default an omitted column to all.

### `export_logs`

- Omitted format defaults to JSON.
- Explicit CSV phrasing selects CSV.
- The app API returns serialized data; the client may create a downloadable Blob for the user-facing export.
- Do not change the existing export contract just to implement a download.

## 4. Normalizer interface

Add a small, model-independent module, proposed path:

```text
client/argument-normalizer.js
```

Suggested contract:

```js
normalizeToolCall(call, context) -> {
  status: "ready" | "needs_clarification",
  call: { name, arguments },       // normalized call when ready
  originalArguments: {},          // untouched model output
  inferred: [],                    // [{ argument, value, reason }]
  clarification: null | {
    reason,
    message
  }
}
```

The exact interface may be adapted to repository conventions, but it must:
- normalize one structured tool call at a time;
- use injected context/API access rather than hidden global state where practical;
- return clarification as data, not dispatch an invalid call;
- retain original arguments and inference metadata;
- leave final validation and execution to the existing adapter.

### Integration point

Insert normalization in `assistant-controller.js` between model tool-call output and `adapter.executeCalls(...)`. Avoid changing the model-facing schema or the adapter's strict validation semantics.

## 5. Delivery phases / issue breakdown

### Phase 0 — Safe normalization foundation (P0)

- Add the normalizer module and integrate it before adapter dispatch.
- Implement defaults for all nine tools, including blue shorthand, explicit yellow/red states, app-clock defaults, and JSON export default.
- Preserve explicit arguments and reject/clarify ambiguous inputs.
- Add focused unit tests and keep all existing adapter/validator tests passing.

### Phase 1 — Context-aware resolution and orchestration (P1)

- Use supported app state/log reads to resolve toggle operations and "latest entry" references.
- Support safe relative-time interpretation using app clock context.
- Support "both blue lights" as two calls and multi-column log reads.
- Add explicit clarification and confirmation handling for ambiguous or destructive requests.
- Orchestrate multiple calls sequentially with per-call outcomes and partial-success reporting.

### Phase 2 — Result presentation and export UX (P2)

- Format tool results into readable assistant responses without losing raw structured data.
- Show inferred/defaulted arguments transparently (e.g. "Assumed right=false; used app time 14:32").
- Implement client-side download handling for JSON/CSV exports.
- Surface truncation, no-result, and partial-failure states clearly.

### Phase 3 — Hardening and regression coverage (P2)

- Expand unit and integration tests across all nine tools and normalization edge cases.
- Verify that strict validation remains intact and destructive protections cannot be bypassed.
- Test multi-call ordering, duplicate/stale targets, explicit false values, and partial failures.
- Run the existing Node test suite and relevant browser/PWA regression checks.

## 6. Acceptance criteria

- [ ] All nine supported tools pass through a single deterministic normalization boundary before adapter validation.
- [ ] "Record blue left" creates a valid blue entry with `left=true`, `right=false`, and app-clock time when no time is supplied.
- [ ] Blue right/both/neither shorthand maps to the correct pair of booleans.
- [ ] Explicit arguments always override inferred defaults, including explicit `false`.
- [ ] Yellow and red entries are never created with an invented state.
- [ ] Toggle semantics read current state and invert it; set-on/set-off semantics remain explicit.
- [ ] Delete/clear operations never guess destructive targets and preserve confirmation protections.
- [ ] JSON remains the default export; CSV is selected only when requested.
- [ ] Inferred values are available to the UI for transparent explanation.
- [ ] Existing strict validation and all existing tests continue to pass.

## 7. Test matrix

Create focused tests, proposed path `needle/test/argument-normalizer.test.mjs`, covering at minimum:

- blue left, right, both, neither, and explicit boolean precedence;
- yellow on/off and ambiguous bare yellow;
- red on/off and ambiguous bare red;
- app-clock default, explicit time preservation, relative time, and invalid time clarification;
- toggle on/off vs state-dependent toggle;
- both-blue expansion;
- latest-entry deletion, ambiguous/duplicate/stale deletion targets;
- clear without a column, explicit single-column clear, and all-column confirmation;
- JSON default and explicit CSV;
- unknown tool/argument behavior and integration with strict adapter validation.

## 8. Out of scope

- Re-training or changing the Needle model.
- Relaxing the existing tool schemas or validator.
- Building a second natural-language interpretation model.
- Accessing app internals or DOM state outside the supported application API.
- Automatically executing ambiguous destructive operations.

## 9. Implementation order

Implement Phase 0 first as a self-contained, testable layer. Phase 1 depends on the normalizer and its context interface. Phase 2 depends on stable normalized outcomes. Phase 3 runs throughout development and is the release gate.
