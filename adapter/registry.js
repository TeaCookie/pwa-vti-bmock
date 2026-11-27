(function attachAdapterRegistry(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NeedleAdapterRegistry = api;
})(typeof self !== 'undefined' ? self : globalThis, function createRegistryModule() {
  'use strict';

  const { AdapterError } = typeof module !== 'undefined' && module.exports
    ? require('./errors.js') : self.NeedleAdapterErrors;
  const { requireConfirmation } = typeof module !== 'undefined' && module.exports
    ? require('./confirmations.js') : self.NeedleAdapterConfirmations;

  const COLUMNS = Object.freeze(['blue', 'yellow', 'red']);
  const REQUIRED_METHODS = [
    'getLightStatus', 'getClockTime', 'readLogs', 'getTerminalHistory',
    'setLight', 'setLogEntry', 'deleteLogEntry', 'clearLogs', 'exportLogs'
  ];

  // Reads are deliberately bounded because the assistant panel is not a bulk
  // data viewer. Full-fidelity exports remain available through export_logs.
  const MAX_LOG_ENTRIES_PER_COLUMN = 100;
  const MAX_TERMINAL_ENTRIES = 100;
  const MAX_TERMINAL_TEXT_LENGTH = 2000;
  const MAX_EXPORT_CHARACTERS = 256 * 1024;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(freezeDeep);
    return value;
  }

  function projectLogEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new AdapterError('app_invalid_response', 'The application returned an invalid log entry.');
    }
    const output = {};
    for (const key of ['id', 'time', 'left', 'right', 'on', 'transition', 'createdAt', 'updatedAt']) {
      if (!Object.prototype.hasOwnProperty.call(entry, key)) continue;
      const value = entry[key];
      if (typeof value === 'string') output[key] = value.slice(0, 128);
      else if (typeof value === 'boolean') output[key] = value;
      else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
    }
    return output;
  }

  function projectTerminalEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new AdapterError('app_invalid_response', 'The application returned an invalid terminal entry.');
    }
    return {
      text: typeof entry.text === 'string' ? entry.text.slice(0, MAX_TERMINAL_TEXT_LENGTH) : '',
      type: typeof entry.type === 'string' ? entry.type.slice(0, 32) : 'output',
      ...(typeof entry.time === 'number' && Number.isFinite(entry.time) ? { time: entry.time } : {})
    };
  }

  function readLogs(appApi, column) {
    const selected = column === undefined ? COLUMNS : [column];
    const columns = {};
    let totalCount = 0;
    let returnedCount = 0;
    let truncated = false;

    for (const name of selected) {
      const entries = appApi.readLogs(name);
      if (!Array.isArray(entries)) {
        throw new AdapterError('app_invalid_response', 'The application returned an invalid log collection.');
      }
      totalCount += entries.length;
      const bounded = entries.slice(0, MAX_LOG_ENTRIES_PER_COLUMN).map(projectLogEntry);
      columns[name] = bounded;
      returnedCount += bounded.length;
      if (entries.length > bounded.length) truncated = true;
    }

    return {
      ...(column === undefined ? { columns } : { column, entries: columns[column] }),
      totalCount,
      returnedCount,
      truncated,
      limitPerColumn: MAX_LOG_ENTRIES_PER_COLUMN
    };
  }

  function createRegistry(appApi, options = {}) {
    if (!appApi || REQUIRED_METHODS.some((name) => typeof appApi[name] !== 'function')) {
      throw new AdapterError('app_unavailable', 'The application tool API is not ready.');
    }

    const confirmAction = options.confirmAction;

    // Fixed closures form the only model-visible route into the app API.
    const registry = {
      get_light_status: async () => appApi.getLightStatus(),
      get_clock_time: async () => appApi.getClockTime(),
      read_logs: async (args) => readLogs(appApi, args.column),
      get_terminal_history: async () => {
        const history = appApi.getTerminalHistory();
        if (!Array.isArray(history)) {
          throw new AdapterError('app_invalid_response', 'The application returned invalid terminal history.');
        }
        const entries = history.slice(-MAX_TERMINAL_ENTRIES).map(projectTerminalEntry);
        return {
          entries,
          totalCount: history.length,
          returnedCount: entries.length,
          truncated: history.length > entries.length,
          limit: MAX_TERMINAL_ENTRIES
        };
      },
      toggle_light: async (args) => appApi.setLight(args.light, args.state),
      set_log_entry: async (args) => {
        const result = appApi.setLogEntry(args);
        if (!result || !result.entry || !['created', 'updated'].includes(result.action)) {
          throw new AdapterError('app_invalid_response', 'The application returned an invalid log-write result.');
        }
        return { entry: projectLogEntry(result.entry), action: result.action };
      },
      delete_log_entry: async (args) => {
        const entries = appApi.readLogs(args.column);
        if (!Array.isArray(entries)) {
          throw new AdapterError('app_invalid_response', 'The application returned an invalid log collection.');
        }
        const matches = entries.filter((entry) => entry && entry.time === args.time);
        if (matches.length !== 1) {
          throw new AdapterError('stale_target', 'The requested log entry is missing or ambiguous. Nothing was deleted.');
        }

        // Keep an immutable snapshot so a changed entry cannot be deleted after
        // the asynchronous confirmation prompt has been displayed.
        const target = freezeDeep(clone(matches[0]));
        await requireConfirmation(confirmAction, {
          tool: 'delete_log_entry',
          column: args.column,
          time: args.time,
          entry: target
        });

        const current = appApi.readLogs(args.column);
        const currentMatches = Array.isArray(current)
          ? current.filter((entry) => entry && entry.time === args.time) : [];
        if (currentMatches.length !== 1 || JSON.stringify(currentMatches[0]) !== JSON.stringify(target)) {
          throw new AdapterError('stale_target', 'The log entry changed before confirmation completed. Nothing was deleted.');
        }
        return appApi.deleteLogEntry(args.column, args.time);
      },
      clear_logs: async (args) => {
        const before = appApi.readLogs(args.column);
        if (!Array.isArray(before)) {
          throw new AdapterError('app_invalid_response', 'The application returned an invalid log collection.');
        }
        const snapshot = JSON.stringify(before);
        await requireConfirmation(confirmAction, {
          tool: 'clear_logs',
          column: args.column,
          deletedCount: before.length
        });
        const current = appApi.readLogs(args.column);
        if (!Array.isArray(current) || JSON.stringify(current) !== snapshot) {
          throw new AdapterError('stale_target', 'The log column changed before confirmation completed. Nothing was cleared.');
        }
        return appApi.clearLogs(args.column);
      },
      export_logs: async (args) => {
        const result = appApi.exportLogs(args.format);
        if (!result || typeof result.data !== 'string' || !result.entryCounts ||
            !['json', 'csv'].includes(result.format)) {
          throw new AdapterError('app_invalid_response', 'The application returned an invalid export result.');
        }
        if (result.data.length > MAX_EXPORT_CHARACTERS) {
          throw new AdapterError('result_too_large', 'The export is too large to return in the assistant panel.');
        }
        return {
          format: result.format,
          data: result.data,
          entryCounts: {
            blue: result.entryCounts.blue,
            yellow: result.entryCounts.yellow,
            red: result.entryCounts.red,
            total: result.entryCounts.total
          }
        };
      }
    };

    return Object.freeze(registry);
  }

  return Object.freeze({
    createRegistry,
    TOOL_NAMES: Object.freeze([
      'get_light_status', 'get_clock_time', 'read_logs', 'get_terminal_history',
      'toggle_light', 'set_log_entry', 'delete_log_entry', 'clear_logs', 'export_logs'
    ]),
    LIMITS: Object.freeze({
      maxLogEntriesPerColumn: MAX_LOG_ENTRIES_PER_COLUMN,
      maxTerminalEntries: MAX_TERMINAL_ENTRIES,
      maxTerminalTextLength: MAX_TERMINAL_TEXT_LENGTH,
      maxExportCharacters: MAX_EXPORT_CHARACTERS
    })
  });
});
