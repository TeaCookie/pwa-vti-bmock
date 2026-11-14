# Tool Contract - Indicator Lights PWA

**Version**: 1.0.0  
**Date**: 2026-11-14  
**Source**: `app-capability-discovery` v1.0.0  
**Application**: pwa-vti-bmock (vanilla HTML/CSS/JS PWA)

---

## Overview

This contract defines the model-facing tool interface for the Indicator Lights PWA. The application is a single-user, client-side Progressive Web App with three indicator lights (Blue split, Yellow auto-toggle, Red toggle), a digital clock, a manual logging system (3 columns), and a command terminal. All state is persisted in localStorage.

**Design Principles**:
- Least privilege: Each tool has one clear responsibility
- Safety first: Destructive operations require explicit confirmation
- Idempotency: Write tools are idempotent where possible
- Validation: All inputs validated at adapter layer before application call
- No secrets: Application stores no sensitive data

---

## Tool Inventory

| # | Tool Name | Type | Category | Risk | Confirmation |
|---|-----------|------|----------|------|--------------|
| 1 | `get_light_status` | Read | Lights | None | No |
| 2 | `get_clock_time` | Read | Clock | None | No |
| 3 | `read_logs` | Read | Logs | None | No |
| 4 | `get_terminal_history` | Read | Terminal | None | No |
| 5 | `toggle_light` | Write | Lights | Low | No |
| 6 | `create_log_entry` | Write | Logs | Low | No |
| 7 | `update_log_entry` | Write | Logs | Low | No |
| 8 | `delete_log_entry` | Write | Logs | Low | Optional |
| 9 | `clear_logs` | Write | Logs | Medium | **Required** |
| 10 | `set_yellow_timing` | Write | Lights | Low-Medium | Recommended |
| 11 | `export_logs` | Read | Logs | None | No |
| 12 | `import_logs` | Write | Logs | Medium | **Required** |

**Total**: 12 tools (4 read, 8 write)

---

## Canonical Tool Definitions

### 1. `get_light_status`

**Description**: Get the current on/off state of all three indicator lights.

**Arguments**:
```typescript
interface GetLightStatusArgs {
  // No arguments - reads all lights
}
```

**Result**:
```typescript
interface GetLightStatusResult {
  blue: {
    left: boolean;
    right: boolean;
  };
  yellow: boolean;
  red: boolean;
}
```

**Errors**: None (always succeeds)

**Side Effects**: None (pure read)

**Idempotency**: Yes

---

### 2. `get_clock_time`

**Description**: Get the current time from the digital clock.

**Arguments**:
```typescript
interface GetClockTimeArgs {
  // No arguments
}
```

**Result**:
```typescript
interface GetClockTimeResult {
  time: string;           // HH:MM format (e.g., "14:30")
  dateTime: string;       // Full locale datetime string
  timezone: string;       // IANA timezone identifier (e.g., "America/Los_Angeles")
}
```

**Errors**: None (always succeeds)

**Side Effects**: None (pure read)

**Idempotency**: No (time changes), but deterministic for given moment

---

### 3. `read_logs`

**Description**: Retrieve log entries for one or all columns.

**Arguments**:
```typescript
interface ReadLogsArgs {
  column?: "blue" | "yellow" | "red" | "all";  // Default: "all"
  limit?: number;                                // Optional pagination (default: no limit)
  offset?: number;                               // Optional pagination offset (default: 0)
}
```

**Result**:
```typescript
interface ReadLogsResult {
  // When column is "all" or omitted:
  blue: LogEntry[];
  yellow: LogEntry[];
  red: LogEntry[];
  
  // When column is specific:
  // entries: LogEntry[];
  
  // Always included:
  totalCount: {
    blue: number;
    yellow: number;
    red: number;
  };
}
```

