/**
 * Input Validation for Tool Adapter
 * Uses Zod-like validation (simplified for no-build production)
 */

// Simple validation helpers (no external deps needed for production)
const validators = {
  string: (val) => typeof val === 'string',
  boolean: (val) => typeof val === 'boolean',
  number: (val) => typeof val === 'number' && !isNaN(val),
  integer: (val) => Number.isInteger(val),
  positiveInteger: (val) => Number.isInteger(val) && val > 0,
  nonEmptyString: (val) => typeof val === 'string' && val.length > 0,
  timeFormat: (val) => typeof val === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(val),
  enum: (val, allowed) => allowed.includes(val),
};

// Error codes
export const ERROR_CODES = {
  INVALID_ARGS: 'invalid_args',
  INVALID_COLUMN: 'invalid_column',
  INVALID_LIGHT: 'invalid_light',
  INVALID_DATA_SCHEMA: 'invalid_data_schema',
  INVALID_TIME_FORMAT: 'invalid_time_format',
  INVALID_TIME_VALUE: 'invalid_time_value',
  INVALID_BOUNDS: 'invalid_bounds',
  INVALID_FORMAT: 'invalid_format',
  INVALID_MODE: 'invalid_mode',
  INVALID_DATA_STRUCTURE: 'invalid_data_structure',
  ENTRY_NOT_FOUND: 'entry_not_found',
  CONFIRMATION_REQUIRED: 'confirmation_required',
  DRY_RUN_ONLY: 'dry_run_only',
  RATE_LIMITED: 'rate_limited',
  INTERNAL_ERROR: 'internal_error',
  STORAGE_ERROR: 'storage_error',
};

export class ValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Validate arguments against a schema
 * @param {Object} schema - Validation schema
 * @param {Object} args - Arguments to validate
 * @returns {Object} Validated/coerced arguments
 */
export function validateArgs(schema, args) {
  const errors = [];
  const result = {};

  for (const [key, rules] of Object.entries(schema)) {
    const value = args[key];
    const required = rules.required !== false;

    // Check required
    if (required && (value === undefined || value === null)) {
      errors.push({ field: key, message: 'Required field missing' });
      continue;
    }

    // Skip validation for optional undefined fields
    if (!required && (value === undefined || value === null)) {
      continue;
    }

    // Type validation
    if (rules.type && !validators[rules.type](value)) {
      errors.push({ field: key, message: `Expected ${rules.type}, got ${typeof value}` });
      continue;
    }

    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push({ field: key, message: `Must be one of: ${rules.enum.join(', ')}` });
      continue;
    }

    // Pattern validation
    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push({ field: key, message: `Invalid format` });
      continue;
    }

    // Min/max for numbers
    if (rules.type === 'number' || rules.type === 'integer') {
      if (rules.minimum !== undefined && value < rules.minimum) {
        errors.push({ field: key, message: `Must be >= ${rules.minimum}` });
        continue;
      }
      if (rules.maximum !== undefined && value > rules.maximum) {
        errors.push({ field: key, message: `Must be <= ${rules.maximum}` });
        continue;
      }
    }

    // Custom validator
    if (rules.validate && !rules.validate(value)) {
      errors.push({ field: key, message: rules.message || 'Validation failed' });
      continue;
    }

    result[key] = value;
  }

  // Check for extra fields (strict mode)
  const allowedKeys = Object.keys(schema);
  const extraKeys = Object.keys(args).filter(k => !allowedKeys.includes(k));
  if (extraKeys.length > 0) {
    errors.push({ field: extraKeys[0], message: 'Unexpected field' });
  }

  if (errors.length > 0) {
    throw new ValidationError(
      ERROR_CODES.INVALID_ARGS,
      `Validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join('; ')}`,
      { errors }
    );
  }

  return result;
}

// ============================================
// TOOL SCHEMAS
// ============================================

