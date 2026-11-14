# Tool Test Plan - Indicator Lights PWA

**Version**: 1.0.0  
**Contract Version**: 1.0.0  
**Adapter Version**: 1.0.0

---

## Overview

This test plan covers all 12 tools defined in the tool contract. Tests are organized by category:
- **Positive Tests** - Valid inputs produce expected results
- **Negative Tests** - Invalid inputs produce expected errors
- **Security Tests** - Authorization, validation bypass, injection attempts
- **Failure Tests** - Timeouts, rate limits, storage errors, concurrent access
- **Contract Tests** - Idempotency, confirmation enforcement, dry-run behavior

**Test Environment**: 
- Browser: Chrome/Firefox/Safari latest
- localStorage: Available, ~5MB quota
- Application: Loaded via `index.html` (no build step)

---

## Test Infrastructure

### Test Utilities
```typescript
// Test harness helpers
const testUtils = {
  // Reset application state to clean slate
  async resetApp(): Promise<void>,
  
  // Direct access to internal state for verification
  getState(): AppState,
  
  // Execute tool via adapter
  executeTool<T>(tool: string, args: any): Promise<ToolResult<T> | ToolError>,
  
  // Wait for async operations (localStorage, timers)
  waitFor(ms: number): Promise<void>,
  
  // Mock time for clock tests
  mockTime(date: Date): void,
  restoreTime(): void,
};
```

### Test Data Fixtures
```typescript
const fixtures = {
  // Valid log entries per column
  blueEntry: { column: "blue" as const, data: { left: true, right: false }, time: "14:30" },
  yellowEntry: { column: "yellow" as const, data: { on: true }, time: "09:15" },
  redEntry: { column: "red" as const, data: { transition: "on-to-off" as const }, time: "18:00" },
  
  // Valid light states
  lights: ["blue-left", "blue-right", "yellow", "red"] as const,
  
  // Valid time strings
  validTimes: ["00:00", "12:30", "23:59", "09:05"],
  
  // Invalid time strings
  invalidTimes: ["24:00", "12:60", "9:30", "14-30", "abc", ""],
};
```

---

## Tool-Specific Test Cases

### 1. `get_light_status`

#### Positive Tests
| ID | Description | Expected |
|----|-------------|----------|
| GL-01 | Call with no args | Returns `{ blue: {left, right}, yellow, red }` all booleans |
| GL-02 | After toggling blue-left on | `blue.left === true` |
| GL-03 | After toggling yellow on | `yellow === true` |
| GL-04 | After toggling red on | `red === true` |
| GL-05 | Fresh app load | All lights `false` |

#### Negative Tests
| ID | Description | Expected |
|----|-------------|----------|
| GL-N01 | Pass unexpected args | `invalid_args` error (extra fields rejected) |

#### Security Tests
| ID | Description | Expected |
|----|-------------|----------|
| GL-S01 | Called rapidly (100x) | All succeed, no rate limit (read tool) |

#### Failure Tests
| ID | Description | Expected |
|----|-------------|----------|
| GL-F01 | App state corrupted | Returns current state (best effort) |

---

### 2. `get_clock_time`

#### Positive Tests
| ID | Description | Expected |
|----|-------------|----------|
| GC-01 | Call with no args | Returns `{ time: "HH:MM", dateTime: string, timezone: string }` |
| GC-02 | Time format validation | `time` matches `/^([01]\d|2[0-3]):([0-5]\d)$/` |
| GC-03 | Timezone present | `timezone` is valid IANA identifier |

#### Negative Tests
| ID | Description | Expected |
|----|-------------|----------|
| GC-N01 | Pass unexpected args | `invalid_args` error |

---

### 3. `read_logs`

#### Positive Tests
| ID | Description | Expected |
|----|-------------|----------|
| RL-01 | `column: "all"` (default) | Returns all 3 columns with `totalCount` |
| RL-02 | `column: "blue"` | Returns `{ entries: BlueLogEntry[], totalCount }` |
| RL-03 | `column: "yellow"` | Returns YellowLogEntry[] |
| RL-04 | `column: "red"` | Returns RedLogEntry[] |
| RL-05 | With `limit: 5` | Returns max 5 entries per column |
| RL-06 | With `offset: 2` | Skips first 2 entries |
| RL-07 | Combined limit + offset | Correct pagination |
| RL-08 | Empty logs | Returns empty arrays, counts = 0 |
| RL-09 | After creating entries | Returns entries with correct schema |

