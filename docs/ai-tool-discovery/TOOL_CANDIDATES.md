# Tool Candidates

## Candidate Overview

| Candidate | User Intent | Classification | Risk | Source Evidence | Main Gap |
|-----------|-------------|----------------|------|-----------------|----------|
| `toggle_light` | Turn a specific indicator light on/off | `good_candidate` | Low | `app.js:167-200` | None |
| `get_light_status` | Read current state of all lights | `good_candidate` | Low | `app.js:9-12, 149-165` | None |
| `create_log_entry` | Record a manual log entry for a light | `good_candidate` | Low | `app.js:207-240` | None |
| `read_logs` | Retrieve log entries for a column | `good_candidate` | Low | `app.js:243-250` | None |
| `update_log_entry` | Modify an existing log entry | `good_candidate` | Low | `app.js:253-262` | Requires entry ID |
| `delete_log_entry` | Remove a log entry | `good_candidate` | Low | `app.js:265-274` | Requires entry ID |
| `clear_logs` | Clear all logs for a column | `candidate_with_controls` | Medium | `app.js:277-282` | Destructive, needs confirmation |
| `execute_terminal_command` | Run a terminal command | `candidate_with_controls` | Medium | `app.js:510-821` | Broad surface, validation needed |
| `get_terminal_history` | Retrieve command history | `good_candidate` | Low | `app.js:112-127` | None |
| `get_clock_time` | Get current time from clock | `good_candidate` | Low | `app.js:82-85, 133-142` | None |
| `set_yellow_timing` | Configure yellow light toggle interval | `candidate_with_controls` | Low | `app.js:178-190` | Requires validation, affects behavior |
| `export_logs` | Export all logs as structured data | `good_candidate` | Low | `app.js:243-250, 93-109` | Not currently implemented |
| `import_logs` | Import logs from structured data | `candidate_with_controls` | Medium | `app.js:98-109` | Overwrites data, needs validation |

---

## Detailed Candidate Specifications

### `toggle_light`

- **Intended user request**: "Turn the blue left light on", "Toggle the red light", "Switch off yellow light"
- **Classification**: `good_candidate`
- **Source implementation**: 
  - `toggleBlueHalf(side)` at `app.js:168-175`
  - `toggleRed()` at `app.js:193-200`
  - Yellow toggle via terminal at `app.js:777-781`
- **Entry point**: User click/keyboard on light elements, or terminal `toggle` command
- **Internal functions**: `toggleBlueHalf()`, `toggleRed()`, direct state mutation for yellow
- **Inputs**: 
  - `light`: `"blue-left" | "blue-right" | "yellow" | "red"` (required)
  - `state`: `boolean` (optional - if omitted, toggles)
- **Outputs**: Updated light state, terminal output line, status text update
- **Data accessed**: `state.blue`, `state.yellow`, `state.red`
- **Side effects**: 
  - DOM class toggle (`.on`)
  - ARIA attribute updates
  - Terminal history append
  - Status text update
- **Preconditions**: Light element exists in DOM
- **Authorization**: None (client-side only)
- **Confirmation**: Not required (reversible, low risk)
- **Idempotency**: Yes when `state` provided; toggle is not idempotent
- **Dependencies/order**: None
- **Risk**: Low - visual state change only, easily reversible
- **Required safeguards**: Validate light identifier exists
- **Tests**: Manual testing via click/keyboard; terminal `toggle` command
- **Recommendation**: Expose as single tool with light identifier enum. Support both explicit state and toggle mode.

---

### `get_light_status`

- **Intended user request**: "What's the current state of all lights?", "Is the blue left light on?"
- **Classification**: `good_candidate`
- **Source implementation**: `state` object at `app.js:9-12`, `updateStatus()` at `app.js:149-165`
- **Entry point**: Terminal `status` command, `window.IndicatorLights.getState()`
- **Internal functions**: `updateStatus()`, direct state access
- **Inputs**: None (reads all lights)
- **Outputs**: Object `{ blue: { left: boolean, right: boolean }, yellow: boolean, red: boolean }`
- **Data accessed**: `state.blue`, `state.yellow`, `state.red`
- **Side effects**: None (pure read)
- **Preconditions**: None
- **Authorization**: None
- **Confirmation**: Not required
- **Idempotency**: Yes (pure read)
- **Dependencies/order**: None
- **Risk**: None
- **Required safeguards**: None
- **Tests**: Terminal `status` command output
- **Recommendation**: Simple read-only tool. Could also support filtering by light.

---

### `create_log_entry`

