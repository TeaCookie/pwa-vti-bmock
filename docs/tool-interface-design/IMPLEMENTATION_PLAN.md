# Implementation Plan - Tool Interface for Indicator Lights PWA

**Version**: 1.0.0  
**Contract Version**: 1.0.0  
**Target**: pwa-vti-bmock (vanilla HTML/CSS/JS PWA)

---

## Overview

This plan details the files, functions, and changes needed to implement the tool adapter layer and expose the 12 tools defined in the contract. The implementation follows a phased approach:

- **Phase 1** (Week 1): Foundation - adapter core, validation, error handling, rate limiting
- **Phase 2** (Week 2): Tool implementations - all 12 tools with proper validation
- **Phase 3** (Week 3): Integration - audit logging, dry-run, persistence enhancements
- **Phase 4** (Week 4): Testing - unit, integration, contract tests

---

## Current Application Structure

```
pwa-vti-bmock/
├── index.html          # Main HTML (140 lines)
├── app.js              # All application logic (977 lines)
├── styles.css          # Styling (866 lines)
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker
├── netlify.toml        # Netlify config
├── icons/              # Icon assets
├── .claude/
│   └── launch.json     # Dev server config
└── docs/
    ├── ai-tool-discovery/
    └── tool-interface-design/   # NEW - this directory
```

**Key Application Entry Points** (from `app.js`):
```javascript
// Exposed on window.IndicatorLights
{
  getState: () => ({ ...state }),
  toggleBlueLeft: () => toggleBlueHalf('left'),
  toggleBlueRight: () => toggleBlueHalf('right'),
  toggleRed,
  createLogEntry,
  readLogs,
  readLogEntry,
  updateLogEntry,
  deleteLogEntry,
  clearLogs,
  appendTerminalLine,
  processCommand
}
```

**Internal State** (`app.js:9-20`):
```javascript
const state = {
  blue: { left: false, right: false },
  yellow: false,
  red: false,
  logs: { blue: [], yellow: [], red: [] },
  terminalHistory: [],
  terminalHistoryIndex: -1
};
```

---

## Phase 1: Foundation (Week 1)

### 1.1 Create Adapter Module Structure

**New Files**:
```
/src/
  adapter/
    index.ts                 # Main entry point
    config.ts                # Configuration
    schemas.ts               # Zod validation schemas
    validation.ts            # Validation helpers
    errors.ts                # Error normalization
    rateLimit.ts             # Rate limiting (token bucket)
    audit.ts                 # Audit logging
    types/
      contract.ts            # TypeScript types from contract
    tools/
      lights.ts              # get_light_status, toggle_light, set_yellow_timing
      logs.ts                # read_logs, create_log_entry, update_log_entry, delete_log_entry, clear_logs, export_logs, import_logs
      clock.ts               # get_clock_time
      terminal.ts            # get_terminal_history
```

**Dependencies to Add**:
```json
// package.json (NEW - for adapter development only)
{
  "devDependencies": {
    "zod": "^3.22.0",
    "vitest": "^1.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Note**: The production app remains vanilla JS - adapter is built separately and loaded as a module.

### 1.2 Implement Core Adapter Infrastructure

#### `adapter/config.ts`
- AdapterConfig interface
- Default configuration
- Environment-based overrides

#### `adapter/errors.ts`
- ErrorCodes enum (matching contract)
- ToolError class
- normalizeError() function
- isRetryable() function

#### `adapter/rateLimit.ts`
- TokenBucket class
- RateLimiter class with per-tool configs
- getRateLimitStatus() function

#### `adapter/audit.ts`
- AuditEntry interface
- AuditLogger class (ring buffer + optional localStorage)
- sanitizeArgs() function

#### `adapter/validation.ts`
- validateArgs(schema, args) function
- ValidationError class

### 1.3 Define Zod Schemas (`adapter/schemas.ts`)

All 12 tool argument schemas matching the contract exactly. Example:
```typescript
import { z } from 'zod';

export const ToggleLightArgsSchema = z.object({
  light: z.enum(['blue-left', 'blue-right', 'yellow', 'red']),
  state: z.boolean(),
});

export const CreateLogEntryArgsSchema = z.object({
  column: z.enum(['blue', 'yellow', 'red']),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  data: z.discriminatedUnion('column', [
    z.object({ column: z.literal('blue'), data: z.object({ left: z.boolean(), right: z.boolean() }) }),
    z.object({ column: z.literal('yellow'), data: z.object({ on: z.boolean() }) }),
    z.object({ column: z.literal('red'), data: z.object({ transition: z.enum(['on-to-off', 'off-to-on']) }) }),
  ]),
});
// ... all 12 schemas
```

### 1.4 Implement Main Adapter Entry (`adapter/index.ts`)

```typescript
export class ToolAdapter {
  private rateLimiter: RateLimiter;
  private auditLogger: AuditLogger;
  private config: AdapterConfig;
  