**LogEntry** (varies by column):
```typescript
// Blue column
interface BlueLogEntry {
  id: string;
  time: string;           // HH:MM
  left: boolean;
  right: boolean;
  createdAt: number;      // Unix ms timestamp
  updatedAt?: number;     // Unix ms timestamp (if updated)
}

// Yellow column
interface YellowLogEntry {
  id: string;
  time: string;           // HH:MM
  on: boolean;
  createdAt: number;
  updatedAt?: number;
}

// Red column
interface RedLogEntry {
  id: string;
  time: string;           // HH:MM
  transition: "on-to-off" | "off-to-on";
  createdAt: number;
  updatedAt?: number;
}
```

**Errors**:
- `invalid_column` - column not in ["blue", "yellow", "red", "all"]

**Side Effects**: None (pure read)

**Idempotency**: Yes

---

### 4. `get_terminal_history`

**Description**: Retrieve the terminal command history.

**Arguments**:
```typescript
interface GetTerminalHistoryArgs {
  limit?: number;              // Default: 100 (max stored)
  offset?: number;             // Default: 0
  filterType?: "command" | "output" | "error" | "info" | "all";  // Default: "all"
}
```

**Result**:
```typescript
interface GetTerminalHistoryResult {
  entries: TerminalHistoryEntry[];
  totalCount: number;
}

interface TerminalHistoryEntry {
  text: string;      // The command or output text
  type: "command" | "output" | "error" | "info";
  time: number;      // Unix ms timestamp
}
```

**Errors**: None

**Side Effects**: None (pure read)

**Idempotency**: Yes

---

### 5. `toggle_light`

**Description**: Set or toggle a specific indicator light. **Idempotent** - requires explicit `state` parameter. Omitting `state` is not allowed (use explicit `true`/`false`).

**Arguments**:
```typescript
interface ToggleLightArgs {
  light: "blue-left" | "blue-right" | "yellow" | "red";
  state: boolean;        // Required - true = on, false = off
}
```

**Result**:
```typescript
interface ToggleLightResult {
  light: "blue-left" | "blue-right" | "yellow" | "red";
  previousState: boolean;
  currentState: boolean;
}
```

**Errors**:
- `invalid_light` - light not in allowed enum
- `invalid_state` - state not a boolean

**Side Effects**:
- Updates light DOM element (`.on` class)
- Updates ARIA attributes
- Appends to terminal history
- Updates status text in footer
- For yellow: resets auto-toggle timer

**Idempotency**: Yes (setting same state is no-op)

**Notes**: 
- Does NOT support "toggle" mode (omitting state) - model must read current state first via `get_light_status` then call with desired state
- This ensures idempotency and prevents retry-induced flips

---

### 6. `create_log_entry`

**Description**: Create a new manual log entry for a specific light column. Uses **upsert-by-timestamp**: if an entry with the same `time` already exists in that column, it will be updated instead of creating a duplicate.

**Arguments**:
```typescript
interface CreateLogEntryArgs {
  column: "blue" | "yellow" | "red";
  time?: string;                    // HH:MM format, default: current time
  data: BlueLogData | YellowLogData | RedLogData;
}

interface BlueLogData {
  left: boolean;
  right: boolean;
}

interface YellowLogData {
  on: boolean;
}

interface RedLogData {
  transition: "on-to-off" | "off-to-on";
}
```

**Result**:
```typescript
interface CreateLogEntryResult {
  entry: BlueLogEntry | YellowLogEntry | RedLogEntry;
  action: "created" | "updated";    // Indicates if new or upsert
}
```

**Errors**:
- `invalid_column` - column not in allowed enum
- `invalid_data_schema` - data doesn't match column schema
- `invalid_time_format` - time not in HH:MM format
- `invalid_time_value` - time values out of range (00-23, 00-59)

**Side Effects**:
- Adds/updates entry in `state.logs[column]` (newest first)
- Persists to localStorage (`indicatorLogs`)
- Re-renders log column in UI
- Appends to terminal history

**Idempotency**: **Not strictly idempotent** - upsert behavior means repeated calls with same `time` will update the existing entry. The `action` field indicates whether created or updated.

**Notes**: 
- Time defaults to current clock time if omitted
- Entries sorted newest-first in UI
- IDs are generated as `Date.now().toString(36) + Math.random().toString(36).substr(2)`

