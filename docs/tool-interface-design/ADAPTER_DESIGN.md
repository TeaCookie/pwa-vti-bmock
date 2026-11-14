# Adapter Design - Indicator Lights PWA

**Version**: 1.0.0  
**Contract Version**: 1.0.0  
**Application**: pwa-vti-bmock (vanilla HTML/CSS/JS PWA)

---

## Overview

This document specifies the application-side adapter layer that sits between the model tool calls and the application's internal functions (`window.IndicatorLights`). The adapter is responsible for:

1. **Authentication/Authorization** - Verify caller identity and permissions
2. **Input Validation** - Strict schema validation before calling application
3. **Business Rule Enforcement** - Confirmation requirements, idempotency, bounds
4. **Execution** - Call internal functions with validated inputs
5. **Error Handling** - Normalize errors to contract-defined error codes
6. **Audit Logging** - Track model-initiated vs user-initiated actions
7. **Rate Limiting** - Prevent abuse/spam
8. **Observability** - Metrics, logging, debugging

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Model / Tool Caller                        │
└─────────────────────────────┬───────────────────────────────────┘
                              │ JSON-RPC / Function Calling
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Tool Adapter Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Auth / Rate  │──►│  Validation  │──►│  Execution / Error   │  │
│  │   Limiting   │   │  (Zod/JSON   │   │  Handling / Audit    │  │
│  └──────────────┘   │   Schema)    │   └──────────────────────┘  │
│                     └──────────────┘              │               │
└────────────────────────────────────────────────────┼──────────────┘
                                                     │
                                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           window.IndicatorLights (internal API)           │  │
│  │  getState() │ toggleBlueLeft() │ createLogEntry() │ ...  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Authentication & Authorization

### Current State
- **No authentication** - Single-user, client-side only
- **No sessions** - State persisted in localStorage
- **No tenant isolation** - All data accessible

### Adapter Behavior
```typescript
interface AuthContext {
  // For future multi-user support
  userId?: string;
  sessionId?: string;
  // For current single-user:
  source: "user" | "model";    // Track who initiated the action
  timestamp: number;
}
```

**Rules**:
- All model calls must include `source: "model"` in audit log
- No user identity verification in v1 (single-user)
- Future: Add JWT/session validation when backend exists

---

## Rate Limiting

### Configuration
```typescript
interface RateLimitConfig {
  // Per-tool limits (requests per window)
  default: { requests: 30, windowMs: 60000 };      // 30/min default
  writeTools: { requests: 20, windowMs: 60000 };   // 20/min for writes
  bulkTools: { requests: 5, windowMs: 60000 };     // 5/min for clear/import
  readTools: { requests: 60, windowMs: 60000 };    // 60/min for reads
}
```

### Implementation
- In-memory token bucket per session (resets on page reload)
- Returns `rate_limited` error with `retryAfterMs` when exceeded
- Model should respect `retryAfterMs` before retrying

---

## Input Validation (Zod Schemas)

### Core Validation Library
Use **Zod** for runtime validation with TypeScript inference. Schemas mirror the contract exactly.

```typescript
// Example: toggle_light validation
const ToggleLightArgsSchema = z.object({
  light: z.enum(["blue-left", "blue-right", "yellow", "red"]),
  state: z.boolean(),
});

// Example: create_log_entry validation
const CreateLogEntryArgsSchema = z.object({
  column: z.enum(["blue", "yellow", "red"]),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  data: z.discriminatedUnion("column", [
    z.object({ column: z.literal("blue"), data: z.object({ left: z.boolean(), right: z.boolean() }) }),
    z.object({ column: z.literal("yellow"), data: z.object({ on: z.boolean() }) }),
    z.object({ column: z.literal("red"), data: z.object({ transition: z.enum(["on-to-off", "off-to-on"]) }) }),
  ]),
});
```

### Validation Rules by Tool

| Tool | Validation |
|------|------------|
| `get_light_status` | No args |
| `get_clock_time` | No args |
| `read_logs` | column enum, limit/offset positive integers |
| `get_terminal_history` | limit/offset positive integers, filterType enum |
| `toggle_light` | light enum, state boolean (REQUIRED) |
| `create_log_entry` | column enum, time HH:MM regex, data discriminated union per column |
| `update_log_entry` | column enum, id non-empty string, data partial discriminated union, time optional HH:MM |
| `delete_log_entry` | column enum, id non-empty string, confirm optional boolean |
| `clear_logs` | column enum, confirm MUST be `true`, dryRun optional boolean |
| `set_yellow_timing` | minMs >= 1000, maxMs <= 60000, minMs < maxMs, confirm optional boolean |
| `export_logs` | format enum, includeMetadata optional boolean |
| `import_logs` | data structure with 3 arrays, mode enum, confirm MUST be `true`, dryRun optional boolean |

### Error Response Format
```typescript
interface ValidationError {
  code: "invalid_args";
  message: string;
  details: z.ZodError;  // Parsed Zod error details
}
```

---

## Business Rule Enforcement

### Confirmation Requirements