- **Intended user request**: "Log that blue left was on at 14:30", "Record yellow off at 09:15", "Add red transition off-to-on now"
- **Classification**: `good_candidate`
- **Source implementation**: `createLogEntry(column, data, time?)` at `app.js:207-240`
- **Entry point**: Modal submit, terminal `log`/`blue`/`yellow`/`red`/`set` commands, `window.IndicatorLights.createLogEntry()`
- **Internal functions**: `createLogEntry()`, `saveLogs()`, `renderLogColumn()`, `appendTerminalLine()`
- **Inputs**:
  - `column`: `"blue" | "yellow" | "red"` (required)
  - `data`: object (required, schema varies by column):
    - Blue: `{ left: boolean, right: boolean }`
    - Yellow: `{ on: boolean }`
    - Red: `{ transition: "on-to-off" | "off-to-on" }`
  - `time`: `"HH:MM"` string (optional, defaults to current time)
- **Outputs**: Created log entry object with `id`, `time`, `data`, `createdAt`
- **Data accessed**: `state.logs[column]`, localStorage `indicatorLogs`
- **Side effects**: 
  - Adds entry to `state.logs[column]` (unshift - newest first)
  - Persists to localStorage
  - Renders log column
  - Appends to terminal history
- **Preconditions**: Valid column, valid data schema for column, valid time format
- **Authorization**: None
- **Confirmation**: Not required (user-initiated logging)
- **Idempotency**: Upsert behavior - if entry with same `time` exists, updates it (not strictly idempotent)
- **Dependencies/order**: None
- **Risk**: Low - adds data, user can delete
- **Required safeguards**: 
  - Validate column enum
  - Validate data schema per column
  - Validate time format (HH:MM)
- **Tests**: Modal creation, terminal commands (`blue left 14:30`, `yellow on`, `red off-to-on 09:15`)
- **Recommendation**: Expose with strict input validation per column schema. Document upsert behavior clearly.

---

### `read_logs`

- **Intended user request**: "Show me all blue log entries", "What are the yellow logs?"
- **Classification**: `good_candidate`
- **Source implementation**: `readLogs(column)` at `app.js:243-245`, `showLogsSummary()` at `app.js:610-643`
- **Entry point**: Terminal `logs` command, `window.IndicatorLights.readLogs()`
- **Internal functions**: `readLogs()`, `showLogsSummary()`
- **Inputs**: 
  - `column`: `"blue" | "yellow" | "red" | "all"` (optional, defaults to "all")
  - `limit`: number (optional, for pagination)
- **Outputs**: Array of log entry objects (or object with three arrays if "all")
- **Data accessed**: `state.logs[column]`
- **Side effects**: None (pure read)
- **Preconditions**: Valid column
- **Authorization**: None
- **Confirmation**: Not required
- **Idempotency**: Yes
- **Dependencies/order**: None
- **Risk**: None
- **Required safeguards**: Validate column enum
- **Tests**: Terminal `logs blue`, `logs all`
- **Recommendation**: Support filtering by column, optional limit for large datasets. Return structured data.

---

### `update_log_entry`

- **Intended user request**: "Change the blue log at 14:30 to have both sides on", "Update yellow log entry ID abc123 to off"
- **Classification**: `good_candidate`
- **Source implementation**: `updateLogEntry(column, id, data)` at `app.js:253-262`
- **Entry point**: Modal edit, `window.IndicatorLights.updateLogEntry()`
- **Internal functions**: `updateLogEntry()`, `saveLogs()`, `renderLogColumn()`, `appendTerminalLine()`
- **Inputs**:
  - `column`: `"blue" | "yellow" | "red"` (required)
  - `id`: string (required - entry ID)
  - `data`: partial object with fields to update
- **Outputs**: Updated log entry object or `null` if not found
- **Data accessed**: `state.logs[column]`, localStorage
- **Side effects**: 
  - Mutates entry in state
  - Persists to localStorage
  - Re-renders log column
  - Appends to terminal history
- **Preconditions**: Entry with given ID exists in column
- **Authorization**: None
- **Confirmation**: Not required (user-initiated edit)
- **Idempotency**: Yes (setting same values)
- **Dependencies/order**: Must know entry ID (from `read_logs`)
- **Risk**: Low - modifies existing user data
- **Required safeguards**: Validate column, validate ID exists, validate data schema
- **Tests**: Modal edit flow
- **Recommendation**: Require ID from prior read. Support partial updates.

---

### `delete_log_entry`

- **Intended user request**: "Delete the blue log entry from 14:30", "Remove log entry ID abc123"
- **Classification**: `good_candidate`
- **Source implementation**: `deleteLogEntry(column, id)` at `app.js:265-274`
- **Entry point**: Modal delete button, terminal `delete` command, `window.IndicatorLights.deleteLogEntry()`
- **Internal functions**: `deleteLogEntry()`, `saveLogs()`, `renderLogColumn()`, `appendTerminalLine()`
- **Inputs**:
  - `column`: `"blue" | "yellow" | "red"` (required)
  - `id`: string (required - entry ID)