---

### 7. `update_log_entry`

**Description**: Update an existing log entry by its ID. Supports partial updates.

**Arguments**:
```typescript
interface UpdateLogEntryArgs {
  column: "blue" | "yellow" | "red";
  id: string;
  data: Partial<BlueLogData | YellowLogData | RedLogData>;
  time?: string;      // Optional - update timestamp (HH:MM)
}
```

**Result**:
```typescript
interface UpdateLogEntryResult {
  entry: BlueLogEntry | YellowLogEntry | RedLogEntry;
}
```

**Errors**:
- `invalid_column` - column not in allowed enum
- `entry_not_found` - no entry with given ID in column
- `invalid_data_schema` - data doesn't match column schema (for provided fields)
- `invalid_time_format` - time not in HH:MM format (if provided)
- `invalid_time_value` - time values out of range (if provided)

**Side Effects**:
- Mutates entry in `state.logs[column]`
- Persists to localStorage
- Re-renders log column
- Appends to terminal history
- Sets `updatedAt` timestamp

**Idempotency**: Yes (setting same values is no-op)

**Notes**: 
- Must know entry ID from prior `read_logs` call
- Partial updates supported - only provided fields are changed

---

### 8. `delete_log_entry`

**Description**: Delete a single log entry by its ID.

**Arguments**:
```typescript
interface DeleteLogEntryArgs {
  column: "blue" | "yellow" | "red";
  id: string;
  confirm?: boolean;          // Optional confirmation flag (recommended)
}
```

**Result**:
```typescript
interface DeleteLogEntryResult {
  success: boolean;
  deletedId: string;
}
```

**Errors**:
- `invalid_column` - column not in allowed enum
- `entry_not_found` - no entry with given ID in column
- `confirmation_required` - if confirm=false or omitted (optional, see below)

**Side Effects**:
- Removes entry from `state.logs[column]`
- Persists to localStorage
- Re-renders log column
- Appends to terminal history

**Idempotency**: Yes (deleting already-deleted returns `success: false`)

**Notes**: 
- `confirm` parameter is optional but recommended for model callers
- If `confirm: true` is required by adapter config, omission returns `confirmation_required` error

---

### 9. `clear_logs`

**Description**: Clear ALL log entries for a specific column. **Destructive bulk operation - requires explicit confirmation.**

**Arguments**:
```typescript
interface ClearLogsArgs {
  column: "blue" | "yellow" | "red";
  confirm: true;              // MANDATORY - must be explicitly true
  dryRun?: boolean;           // Optional - preview without committing
}
```

**Result**:
```typescript
interface ClearLogsResult {
  column: "blue" | "yellow" | "red";
  deletedCount: number;       // Number of entries that were/would be deleted
  dryRun: boolean;            // Echoes the dryRun parameter
}
```

**Errors**:
- `invalid_column` - column not in allowed enum
- `confirmation_required` - if `confirm` is not explicitly `true`
- `dry_run_only` - if `dryRun: true` (not an error, but indicates no mutation)

**Side Effects** (when `dryRun: false` or omitted):
- Empties `state.logs[column]`
- Persists to localStorage
- Re-renders log column
- Appends to terminal history

**Side Effects** (when `dryRun: true`):
- None (preview only)

**Idempotency**: Yes (clearing empty array returns `deletedCount: 0`)

**Notes**: 
- `confirm: true` is MANDATORY - not optional
- `dryRun: true` allows preview before committing
- This is the only tool that can destroy all user data for a column

---

### 10. `set_yellow_timing`

**Description**: Configure the yellow light's automatic random toggle interval. Affects global autonomous behavior.

**Arguments**:
```typescript
interface SetYellowTimingArgs {
  minMs: number;              // Minimum interval in milliseconds (>= 1000)
  maxMs: number;              // Maximum interval in milliseconds (<= 60000)
  confirm?: boolean;          // Recommended confirmation flag
}
```

**Result**:
```typescript
interface SetYellowTimingResult {
  previousMinMs: number;
  previousMaxMs: number;
  currentMinMs: number;
  currentMaxMs: number;
}
```