export const SCHEMAS = {
  get_light_status: {},

  get_clock_time: {},

  read_logs: {
    column: { type: 'string', enum: ['blue', 'yellow', 'red', 'all'], required: false },
    limit: { type: 'integer', minimum: 1, required: false },
    offset: { type: 'integer', minimum: 0, required: false },
  },

  get_terminal_history: {
    limit: { type: 'integer', minimum: 1, maximum: 100, required: false },
    offset: { type: 'integer', minimum: 0, required: false },
    filterType: { type: 'string', enum: ['command', 'output', 'error', 'info', 'all'], required: false },
  },

  toggle_light: {
    light: { type: 'string', enum: ['blue-left', 'blue-right', 'yellow', 'red'], required: true },
    state: { type: 'boolean', required: true },
  },

  // Needle 3 expanded create log entry schemas
  create_blue_log_entry: {
    time: { type: 'string', pattern: /^([01]\d|2[0-3]):([0-5]\d)$/, required: false },
    left: { type: 'boolean', required: true },
    right: { type: 'boolean', required: true },
  },

  create_yellow_log_entry: {
    time: { type: 'string', pattern: /^([01]\d|2[0-3]):([0-5]\d)$/, required: false },
    on: { type: 'boolean', required: true },
  },

  create_red_log_entry: {
    time: { type: 'string', pattern: /^([01]\d|2[0-3]):([0-5]\d)$/, required: false },
    transition: { type: 'string', enum: ['on-to-off', 'off-to-on'], required: true },
  },

  // Needle 3 expanded update log entry schemas
  update_blue_log_entry: {
    id: { type: 'string', validate: validators.nonEmptyString, required: true },
    left: { type: 'boolean', required: false },
    right: { type: 'boolean', required: false },
    time: { type: 'string', pattern: /^([01]\d|2[0-3]):([0-5]\d)$/, required: false },
  },

  update_yellow_log_entry: {
    id: { type: 'string', validate: validators.nonEmptyString, required: true },
    on: { type: 'boolean', required: false },
    time: { type: 'string', pattern: /^([01]\d|2[0-3]):([0-5]\d)$/, required: false },
  },

  update_red_log_entry: {
    id: { type: 'string', validate: validators.nonEmptyString, required: true },
    transition: { type: 'string', enum: ['on-to-off', 'off-to-on'], required: false },
    time: { type: 'string', pattern: /^([01]\d|2[0-3]):([0-5]\d)$/, required: false },
  },

  delete_log_entry: {
    column: { type: 'string', enum: ['blue', 'yellow', 'red'], required: true },
    id: { type: 'string', validate: validators.nonEmptyString, required: true },
    confirm: { type: 'boolean', required: false },
  },

  clear_logs: {
    column: { type: 'string', enum: ['blue', 'yellow', 'red'], required: true },
    confirm: { type: 'boolean', validate: (v) => v === true, required: true },
    dryRun: { type: 'boolean', required: false },
  },

  set_yellow_timing: {
    minMs: { type: 'integer', minimum: 1000, required: true },
    maxMs: { type: 'integer', maximum: 60000, required: true },
    confirm: { type: 'boolean', required: false },
  },

  export_logs: {
    format: { type: 'string', enum: ['json', 'csv'], required: false },
    includeMetadata: { type: 'boolean', required: false },
  },

  import_logs: {
    data: {
      type: 'object',
      validate: (v) => v && Array.isArray(v.blue) && Array.isArray(v.yellow) && Array.isArray(v.red),
      required: true,
    },
    mode: { type: 'string', enum: ['replace', 'merge'], required: false },
    confirm: { type: 'boolean', validate: (v) => v === true, required: true },
    dryRun: { type: 'boolean', required: false },
  },

  ping: {},
};

/**
 * Validate tool arguments
 * @param {string} toolName - Name of the tool
 * @param {Object} args - Arguments to validate
 * @returns {Object} Validated arguments
 */
export function validateToolArgs(toolName, args) {
  const schema = SCHEMAS[toolName];
  if (!schema) {
    throw new ValidationError(ERROR_CODES.INVALID_ARGS, `Unknown tool: ${toolName}`);
  }
  return validateArgs(schema, args);
}

/**
 * Validate import log entries
 * @param {Object} data - Import data
 * @returns {Object} Validation result with errors
 */
export function validateImportData(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push({ column: 'root', index: -1, error: 'Data must be an object', entry: data });
    return { valid: false, errors };
  }

  ['blue', 'yellow', 'red'].forEach(column => {
    if (!Array.isArray(data[column])) {
      errors.push({ column, index: -1, error: `${column} must be an array`, entry: data[column] });
      return;
    }

    data[column].forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        errors.push({ column, index, error: 'Entry must be an object', entry });
        return;
      }

      if (!entry.id || typeof entry.id !== 'string') {
        errors.push({ column, index, error: 'Missing or invalid id', entry });
      }

      if (!entry.time || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(entry.time)) {
        errors.push({ column, index, error: 'Invalid time format (HH:MM)', entry });
      }

      if (column === 'blue') {
        if (typeof entry.left !== 'boolean' || typeof entry.right !== 'boolean') {
          errors.push({ column, index, error: 'Blue entry requires boolean left and right', entry });
        }
      } else if (column === 'yellow') {
        if (typeof entry.on !== 'boolean') {
          errors.push({ column, index, error: 'Yellow entry requires boolean on', entry });
        }
      } else if (column === 'red') {
        if (!['on-to-off', 'off-to-on'].includes(entry.transition)) {
          errors.push({ column, index, error: 'Red entry requires valid transition', entry });
        }
      }
    });
  });

  return { valid: errors.length === 0, errors };
}