/**
 * Tool Adapter - Main Entry Point
 * Central adapter that routes tool calls to handlers with validation, rate limiting, audit logging
 */

import { ADAPTER_CONFIG } from './config.js';
import { getRateLimiter, resetRateLimiter } from './rateLimit.js';
import { getAuditLogger, resetAuditLogger } from './audit.js';
import { normalizeError, ToolError, isRetryable } from './errors.js';
import { validateToolArgs } from './validation.js';
import { withErrorNormalization } from './errors.js';
import { CONTRACT_VERSION, TOOL_NAMES, NEEDLE_TOOL_NAMES } from './types/contract.js';

// Import all tool handlers
import {
  handleGetLightStatus,
  handleToggleLight,
  handleSetYellowTiming,
} from './tools/lights.js';

import { handleGetClockTime } from './tools/clock.js';

import { handleGetTerminalHistory } from './tools/terminal.js';

import {
  handleReadLogs,
  handleCreateBlueLogEntry,
  handleCreateYellowLogEntry,
  handleCreateRedLogEntry,
  handleUpdateBlueLogEntry,
  handleUpdateYellowLogEntry,
  handleUpdateRedLogEntry,
  handleDeleteLogEntry,
  handleClearLogs,
  handleExportLogs,
  handleImportLogs,
} from './tools/logs.js';

import { handleHealthCheck, handlePing } from './tools/system.js';

// ============================================
// TOOL REGISTRY
// ============================================

// Contract tools (12 tools)
const CONTRACT_TOOL_REGISTRY = {
  [TOOL_NAMES.GET_LIGHT_STATUS]: { type: 'read', handler: handleGetLightStatus },
  [TOOL_NAMES.GET_CLOCK_TIME]: { type: 'read', handler: handleGetClockTime },
  [TOOL_NAMES.READ_LOGS]: { type: 'read', handler: handleReadLogs },
  [TOOL_NAMES.GET_TERMINAL_HISTORY]: { type: 'read', handler: handleGetTerminalHistory },
  [TOOL_NAMES.TOGGLE_LIGHT]: { type: 'write', handler: handleToggleLight },
  [TOOL_NAMES.CREATE_LOG_ENTRY]: { type: 'write', handler: handleCreateLogEntryUnified },
  [TOOL_NAMES.UPDATE_LOG_ENTRY]: { type: 'write', handler: handleUpdateLogEntryUnified },
  [TOOL_NAMES.DELETE_LOG_ENTRY]: { type: 'write', handler: handleDeleteLogEntry },
  [TOOL_NAMES.CLEAR_LOGS]: { type: 'write', handler: handleClearLogs, requiresConfirm: true },
  [TOOL_NAMES.SET_YELLOW_TIMING]: { type: 'write', handler: handleSetYellowTiming },
  [TOOL_NAMES.EXPORT_LOGS]: { type: 'read', handler: handleExportLogs },
  [TOOL_NAMES.IMPORT_LOGS]: { type: 'write', handler: handleImportLogs, requiresConfirm: true },
};