#### Negative Tests
| ID | Description | Expected |
|----|-------------|----------|
| RL-N01 | `column: "invalid"` | `invalid_column` error |
| RL-N02 | `limit: -1` | `invalid_args` (positive integer) |
| RL-N03 | `limit: 0` | `invalid_args` (positive integer) |
| RL-N04 | `offset: -1` | `invalid_args` |
| RL-N05 | Extra fields in args | `invalid_args` |

#### Contract Tests
| ID | Description | Expected |
|----|-------------|----------|
| RL-C01 | Idempotency - call twice | Identical results |
| RL-C02 | Result shape matches contract | All required fields present |

---

### 4. `get_terminal_history`

#### Positive Tests
| ID | Description | Expected |
|----|-------------|----------|
| TH-01 | Default (no args) | Returns up to 100 entries, `totalCount` |
| TH-02 | `limit: 10` | Returns max 10 entries |
| TH-03 | `offset: 5` | Skips first 5 |
| TH-04 | `filterType: "command"` | Only command entries |
| TH-05 | `filterType: "error"` | Only error entries |
| TH-06 | `filterType: "output"` | Only output entries |
| TH-07 | `filterType: "info"` | Only info entries |
| TH-08 | Fresh app | Contains welcome messages |

#### Negative Tests
| ID | Description | Expected |
|----|-------------|----------|
| TH-N01 | `filterType: "invalid"` | `invalid_args` |
| TH-N02 | `limit: -1` | `invalid_args` |

#### Contract Tests
| ID | Description | Expected |
|----|-------------|----------|
| TH-C01 | Idempotency | Identical results for same args |

---

### 5. `toggle_light`

#### Positive Tests
| ID | Description | Expected |
|----|-------------|----------|
| TL-01 | `light: "blue-left", state: true` | Returns previous=false, current=true |
| TL-02 | `light: "blue-left", state: false` | Returns previous=true, current=false |
| TL-03 | `light: "blue-right", state: true` | Blue right on |
| TL-04 | `light: "yellow", state: true` | Yellow on |
| TL-05 | `light: "red", state: true` | Red on |
| TL-06 | Toggle same state twice | Second call: previous=current (idempotent) |
| TL-07 | Verify UI updates | DOM `.on` class matches state |
| TL-08 | Verify terminal history | New entry appended |
| TL-09 | Verify status text | Footer status updated |

#### Negative Tests
| ID | Description | Expected |
|----|-------------|----------|
| TL-N01 | `light: "invalid"` | `invalid_light` error |
| TL-N02 | `state: "true"` (string) | `invalid_args` / `invalid_state` |
| TL-N03 | `state` omitted | `invalid_args` (required) |
| TL-N04 | `light` omitted | `invalid_args` (required) |
| TL-N05 | Extra fields | `invalid_args` |

#### Security Tests
| ID | Description | Expected |
|----|-------------|----------|
| TL-S01 | Rapid toggle (50x/sec) | Rate limited after threshold |
| TL-S02 | Model retries on timeout | Idempotent - no double-toggle |

#### Contract Tests
| ID | Description | Expected |
|----|-------------|----------|
| TL-C01 | Idempotent with same state | No state flip on retry |
| TL-C02 | `action` not needed (not upsert) | N/A |

#### Failure Tests
| ID | Description | Expected |
|----|-------------|----------|
| TL-F01 | localStorage quota exceeded | `storage_error`, retryable |
| TL-F02 | DOM element missing | `internal_error` |

---

### 6. `create_log_entry`