- **Outputs**: Boolean success
- **Data accessed**: `state.logs[column]`, localStorage
- **Side effects**: 
  - Removes entry from state
  - Persists to localStorage
  - Re-renders log column
  - Appends to terminal history
- **Preconditions**: Entry with given ID exists in column
- **Authorization**: None
- **Confirmation**: Recommended (destructive but single entry)
- **Idempotency**: Yes (deleting already-deleted returns false)
- **Dependencies/order**: Must know entry ID
- **Risk**: Low - single entry deletion, user can re-create
- **Required safeguards**: Validate column, validate ID exists
- **Tests**: Modal delete, terminal `delete blue 14:30`
- **Recommendation**: Require confirmation flag or separate confirm step.

---

### `clear_logs`

- **Intended user request**: "Clear all blue logs", "Wipe the yellow log column"
- **Classification**: `candidate_with_controls`
- **Source implementation**: `clearLogs(column)` at `app.js:277-282`
- **Entry point**: Not directly exposed in UI (no "clear all" button), `window.IndicatorLights.clearLogs()`
- **Internal functions**: `clearLogs()`, `saveLogs()`, `renderLogColumn()`, `appendTerminalLine()`
- **Inputs**: `column`: `"blue" | "yellow" | "red"` (required)
- **Outputs**: None
- **Data accessed**: `state.logs[column]`, localStorage
- **Side effects**: 
  - Empties entire log array for column
  - Persists to localStorage
  - Re-renders log column
  - Appends to terminal history
- **Preconditions**: Valid column
- **Authorization**: None
- **Confirmation**: **Required** - destructive bulk operation
- **Idempotency**: Yes (clearing empty array is no-op)
- **Dependencies/order**: None
- **Risk**: Medium - destroys all user data for a column irreversibly
- **Required safeguards**: 
  - Explicit confirmation parameter (e.g., `confirm: true`)
  - Could add `dryRun` preview
- **Tests**: Direct function call only
- **Recommendation**: Only expose with mandatory confirmation. Consider audit log.

---

### `execute_terminal_command`

- **Intended user request**: "Run `status` in the terminal", "Execute `blue left 14:30`"
- **Classification**: `candidate_with_controls`
- **Source implementation**: `processCommand(cmd)` at `app.js:510-576`, command handlers at `app.js:578-821`
- **Entry point**: Terminal input (Enter key), `window.IndicatorLights.processCommand()`
- **Internal functions**: `processCommand()`, all command handlers (`showHelp`, `showLogsSummary`, `handleLogCommand`, `handleSetCommand`, `handleBlueCommand`, `handleYellowCommand`, `handleRedCommand`, `handleToggleCommand`, `handleDeleteCommand`)
- **Inputs**: `command`: string (full command line)
- **Outputs**: Terminal output lines (array of `{ text, type }`)
- **Data accessed**: Full `state` object, localStorage
- **Side effects**: 
  - Can mutate any light state
  - Can create/update/delete logs
  - Appends to terminal history (persists)
  - Updates UI
- **Preconditions**: Valid command syntax
- **Authorization**: None
- **Confirmation**: Not required per command, but broad surface
- **Idempotency**: Varies by command (reads are idempotent, writes are not)
- **Dependencies/order**: Command-specific
- **Risk**: Medium - broad attack surface, 15+ sub-commands, can mutate all state
- **Required safeguards**: 
  - Strict command allowlist
  - Input validation per sub-command
  - Rate limiting
  - Consider exposing individual commands as separate tools instead
- **Tests**: Terminal `help` shows all; manual testing of each command
- **Recommendation**: **Do not expose as single generic tool**. Instead, expose individual terminal capabilities as separate tools (e.g., `get_status`, `create_log_entry`, `toggle_light`). If terminal execution is needed, use a restricted allowlist.

---

### `get_terminal_history`

- **Intended user request**: "Show me the terminal command history"
- **Classification**: `good_candidate`
- **Source implementation**: `loadTerminalHistory()` at `app.js:116-127`, `state.terminalHistory`
- **Entry point**: Terminal `history` command, `window.IndicatorLights` (not directly exported)
- **Internal functions**: `loadTerminalHistory()`, `saveTerminalHistory()`
- **Inputs**: `limit`: number (optional, default 100)
- **Outputs**: Array of `{ text: string, type: string, time: number }`
- **Data accessed**: localStorage `terminalHistory`, `state.terminalHistory`
- **Side effects**: None (pure read)
- **Preconditions**: None
- **Authorization**: None
- **Confirmation**: Not required
- **Idempotency**: Yes
- **Dependencies/order**: None
- **Risk**: None
- **Required safeguards**: None
- **Tests**: Terminal `history` command
- **Recommendation**: Simple read tool. Consider filtering by type (command/output/error/info).