  constructor(config?: Partial<AdapterConfig>) { ... }
  
  async execute<T>(tool: string, args: any, context: AuthContext): Promise<ToolResult<T> | ToolError> {
    // 1. Rate limit check
    // 2. Validate args against schema
    // 3. Check confirmation requirements
    // 4. Execute tool handler
    // 5. Audit log
    // 6. Return result or normalized error
  }
  
  getContractVersion(): string { return '1.0.0'; }
  healthCheck(): Promise<HealthStatus>;
  getRateLimitStatus(): RateLimitStatus;
  getAuditLog(limit?: number): AuditEntry[];
}
```

### 1.5 Tool Registry (`adapter/tools/registry.ts`)

```typescript
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  get_light_status: { type: 'read', handler: handleGetLightStatus },
  get_clock_time: { type: 'read', handler: handleGetClockTime },
  read_logs: { type: 'read', handler: handleReadLogs },
  get_terminal_history: { type: 'read', handler: handleGetTerminalHistory },
  toggle_light: { type: 'write', handler: handleToggleLight },
  create_log_entry: { type: 'write', handler: handleCreateLogEntry },
  update_log_entry: { type: 'write', handler: handleUpdateLogEntry },
  delete_log_entry: { type: 'write', handler: handleDeleteLogEntry, requiresConfirm: false },
  clear_logs: { type: 'write', handler: handleClearLogs, requiresConfirm: true },
  set_yellow_timing: { type: 'write', handler: handleSetYellowTiming },
  export_logs: { type: 'read', handler: handleExportLogs },
  import_logs: { type: 'write', handler: handleImportLogs, requiresConfirm: true },
};
```

---

## Phase 2: Tool Implementations (Week 2)

### 2.1 Light Tools (`adapter/tools/lights.ts`)

#### `handleGetLightStatus()`
- Call `IndicatorLights.getState()`
- Return `{ blue: {left, right}, yellow, red }`

#### `handleToggleLight(args)`
- Validate `light` enum, `state` boolean
- Map to internal functions:
  - `blue-left` → `IndicatorLights.toggleBlueLeft()`
  - `blue-right` → `IndicatorLights.toggleBlueRight()`
  - `red` → `IndicatorLights.toggleRed()`
  - `yellow` → Direct state mutation + UI update (replicate `app.js:777-781`)
- Return `{ light, previousState, currentState }`

#### `handleSetYellowTiming(args)`
- Validate bounds (1000-60000, min < max)
- Clear existing `yellowTimer` (access via closure or expose on IndicatorLights)
- Update min/max, call `scheduleYellowToggle()`
- Return previous/current bounds

**Required App Change**: Expose `yellowTimer` and `scheduleYellowToggle` on `IndicatorLights` or provide setter.

### 2.2 Clock Tool (`adapter/tools/clock.ts`)

#### `handleGetClockTime()`
- Call `formatTime()` and `formatDateTime()` (expose on IndicatorLights)
- Get timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Return `{ time, dateTime, timezone }`

**Required App Change**: Export `formatTime`, `formatDateTime` on `IndicatorLights`.

### 2.3 Log Tools (`adapter/tools/logs.ts`)

#### `handleReadLogs(args)`
- Default `column: 'all'`, `limit: undefined`, `offset: 0`
- Call `IndicatorLights.readLogs(column)` per column
- Apply pagination (slice)
- Return contracted shape with `totalCount`

#### `handleCreateLogEntry(args)`
- Call `IndicatorLights.createLogEntry(column, data, time)`
- Return `{ entry, action: 'created' | 'updated' }`
- Note: Internal function returns entry, need to detect upsert vs create

**Required App Change**: Modify `createLogEntry` to return `{ entry, action }` or add `IndicatorLights.readLogEntry` to check existence first.

#### `handleUpdateLogEntry(args)`
- Call `IndicatorLights.updateLogEntry(column, id, data)`
- If `time` provided, include in data
- Return updated entry

#### `handleDeleteLogEntry(args)`
- Check confirmation if required by config
- Call `IndicatorLights.deleteLogEntry(column, id)`
- Return `{ success, deletedId }`

#### `handleClearLogs(args)`
- Enforce `confirm: true` (mandatory)
- If `dryRun: true`, return count without calling `clearLogs`
- Else call `IndicatorLights.clearLogs(column)`
- Return `{ column, deletedCount, dryRun }`

#### `handleExportLogs(args)`
- Call `IndicatorLights.readLogs('all')` for all columns
- Format as JSON or CSV
- Return `{ format, data, entryCounts, exportedAt }`

**Implementation Note**: CSV generation needs careful escaping.

#### `handleImportLogs(args)`
- Enforce `confirm: true` (mandatory)
- Validate all entries against column schemas
- If `dryRun: true`, return preview with `imported` counts and `errors`
- If `mode: 'replace'`:
  - Call `clearLogs` for each column
  - Call `createLogEntry` for each valid entry
- If `mode: 'merge'`:
  - For each entry: check if ID exists → `updateLogEntry` or `createLogEntry`
- Return `{ mode, imported, errors, dryRun }`

**Required App Change**: Expose `clearLogs` per column, or add bulk clear.

### 2.4 Terminal Tool (`adapter/tools/terminal.ts`)

#### `handleGetTerminalHistory(args)`
- Access `IndicatorLights.getState().terminalHistory` (not currently exported)
- Apply limit, offset, filterType
- Return `{ entries, totalCount }`

**Required App Change**: Export `terminalHistory` on `IndicatorLights`.

---

## Phase 3: Integration & Enhancements (Week 3)

### 3.1 Application Modifications (`app.js`)

**Required Changes to `window.IndicatorLights`**:

```javascript
// Add to IndicatorLights export:
window.IndicatorLights = {
  // ... existing ...
  
  // NEW: Clock functions
  formatTime,
  formatDateTime,
  
  // NEW: Terminal history access
  getTerminalHistory: () => [...state.terminalHistory],
  
  // NEW: Yellow timer control
  getYellowTiming: () => ({ minMs: 5000, maxMs: 15000 }), // Track current values
  setYellowTiming: (minMs, maxMs) => { /* clear timer, set new, schedule */ },
  
  // NEW: Bulk operations for import
  clearAllLogs: () => { /* clear all three columns */ },
  bulkCreateLogs: (entries) => { /* create multiple, return results */ },
  
  // NEW: Yellow toggle (for toggle_light yellow)
  toggleYellow: () => { /* replicate app.js:777-781 */ },
  
  // NEW: Audit log access (if implemented)
  getAuditLog: () => [...state.auditLog],
  addAuditEntry: (entry) => { /* add to state.auditLog */ },
};
```

**Additional State**:
```javascript
// Add to state object:
auditLog: [],
yellowTiming: { minMs: 5000, maxMs: 15000 }, // Persist to localStorage
```

**localStorage Keys to Add**:
- `indicatorYellowTiming` - Persist yellow timing across sessions
- `indicatorAuditLog` - Optional audit persistence

### 3.2 Dry-Run Implementation

For `clear_logs` and `import_logs`:
- Add `dryRun` parameter to internal functions or compute preview in adapter
- For `clear_logs`: preview = `state.logs[column].length`
- For `import_logs`: validate all, compute diff, return counts

### 3.3 Audit Logging Integration

- Add `source: 'model'` to all adapter-initiated mutations
- Store in `state.auditLog` (ring buffer, max 1000)
- Optional: persist to localStorage

### 3.4 Yellow Timing Persistence

- Load `indicatorYellowTiming` on init
- Save on `set_yellow_timing`
- Apply on `scheduleYellowToggle()`

---

## Phase 4: Testing (Week 4)

### 4.1 Test Infrastructure Setup

**New Files**:
```
/tests/
  setup.ts                 # Vitest setup, mocks
  utils/
    testHarness.ts         # resetApp, executeTool, fixtures
    mockTime.ts            # Date mocking
  unit/
    schemas.test.ts        # Zod schema validation
    validation.test.ts     # validateArgs
    errors.test.ts         # Error normalization
    rateLimit.test.ts      # Token bucket
    audit.test.ts          # Audit logging
  integration/
    lights.test.ts         # Light tools
    logs.test.ts           # Log tools
    clock.test.ts          # Clock tool
    terminal.test.ts       # Terminal tool
    system.test.ts         # Export/import, yellow timing
  contract/
    idempotency.test.ts    # Idempotency verification
    confirmation.test.ts   # Confirmation enforcement
    dryRun.test.ts         # Dry-run behavior
  security/
    validationBypass.test.ts
    injection.test.ts
  failure/
    timeout.test.ts
    rateLimit.test.ts
    storageError.test.ts
