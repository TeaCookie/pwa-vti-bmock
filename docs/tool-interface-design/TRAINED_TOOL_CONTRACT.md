# Trained Needle Tool Contract (v5)

**Status:** Contract baseline for the first adapter implementation. Adapter and application integration may proceed independently of Experiment 2; model evaluation and production-readiness decisions remain separate.
**Contract version:** `needle-tools-v5`
**Schema source:** `needle/tools.v5.json`
**Generated training schema:** `finetune/tools.train.json`
**Model manifest:** `needle/assets.exp1_20l.json`
**Model artifact:** `finetune/models/exp1_20l.cact`
**Manifest model SHA-256:** `55021a3c9bc334c4c58e2c7131b292a8013beac4d1c1da1f1530aa47c1ef036a`
**Manifest model size:** 63,437,076 bytes (about 63 MB)
**Cactus runtime:** 4.0.0
**Schema source Git blob:** `5a6f85d5f2ebe1d7d0390824d6a7a0d04d43d628` (repository revision inspected: `a9dc7915b7713faee2a55bf36de2d9e7fae7946f`)

The fine-tuned model's tool inventory is exactly the nine tools in `needle/tools.v5.json`. That file is authoritative for model-visible names, properties, types, enums, and required fields. Do not add parameters to it or expose tools from the broader application contract unless a later model/schema version is deliberately trained and evaluated.

The model emits calls; it does not define handler return values or authorize side effects. Result shapes below are the proposed adapter/application contract and must be implemented against the current application behavior. Where the existing app has no structured result, the adapter should return a documented normalized result without changing the model-facing schema.

## Version identity and compatibility

The artifact is identified by the manifest model SHA-256 above, not merely by the mutable filename. The manifest's `model.url` resolves to `../finetune/models/exp1_20l.cact` (with a hash query parameter), and `model.source` names `exp1_20l.cact`. Its `model.file` field is the runtime alias `needle3.cact`, not the repository path. The schema passed to the model is `needle/tools.v5.json`, with training copy generated into `finetune/tools.train.json`. The existing finetuning tests assert that the generated copy matches the canonical schema.

A deployment must pin the model artifact and tool schema together. If either hash/revision changes, treat it as a new compatibility pair and rerun the contract fixtures plus model evaluations. Experiment 1 is an evaluated research artifact, not a production-readiness claim: it missed the 30 MB size gate (63 MB actual), and the hold-out contamination caveat remains. These limitations do not block implementing the tool adapter or integrating the application's tool handlers. Keep model selection/loading behind a replaceable configuration boundary; Experiment 2 may supply a different artifact later without changing the tool contract or adapter.

## Shared argument rules

- Arguments must be a JSON object. A missing argument object is treated as `{}` by the current output validator.
- Only listed properties are accepted; unknown properties are rejected.
- Enum values are case-sensitive.
- Boolean fields must be JSON booleans, not strings such as `"on"` or `"true"`.
- `time` uses local 24-hour `HH:MM`, matching `^([01]\\d|2[0-3]):([0-5]\\d)$`. Omission means the application's current local clock time for `set_log_entry`.
- The model schema has no confirmation property. Confirmation is an application/UI gate, never a model argument.
- The schema does not encode every cross-field rule. The adapter must validate column-specific log fields before invoking application functions; it must not silently discard or reinterpret incompatible fields.

## Tool inventory and exact model-facing arguments

| Tool | Required arguments | Optional arguments |
|---|---|---|
| `get_light_status` | none | none |
| `get_clock_time` | none | none |
| `read_logs` | none | `column: "blue" \| "yellow" \| "red"` |
| `get_terminal_history` | none | none |
| `toggle_light` | `light`, `state` | none |
| `set_log_entry` | `column` | `time`, `left`, `right`, `on`, `transition` |
| `delete_log_entry` | `column`, `time` | none |
| `clear_logs` | `column` | none |
| `export_logs` | none | `format: "json" \| "csv"` |

### Read tools

#### `get_light_status()`
- **Arguments:** `{}`.
- **Validation:** no properties accepted.
- **Application result:** `{ blue: { left: boolean, right: boolean }, yellow: boolean, red: boolean }`.
- **Side effects:** none.