| Tool | Confirmation Required | Adapter Behavior |
|------|----------------------|------------------|
| `clear_logs` | **MANDATORY** `confirm: true` | Reject if `confirm !== true` |
| `import_logs` | **MANDATORY** `confirm: true` | Reject if `confirm !== true` |
| `delete_log_entry` | Optional (configurable) | If adapter config requires confirm, reject without it |
| `set_yellow_timing` | Recommended (configurable) | Warn/log if missing, but allow |

### Idempotency Strategy

| Tool | Strategy |
|------|----------|
| `toggle_light` | Require explicit `state` - model must read then write |
| `create_log_entry` | Upsert by timestamp - document in `action` field |
| `update_log_entry` | Partial update - naturally idempotent |
| `delete_log_entry` | Returns `success: false` if already deleted |
| `clear_logs` | Returns `deletedCount: 0` if already empty |
| `set_yellow_timing` | Setting same values is no-op |
| `import_logs` (replace) | Full replace - idempotent |
| `import_logs` (merge) | Merge by ID - idempotent for same data |

### Dry-Run / Preview Support

Tools supporting `dryRun: true`:
- `clear_logs` - Returns `deletedCount` without mutating
- `import_logs` - Returns `imported` counts and `errors` without mutating

**Implementation**: 
- Check `dryRun` flag before calling mutating functions
- For `clear_logs`: return `state.logs[column].length` as `deletedCount`
- For `import_logs`: validate all entries, compute merge/replace diff, return preview

---

## Execution & Error Handling

### Internal Function Mapping

| Tool | Internal Function(s) |
|------|---------------------|
| `get_light_status` | `IndicatorLights.getState()` |
| `get_clock_time` | `formatTime()`, `formatDateTime()`, `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| `read_logs` | `IndicatorLights.readLogs(column)` |
| `get_terminal_history` | `IndicatorLights.getState().terminalHistory` (not directly exported - need access) |
| `toggle_light` | `IndicatorLights.toggleBlueLeft()`, `toggleBlueRight()`, `toggleRed()`, direct yellow mutation |
| `create_log_entry` | `IndicatorLights.createLogEntry(column, data, time)` |
| `update_log_entry` | `IndicatorLights.updateLogEntry(column, id, data)` |
| `delete_log_entry` | `IndicatorLights.deleteLogEntry(column, id)` |
| `clear_logs` | `IndicatorLights.clearLogs(column)` |
| `set_yellow_timing` | Direct manipulation of `yellowTimer` + `scheduleYellowToggle()` |
| `export_logs` | Compose from `readLogs('all')` + localStorage |
| `import_logs` | Validate → `clearLogs` (if replace) → `createLogEntry` for each → `saveLogs()` |

### Error Normalization

All errors normalized to contract error codes:

```typescript
interface ToolError {
  code: string;           // Contract error code
  message: string;        // Human-readable
  details?: any;          // Optional extra info
  retryable: boolean;     // Whether model should retry
}

// Standard error codes
const ErrorCodes = {
  // Validation
  "invalid_args": "Argument validation failed",
  "invalid_column": "Column must be blue, yellow, or red",
  "invalid_light": "Light must be blue-left, blue-right, yellow, or red",
  "invalid_data_schema": "Data doesn't match column schema",
  "invalid_time_format": "Time must be HH:MM format",
  "invalid_time_value": "Time values out of range",
  "invalid_bounds": "minMs/maxMs out of bounds or min >= max",
  "invalid_format": "Format must be json or csv",
  "invalid_mode": "Mode must be replace or merge",
  "invalid_data_structure": "Import data must have blue, yellow, red arrays",
  
  // Not found
  "entry_not_found": "Log entry not found",
  
  // Confirmation
  "confirmation_required": "Operation requires explicit confirmation",
  "dry_run_only": "Preview only - no changes made",
  
  // Rate limiting
  "rate_limited": "Too many requests",
  
  // Internal
  "internal_error": "Application error",
  "storage_error": "localStorage operation failed",
} as const;
```

### Retry Policy

| Error Code | Retryable | Model Action |
|------------|-----------|--------------|
| `invalid_*` | No | Fix arguments, don't retry |
| `entry_not_found` | No | Re-read logs first |
| `confirmation_required` | No | Re-call with `confirm: true` |
| `dry_run_only` | N/A | Not an error - informational |
| `rate_limited` | **Yes** | Wait `retryAfterMs`, then retry |
| `internal_error` | **Yes** | Retry once after brief delay |
| `storage_error` | **Yes** | Retry once (quota may clear) |

---

## Audit Logging

### Audit Entry Structure
```typescript
interface AuditEntry {
  id: string;                    // Unique audit ID
  timestamp: number;             // Unix ms
  tool: string;                  // Tool name
  source: "user" | "model";      // Who initiated
  args: Record<string, any>;     // Sanitized arguments (no sensitive data)
  result: "success" | "error";   // Outcome
  errorCode?: string;            // If error
  durationMs: number;            // Execution time
}
```

### Storage
- In-memory ring buffer (last 1000 entries)
- Optional: persist to localStorage `indicatorAuditLog`
- Not exposed via tools (admin only)

### Sanitization
- Remove any potential PII from args before logging
- For this app: only light states, timestamps, log IDs - no sensitive data

---

## Data Minimization in Results

### Principles
- Return only what the model needs
- Don't expose internal implementation details
- Don't return full state when only subset requested

### Examples

| Tool | Full Internal Result | Contracted Result |
|------|---------------------|-------------------|
| `get_light_status` | `{ blue: {left, right}, yellow, red, ...otherState }` | Only light states |
| `read_logs` | Full entry objects with all fields | Contracted entry shape |
| `toggle_light` | Full state + DOM refs | Only light, previous, current |
| `create_log_entry` | Full entry + DOM refs | Contracted entry + action |

---

## Timeout & Retry Policy

### Execution Timeouts
```typescript
const Timeouts = {
  readTools: 5000,      // 5 seconds
  writeTools: 10000,    // 10 seconds (includes localStorage)
  bulkTools: 30000,     // 30 seconds (clear/import large datasets)
};
```

### Timeout Handling
- Wrap execution in `Promise.race([execution, timeout])`
- On timeout: return `internal_error` with `retryable: true`
- Log timeout for debugging

---

## Adapter API Surface

### Main Entry Point
```typescript
interface ToolAdapter {
  // Contract version
  getContractVersion(): string;
  