#### Positive Tests
| ID | Description | Expected |
|----|-------------|----------|
| CL-01 | Blue: `{left:true, right:false}`, time="14:30" | `action: "created"`, entry matches |
| CL-02 | Yellow: `{on:true}`, time="09:15" | Entry with `on: true` |
| CL-03 | Red: `{transition:"off-to-on"}`, time="18:00" | Entry with transition |
| CL-04 | Time omitted | Uses current clock time |
| CL-05 | Blue both sides on | `{left:true, right:true}` |
| CL-06 | Blue none | `{left:false, right:false}` |
| CL-07 | Yellow off | `{on:false}` |
| CL-08 | Red on-to-off | `{transition:"on-to-off"}` |
| CL-09 | Verify persistence | Entry in localStorage after reload |
| CL-10 | Verify UI render | Entry appears in log column |
| CL-11 | Verify terminal history | "Log created: BLUE at 14:30" |

#### Negative Tests
| ID | Description | Expected |
|----|-------------|----------|
| CL-N01 | `column: "invalid"` | `invalid_column` |
| CL-N02 | Blue: missing `left` field | `invalid_data_schema` |
| CL-N03 | Blue: `left: "true"` (string) | `invalid_data_schema` |
| CL-N04 | Yellow: missing `on` field | `invalid_data_schema` |
| CL-N05 | Red: `transition: "invalid"` | `invalid_data_schema` |
| CL-N06 | `time: "24:00"` | `invalid_time_value` |
| CL-N07 | `time: "12:60"` | `invalid_time_value` |
| CL-N08 | `time: "9:30"` (no leading zero) | `invalid_time_format` |
| CL-N09 | `time: "14-30"` | `invalid_time_format` |
| CL-N10 | Extra fields in data | `invalid_args` |

#### Contract Tests
| ID | Description | Expected |
|----|-------------|----------|
| CL-C01 | Upsert: same time twice | First `action: "created"`, second `action: "updated"` |
| CL-C02 | Upsert: different data same time | Second call updates data, preserves ID? (check impl) |
| CL-C03 | Result shape matches contract | All required fields |

#### Security Tests
| ID | Description | Expected |
|----|-------------|----------|
| CL-S01 | Rapid create (100 entries) | Rate limited |
| CL-S02 | Very long time string | Rejected by regex |
| CL-S03 | Injection in data fields | Treated as boolean, no injection |

#### Failure Tests
| ID | Description | Expected |
|----|-------------|----------|
| CL-F01 | localStorage full | `storage_error`, retryable |
| CL-F02 | localStorage unavailable | `storage_error` |

---

### 7. `update_log_entry`

#### Positive Tests
| ID | Description | Expected |
|----|-------------|----------|
| UL-01 | Update Blue `left: false → true` | Entry updated, `updatedAt` set |
| UL-02 | Update Yellow `on: true → false` | Entry updated |
| UL-03 | Update Red `transition` | Entry updated |
| UL-04 | Update `time` field | Timestamp changed, entry repositioned |
| UL-05 | Partial update (only one field) | Other fields preserved |
| UL-06 | Verify persistence | Updated entry in localStorage |
| UL-07 | Verify UI | Log column re-rendered |

#### Negative Tests
| ID | Description | Expected |
|----|-------------|----------|
| UL-N01 | `id: "nonexistent"` | `entry_not_found` |
| UL-N02 | `column: "invalid"` | `invalid_column` |
| UL-N03 | Blue: `left: "true"` (string) | `invalid_data_schema` |
| UL-N04 | `time: "invalid"` | `invalid_time_format` |
| UL-N05 | Empty `data` object | `invalid_args` (no fields to update) |

#### Contract Tests
| ID | Description | Expected |
|----|-------------|----------|
| UL-C01 | Idempotent: same update twice | Second call returns same result |
| UL-C02 | Result shape matches contract | All required fields |

#### Security Tests
| ID | Description | Expected |
|----|-------------|----------|
| UL-S01 | Update with ID traversal attempt | `entry_not_found` (no traversal) |

---

### 8. `delete_log_entry`

