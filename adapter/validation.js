(function attachAdapterValidation(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NeedleAdapterValidation = api;
})(typeof self !== 'undefined' ? self : globalThis, function createValidation() {
  'use strict';

  const { AdapterError } = typeof module !== 'undefined' && module.exports
    ? require('./errors.js') : self.NeedleAdapterErrors;

  const COLUMNS = ['blue', 'yellow', 'red'];
  const LIGHTS = ['blue-left', 'blue-right', 'yellow', 'red'];
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  const TRANSITIONS = ['on-to-off', 'off-to-on'];
  const FORMATS = ['json', 'csv'];

  function invalid(message, details) {
    throw new AdapterError('invalid_args', message, details);
  }

  function isRecord(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function assertObject(args) {
    if (!isRecord(args)) invalid('Tool arguments must be a JSON object.');
  }

  function assertKeys(args, allowed) {
    const unknown = Object.keys(args).filter((key) => !allowed.includes(key));
    if (unknown.length) invalid('Tool arguments contain unsupported properties.', { properties: unknown });
  }

  function required(args, names) {
    const missing = names.filter((name) => !Object.prototype.hasOwnProperty.call(args, name));
    if (missing.length) invalid('Required tool arguments are missing.', { properties: missing });
  }

  function oneOf(value, choices, name) {
    if (!choices.includes(value)) invalid(name + ' must be one of: ' + choices.join(', ') + '.');
  }

  function bool(value, name) {
    if (typeof value !== 'boolean') invalid(name + ' must be a boolean.');
  }

  function time(value) {
    if (typeof value !== 'string' || !TIME.test(value)) invalid('time must use local 24-hour HH:MM format.');
  }

  function validateArguments(name, input) {
    const args = input === undefined || input === null ? {} : input;
    assertObject(args);

    switch (name) {
      case 'get_light_status':
      case 'get_clock_time':
      case 'get_terminal_history':
        assertKeys(args, []);
        break;
      case 'read_logs':
        assertKeys(args, ['column']);
        if (Object.hasOwn(args, 'column')) oneOf(args.column, COLUMNS, 'column');
        break;
      case 'toggle_light':
        assertKeys(args, ['light', 'state']);
        required(args, ['light', 'state']);
        oneOf(args.light, LIGHTS, 'light');
        bool(args.state, 'state');
        break;
      case 'set_log_entry': {
        assertKeys(args, ['column', 'time', 'left', 'right', 'on', 'transition']);
        required(args, ['column']);
        oneOf(args.column, COLUMNS, 'column');
        if (Object.hasOwn(args, 'time')) time(args.time);
        const fields = args.column === 'blue' ? ['left', 'right']
          : args.column === 'yellow' ? ['on'] : ['transition'];
        const incompatible = ['left', 'right', 'on', 'transition'].filter((key) =>
          Object.hasOwn(args, key) && !fields.includes(key));
        if (incompatible.length) invalid('Log fields do not belong to the selected column.', { properties: incompatible });
        if (!fields.some((key) => Object.hasOwn(args, key))) {
          invalid('At least one state field for the selected log column is required.');
        }
        if (args.column === 'blue') {
          required(args, ['left', 'right']);
          bool(args.left, 'left');
          bool(args.right, 'right');
        } else if (args.column === 'yellow') {
          required(args, ['on']);
          bool(args.on, 'on');
        } else {
          required(args, ['transition']);
          oneOf(args.transition, TRANSITIONS, 'transition');
        }
        break;
      }
      case 'delete_log_entry':
        assertKeys(args, ['column', 'time']);
        required(args, ['column', 'time']);
        oneOf(args.column, COLUMNS, 'column');
        time(args.time);
        break;
      case 'clear_logs':
        assertKeys(args, ['column']);
        required(args, ['column']);
        oneOf(args.column, COLUMNS, 'column');
        break;
      case 'export_logs':
        assertKeys(args, ['format']);
        if (Object.hasOwn(args, 'format')) oneOf(args.format, FORMATS, 'format');
        break;
      default:
        throw new AdapterError('unknown_tool', 'This tool is not supported.');
    }

    return Object.freeze({ ...args });
  }

  return Object.freeze({ validateArguments, COLUMNS: Object.freeze(COLUMNS.slice()), TIME_PATTERN: TIME });
});
