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

  const REQUIRED_METHODS = [
    'getLightStatus', 'getClockTime', 'readLogs', 'getTerminalHistory',
    'setLight', 'setLogEntry', 'deleteLogEntry', 'clearLogs', 'exportLogs'
  ];

  function createRegistry(appApi, options = {}) {
    if (!appApi || REQUIRED_METHODS.some((name) => typeof appApi[name] !== 'function')) {
      throw new AdapterError('app_unavailable', 'The application tool API is not ready.');
    }

    const confirmAction = options.confirmAction;

    // Keep every model-visible name mapped to a fixed closure. Never resolve a
    // model-provided method name or property path against the application API.
    const registry = {
      get_light_status: async () => appApi.getLightStatus(),
      get_clock_time: async () => appApi.getClockTime(),
      read_logs: async (args) => args.column === undefined
        ? appApi.readLogs() : appApi.readLogs(args.column),
      get_terminal_history: async () => appApi.getTerminalHistory(),
      toggle_light: async (args) => appApi.setLight(args.light, args.state),
      set_log_entry: async (args) => appApi.setLogEntry(args),
      delete_log_entry: async (args) => {
        const entries = appApi.readLogs(args.column);
        const matches = entries.filter((entry) => entry && entry.time === args.time);
        if (matches.length !== 1) return appApi.deleteLogEntry(args.column, args.time);

        const target = matches[0];
        await requireConfirmation(confirmAction, {
          tool: 'delete_log_entry',
          column: args.column,
          time: args.time,
          entry: target
        });

        // Re-resolve after the asynchronous confirmation. A stale or ambiguous
        // target is never deleted.
        const current = appApi.readLogs(args.column).filter((entry) => entry && entry.time === args.time);
        if (current.length !== 1 || current[0].id !== target.id) {
          throw new AdapterError('stale_target', 'The log entry changed before confirmation completed. Nothing was deleted.');
        }
        return appApi.deleteLogEntry(args.column, args.time);
      },
      clear_logs: async (args) => {
        const before = appApi.readLogs(args.column);
        await requireConfirmation(confirmAction, {
          tool: 'clear_logs',
          column: args.column,
          deletedCount: before.length
        });
        const current = appApi.readLogs(args.column);
        if (JSON.stringify(current) !== JSON.stringify(before)) {
          throw new AdapterError('stale_target', 'The log column changed before confirmation completed. Nothing was cleared.');
        }
        return appApi.clearLogs(args.column);
      },
      export_logs: async (args) => appApi.exportLogs(args.format)
    };

    return Object.freeze(registry);
  }

  return Object.freeze({ createRegistry, TOOL_NAMES: Object.freeze([
    'get_light_status', 'get_clock_time', 'read_logs', 'get_terminal_history',
    'toggle_light', 'set_log_entry', 'delete_log_entry', 'clear_logs', 'export_logs'
  ]) });
});
