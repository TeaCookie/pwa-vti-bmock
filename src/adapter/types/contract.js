/**
 * JavaScript Types for Tool Contract
 * Generated from TOOL_CONTRACT.md
 * (TypeScript types converted to JSDoc for browser compatibility)
 */

// ============================================
// CONTRACT VERSION
// ============================================

/**
 * @type {string}
 */
export const CONTRACT_VERSION = '1.0.0';

// ============================================
// TOOL NAMES (Contract - 12 tools)
// ============================================

/**
 * @type {Object<string, string>}
 */
export const TOOL_NAMES = {
  GET_LIGHT_STATUS: 'get_light_status',
  GET_CLOCK_TIME: 'get_clock_time',
  READ_LOGS: 'read_logs',
  GET_TERMINAL_HISTORY: 'get_terminal_history',
  TOGGLE_LIGHT: 'toggle_light',
  CREATE_LOG_ENTRY: 'create_log_entry',
  UPDATE_LOG_ENTRY: 'update_log_entry',
  DELETE_LOG_ENTRY: 'delete_log_entry',
  CLEAR_LOGS: 'clear_logs',
  SET_YELLOW_TIMING: 'set_yellow_timing',
  EXPORT_LOGS: 'export_logs',
  IMPORT_LOGS: 'import_logs',
};

// Freeze to prevent accidental modification
Object.freeze(TOOL_NAMES);

// ============================================
// NEEDLE 3 TOOL NAMES (16 tools - expanded per column)
// ============================================

/**
 * @type {Object<string, string>}
 */
export const NEEDLE_TOOL_NAMES = {
  // Read tools
  GET_LIGHT_STATUS: 'get_light_status',
  GET_CLOCK_TIME: 'get_clock_time',
  READ_LOGS: 'read_logs',
  GET_TERMINAL_HISTORY: 'get_terminal_history',

  // Light write tools
  TOGGLE_LIGHT: 'toggle_light',
  SET_YELLOW_TIMING: 'set_yellow_timing',

  // Log write tools (expanded per column)
  CREATE_BLUE_LOG_ENTRY: 'create_blue_log_entry',
  CREATE_YELLOW_LOG_ENTRY: 'create_yellow_log_entry',
  CREATE_RED_LOG_ENTRY: 'create_red_log_entry',
  UPDATE_BLUE_LOG_ENTRY: 'update_blue_log_entry',
  UPDATE_YELLOW_LOG_ENTRY: 'update_yellow_log_entry',
  UPDATE_RED_LOG_ENTRY: 'update_red_log_entry',
  DELETE_LOG_ENTRY: 'delete_log_entry',
  CLEAR_LOGS: 'clear_logs',
  EXPORT_LOGS: 'export_logs',
  IMPORT_LOGS: 'import_logs',
};

Object.freeze(NEEDLE_TOOL_NAMES);

// ============================================
// ENUM VALUES (for reference)
// ============================================

/**
 * @type {string[]}
 */
export const LIGHT_ENUMS = ['blue-left', 'blue-right', 'yellow', 'red'];

/**
 * @type {string[]}
 */
export const COLUMN_ENUMS = ['blue', 'yellow', 'red'];

/**
 * @type {string[]}
 */
export const LOG_TRANSITION_ENUMS = ['on-to-off', 'off-to-on'];

/**
 * @type {string[]}
 */
export const EXPORT_FORMAT_ENUMS = ['json', 'csv'];

/**
 * @type {string[]}
 */
export const IMPORT_MODE_ENUMS = ['replace', 'merge'];

/**
 * @type {string[]}
 */
export const TERMINAL_FILTER_TYPE_ENUMS = ['command', 'output', 'error', 'info', 'all'];

/**
 * @type {string[]}
 */
export const TOOL_TYPE_ENUMS = ['read', 'write'];

// ============================================
// ERROR CODES
// ============================================

/**
 * @type {string[]}
 */
export const ERROR_CODES = [
  'invalid_args',
  'invalid_column',
  'invalid_light',
  'invalid_data_schema',
  'invalid_time_format',
  'invalid_time_value',
  'invalid_bounds',
  'invalid_format',
  'invalid_mode',
  'invalid_data_structure',
  'entry_not_found',
  'confirmation_required',
  'dry_run_only',
  'rate_limited',
  'internal_error',
  'storage_error',
];

// ============================================
// TYPE DEFINITIONS (as JSDoc for documentation)
// ============================================

/**
 * @typedef {Object} GetLightStatusArgs
 * @property {} - No arguments
 */