// Needle 3 expanded tools (16 tools)
const NEEDLE_TOOL_REGISTRY = {
  // Read tools (same as contract)
  [NEEDLE_TOOL_NAMES.GET_LIGHT_STATUS]: { type: 'read', handler: handleGetLightStatus },
  [NEEDLE_TOOL_NAMES.GET_CLOCK_TIME]: { type: 'read', handler: handleGetClockTime },
  [NEEDLE_TOOL_NAMES.READ_LOGS]: { type: 'read', handler: handleReadLogs },
  [NEEDLE_TOOL_NAMES.GET_TERMINAL_HISTORY]: { type: 'read', handler: handleGetTerminalHistory },

  // Light write tools
  [NEEDLE_TOOL_NAMES.TOGGLE_LIGHT]: { type: 'write', handler: handleToggleLight },
  [NEEDLE_TOOL_NAMES.SET_YELLOW_TIMING]: { type: 'write', handler: handleSetYellowTiming },

  // Log write tools (expanded per column)
  [NEEDLE_TOOL_NAMES.CREATE_BLUE_LOG_ENTRY]: { type: 'write', handler: handleCreateBlueLogEntry },
  [NEEDLE_TOOL_NAMES.CREATE_YELLOW_LOG_ENTRY]: { type: 'write', handler: handleCreateYellowLogEntry },
  [NEEDLE_TOOL_NAMES.CREATE_RED_LOG_ENTRY]: { type: 'write', handler: handleCreateRedLogEntry },
  [NEEDLE_TOOL_NAMES.UPDATE_BLUE_LOG_ENTRY]: { type: 'write', handler: handleUpdateBlueLogEntry },
  [NEEDLE_TOOL_NAMES.UPDATE_YELLOW_LOG_ENTRY]: { type: 'write', handler: handleUpdateYellowLogEntry },
  [NEEDLE_TOOL_NAMES.UPDATE_RED_LOG_ENTRY]: { type: 'write', handler: handleUpdateRedLogEntry },
  [NEEDLE_TOOL_NAMES.DELETE_LOG_ENTRY]: { type: 'write', handler: handleDeleteLogEntry },
  [NEEDLE_TOOL_NAMES.CLEAR_LOGS]: { type: 'write', handler: handleClearLogs, requiresConfirm: true },
  [NEEDLE_TOOL_NAMES.EXPORT_LOGS]: { type: 'read', handler: handleExportLogs },
  [NEEDLE_TOOL_NAMES.IMPORT_LOGS]: { type: 'write', handler: handleImportLogs, requiresConfirm: true },
  // Ping tool for testing
  ping: { type: 'read', handler: handlePing },
};

// Use Needle 3 registry by default (16 tools)
const TOOL_REGISTRY = NEEDLE_TOOL_REGISTRY;

/**
 * Unified create_log_entry handler (contract tool)
 * Routes to column-specific handler
 */
async function handleCreateLogEntryUnified(args, context) {
  const { column, time, data } = args;

  switch (column) {
    case 'blue':
      return handleCreateBlueLogEntry({ ...data, time }, context);
    case 'yellow':
      return handleCreateYellowLogEntry({ ...data, time }, context);
    case 'red':
      return handleCreateRedLogEntry({ ...data, time }, context);
    default:
      throw new ToolError('invalid_column', `Invalid column: ${column}`);
  }
}

/**
 * Unified update_log_entry handler (contract tool)
 * Routes to column-specific handler
 */
async function handleUpdateLogEntryUnified(args, context) {
  const { column, id, time, data } = args;

  switch (column) {
    case 'blue':
      return handleUpdateBlueLogEntry({ id, ...data, time }, context);
    case 'yellow':
      return handleUpdateYellowLogEntry({ id, ...data, time }, context);
    case 'red':
      return handleUpdateRedLogEntry({ id, ...data, time }, context);
    default:
      throw new ToolError('invalid_column', `Invalid column: ${column}`);
  }
}

// ============================================
// MAIN ADAPTER CLASS
// ============================================

class ToolAdapter {
  constructor(config = {}) {
    this.config = { ...ADAPTER_CONFIG, ...config };
    this.rateLimiter = getRateLimiter();
    this.auditLogger = getAuditLogger(this.config);
    this.initialized = false;
  }

  /**
   * Initialize the adapter
   */
  async initialize() {
    if (this.initialized) return;

    // Wait for IndicatorLights to be available
    await this.waitForIndicatorLights();

    this.initialized = true;
    console.log('[Adapter] Tool Adapter initialized');
  }

