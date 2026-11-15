/**
 * Tool Adapter Configuration
 */

export const ADAPTER_CONFIG = {
  // Contract version
  contractVersion: '1.0.0',

  // Confirmation requirements
  requireConfirmForDelete: false,
  requireConfirmForYellowTiming: false,

  // Rate limiting (requests per window)
  rateLimit: {
    default: { requests: 30, windowMs: 60000 },      // 30/min default
    writeTools: { requests: 20, windowMs: 60000 },   // 20/min for writes
    bulkTools: { requests: 5, windowMs: 60000 },     // 5/min for clear/import
    readTools: { requests: 60, windowMs: 60000 },    // 60/min for reads
  },

  // Tool categorization for rate limiting
  toolCategories: {
    read: ['get_light_status', 'get_clock_time', 'read_logs', 'get_terminal_history', 'export_logs'],
    write: ['toggle_light', 'create_log_entry', 'update_log_entry', 'delete_log_entry', 'set_yellow_timing'],
    bulk: ['clear_logs', 'import_logs'],
    // Needle 3 expanded tools
    needleWrite: [
      'create_blue_log_entry', 'create_yellow_log_entry', 'create_red_log_entry',
      'update_blue_log_entry', 'update_yellow_log_entry', 'update_red_log_entry',
    ],
  },

  // Timeouts (ms)
  timeouts: {
    readTools: 5000,
    writeTools: 10000,
    bulkTools: 30000,
  },

  // Audit
  auditEnabled: true,
  auditPersistToStorage: false,
  auditMaxEntries: 1000,

  // Dry-run
  dryRunEnabled: true,

  // Validation
  strictValidation: true,

  // Default yellow timing
  defaultYellowTiming: { minMs: 5000, maxMs: 15000 },
};

/**
 * Get rate limit config for a tool
 */
export function getRateLimitConfig(toolName) {
  const { toolCategories, rateLimit } = ADAPTER_CONFIG;

  if (toolCategories.bulk.includes(toolName)) return rateLimit.bulkTools;
  if (toolCategories.write.includes(toolName) || toolCategories.needleWrite.includes(toolName)) return rateLimit.writeTools;
  if (toolCategories.read.includes(toolName)) return rateLimit.readTools;
  return rateLimit.default;
}

/**
 * Get timeout for a tool
 */
export function getTimeout(toolName) {
  const { toolCategories, timeouts } = ADAPTER_CONFIG;

  if (toolCategories.bulk.includes(toolName)) return timeouts.bulkTools;
  if (toolCategories.write.includes(toolName) || toolCategories.needleWrite.includes(toolName)) return timeouts.writeTools;
  return timeouts.readTools;
}

/**
 * Check if tool requires confirmation
 */
export function requiresConfirmation(toolName) {
  if (toolName === 'clear_logs' || toolName === 'import_logs') return true;
  if (toolName === 'delete_log_entry' && ADAPTER_CONFIG.requireConfirmForDelete) return true;
  if (toolName === 'set_yellow_timing' && ADAPTER_CONFIG.requireConfirmForYellowTiming) return true;
  return false;
}