/**
 * @typedef {Object} GetClockTimeArgs
 * @property {} - No arguments
 */

/**
 * @typedef {Object} ReadLogsArgs
 * @property {string} [column] - 'blue' | 'yellow' | 'red' | 'all'
 * @property {number} [limit] - Max entries per column
 * @property {number} [offset] - Pagination offset
 */

/**
 * @typedef {Object} GetTerminalHistoryArgs
 * @property {number} [limit] - Max entries (default 100)
 * @property {number} [offset] - Pagination offset
 * @property {string} [filterType] - 'command' | 'output' | 'error' | 'info' | 'all'
 */

/**
 * @typedef {Object} ToggleLightArgs
 * @property {string} light - 'blue-left' | 'blue-right' | 'yellow' | 'red'
 * @property {boolean} state - Target state (required)
 */

/**
 * @typedef {Object} CreateLogEntryArgs
 * @property {string} column - 'blue' | 'yellow' | 'red'
 * @property {string} [time] - HH:MM format
 * @property {Object} data - Column-specific data
 */

/**
 * @typedef {Object} BlueLogData
 * @property {boolean} left
 * @property {boolean} right
 */

/**
 * @typedef {Object} YellowLogData
 * @property {boolean} on
 */

/**
 * @typedef {Object} RedLogData
 * @property {string} transition - 'on-to-off' | 'off-to-on'
 */

/**
 * @typedef {Object} UpdateLogEntryArgs
 * @property {string} column - 'blue' | 'yellow' | 'red'
 * @property {string} id - Entry ID
 * @property {Object} [data] - Partial column data
 * @property {string} [time] - HH:MM format
 */

/**
 * @typedef {Object} DeleteLogEntryArgs
 * @property {string} column - 'blue' | 'yellow' | 'red'
 * @property {string} id - Entry ID
 * @property {boolean} [confirm] - Confirmation flag
 */

/**
 * @typedef {Object} ClearLogsArgs
 * @property {string} column - 'blue' | 'yellow' | 'red'
 * @property {boolean} confirm - MUST be true
 * @property {boolean} [dryRun] - Preview only
 */

/**
 * @typedef {Object} SetYellowTimingArgs
 * @property {number} minMs - Minimum interval (>= 1000)
 * @property {number} maxMs - Maximum interval (<= 60000)
 * @property {boolean} [confirm] - Confirmation flag
 */

/**
 * @typedef {Object} ExportLogsArgs
 * @property {string} [format] - 'json' | 'csv'
 * @property {boolean} [includeMetadata] - Include timestamps
 */

/**
 * @typedef {Object} ImportLogsArgs
 * @property {Object} data - {blue: [], yellow: [], red: []}
 * @property {string} [mode] - 'replace' | 'merge'
 * @property {boolean} confirm - MUST be true
 * @property {boolean} [dryRun] - Preview only
 */

/**
 * @typedef {Object} BlueLogEntry
 * @property {string} id
 * @property {string} time - HH:MM
 * @property {boolean} left
 * @property {boolean} right
 * @property {number} createdAt
 * @property {number} [updatedAt]
 */

/**
 * @typedef {Object} YellowLogEntry
 * @property {string} id
 * @property {string} time - HH:MM
 * @property {boolean} on
 * @property {number} createdAt
 * @property {number} [updatedAt]
 */

/**
 * @typedef {Object} RedLogEntry
 * @property {string} id
 * @property {string} time - HH:MM
 * @property {string} transition - 'on-to-off' | 'off-to-on'
 * @property {number} createdAt
 * @property {number} [updatedAt]
 */

/**
 * @typedef {Object} TerminalHistoryEntry
 * @property {string} text
 * @property {string} type - 'command' | 'output' | 'error' | 'info'
 * @property {number} time
 */

/**
 * @typedef {Object} ImportError
 * @property {string} column - 'blue' | 'yellow' | 'red'
 * @property {number} index
 * @property {string} error
 * @property {any} entry
 */

/**
 * @typedef {Object} ToolError
 * @property {string} code - Error code from ERROR_CODES
 * @property {string} message
 * @property {any} [details]
 * @property {boolean} retryable
 */

/**
 * @typedef {Object} AuthContext
 * @property {string} [userId]
 * @property {string} [sessionId]
 * @property {string} source - 'user' | 'model'
 * @property {number} timestamp
 */

/**
 * @typedef {Object} ToolDefinition
 * @property {string} type - 'read' | 'write'
 * @property {Function} handler
 * @property {boolean} [requiresConfirm]
 */