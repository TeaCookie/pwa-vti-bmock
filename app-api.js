(function attachIndicatorLightsApi(root, factory) {
  const createApi = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = createApi;
  if (root) root.createIndicatorLightsApi = createApi;
})(typeof window !== 'undefined' ? window : globalThis, function createFactory() {
  'use strict';

  const COLUMNS = ['blue', 'yellow', 'red'];
  const LIGHTS = {
    'blue-left': { group: 'blue', key: 'left', toggle: 'toggleBlueLeft' },
    'blue-right': { group: 'blue', key: 'right', toggle: 'toggleBlueRight' },
    yellow: { group: null, key: 'yellow', toggle: null },
    red: { group: null, key: 'red', toggle: 'toggleRed' }
  };
  const TIME_PATTERN = /^([01]\\d|2[0-3]):[0-5]\\d$/;
  const LOG_FIELDS = new Set(['column', 'time', 'left', 'right', 'on', 'transition']);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function assertColumn(column) {
    if (!COLUMNS.includes(column)) throw new TypeError('column must be blue, yellow, or red');
  }

  function assertTime(time) {
    if (typeof time !== 'string' || !TIME_PATTERN.test(time)) {
      throw new TypeError('time must use 24-hour HH:MM format');
    }
  }

  function csvCell(value) {
    const text = value == null ? '' : String(value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  return function createIndicatorLightsApi(legacyApi, options = {}) {
    if (!legacyApi || typeof legacyApi.getState !== 'function') {
      throw new TypeError('An initialized IndicatorLights API is required');
    }
    const getClockText = options.getClockText || (() => '');
    const runCommand = options.runCommand || ((command) => legacyApi.processCommand(command));
    const getState = () => clone(legacyApi.getState());

    function readColumn(column) {
      assertColumn(column);
      return clone(getState().logs[column] || []);
    }

    function setLogEntry(args = {}) {
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        throw new TypeError('log entry arguments must be an object');
      }
      for (const key of Object.keys(args)) {
        if (!LOG_FIELDS.has(key)) throw new TypeError('unsupported log entry property: ' + key);
      }
      const { column, time, left, right, on, transition } = args;
      assertColumn(column);
      if (time !== undefined) assertTime(time);

      const suppliedFields = column === 'blue' ? ['left', 'right']
        : column === 'yellow' ? ['on'] : ['transition'];
      const incompatibleFields = column === 'blue' ? ['on', 'transition']
        : column === 'yellow' ? ['left', 'right', 'transition'] : ['left', 'right', 'on'];
      if (incompatibleFields.some((key) => Object.hasOwn(args, key))) {
        throw new TypeError('log entry contains fields that do not belong to the ' + column + ' column');
      }
      if (!suppliedFields.some((key) => Object.hasOwn(args, key))) {
        throw new TypeError('at least one ' + column + ' log data field is required');
      }

      const data = {};
      if (column === 'blue') {
        if (typeof left !== 'boolean' || typeof right !== 'boolean') {
          throw new TypeError('blue entries require boolean left and right fields');
        }
        data.left = left;
        data.right = right;
      } else if (column === 'yellow') {
        if (typeof on !== 'boolean') throw new TypeError('yellow entries require a boolean on field');
        data.on = on;
      } else {
        if (!['on-to-off', 'off-to-on'].includes(transition)) {
          throw new TypeError('red entries require transition on-to-off or off-to-on');
        }
        data.transition = transition;
      }

      const entryTime = time === undefined ? String(getClockText()) : time;
      if (!TIME_PATTERN.test(entryTime)) throw new TypeError('current clock must use HH:MM format');
      const existed = readColumn(column).some((entry) => entry.time === entryTime);
      const entry = legacyApi.createLogEntry(column, data, time);
      return { entry: clone(entry), action: existed ? 'updated' : 'created' };
    }

    function setLight(light, desiredState) {
      const target = LIGHTS[light];
      if (!target) throw new TypeError('light must be blue-left, blue-right, yellow, or red');
      if (typeof desiredState !== 'boolean') throw new TypeError('state must be a boolean');
      const state = getState();
      const previousState = target.group ? state[target.group][target.key] : state[target.key];
      if (previousState !== desiredState) {
        if (light === 'yellow') runCommand('toggle yellow');
        else legacyApi[target.toggle]();
      }
      return { light, previousState, currentState: desiredState };
    }

    function deleteLogEntry(column, time) {
      assertColumn(column);
      assertTime(time);
      const matches = readColumn(column).filter((entry) => entry.time === time);
      if (matches.length === 0) return { success: false, reason: 'not-found', column, time };
      if (matches.length > 1) return { success: false, reason: 'ambiguous', column, time };
      const deleted = legacyApi.deleteLogEntry(column, matches[0].id);
      return deleted
        ? { success: true, column, time, deletedId: matches[0].id }
        : { success: false, reason: 'not-found', column, time };
    }

    function clearLogs(column) {
      assertColumn(column);
      const deletedCount = readColumn(column).length;
      legacyApi.clearLogs(column);
      return { column, deletedCount };
    }

    function exportLogs(format = 'json') {
      if (!['json', 'csv'].includes(format)) throw new TypeError('format must be json or csv');
      const logs = Object.fromEntries(COLUMNS.map((column) => [column, readColumn(column)]));
      const entryCounts = Object.fromEntries(COLUMNS.map((column) => [column, logs[column].length]));
      entryCounts.total = COLUMNS.reduce((total, column) => total + entryCounts[column], 0);
      if (format === 'json') {
        return { format, data: JSON.stringify(logs, null, 2), entryCounts };
      }
      const rows = [['column', 'id', 'time', 'left', 'right', 'on', 'transition', 'createdAt', 'updatedAt']];
      for (const column of COLUMNS) {
        for (const entry of logs[column]) {
          rows.push([column, entry.id, entry.time, entry.left, entry.right, entry.on, entry.transition, entry.createdAt, entry.updatedAt]);
        }
      }
      return { format, data: rows.map((row) => row.map(csvCell).join(',')).join('\\r\\n'), entryCounts };
    }

    return Object.freeze({
      getState,
      getLightStatus: () => {
        const state = getState();
        return { blue: clone(state.blue), yellow: state.yellow, red: state.red };
      },
      getClockTime: () => ({ time: String(getClockText()) }),
      readLogs: (column) => column === undefined
        ? Object.fromEntries(COLUMNS.map((name) => [name, readColumn(name)]))
        : readColumn(column),
      getTerminalHistory: () => clone(getState().terminalHistory || []),
      setLight,
      setLogEntry,
      deleteLogEntry,
      clearLogs,
      exportLogs
    });
  };
});