```

### 4.2 Test Commands

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:contract": "vitest run tests/contract"
  }
}
```

### 4.3 CI Integration

```yaml
# .github/workflows/test.yml
name: Tool Adapter Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:coverage
```

---

## File Changes Summary

### New Files (Adapter - ~15 files)
| File | Purpose |
|------|---------|
| `src/adapter/index.ts` | Main adapter entry |
| `src/adapter/config.ts` | Configuration |
| `src/adapter/schemas.ts` | Zod schemas (12 tools) |
| `src/adapter/validation.ts` | Validation helpers |
| `src/adapter/errors.ts` | Error normalization |
| `src/adapter/rateLimit.ts` | Rate limiting |
| `src/adapter/audit.ts` | Audit logging |
| `src/adapter/types/contract.ts` | TypeScript types |
| `src/adapter/tools/registry.ts` | Tool registry |
| `src/adapter/tools/lights.ts` | Light tools (3) |
| `src/adapter/tools/logs.ts` | Log tools (8) |
| `src/adapter/tools/clock.ts` | Clock tool (1) |
| `src/adapter/tools/terminal.ts` | Terminal tool (1) |
| `src/adapter/tools/system.ts` | Export/import, yellow timing |
| `package.json` | Dev dependencies |

### Modified Files (Application)
| File | Changes |
|------|---------|
| `app.js` | Export additional functions on `IndicatorLights`, add `auditLog` and `yellowTiming` to state, persist yellow timing, add audit logging to mutations |
| `index.html` | Load adapter module (if exposing via page) |