  // Tool execution
  execute<T extends ToolName>(
    tool: T,
    args: ToolArgs[T],
    context: AuthContext
  ): Promise<ToolResult[T] | ToolError>;
  
  // Health check
  healthCheck(): Promise<{ status: "ok" | "degraded"; details: any }>;
  
  // Rate limit status
  getRateLimitStatus(): RateLimitStatus;
  
  // Audit (admin)
  getAuditLog(limit?: number): AuditEntry[];
}
```

### Tool Registry
```typescript
const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  get_light_status: { type: "read", handler: handleGetLightStatus },
  get_clock_time: { type: "read", handler: handleGetClockTime },
  read_logs: { type: "read", handler: handleReadLogs },
  get_terminal_history: { type: "read", handler: handleGetTerminalHistory },
  toggle_light: { type: "write", handler: handleToggleLight },
  create_log_entry: { type: "write", handler: handleCreateLogEntry },
  update_log_entry: { type: "write", handler: handleUpdateLogEntry },
  delete_log_entry: { type: "write", handler: handleDeleteLogEntry },
  clear_logs: { type: "write", handler: handleClearLogs, requiresConfirm: true },
  set_yellow_timing: { type: "write", handler: handleSetYellowTiming },
  export_logs: { type: "read", handler: handleExportLogs },
  import_logs: { type: "write", handler: handleImportLogs, requiresConfirm: true },
};
```

---

## Integration with Application

### Required Application Changes

1. **Expose terminal history** - Add `IndicatorLights.getTerminalHistory()` or expose `state.terminalHistory`
2. **Add audit log** - New `state.auditLog` array + persistence
3. **Add yellow timing config** - Persist min/max to localStorage (currently only in memory)
4. **Add export/import functions** - New internal functions for bulk operations
5. **Add adapter initialization** - Initialize rate limiter, audit log on app start

### File Structure (Proposed)
```
/src/
  adapter/
    index.ts              # Main adapter entry
    schemas.ts            # Zod schemas
    validation.ts         # Validation helpers
    execution.ts          # Tool execution logic
    errors.ts             # Error normalization
    audit.ts              # Audit logging
    rateLimit.ts          # Rate limiting
    tools/
      lights.ts           # Light tools
      logs.ts             # Log tools
      clock.ts            # Clock tool
      terminal.ts         # Terminal tool
      system.ts           # Export/import, yellow timing
  types/
    contract.ts           # Contract types (generated from contract)
```

---

## Configuration

```typescript
interface AdapterConfig {
  // Confirmation requirements
  requireConfirmForDelete: boolean;      // Default: false
  requireConfirmForYellowTiming: boolean; // Default: false
  
  // Rate limiting
  rateLimit: RateLimitConfig;
  
  // Timeouts
  timeouts: typeof Timeouts;
  
  // Audit
  auditEnabled: boolean;                 // Default: true
  auditPersistToStorage: boolean;        // Default: false
  
  // Dry-run
  dryRunEnabled: boolean;                // Default: true
}
```

---

## Testing Strategy

### Unit Tests (Adapter Only)
- Validation schema tests for each tool
- Error normalization tests
- Rate limiting logic tests
- Audit log sanitization tests
- Dry-run behavior tests

### Integration Tests (Adapter + App)
- Tool execution against real `window.IndicatorLights`
- localStorage persistence verification
- Concurrent access simulation
- Error path coverage

### Contract Tests
- Valid args → expected result shape
- Invalid args → expected error codes
- Idempotency verification
- Confirmation enforcement

---

## Migration Notes

### v1.0.0 → Future Versions
- **Breaking**: Tool name changes, argument renames, enum value changes, result shape changes, error code changes
- **Non-breaking**: New optional args, new result fields, new tools, relaxed validation (rare)
- **Adapter versioning**: Semantic versioning aligned with contract version
- **Model compatibility**: Model should check `getContractVersion()` before calling tools