**Errors**:
- `invalid_bounds` - minMs < 1000, maxMs > 60000, or minMs >= maxMs
- `confirmation_required` - if `confirm: true` required by adapter and omitted

**Side Effects**:
- Clears existing yellow timer
- Sets new random interval range
- Next toggle will use new range
- Affects all users of the app (global behavior)

**Idempotency**: Yes (setting same values is no-op)

**Notes**: 
- Default in app: minMs=5000, maxMs=15000 (5-15 seconds)
- Changes take effect immediately for next toggle cycle
- Not persisted across sessions (would need localStorage addition)

---

### 11. `export_logs`

**Description**: Export all log data as structured JSON or CSV.

**Arguments**:
```typescript
interface ExportLogsArgs {
  format?: "json" | "csv";    // Default: "json"
  includeMetadata?: boolean;  // Default: true (include createdAt/updatedAt)
}
```

**Result**:
```typescript
interface ExportLogsResult {
  format: "json" | "csv";
  data: string;               // JSON string or CSV text
  entryCounts: {
    blue: number;
    yellow: number;
    red: number;
    total: number;
  };
  exportedAt: number;         // Unix ms timestamp
}
```

**Errors**:
- `invalid_format` - format not in ["json", "csv"]

**Side Effects**: None (pure read)

**Idempotency**: Yes

**Notes**: 
- JSON format: `{ blue: [...], yellow: [...], red: [...], metadata: {...} }`
- CSV format: One row per entry with columns: column,id,time,data...,createdAt,updatedAt
- Does not trigger browser download - returns data for model to handle

---

### 12. `import_logs`

**Description**: Import log data from JSON, replacing or merging with existing logs. **Destructive - requires explicit confirmation.**

**Arguments**:
```typescript
interface ImportLogsArgs {
  data: {
    blue: BlueLogEntry[];
    yellow: YellowLogEntry[];
    red: RedLogEntry[];
  };
  mode: "replace" | "merge";      // Default: "replace"
  confirm: true;                   // MANDATORY - must be explicitly true
  dryRun?: boolean;                // Optional - preview without committing
}
```

**Result**:
```typescript
interface ImportLogsResult {
  mode: "replace" | "merge";
  imported: {
    blue: number;
    yellow: number;
    red: number;
    total: number;
  };
  errors: ImportError[];
  dryRun: boolean;
}

interface ImportError {
  column: "blue" | "yellow" | "red";
  index: number;              // Index in input array
  error: string;              // Validation error message
  entry: any;                 // The invalid entry
}
```

**Errors**:
- `invalid_mode` - mode not in ["replace", "merge"]
- `confirmation_required` - if `confirm` is not explicitly `true`
- `invalid_data_structure` - data missing required columns or not an object
- `dry_run_only` - if `dryRun: true` (not an error, indicates no mutation)

**Side Effects** (when `dryRun: false` or omitted, `mode: "replace"`):
- Replaces all `state.logs` with imported data
- Persists to localStorage
- Re-renders all log columns
- Appends to terminal history

**Side Effects** (when `dryRun: false` or omitted, `mode: "merge"`):
- Merges imported entries by ID (existing IDs updated, new IDs added)
- Persists to localStorage
- Re-renders all log columns
- Appends to terminal history

**Side Effects** (when `dryRun: true`):
- None (preview only - returns what would be imported/errors)

**Idempotency**: 
- Replace mode: Yes
- Merge mode: Depends on ID conflicts (re-running with same data is idempotent)

**Notes**: 
- Validates every entry against column schema before import
- `dryRun: true` recommended for preview
- Backs up current logs internally before replace (not exposed)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-11-14 | Initial contract from app-capability-discovery |

---

## Compatibility Notes

- **Breaking changes**: Any change to tool names, argument names, enum values, result shapes, or error codes
- **Non-breaking**: Adding optional arguments, adding new result fields, adding new tools
- **Model retraining required**: For any breaking change
- **Adapter versioning**: Adapter should expose `getToolContractVersion()` for model compatibility checks