#### Positive Tests
| ID | Description | Expected |
|----|-------------|----------|
| DL-01 | Delete existing entry | `success: true`, entry removed |
| DL-02 | Verify persistence | Entry gone from localStorage |
| DL-03 | Verify UI | Log column re-rendered |
| DL-04 | Verify terminal history | "Log deleted: BLUE {id}" |
| DL-05 | With `confirm: true` | Succeeds |

#### Negative Tests
| ID | Description | Expected |
|----|-------------|----------|
| DL-N01 | `id: "nonexistent"` | `entry_not_found` |
| DL-N02 | `column: "invalid"` | `invalid_column` |
| DL-N03 | Without `confirm` (if required) | `confirmation_required` |

#### Contract Tests
| ID | Description | Expected |
|----|-------------|----------|
| DL-C01 | Idempotent: delete twice | First `success: true`, second `success: false` |
| DL-C02 | Result shape | `{ success, deletedId }` |

#### Security Tests
| ID | Description | Expected |
|----|-------------|----------|
| DL-S01 | Delete all entries rapidly | Rate limited |

---

### 9. `clear_logs`

#### Positive Tests
| ID | Description | Expected |
|----|-------------|----------|
| CLR-01 | Clear blue with `confirm: true` | `deletedCount > 0`, logs empty |
| CLR-02 | Clear yellow | All yellow entries gone |
| CLR-03 | Clear red | All red entries gone |
| CLR-04 | Clear already-empty column | `deletedCount: 0` |
| CLR-05 | Verify persistence | Column empty in localStorage |
| CLR-06 | Verify UI | "No entries yet" message |
| CLR-07 | Verify terminal history | "Logs cleared: BLUE" |

#### Negative Tests
| ID | Description | Expected |
|----|-------------|----------|
| CLR-N01 | `confirm: false` | `confirmation_required` |
| CLR-N02 | `confirm` omitted | `confirmation_required` |
| CLR-N03 | `confirm: "true"` (string) | `invalid_args` / `confirmation_required` |
| CLR-N04 | `column: "invalid"` | `invalid_column` |

#### Dry-Run Tests
| ID | Description | Expected |
|----|-------------|----------|
| CLR-D01 | `dryRun: true, confirm: true` | Returns `deletedCount`, no mutation |
| CLR-D02 | Verify no mutation after dryRun | Logs unchanged |
| CLR-D03 | `dryRun: true` without confirm | `confirmation_required` (confirm still needed) |

#### Contract Tests
| ID | Description | Expected |
|----|-------------|----------|
| CLR-C01 | Idempotent: clear twice | Second call `deletedCount: 0` |

#### Security Tests
| ID | Description | Expected |
|----|-------------|----------|
| CLR-S01 | Attempt without confirm | Rejected |
| CLR-S02 | Rapid clear calls | Rate limited (bulk tool limit) |

---

### 10. `set_yellow_timing`

#### Positive Tests
| ID | Description | Expected |
|----|-------------|----------|
| YT-01 | `minMs: 10000, maxMs: 20000` | Returns previous/current bounds |
| YT-02 | Verify timer reset | Next toggle uses new range |
| YT-03 | Same values twice | Idempotent, no timer thrash |
| YT-04 | With `confirm: true` | Succeeds |

#### Negative Tests
| ID | Description | Expected |
|----|-------------|----------|
| YT-N01 | `minMs: 500` (< 1000) | `invalid_bounds` |
| YT-N02 | `maxMs: 70000` (> 60000) | `invalid_bounds` |
| YT-N03 | `minMs: 10000, maxMs: 5000` (min >= max) | `invalid_bounds` |
| YT-N04 | `minMs: 0` | `invalid_bounds` |
| YT-N05 | Non-integer values | `invalid_args` |

#### Contract Tests
| ID | Description | Expected |
|----|-------------|----------|
| YT-C01 | Idempotent | Same values = no change |

---

### 11. `export_logs`

#### Positive Tests
| ID | Description | Expected |
|----|-------------|----------|
| EX-01 | Default (JSON) | Returns JSON string with all 3 columns |
| EX-02 | `format: "json"` | Valid JSON, parseable |
| EX-03 | `format: "csv"` | Returns CSV text with headers |
| EX-04 | CSV structure | Columns: column,id,time,data...,createdAt,updatedAt |
| EX-05 | `includeMetadata: false` | Excludes createdAt/updatedAt |
| EX-06 | `includeMetadata: true` (default) | Includes metadata |
| EX-07 | Empty logs | Valid empty JSON/CSV |
| EX-08 | Entry counts correct | `entryCounts.total` matches sum |

