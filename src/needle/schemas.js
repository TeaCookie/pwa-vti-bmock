/**
 * Needle 3 Tool Schemas (OpenAI Function Calling Format)
 * 16 tools expanded per column for Needle 3 compatibility
 */

import { NEEDLE_TOOL_NAMES, LIGHT_ENUMS, COLUMN_ENUMS, LOG_SCHEMAS } from './config.js';

/**
 * Base schema for all tools
 */
const baseSchema = {
  type: 'function',
  function: {
    name: '',
    description: '',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
};

/**
 * Create a tool schema
 */
function createToolSchema(name, description, properties, required = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

// ============================================
// READ TOOLS (4)
// ============================================

/** 1. get_light_status - Get current state of all indicator lights */
export const getLightStatusSchema = createToolSchema(
  NEEDLE_TOOL_NAMES.GET_LIGHT_STATUS,
  'Get the current on/off state of all three indicator lights (Blue split, Yellow, Red)',
  {},
  []
);

/** 2. get_clock_time - Get current time from digital clock */
export const getClockTimeSchema = createToolSchema(
  NEEDLE_TOOL_NAMES.GET_CLOCK_TIME,
  'Get the current time from the digital clock in HH:MM format',
  {},
  []
);

/** 3. read_logs - Retrieve log entries for one or all columns */
export const readLogsSchema = createToolSchema(
  NEEDLE_TOOL_NAMES.READ_LOGS,
  'Retrieve log entries for one or all columns (blue, yellow, red)',
  {
    column: {
      type: 'string',
      enum: [...COLUMN_ENUMS, 'all'],
      description: 'Which log column to read (default: all)',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      description: 'Maximum number of entries to return per column',
    },
    offset: {
      type: 'integer',
      minimum: 0,
      description: 'Number of entries to skip (for pagination)',
    },
  },
  []
);

/** 4. get_terminal_history - Retrieve terminal command history */
export const getTerminalHistorySchema = createToolSchema(
  NEEDLE_TOOL_NAMES.GET_TERMINAL_HISTORY,
  'Retrieve the terminal command history with optional filtering',
  {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      description: 'Maximum number of entries to return (default: 100)',
    },
    offset: {
      type: 'integer',
      minimum: 0,
      description: 'Number of entries to skip',
    },
    filterType: {
      type: 'string',
      enum: ['command', 'output', 'error', 'info', 'all'],
      description: 'Filter by entry type (default: all)',
    },
  },
  []
);

// ============================================
// WRITE TOOLS - LIGHTS (2)
// ============================================

/** 5. toggle_light - Set or toggle a specific indicator light */
export const toggleLightSchema = createToolSchema(
  NEEDLE_TOOL_NAMES.TOGGLE_LIGHT,
  'Set a specific indicator light to on or off. Idempotent - requires explicit state parameter.',
  {
    light: {
      type: 'string',
      enum: LIGHT_ENUMS,
      description: 'Which light to control',
    },
    state: {
      type: 'boolean',
      description: 'Target state: true = on, false = off (REQUIRED)',
    },
  },
  ['light', 'state']
);

/** 6. set_yellow_timing - Configure yellow light's automatic toggle interval */
export const setYellowTimingSchema = createToolSchema(
  NEEDLE_TOOL_NAMES.SET_YELLOW_TIMING,
  'Configure the yellow light\'s automatic random toggle interval range',
  {
    minMs: {
      type: 'integer',
      minimum: 1000,
      description: 'Minimum interval in milliseconds (>= 1000)',
    },
    maxMs: {
      type: 'integer',
      maximum: 60000,
      description: 'Maximum interval in milliseconds (<= 60000)',
    },
    confirm: {
      type: 'boolean',
      description: 'Confirmation flag (recommended)',
    },
  },
  ['minMs', 'maxMs']
);

// ============================================
// WRITE TOOLS - LOGS (10) - Expanded per column
// ============================================

/** 7. create_blue_log_entry - Create blue log entry */
export const createBlueLogEntrySchema = createToolSchema(
  NEEDLE_TOOL_NAMES.CREATE_BLUE_LOG_ENTRY,
  'Create a new manual log entry for the Blue light column (logs left/right/both/none state at a specific time)',
  {
    time: {
      type: 'string',
      pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
      description: 'Time in HH:MM format (default: current time)',
    },
    left: {
      type: 'boolean',
      description: 'Left half state',
    },
    right: {
      type: 'boolean',
      description: 'Right half state',
    },
  },
  ['left', 'right']
);

/** 8. create_yellow_log_entry - Create yellow log entry */
export const createYellowLogEntrySchema = createToolSchema(
  NEEDLE_TOOL_NAMES.CREATE_YELLOW_LOG_ENTRY,
  'Create a new manual log entry for the Yellow light column (logs on/off state at a specific time)',
  {
    time: {
      type: 'string',
      pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
      description: 'Time in HH:MM format (default: current time)',
    },
    on: {
      type: 'boolean',
      description: 'Yellow light state',
    },
  },
  ['on']
);

/** 9. create_red_log_entry - Create red log entry */
export const createRedLogEntrySchema = createToolSchema(
  NEEDLE_TOOL_NAMES.CREATE_RED_LOG_ENTRY,
  'Create a new manual log entry for the Red light column (logs state transition at a specific time)',
  {
    time: {
      type: 'string',
      pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
      description: 'Time in HH:MM format (default: current time)',
    },
    transition: {
      type: 'string',
      enum: ['on-to-off', 'off-to-on'],
      description: 'State transition type',
    },
  },
  ['transition']
);

/** 10. update_blue_log_entry - Update blue log entry */
export const updateBlueLogEntrySchema = createToolSchema(
  NEEDLE_TOOL_NAMES.UPDATE_BLUE_LOG_ENTRY,
  'Update an existing Blue log entry by ID (partial updates supported)',
  {
    id: {
      type: 'string',
      minLength: 1,
      description: 'Entry ID to update',
    },
    left: {
      type: 'boolean',
      description: 'Left half state',
    },
    right: {
      type: 'boolean',
      description: 'Right half state',
    },
    time: {
      type: 'string',
      pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
      description: 'New timestamp in HH:MM format (optional)',
    },
  },
  ['id']
);

/** 11. update_yellow_log_entry - Update yellow log entry */
export const updateYellowLogEntrySchema = createToolSchema(
  NEEDLE_TOOL_NAMES.UPDATE_YELLOW_LOG_ENTRY,
  'Update an existing Yellow log entry by ID (partial updates supported)',
  {
    id: {
      type: 'string',
      minLength: 1,
      description: 'Entry ID to update',
    },
    on: {
      type: 'boolean',
      description: 'Yellow light state',
    },
    time: {
      type: 'string',
      pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
      description: 'New timestamp in HH:MM format (optional)',
    },
  },
  ['id']
);

/** 12. update_red_log_entry - Update red log entry */
export const updateRedLogEntrySchema = createToolSchema(
  NEEDLE_TOOL_NAMES.UPDATE_RED_LOG_ENTRY,
  'Update an existing Red log entry by ID (partial updates supported)',
  {
    id: {
      type: 'string',
      minLength: 1,
      description: 'Entry ID to update',
    },
    transition: {
      type: 'string',
      enum: ['on-to-off', 'off-to-on'],
      description: 'State transition type',
    },
    time: {
      type: 'string',
      pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
      description: 'New timestamp in HH:MM format (optional)',
    },
  },
  ['id']
);

/** 13. delete_log_entry - Delete a log entry by ID */
export const deleteLogEntrySchema = createToolSchema(
  NEEDLE_TOOL_NAMES.DELETE_LOG_ENTRY,
  'Delete a single log entry by its ID',
  {
    column: {
      type: 'string',
      enum: COLUMN_ENUMS,
      description: 'Log column (blue, yellow, or red)',
    },
    id: {
      type: 'string',
      minLength: 1,
      description: 'Entry ID to delete',
    },
    confirm: {
      type: 'boolean',
      description: 'Confirmation flag (recommended)',
    },
  },
  ['column', 'id']
);

/** 14. clear_logs - Clear ALL log entries for a column */
export const clearLogsSchema = createToolSchema(
  NEEDLE_TOOL_NAMES.CLEAR_LOGS,
  'Clear ALL log entries for a specific column. Destructive bulk operation - requires explicit confirmation.',
  {
    column: {
      type: 'string',
      enum: COLUMN_ENUMS,
      description: 'Log column to clear (blue, yellow, or red)',
    },
    confirm: {
      type: 'boolean',
      const: true,
      description: 'MUST be explicitly true (mandatory confirmation)',
    },
    dryRun: {
      type: 'boolean',
      description: 'Preview without committing (optional)',
    },
  },
  ['column', 'confirm']
);

/** 15. export_logs - Export all log data as JSON or CSV */
export const exportLogsSchema = createToolSchema(
  NEEDLE_TOOL_NAMES.EXPORT_LOGS,
  'Export all log data as structured JSON or CSV',
  {
    format: {
      type: 'string',
      enum: ['json', 'csv'],
      description: 'Export format (default: json)',
    },
    includeMetadata: {
      type: 'boolean',
      description: 'Include createdAt/updatedAt timestamps (default: true)',
    },
  },
  []
);

/** 16. import_logs - Import log data from JSON */
export const importLogsSchema = createToolSchema(
  NEEDLE_TOOL_NAMES.IMPORT_LOGS,
  'Import log data from JSON, replacing or merging with existing logs. Destructive - requires explicit confirmation.',
  {
    data: {
      type: 'object',
      description: 'Log data to import',
      properties: {
        blue: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              time: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
              left: { type: 'boolean' },
              right: { type: 'boolean' },
              createdAt: { type: 'integer' },
              updatedAt: { type: 'integer' },
            },
            required: ['id', 'time', 'left', 'right'],
          },
        },
        yellow: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              time: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
              on: { type: 'boolean' },
              createdAt: { type: 'integer' },
              updatedAt: { type: 'integer' },
            },
            required: ['id', 'time', 'on'],
          },
        },
        red: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              time: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
              transition: { type: 'string', enum: ['on-to-off', 'off-to-on'] },
              createdAt: { type: 'integer' },
              updatedAt: { type: 'integer' },
            },
            required: ['id', 'time', 'transition'],
          },
        },
      },
      required: ['blue', 'yellow', 'red'],
    },
    mode: {
      type: 'string',
      enum: ['replace', 'merge'],
      description: 'Import mode (default: replace)',
    },
    confirm: {
      type: 'boolean',
      const: true,
      description: 'MUST be explicitly true (mandatory confirmation)',
    },
    dryRun: {
      type: 'boolean',
      description: 'Preview without committing (optional)',
    },
  },
  ['data', 'confirm']
);

// ============================================
// EXPORT ALL SCHEMAS
// ============================================

/** Array of all 16 Needle 3 tool schemas */
export const NEEDLE_3_TOOL_SCHEMAS = [
  // Read tools
  getLightStatusSchema,
  getClockTimeSchema,
  readLogsSchema,
  getTerminalHistorySchema,
  // Light write tools
  toggleLightSchema,
  setYellowTimingSchema,
  // Log write tools (expanded per column)
  createBlueLogEntrySchema,
  createYellowLogEntrySchema,
  createRedLogEntrySchema,
  updateBlueLogEntrySchema,
  updateYellowLogEntrySchema,
  updateRedLogEntrySchema,
  deleteLogEntrySchema,
  clearLogsSchema,
  exportLogsSchema,
  importLogsSchema,
];

/** Map of tool name to schema for quick lookup */
export const SCHEMA_MAP = Object.fromEntries(
  NEEDLE_3_TOOL_SCHEMAS.map(schema => [schema.function.name, schema])
);

/** Get schema by tool name */
export function getSchema(toolName) {
  return SCHEMA_MAP[toolName];
}

/** Get all tool names */
export function getToolNames() {
  return NEEDLE_3_TOOL_SCHEMAS.map(s => s.function.name);
}