---

### `get_clock_time`

- **Intended user request**: "What time is it?", "Get the current clock time"
- **Classification**: `good_candidate`
- **Source implementation**: `formatTime()` at `app.js:82-85`, `updateClock()` at `app.js:134-136`
- **Entry point**: Terminal `time` command, clock display in header
- **Internal functions**: `formatTime()`, `formatDateTime()`
- **Inputs**: None
- **Outputs**: `{ time: "HH:MM", dateTime: "locale string" }`
- **Data accessed**: System clock (`new Date()`)
- **Side effects**: None
- **Preconditions**: None
- **Authorization**: None
- **Confirmation**: Not required
- **Idempotency**: No (time changes), but deterministic for given moment
- **Dependencies/order**: None
- **Risk**: None
- **Required safeguards**: None
- **Tests**: Terminal `time` command, header clock display
- **Recommendation**: Trivial read tool. Could also return timezone info.

---

### `set_yellow_timing`

- **Intended user request**: "Make the yellow light toggle every 10-20 seconds instead of 5-15"
- **Classification**: `candidate_with_controls`
- **Source implementation**: `scheduleYellowToggle()` at `app.js:178-190`
- **Entry point**: Not exposed in UI/terminal, only via code modification
- **Internal functions**: `scheduleYellowToggle()`, uses `yellowTimer` variable
- **Inputs**: 
  - `minMs`: number (minimum interval in milliseconds)
  - `maxMs`: number (maximum interval in milliseconds)
- **Outputs**: None (affects future behavior)
- **Data accessed**: `yellowTimer`, `state.yellow`, `yellowLight` DOM element
- **Side effects**: 
  - Clears existing timer
  - Sets new random interval range
  - Affects automatic yellow light behavior globally
- **Preconditions**: Valid positive numbers, min < max
- **Authorization**: None
- **Confirmation**: Recommended (affects autonomous behavior)
- **Idempotency**: Yes (setting same values)
- **Dependencies/order**: None
- **Risk**: Low-Medium - changes automatic behavior, affects all users of the app
- **Required safeguards**: 
  - Validate min/max bounds (e.g., 1000-60000ms)
  - Confirmation flag
- **Tests**: Manual code change only
- **Recommendation**: Expose with bounds validation and confirmation. Could be useful for testing/demo scenarios.

---

### `export_logs`

- **Intended user request**: "Export all my logs as JSON", "Download my log data"
- **Classification**: `good_candidate`
- **Source implementation**: Not currently implemented as single function. Data available via `readLogs()` and `localStorage.getItem('indicatorLogs')`
- **Entry point**: Not exposed
- **Internal functions**: Would compose `readLogs('all')` + localStorage access
- **Inputs**: `format`: `"json" | "csv"` (optional, default "json")
- **Outputs**: Structured data blob or download trigger
- **Data accessed**: `state.logs` (all columns), localStorage `indicatorLogs`
- **Side effects**: None (read-only)
- **Preconditions**: None
- **Authorization**: None
- **Confirmation**: Not required
- **Idempotency**: Yes
- **Dependencies/order**: None
- **Risk**: None
- **Required safeguards**: None
- **Tests**: N/A (not implemented)
- **Recommendation**: Implement as convenience wrapper around `readLogs('all')`. Add CSV option for spreadsheet import.

---

### `import_logs`

- **Intended user request**: "Import logs from a JSON file", "Restore my log backup"
- **Classification**: `candidate_with_controls`
- **Source implementation**: `loadLogs()` at `app.js:98-109` reads from localStorage but no import API
- **Entry point**: Not exposed
- **Internal functions**: Would need new function to parse, validate, merge/replace, then `saveLogs()`
- **Inputs**: 
  - `data`: object with `blue`, `yellow`, `red` arrays
  - `mode`: `"replace" | "merge"` (default "replace")
- **Outputs**: Result summary (imported count, errors)
- **Data accessed**: `state.logs`, localStorage `indicatorLogs`
- **Side effects**: 
  - Overwrites or merges log data
  - Persists to localStorage
  - Re-renders all log columns
- **Preconditions**: Valid data structure, valid entry schemas
- **Authorization**: None
- **Confirmation**: **Required** - overwrites user data
- **Idempotency**: Replace mode: yes. Merge mode: depends on ID conflicts.
- **Dependencies/order**: None
- **Risk**: Medium - can corrupt log data if invalid input
- **Required safeguards**: 
  - Strict schema validation per column
  - Dry-run/preview mode
  - Confirmation flag
  - Backup current logs before import
- **Tests**: N/A (not implemented)
- **Recommendation**: Implement with comprehensive validation. Support both replace and merge. Require explicit confirmation.