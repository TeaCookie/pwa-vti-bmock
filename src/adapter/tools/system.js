/**
 * System Tool Handlers
 * Implements: export_logs, import_logs, set_yellow_timing
 * (These are also in logs.js and lights.js, this is for the contract tool names)
 */

import { validateToolArgs } from '../validation.js';
import { getIndicatorLights } from './logs.js'; // Reuse the helper

// Re-export from other modules
export {
  handleSetYellowTiming,
} from './lights.js';

export {
  handleExportLogs,
  handleImportLogs,
} from './logs.js';

/**
 * Simple ping tool for testing
 */
async function handlePing(args, context) {
  validateToolArgs('ping', args || {});
  return { status: 'pong', timestamp: Date.now() };
}

/**
 * Adapter health check
 */
async function handleHealthCheck(args, context) {
  validateToolArgs('health_check', args || {});

  const IndicatorLights = getIndicatorLights();
  const state = IndicatorLights.getState();

  return {
    status: 'ok',
    timestamp: Date.now(),
    version: '1.0.0',
    lights: { blue: state.blue, yellow: state.yellow, red: state.red },
    logsCount: {
      blue: state.logs.blue.length,
      yellow: state.logs.yellow.length,
      red: state.logs.red.length,
    },
    terminalHistoryCount: state.terminalHistory.length,
  };
}

export { handleHealthCheck, handlePing };