### Test Files (~20 files)
| Category | Files |
|----------|-------|
| Unit | 5 |
| Integration | 5 |
| Contract | 3 |
| Security | 2 |
| Failure | 3 |

---

## Dependencies

### Runtime (Production)
- **None** - Adapter compiles to vanilla JS or is loaded as ES module
- Application remains zero-dependency vanilla HTML/CSS/JS

### Development Only
```json
{
  "devDependencies": {
    "zod": "^3.22.0",
    "vitest": "^1.0.0",
    "typescript": "^5.0.0",
    "@vitest/coverage-v8": "^1.0.0"
  }
}
```

---

## Migration Notes

### From Current App to Tool-Enabled App

1. **No breaking changes** to existing UI/functionality
2. **Additive only** - new exports on `IndicatorLights`, new state fields
3. **localStorage keys** added: `indicatorYellowTiming`, `indicatorAuditLog` (optional)
4. **Backward compatible** - existing `createLogEntry` behavior preserved (upsert)

### Version Compatibility

| Contract Version | Adapter Version | App Version | Notes |
|------------------|-----------------|-------------|-------|
| 1.0.0 | 1.0.0 | 1.0.0+ | Initial release |
| 1.1.0 | 1.1.0 | 1.0.0+ | Add optional fields, new tools |
| 2.0.0 | 2.0.0 | 2.0.0+ | Breaking changes |

---

## Rollout Plan

### Week 1: Foundation
- [ ] Create adapter module structure
- [ ] Implement core infrastructure (config, errors, rateLimit, audit, validation)
- [ ] Define all 12 Zod schemas
- [ ] Implement main adapter entry with tool registry
- [ ] Unit tests for core infrastructure

### Week 2: Tools
- [ ] Implement light tools (3)
- [ ] Implement clock tool (1)
- [ ] Implement terminal tool (1)
- [ ] Implement log tools (8) - most complex
- [ ] Integration tests for each tool category

### Week 3: Integration
- [ ] Modify `app.js` for new exports and state
- [ ] Add yellow timing persistence
- [ ] Add audit logging to mutations
- [ ] Implement dry-run for clear/import
- [ ] Integration tests with real app

### Week 4: Testing & Polish
- [ ] Contract tests (idempotency, confirmation, dry-run)
- [ ] Security tests (validation bypass, injection)
- [ ] Failure tests (timeout, rate limit, storage)
- [ ] Cross-tool tests (concurrency, persistence)
- [ ] CI/CD integration
- [ ] Documentation update

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `app.js` modifications break existing UI | Low | High | Minimal changes, extensive integration tests |
| Zod bundle size too large for client | Medium | Low | Adapter can be server-side or build-time only; production app unchanged |
| localStorage quota exceeded during import | Low | Medium | Validate size before import, chunk large imports |
| Yellow timer race conditions | Medium | Medium | Single-threaded JS, but test concurrent toggle + timing change |
| Model calls tools before app initialized | Medium | Low | Adapter health check, wait for DOMContentLoaded |

---

## Success Criteria

- [ ] All 12 tools execute successfully via adapter
- [ ] All contract tests pass (idempotency, confirmation, dry-run)
- [ ] All validation tests pass (correct error codes)
- [ ] All security tests pass (no bypasses)
- [ ] Rate limiting enforced per tool category
- [ ] Audit log captures model-initiated actions
- [ ] Yellow timing persists across sessions
- [ ] Import/export round-trip preserves data
- [ ] No regression in existing UI functionality
- [ ] Test coverage > 90% for adapter, > 80% for integration