#### Negative Tests
| ID | Description | Expected |
|----|-------------|----------|
| EX-N01 | `format: "xml"` | `invalid_format` |

#### Contract Tests
| ID | Description | Expected |
|----|-------------|----------|
| EX-C01 | Idempotent | Identical output for same state |

---

### 12. `import_logs`

#### Positive Tests (Replace Mode)
| ID | Description | Expected |
|----|-------------|----------|
| IM-01 | Valid JSON, `mode: "replace", confirm: true` | All logs replaced, counts match |
| IM-02 | Verify persistence | New data in localStorage |
| IM-03 | Verify UI | All columns re-rendered |
| IM-04 | Empty import | All logs cleared |

#### Positive Tests (Merge Mode)
| ID | Description | Expected |
|----|-------------|----------|
| IM-05 | Merge new entries | New IDs added, existing preserved |
| IM-06 | Merge updates existing | Same ID → updated data |
| IM-07 | Merge mixed | Some new, some updated |

#### Negative Tests
| ID | Description | Expected |
|----|-------------|----------|
| IM-N01 | `confirm: false` | `confirmation_required` |
| IM-N02 | `confirm` omitted | `confirmation_required` |
| IM-N03 | `mode: "invalid"` | `invalid_mode` |
| IM-N04 | Missing `blue` array | `invalid_data_structure` |
| IM-N05 | Blue entry missing `left` field | `errors` array with details |
| IM-N06 | Yellow entry invalid `on` type | `errors` array |
| IM-N07 | Red entry invalid `transition` | `errors` array |
| IM-N08 | Invalid time format in entry | `errors` array |

#### Dry-Run Tests
| ID | Description | Expected |
|----|-------------|----------|
| IM-D01 | `dryRun: true, confirm: true` | Returns `imported` counts, `errors`, no mutation |
| IM-D02 | Verify no mutation after dryRun | Original logs unchanged |
| IM-D03 | Dry-run with errors | Returns errors, no mutation |

#### Contract Tests
| ID | Description | Expected |
|----|-------------|----------|
| IM-C01 | Replace mode idempotent | Same import twice = same result |
| IM-C02 | Merge mode idempotent | Same merge twice = same result |

#### Security Tests
| ID | Description | Expected |
|----|-------------|----------|
| IM-S01 | Import with malicious script in data | Treated as string/boolean, no execution |
| IM-S02 | Huge import (10k entries) | Rate limited or timeout |

---

## Cross-Tool Tests

### Concurrency Tests
| ID | Description | Expected |
|----|-------------|----------|
| CT-01 | Model reads while user clicks light | Read returns consistent state |
| CT-02 | Model creates log while user deletes | Both operations succeed, final state correct |
| CT-03 | Rapid toggle + read | No race conditions |

### State Consistency Tests
| ID | Description | Expected |
|----|-------------|----------|
| SC-01 | Create log → read_logs → verify | Entry present |
| SC-02 | Toggle light → get_light_status → verify | State matches |
| SC-03 | Update log → read_logs → verify | Updated fields present |
| SC-04 | Delete log → read_logs → verify | Entry gone |
| SC-05 | Clear logs → read_logs → verify | Column empty |

### Persistence Tests
| ID | Description | Expected |
|----|-------------|----------|
| PS-01 | Create log → reload page → read_logs | Entry persists |
| PS-02 | Toggle light → reload → get_light_status | Light state persists? (check: lights NOT persisted) |
| PS-03 | Terminal history → reload → get_terminal_history | History persists |
| PS-04 | Yellow timing → reload → timing | Timing NOT persisted (current impl) |

---

## Security Test Suite