#### `get_clock_time()`
- **Arguments:** `{}`.
- **Validation:** no properties accepted.
- **Application result:** `{ time: string }`, where `time` is the displayed local `HH:MM` value. Do not promise the broader contract's date-time or timezone fields; the current app clock exposes only the formatted time.
- **Side effects:** none.

#### `read_logs(column?)`
- **Arguments:** optional `column` enum `blue | yellow | red`. Omit it to read all columns.
- **Validation:** reject any other column, including `"all"`; omission is the all-columns sentinel.
- **Application result:** with a column, return that column's entries as an array; without one, return `{ blue: LogEntry[], yellow: LogEntry[], red: LogEntry[] }`. Entries contain `id`, `time`, the column's data fields, and `createdAt`; upserted entries may also contain `updatedAt`.
- **Side effects:** none. Logs are the manual log columns, not terminal history.

#### `get_terminal_history()`
- **Arguments:** `{}`.
- **Validation:** no properties accepted.
- **Application result:** an ordered array of stored terminal records, each with `text` and `type`; the app persists at most the latest 100 lines. The existing UI history representation does not guarantee the timestamp and pagination/filter fields in the broader contract.
- **Side effects:** none.

#### `export_logs(format?)`
- **Arguments:** optional `format` enum `json | csv`; omission defaults to JSON.
- **Validation:** reject any other format and unknown properties.
- **Application result:** `{ format: "json" | "csv", data: string, entryCounts: { blue: number, yellow: number, red: number, total: number } }`. JSON serializes the three log arrays; CSV emits one row per entry with column-specific data. The adapter returns content; it must not claim a browser download unless it actually initiates one.
- **Side effects:** reading only; no mutation of logs.

### Mutation tools

#### `toggle_light(light, state)`
- **Required arguments:** `light` enum `blue-left | blue-right | yellow | red`; `state` boolean.
- **Validation:** both required; reject invalid light names and non-boolean states. This is set-to-state, not invert/toggle.
- **Application result:** `{ light, previousState: boolean, currentState: boolean }`.
- **Side effects:** updates the selected light and its visual/status representation; appends a terminal output line. Yellow's automatic timer behavior must be preserved by any future handler.
- **Confirmation:** none; this is a reversible low-risk setting.

#### `set_log_entry(column, time?, left?, right?, on?, transition?)`
- **Required arguments:** `column` enum `blue | yellow | red`.
- **Optional arguments:** `time` valid local `HH:MM`; `left` and `right` booleans; `on` boolean; `transition` enum `on-to-off | off-to-on`.
- **Validation:** schema-level required field is only `column`. The adapter must additionally enforce column/data compatibility: blue accepts blue fields (`left`/`right`), yellow accepts `on`, red accepts `transition`; reject fields belonging to another column. Require the data field(s) needed to represent the requested entry rather than creating malformed records. Do not infer missing values. At least one column-specific data field must be supplied; a complete blue state should supply both halves.
- **Application behavior/result:** upsert by `column + time`; omitted time uses current local `HH:MM`. Existing entry data is merged with supplied data; a new entry receives a generated `id`, `createdAt`, and supplied time/data. Updating an existing entry adds `updatedAt`. Return the resulting entry and an adapter action discriminator `created | updated` (the current app function returns the entry only, so the adapter determines the action before calling it).
- **Side effects:** persists `indicatorLogs`, re-renders the affected column, and appends terminal info.
- **Confirmation:** no separate confirmation; if the timestamp already exists, clearly report that the entry was updated rather than created.

#### `delete_log_entry(column, time)`
- **Required arguments:** `column` enum `blue | yellow | red`; `time` valid local `HH:MM`.
- **Validation:** both required. Resolve by column and time; if multiple entries share a time, do not delete an arbitrary entry. Return a not-found/ambiguous result without mutation.
- **Application behavior/result:** the model identifies the entry by time, while the existing app deletion primitive identifies it by generated ID. The adapter must resolve the matching entry first, then call deletion by ID. Return `{ success: boolean, column, time, deletedId?: string }`.
- **Side effects:** removes one matching entry, persists logs, re-renders the column, and appends terminal info.
- **Confirmation:** require explicit user confirmation in the application UI immediately before deletion. Model wording or a model-generated argument is not confirmation.

