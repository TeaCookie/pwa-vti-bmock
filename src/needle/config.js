/**
 * Needle 3 Configuration
 * Central configuration for Needle 3 WASM model integration
 */

export const NEEDLE_CONFIG = {
  // Model
  modelUrl: "https://huggingface.co/Cactus-Compute/needle3/resolve/main/needle3.cact",
  modelCacheKey: "needle3-model",
  modelFilename: "needle3.cact",

  // Inference
  maxTokens: 512,
  temperature: 0.0,  // Greedy for tool calling
  seed: 0,
  constrained: true,

  // v3 specific
  depth: 20,  // Full 20 layers
  int8KvCache: true,  // 2.3 MB vs 8.8 MB

  // Behavior
  confidenceThreshold: 0.5,  // Below this → clarification
  maxToolCallsPerTurn: 3,

  // Timeouts
  modelLoadTimeout: 60000,
  inferenceTimeout: 120000, // 2 minutes for worker inference

  // Cache
  cacheName: 'needle-models',
  useIndexedDB: true,
};

// Tool name mappings for Needle 3 (16 tools)
export const NEEDLE_TOOL_NAMES = {
  // Read tools (4)
  GET_LIGHT_STATUS: 'get_light_status',
  GET_CLOCK_TIME: 'get_clock_time',
  READ_LOGS: 'read_logs',
  GET_TERMINAL_HISTORY: 'get_terminal_history',

  // Write tools - Lights (2)
  TOGGLE_LIGHT: 'toggle_light',
  SET_YELLOW_TIMING: 'set_yellow_timing',

  // Write tools - Logs (10) - Expanded per column for Needle 3
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

// Light enum for toggle_light
export const LIGHT_ENUMS = ['blue-left', 'blue-right', 'yellow', 'red'];

// Column enums
export const COLUMN_ENUMS = ['blue', 'yellow', 'red'];

// Log data schemas per column
export const LOG_SCHEMAS = {
  blue: {
    left: { type: 'boolean' },
    right: { type: 'boolean' },
  },
  yellow: {
    on: { type: 'boolean' },
  },
  red: {
    transition: { type: 'string', enum: ['on-to-off', 'off-to-on'] },
  },
};