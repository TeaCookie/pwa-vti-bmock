/**
 * Terminal Tool Handler
 * Implements: get_terminal_history
 */

import { validateToolArgs } from '../validation.js';

/**
 * Get IndicatorLights API from window
 */
function getIndicatorLights() {
  if (!window.IndicatorLights) {
    throw new Error('IndicatorLights not initialized');
  }
  return window.IndicatorLights;
}

/**
 * Get terminal history
 */
async function handleGetTerminalHistory(args, context) {
  validateToolArgs('get_terminal_history', args);

  const IndicatorLights = getIndicatorLights();
  const { limit = 100, offset = 0, filterType = 'all' } = args;

  // Get terminal history from IndicatorLights
  let history = [];
  if (IndicatorLights.getTerminalHistory) {
    history = IndicatorLights.getTerminalHistory();
  } else {
    // Fallback: access state directly
    const state = IndicatorLights.getState();
    history = state.terminalHistory || [];
  }

  // Apply filter
  let filtered = history;
  if (filterType !== 'all') {
    filtered = history.filter(entry => entry.type === filterType);
  }

  // Apply pagination (history is oldest first, we want newest first)
  const totalCount = filtered.length;
  const reversed = [...filtered].reverse(); // newest first
  const entries = reversed.slice(offset, offset + limit);

  return { entries, totalCount };
}

export { handleGetTerminalHistory };