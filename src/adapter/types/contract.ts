/**
 * TypeScript Types for Tool Contract
 * Generated from TOOL_CONTRACT.md
 */

// ============================================
// BASE TYPES
// ============================================

export type LightName = 'blue-left' | 'blue-right' | 'yellow' | 'red';
export type ColumnName = 'blue' | 'yellow' | 'red';
export type LogTransition = 'on-to-off' | 'off-to-on';
export type ExportFormat = 'json' | 'csv';
export type ImportMode = 'replace' | 'merge';
export type TerminalFilterType = 'command' | 'output' | 'error' | 'info' | 'all';
export type ToolType = 'read' | 'write';

// ============================================
// TOOL ARGUMENTS
// ============================================

export interface GetLightStatusArgs {}

export interface GetClockTimeArgs {}

export interface ReadLogsArgs {
  column?: ColumnName | 'all';
  limit?: number;
  offset?: number;
}

export interface GetTerminalHistoryArgs {
  limit?: number;
  offset?: number;
  filterType?: TerminalFilterType;
}

export interface ToggleLightArgs {
  light: LightName;
  state: boolean;
}

export interface CreateLogEntryArgs {
  column: ColumnName;
  time?: string; // HH:MM
  data: BlueLogData | YellowLogData | RedLogData;
}

export interface BlueLogData {
  left: boolean;
  right: boolean;
}

export interface YellowLogData {
  on: boolean;
}

export interface RedLogData {
  transition: LogTransition;
}

export interface UpdateLogEntryArgs {
  column: ColumnName;
  id: string;
  data?: Partial<BlueLogData | YellowLogData | RedLogData>;
  time?: string; // HH:MM
}

export interface DeleteLogEntryArgs {
  column: ColumnName;
  id: string;
  confirm?: boolean;
}

export interface ClearLogsArgs {
  column: ColumnName;
  confirm: true; // MANDATORY
  dryRun?: boolean;
}

export interface SetYellowTimingArgs {
  minMs: number;
  maxMs: number;
  confirm?: boolean;
}

export interface ExportLogsArgs {
  format?: ExportFormat;
  includeMetadata?: boolean;
}

export interface ImportLogsArgs {
  data: {
    blue: BlueLogEntry[];
    yellow: YellowLogEntry[];
    red: RedLogEntry[];
  };
  mode?: ImportMode;
  confirm: true; // MANDATORY
  dryRun?: boolean;
}

// ============================================
// TOOL RESULTS
// ============================================

export interface GetLightStatusResult {
  blue: { left: boolean; right: boolean };
  yellow: boolean;
  red: boolean;
}

export interface GetClockTimeResult {
  time: string; // HH:MM
  dateTime: string; // Full locale datetime
  timezone: string; // IANA timezone
}

export interface ReadLogsResult {
  blue: BlueLogEntry[];
  yellow: YellowLogEntry[];
  red: RedLogEntry[];
  totalCount: { blue: number; yellow: number; red: number };
}

export interface GetTerminalHistoryResult {
  entries: TerminalHistoryEntry[];
  totalCount: number;
}

export interface ToggleLightResult {
  light: LightName;
  previousState: boolean;
  currentState: boolean;
}

export interface CreateLogEntryResult {
  entry: BlueLogEntry | YellowLogEntry | RedLogEntry;
  action: 'created' | 'updated';
}

export interface UpdateLogEntryResult {
  entry: BlueLogEntry | YellowLogEntry | RedLogEntry;
}

export interface DeleteLogEntryResult {
  success: boolean;
  deletedId: string;
}

export interface ClearLogsResult {
  column: ColumnName;
  deletedCount: number;
  dryRun: boolean;
}

export interface SetYellowTimingResult {
  previousMinMs: number;
  previousMaxMs: number;
  currentMinMs: number;
  currentMaxMs: number;
}

export interface ExportLogsResult {
  format: ExportFormat;
  data: string;
  entryCounts: { blue: number; yellow: number; red: number; total: number };
  exportedAt: number;
}

export interface ImportLogsResult {
  mode: ImportMode;
  imported: { blue: number; yellow: number; red: number; total: number };
  errors: ImportError[];
  dryRun: boolean;
}

// ============================================
// LOG ENTRY TYPES
// ============================================

export interface BlueLogEntry {
  id: string;
  time: string; // HH:MM
  left: boolean;
  right: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface YellowLogEntry {
  id: string;
  time: string; // HH:MM
  on: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface RedLogEntry {
  id: string;
  time: string; // HH:MM
  transition: LogTransition;
  createdAt: number;
  updatedAt?: number;
}

// ============================================
// TERMINAL
// ============================================

export interface TerminalHistoryEntry {
  text: string;
  type: 'command' | 'output' | 'error' | 'info';
  time: number;
}

// ============================================
// IMPORT
// ============================================

export interface ImportError {
  column: ColumnName;
  index: number;
  error: string;
  entry: any;
}

// ============================================
// ERROR TYPES
// ============================================

export type ErrorCode =
  | 'invalid_args'
  | 'invalid_column'
  | 'invalid_light'
  | 'invalid_data_schema'
  | 'invalid_time_format'
  | 'invalid_time_value'
  | 'invalid_bounds'
  | 'invalid_format'
  | 'invalid_mode'
  | 'invalid_data_structure'
  | 'entry_not_found'
  | 'confirmation_required'
  | 'dry_run_only'
  | 'rate_limited'
  | 'internal_error'
  | 'storage_error';

export interface ToolError {
  code: ErrorCode;
  message: string;
  details?: any;
  retryable: boolean;
}

export interface ToolResult<T = any> {
  success: true;
  data: T;
}

// ============================================
// TOOL DEFINITIONS
// ============================================

export interface ToolDefinition {
  type: ToolType;
  handler: ToolHandler;
  requiresConfirm?: boolean;
}

export type ToolHandler = (args: any, context: AuthContext) => Promise<any>;

export interface AuthContext {
  userId?: string;
  sessionId?: string;
  source: 'user' | 'model';
  timestamp: number;
}

// ============================================
// CONTRACT VERSION
// ============================================

export const CONTRACT_VERSION = '1.0.0';

// Tool names
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
} as const;

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];

// Needle 3 expanded tool names (16 tools)
export const NEEDLE_TOOL_NAMES = {
  GET_LIGHT_STATUS: 'get_light_status',
  GET_CLOCK_TIME: 'get_clock_time',
  READ_LOGS: 'read_logs',
  GET_TERMINAL_HISTORY: 'get_terminal_history',
  TOGGLE_LIGHT: 'toggle_light',
  SET_YELLOW_TIMING: 'set_yellow_timing',
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
  PING: 'ping',
} as const;

export type NeedleToolName = typeof NEEDLE_TOOL_NAMES[keyof typeof NEEDLE_TOOL_NAMES];