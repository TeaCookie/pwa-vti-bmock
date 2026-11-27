# IndicatorLights application API

The browser app exposes `window.IndicatorLights` as the supported integration boundary. Assistant tools must call this API and must not access application DOM nodes, localStorage keys, or private state directly.

The API is initialized after `app.js` and provides detached snapshots. Mutating methods validate their inputs and delegate to existing application operations so UI rendering, persistence, status text, and terminal feedback remain synchronized.

## Read operations

```js
IndicatorLights.getLightStatus();
// { blue: { left: boolean, right: boolean }, yellow: boolean, red: boolean }

IndicatorLights.getClockTime();
// { time: "14:30" } - the HH:MM value displayed in the app header

IndicatorLights.readLogs();        // { blue: Entry[], yellow: Entry[], red: Entry[] }
IndicatorLights.readLogs('blue');  // Entry[]
IndicatorLights.getTerminalHistory(); // detached array of stored terminal records
```

Every returned object or array is a snapshot. Mutating it does not mutate application state.

## Mutations

```js
IndicatorLights.setLight('red', true);
// { light, previousState, currentState }; accepted names: blue-left, blue-right, yellow, red

IndicatorLights.setLogEntry({ column: 'blue', left: true, right: false, time: '14:30' });
// { entry, action: "created" | "updated" }
IndicatorLights.setLogEntry({ column: 'yellow', on: true });
IndicatorLights.setLogEntry({ column: 'red', transition: 'off-to-on' });

IndicatorLights.deleteLogEntry('blue', '14:30');
// { success, column, time, deletedId? } or { success: false, reason: "not-found" | "ambiguous" }

IndicatorLights.clearLogs('red'); // { column, deletedCount }
```

Log writes use the existing upsert-by-time behavior. Blue entries require boolean `left` and `right`; yellow entries require boolean `on`; red entries require `transition` equal to `on-to-off` or `off-to-on`. Optional times must be 24-hour `HH:MM`. Unknown properties and fields belonging to another column are rejected. Invalid inputs throw `TypeError` before application state changes. Delete-by-time refuses ambiguous duplicate timestamps instead of deleting an arbitrary record.

## Export

```js
const result = IndicatorLights.exportLogs('json'); // default: json
// { format: "json", data: string, entryCounts: { blue, yellow, red, total } }
```

CSV is also supported with `exportLogs('csv')`. Export returns serialized data and counts; it does not trigger a download. Empty logs produce valid empty JSON or a header-only CSV.
