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
  const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

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
    const getState = () => clone(legacyApi.getState());

    function readColumn(column) {
      assertColumn(column);
      const state = getState();
      return clone(state.logs[column] || []);
    }

    function setLogEntry({ column, time, left, right, on, transition } = {}) {
      assertColumn(column);
      if (time !== undefined) assertTime(time);
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
      return clone(legacyApi.createLogEntry(column, data, time));
    }

    function setLight(light, desiredState) {
      const target = LIGHTS[light];
      if (!target) throw new TypeError('light must be blue-left, blue-right, yellow, or red');
      if (typeof desiredState !== 'boolean') throw new TypeError('state must be a boolean');
      const state = getState();
      const current = target.group ? state[target.group][target.key] : state[target.key];
      if (current !== desiredState) {
        if (light === 'yellow') legacyApi.processCommand('toggle yellow');
        else legacyApi[target.toggle]();
      }
      return { light, state: desiredState };
    }

    function deleteLogEntry(column, time) {
      assertColumn(column);
      assertTime(time);
      const entry = readColumn(column).find((item) => item.time === time);
      if (!entry) return false;
      return legacyApi.deleteLogEntry(column, entry.id);
    }

    function exportLogs(format = 'json') {
      if (!['json', 'csv'].includes(format)) throw new TypeError('format must be json or csv');
      const logs = Object.fromEntries(COLUMNS.map((column) => [column, readColumn(column)]));
      if (format === 'json') {
        return {
          filename: 'indicator-logs.json',
          mimeType: 'application/json',
          content: JSON.stringify(logs, null, 2)
        };
      }
      const rows = [['column', 'id', 'time', 'left', 'right', 'on', 'transition', 'createdAt', 'updatedAt']];
      for (const column of COLUMNS) {
        for (const entry of logs[column]) {
          rows.push([column, entry.id, entry.time, entry.left, entry.right, entry.on, entry.transition, entry.createdAt, entry.updatedAt]);
        }
      }
      return {
        filename: 'indicator-logs.csv',
        mimeType: 'text/csv;charset=utf-8',
        content: rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
      };
    }

    return Object.freeze({
      getState,
      getLightStatus: () => {
        const state = getState();
        return { blue: clone(state.blue), yellow: state.yellow, red: state.red };
      },
      getClockTime: () => String(getClockText()),
      readLogs: (column) => column === undefined
        ? Object.fromEntries(COLUMNS.map((name) => [name, readColumn(name)]))
        : readColumn(column),
      getTerminalHistory: () => clone(getState().terminalHistory || []),
      setLight,
      setLogEntry,
      deleteLogEntry,
      clearLogs: (column) => {
        assertColumn(column);
        legacyApi.clearLogs(column);
        return { column, cleared: true };
      },
      exportLogs
    });
  };
});