#### `clear_logs(column)`
- **Required arguments:** `column` enum `blue | yellow | red`.
- **Validation:** reject any other column.
- **Application behavior/result:** clear every entry in exactly the selected column; return `{ column, deletedCount }`.
- **Side effects:** empties the selected array, persists logs, re-renders the column, and appends terminal info.
- **Confirmation:** mandatory explicit user confirmation in the application UI, showing the target column and current number of entries. Cancel means no mutation. Do not add `confirm` or `dryRun` to the model schema.

## Destructive-action confirmation policy

Confirmation is enforced by the application boundary, not by model prompting or schema fields:

1. `delete_log_entry`: present the specific column and time (and resolved entry details); execute only after the user explicitly confirms.
2. `clear_logs`: present the column and exact number of entries that will be removed; execute only after explicit confirmation.
3. A tool call is a proposal, not consent. Phrases such as "I confirm" inside the original natural-language request do not bypass the UI confirmation step.
4. Cancellation, timeout, stale target, missing entry, or ambiguous match must leave data unchanged.
5. Re-check the target immediately before mutation to avoid confirming one record and deleting another.
6. Read-only tools and reversible light state changes do not require this destructive-action confirmation.

## Broader application contract mismatch matrix

The source of this comparison is `docs/tool-interface-design/TOOL_CONTRACT.md` v1.0.0 (2026-11-14). The trained v5 schema remains authoritative for the first model adapter.

| Broader contract item | Trained v5 reality | Resolution |
|---|---|---|
| `create_log_entry` | No such tool; v5 has `set_log_entry`. | Defer old name. Implement only `set_log_entry`; its upsert-by-time semantics cover create/update. |
| `update_log_entry` | No such tool; v5 has `set_log_entry`. | Defer old name. Do not expose a second update tool. |
| `set_log_entry` | v5 requires `column`; accepts optional flat `left`, `right`, `on`, `transition`, and `time`. | Use the trained flat shape. Do not substitute broader `data` object. Enforce column-specific data in adapter. |
| `toggle_light` | Both require `light` and boolean `state`. | Argument shape is compatible; retain explicit set-state semantics. |
| `delete_log_entry` | v5 locates by `column + time`; broader contract locates by `column + id` and optional `confirm`. | Resolve unique time match to app ID internally; confirmation is UI-side; no model-facing `id`/`confirm`. |
| `clear_logs` | v5 requires only `column`; broader contract requires `confirm: true` and optionally `dryRun`. | Keep schema unchanged; enforce mandatory UI confirmation; no `confirm`/`dryRun` model fields. |
| `read_logs` | v5 accepts optional one-column enum; omit column for all. No `all`, `limit`, or `offset`. | Omission means all columns; reject unsupported pagination and `all` literal. |
| `get_terminal_history` | v5 has no arguments. | No pagination or filter arguments; return the current app's stored history. |
| `get_clock_time` | v5 has no arguments. | Return displayed `HH:MM`; do not promise dateTime/timezone fields absent from current app surface. |
| `export_logs` | v5 accepts optional `format` only. | Default JSON; do not expose `includeMetadata`. |
| `set_yellow_timing` | Absent from v5. | Defer; do not expose to model. |
| `import_logs` | Absent from v5. | Defer; do not expose to model. |
| Pagination/filtering and metadata options | Broader contract proposes `limit`, `offset`, `filterType`, `includeMetadata`. | Defer; not present in trained schema. |
| `dryRun` and model-supplied confirmation | Broader contract proposes these for destructive operations. | Replace with application-owned confirmation flow; no model-facing fields. |

## Deferred capabilities

The following are explicitly out of the first adapter release: `create_log_entry`, `update_log_entry`, `set_yellow_timing`, `import_logs`, pagination/filtering arguments, `includeMetadata`, `dryRun`, and model-supplied confirmation flags. Do not create aliases or silently accept these arguments. Revisit only with a separately versioned schema/model and evaluation.

## Fixture and test coverage

- `needle/fixtures/tool-contract.v5.json` contains one representative valid and invalid invocation for each of the nine tools, plus edge cases.
- `needle/test/tool-contract.test.mjs` validates fixture calls using the same `NeedleValidate.parseResult` implementation used by the harness and checks the fixture inventory against `needle/tools.v5.json`.
- Run: `node --test needle/test/*.test.mjs`.

This is a model-call/schema contract test, not an application-handler integration test. Handler behavior and UI confirmation must receive integration tests when the adapter is implemented.