### Input Validation Bypass Attempts
| ID | Tool | Attack Vector | Expected |
|----|------|---------------|----------|
| SV-01 | All | Prototype pollution (`__proto__`) | Rejected by schema |
| SV-02 | All | Constructor pollution | Rejected |
| SV-03 | create_log_entry | XSS in time field | Rejected by regex |
| SV-04 | create_log_entry | XSS in boolean fields | Type coercion prevents |
| SV-05 | import_logs | Large payload (DoS) | Rate limited / timeout |
| SV-06 | import_logs | Circular JSON | Rejected by parser |

### Authorization Tests (Future Multi-User)
| ID | Description | Expected |
|----|-------------|----------|
| AZ-01 | No auth context provided | Single-user: allowed |
| AZ-02 | Cross-user data access | N/A (single-user) |

---

## Failure & Resilience Tests

### Timeout Tests
| ID | Tool | Scenario | Expected |
|----|------|----------|----------|
| FT-01 | All | Adapter timeout (5s read, 10s write) | `internal_error`, retryable |
| FT-02 | clear_logs | Large dataset (1000 entries) | Completes within 30s bulk timeout |

### Rate Limiting Tests
| ID | Tool | Scenario | Expected |
|----|------|----------|----------|
| RL-01 | toggle_light | 25 calls in 1 minute | First 20 succeed, then `rate_limited` |
| RL-02 | create_log_entry | 25 calls in 1 minute | Rate limited |
| RL-03 | clear_logs | 10 calls in 1 minute | First 5 succeed, then `rate_limited` |
| RL-04 | get_light_status | 70 calls in 1 minute | First 60 succeed, then `rate_limited` |
| RL-05 | Rate limit reset | Wait windowMs + retry | Succeeds |

### Storage Error Tests
| ID | Tool | Scenario | Expected |
|----|------|----------|----------|
| SE-01 | create_log_entry | localStorage quota exceeded | `storage_error`, retryable |
| SE-02 | clear_logs | localStorage unavailable | `storage_error` |
| SE-03 | import_logs | localStorage full mid-import | `storage_error`, partial state? |

### Network/Offline Tests (PWA)
| ID | Description | Expected |
|----|-------------|----------|
| NW-01 | App offline, model calls tools | Tools work (local only) |
| NW-02 | Online after offline | Sync not applicable (no server) |

---

## Test Execution Strategy

### Test Order
1. **Smoke tests** - All positive paths for each tool (12 tests)
2. **Validation tests** - All negative/validation cases (~60 tests)
3. **Contract tests** - Idempotency, confirmation, dry-run (~15 tests)
4. **Security tests** - Injection, bypass, DoS (~10 tests)
5. **Failure tests** - Timeouts, rate limits, storage (~15 tests)
6. **Cross-tool tests** - Concurrency, state consistency, persistence (~10 tests)

**Total**: ~122 test cases

### Automation
- **Framework**: Vitest (runs in browser via WebContainer or Playwright)
- **CI**: Run on every commit
- **Coverage target**: 90%+ for adapter logic, 80%+ for app integration

### Test Data Management
- Each test gets fresh app state via `resetApp()`
- localStorage cleared between tests
- Timers mocked for deterministic timing tests

### Flaky Test Mitigation
- No async timing dependencies (use `waitFor` with conditions)
- Mock `Date.now()` for time-sensitive tests
- Isolate rate limiter per test (reset between tests)

---

## Test Reporting

### Required Outputs
- Pass/fail per test case
- Coverage report (lines, branches, functions)
- Performance benchmarks (tool latency p50, p95, p99)
- Rate limit behavior verification

### Acceptance Criteria
- All positive tests pass
- All negative tests produce correct error codes
- All contract tests verify idempotency/confirmation
- No security test bypasses validation
- Rate limiting enforced correctly
- < 100ms p95 latency for read tools
- < 500ms p95 latency for write tools

---

## Future Test Extensions

### When Multi-User Support Added
- Cross-tenant access tests
- Authentication token validation tests
- Permission boundary tests

### When Backend Added
- Server-side validation tests
- Sync/conflict resolution tests
- Offline queue tests

### When Audit Log Exposed
- Audit completeness tests
- Tamper detection tests