  /**
   * Wait for IndicatorLights to be available
   */
  waitForIndicatorLights(timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        if (window.IndicatorLights) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('IndicatorLights not initialized within timeout'));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  /**
   * Execute a tool call
   * @param {string} tool - Tool name
   * @param {Object} args - Tool arguments
   * @param {Object} context - Auth context (source, timestamp, etc.)
   * @returns {Promise<Object>} Tool result
   */
  async execute(tool, args, context = {}) {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const authContext = {
      source: context.source || 'model',
      timestamp: context.timestamp || Date.now(),
      sessionId: context.sessionId,
      userId: context.userId,
    };

    try {
      // 1. Check if tool exists
      const toolDef = TOOL_REGISTRY[tool];
      if (!toolDef) {
        throw new ToolError('invalid_args', `Unknown tool: ${tool}`);
      }

      // 2. Rate limiting
      const rateLimitResult = this.rateLimiter.checkLimit(tool);
      if (!rateLimitResult.allowed) {
        const error = new ToolError('rate_limited', 'Rate limit exceeded');
        error.details = { retryAfterMs: rateLimitResult.retryAfterMs };
        throw error;
      }

      // 3. Validate arguments
      validateToolArgs(tool, args);

      // 4. Check confirmation requirements
      if (toolDef.requiresConfirm && !args.confirm) {
        throw new ToolError('confirmation_required', 'This operation requires explicit confirmation (confirm: true)');
      }

      // 5. Execute tool handler with timeout
      const timeoutMs = this.config.timeouts[toolDef.type === 'bulk' ? 'bulkTools' : toolDef.type === 'write' ? 'writeTools' : 'readTools'];
      const result = await this.executeWithTimeout(toolDef.handler(args, authContext), timeoutMs);

      // 6. Audit log
      const durationMs = Date.now() - startTime;
      this.auditLogger.log(tool, authContext.source, args, result, durationMs);

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const normalizedError = normalizeError(error);
      this.auditLogger.log(tool, authContext.source, args, normalizedError, durationMs);
      throw normalizedError;
    }
  }

  /**
   * Execute promise with timeout
   */
  async executeWithTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Get contract version
   */
  getContractVersion() {
    return CONTRACT_VERSION;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!window.IndicatorLights) {
        return { status: 'degraded', reason: 'IndicatorLights not initialized' };
      }
      const state = window.IndicatorLights.getState();
      return {
        status: 'ok',
        timestamp: Date.now(),
        version: CONTRACT_VERSION,
        lights: { blue: state.blue, yellow: state.yellow, red: state.red },
        logsCount: {
          blue: state.logs.blue.length,
          yellow: state.logs.yellow.length,
          red: state.logs.red.length,
        },
        terminalHistoryCount: state.terminalHistory.length,
      };
    } catch (error) {
      return { status: 'degraded', reason: error.message };
    }
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return this.rateLimiter.getStatus();
  }

  /**
   * Get audit log
   */
  getAuditLog(limit = 100) {
    return this.auditLogger.getEntries(limit);
  }

  /**
   * Get available tool names
   */
  getToolNames() {
    return Object.keys(TOOL_REGISTRY);
  }

  /**
   * Get tool registry (for inspection)
   */
  getToolRegistry() {
    return TOOL_REGISTRY;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let adapterInstance = null;

/**
 * Get or create adapter instance
 */
export function getAdapter(config) {
  if (!adapterInstance) {
    adapterInstance = new ToolAdapter(config);
  }
  return adapterInstance;
}

/**
 * Initialize adapter (convenience function)
 */
export async function initializeAdapter(config) {
  const adapter = getAdapter(config);
  await adapter.initialize();
  return adapter;
}

/**
 * Reset adapter (for testing)
 */
export function resetAdapter() {
  adapterInstance = null;
  resetRateLimiter();
  resetAuditLogger();
}

// ============================================
// EXPORTS
// ============================================

export {
  ToolAdapter,
  CONTRACT_TOOL_REGISTRY,
  NEEDLE_TOOL_REGISTRY,
  TOOL_REGISTRY,
  TOOL_NAMES,
  NEEDLE_TOOL_NAMES,
  CONTRACT_VERSION,
};