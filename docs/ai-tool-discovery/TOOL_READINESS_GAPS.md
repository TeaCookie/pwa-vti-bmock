# Tool Readiness Gaps

## Summary

This document identifies gaps between the current application implementation and what would be needed to safely expose the candidate tools to an AI model. Gaps are categorized by security, validation, idempotency, privacy, and testing.

---

## Security & Authorization Gaps

### No Server-Side Authorization
- **Gap**: Entire application is client-side only. No authentication, no user sessions, no tenant boundaries.
- **Impact**: Any tool exposed would run with full user privileges in the browser context. No way to distinguish between user-initiated and model-initiated actions.
- **Affected Tools**: All candidates
- **Recommended Fix**: 
  - If deploying as multi-user app: add authentication, session management, and per-user data isolation
  - For single-user/local use: document that model tools run with full user privileges

### No Object-Level Access Control
- **Gap**: No concept of ownership or permissions on log entries or light states.
- **Impact**: Any tool can read/write all data.
- **Affected Tools**: All log CRUD tools, light control tools
- **Recommended Fix**: Not applicable for single-user app. For multi-user: add user IDs to log entries, enforce ownership checks.

### Frontend-Only Validation
- **Gap**: All validation currently happens in JavaScript in the browser. Model-generated arguments bypass UI validation.
- **Impact**: Invalid data could corrupt localStorage, break rendering, or cause unexpected behavior.
- **Affected Tools**: `create_log_entry`, `update_log_entry`, `set_yellow_timing`, `import_logs`
- **Recommended Fix**: 
  - Add server-side validation if backend exists
  - For client-only: implement strict schema validation in tool adapter layer (Zod/JSON Schema)
  - Validate all inputs before passing to application functions

---

## Input Validation Gaps

### Missing Schema Validation
| Tool | Missing Validation |
|------|-------------------|
| `create_log_entry` | Column-specific data schema (blue: left/right booleans, yellow: on boolean, red: transition enum), time format HH:MM |
| `update_log_entry` | Partial data schema validation, ID existence check |
| `delete_log_entry` | ID existence check |
| `clear_logs` | Column enum validation |
| `set_yellow_timing` | Bounds check (min > 0, max > min, reasonable max e.g. 60000ms) |
| `import_logs` | Full schema validation for all three column types, duplicate ID handling |
| `execute_terminal_command` | Command allowlist, per-subcommand argument validation |

### Time Format Validation
- **Gap**: Time strings accepted as `"HH:MM"` but only validated in terminal `set`/`delete` commands (regex `/^\d{2}:\d{2}$/`), not in `createLogEntry`.
- **Impact**: Invalid times could create unqueryable entries.
- **Affected Tools**: `create_log_entry`, `update_log_entry` (when updating time)
- **Recommended Fix**: Centralize time validation in `createLogEntry` and `updateLogEntry`.

### Column Enum Validation
- **Gap**: Column parameter validated in some places (`showLogsSummary`, `handleDeleteCommand`) but not all (`createLogEntry` assumes valid column).
- **Impact**: Typos like `"bleu"` would cause runtime errors.
- **Affected Tools**: All log tools
- **Recommended Fix**: Central column validation helper.

---

## Idempotency Gaps

### Toggle Operations Not Idempotent
- **Gap**: `toggle_light` without explicit `state` parameter toggles (not idempotent). Repeated calls flip state.
- **Impact**: Model retry logic could cause unintended state flips.
- **Affected Tools**: `toggle_light`
- **Recommended Fix**: 
  - Require explicit `state: boolean` parameter for idempotent behavior
  - Or provide separate `turn_on` / `turn_off` tools
  - Document non-idempotent nature clearly

### Upsert Behavior in `create_log_entry`
- **Gap**: `createLogEntry` uses upsert-by-timestamp: if entry with same `time` exists, it updates instead of creating new.
- **Impact**: Not strictly idempotent for create semantics; repeated calls with same time mutate existing entry.
- **Affected Tools**: `create_log_entry`
- **Recommended Fix**: 
  - Document upsert behavior clearly
  - Consider separate `upsert_log_entry` tool
  - Or add `mode: "create" | "upsert"` parameter

---

## Privacy & Data Exposure Gaps

### Terminal History Contains Commands
- **Gap**: `get_terminal_history` returns full command text including arguments (which may contain timestamps, light states).
- **Impact**: Low - only operational data, no secrets. But could reveal user patterns.
- **Affected Tools**: `get_terminal_history`
- **Recommended Fix**: 
  - Add optional `filterType` parameter to exclude commands
  - Or redact sensitive args (none currently sensitive)

### No Sensitive Data in App
- **Observation**: Application stores no passwords, tokens, PII, or financial data. Only light states and user-entered log timestamps.
- **Impact**: Low privacy risk.
- **Affected Tools**: None

---

## Confirmation Boundary Gaps

