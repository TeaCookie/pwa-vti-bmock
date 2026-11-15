/**
 * Clock Tool Handler
 * Implements: get_clock_time
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
 * Get current clock time
 */
async function handleGetClockTime(args, context) {
  validateToolArgs('get_clock_time', args);

  const IndicatorLights = getIndicatorLights();

  // Use exposed functions or fall back to direct implementation
  const time = IndicatorLights.formatTime ? IndicatorLights.formatTime() : formatTime();
  const dateTime = IndicatorLights.formatDateTime ? IndicatorLights.formatDateTime() : formatDateTime();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return { time, dateTime, timezone };
}

/**
 * Format time as HH:MM (fallback)
 */
function formatTime(date = new Date()) {
  return date.toTimeString().slice(0, 5);
}

/**
 * Format date for display (fallback)
 */
function formatDateTime(date = new Date()) {
  return date.toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export { handleGetClockTime };