### Destructive Operations Without Confirmation
| Tool | Current | Needed |
|------|---------|--------|
| `clear_logs` | No confirmation | Mandatory `confirm: true` parameter |
| `delete_log_entry` | No confirmation | Optional `confirm: true` or two-step (read → confirm) |
| `import_logs` | N/A (not implemented) | Mandatory `confirm: true`, dry-run mode |
| `execute_terminal_command` | No confirmation | Per-command allowlist; dangerous commands (clear, delete) need confirmation |

### Recommended Pattern
```typescript
// For destructive tools
interface DestructiveToolParams {
  confirm: true;  // Must be explicitly true
  dryRun?: boolean;  // Preview without committing
}
```

---

## Missing Features for Tool Exposure

### No Stable API/Service Boundary
- **Gap**: Application functions are in global `window.IndicatorLights` object but not designed as stable API.
- **Impact**: Tool adapter would need to call internal functions directly, coupling to implementation.
- **Affected Tools**: All
- **Recommended Fix**: 
  - Define explicit TypeScript interfaces for each tool
  - Create adapter module that wraps internal functions
  - Version the API

### No Dry-Run/Preview for Write Operations
- **Gap**: No way to preview what a write operation would do without committing.
- **Impact**: Model cannot show user "this is what will happen" before executing.
- **Affected Tools**: `create_log_entry`, `update_log_entry`, `delete_log_entry`, `clear_logs`, `import_logs`, `set_yellow_timing`
- **Recommended Fix**: Add `dryRun: boolean` parameter to write tools that returns predicted effect without mutating state.

### No Audit Logging
- **Gap**: Terminal history captures some operations but not all (modal edits, direct clicks not logged).
- **Impact**: No complete trail of model-initiated vs user-initiated changes.
- **Affected Tools**: All write tools
- **Recommended Fix**: 
  - Add `source: "user" | "model"` to all state mutations
  - Persist audit log to localStorage or export

### No Rate Limiting / Abuse Controls
- **Gap**: No limits on command frequency, log entry creation rate, etc.
- **Impact**: Model loop could spam operations, fill localStorage, degrade performance.
- **Affected Tools**: All, especially `execute_terminal_command`, `create_log_entry`
- **Recommended Fix**: 
  - Add rate limiting in tool adapter (e.g., max 10 ops/sec)
  - Limit localStorage usage (already capped at 100 terminal lines)

---

## Testing Gaps

### No Automated Tests
- **Gap**: Repository has no test framework, no unit tests, no integration tests.
- **Impact**: No regression protection for tool adapter changes. No baseline for verifying tool behavior.
- **Affected Tools**: All
- **Recommended Fix**: 
  - Add minimal test setup (Vitest/Jest)
  - Test core functions: `createLogEntry`, `readLogs`, `updateLogEntry`, `deleteLogEntry`, `toggleBlueHalf`, `toggleRed`, `processCommand`
  - Test validation edge cases

### No Test Coverage for Error Paths
- **Gap**: Error handling paths (invalid ID, invalid time, invalid column, localStorage quota exceeded) untested.
- **Impact**: Tool adapter errors may surface as unhandled exceptions.
- **Affected Tools**: All write tools
- **Recommended Fix**: Add error case tests once test framework exists.

### No E2E Tests for Terminal Commands
- **Gap**: 15+ terminal sub-commands tested only manually.
- **Impact**: Command parser changes could break multiple tools.
- **Affected Tools**: `execute_terminal_command` (if exposed), individual command tools
- **Recommended Fix**: Add command-level tests for each handler.

---

## Unresolved Questions

1. **Multi-user vs Single-user**: Is this app intended for single-user local use or multi-user deployment? Changes authorization model significantly.

2. **Model Context**: Will the model have access to the full `state` object, or only tool outputs? Affects whether read tools are needed.

3. **Tool Granularity**: Should terminal commands be individual tools (`get_status`, `toggle_light`, `create_log_entry`) or one `execute_command` tool? Individual tools are safer but more numerous.

4. **Persistence Scope**: Should tools work across browser sessions (localStorage) or only current session? Current app uses localStorage.

5. **Concurrent Access**: What happens if user and model both modify state simultaneously? No locking mechanism exists.

6. **Offline/Online Sync**: If PWA used offline, how should model tools handle pending mutations? Not addressed.

---

## Priority Fixes for Tool Exposure

### Must Fix Before Any Tool Exposure
1. ✅ Add input validation schemas (Zod/JSON Schema) for all tool inputs
2. ✅ Add mandatory confirmation for `clear_logs` and `import_logs`
3. ✅ Document upsert behavior in `create_log_entry`
4. ✅ Make `toggle_light` idempotent via explicit `state` parameter

### Should Fix Before Production Use
5. ✅ Create stable adapter API layer (decouple from `window.IndicatorLights`)
6. ✅ Add dry-run/preview mode for write operations
7. ✅ Add rate limiting in adapter
8. ✅ Add basic test suite for core functions

### Nice to Have
9. ⬜ Audit logging with source attribution
10. ⬜ Export/import logs tools implementation
11. ⬜ Timezone-aware clock tool
12. ⬜ Concurrent modification handling