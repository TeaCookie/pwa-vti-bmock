/**
 * Light Tool Handlers
 * Implements: get_light_status, toggle_light, set_yellow_timing
 */

import { ADAPTER_CONFIG } from '../config.js';
import { validateToolArgs } from '../validation.js';
import { normalizeError } from '../errors.js';
import { withErrorNormalization } from '../errors.js';

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
 * Get current state of all lights
 */
async function handleGetLightStatus(args, context) {
  validateToolArgs('get_light_status', args);

  const IndicatorLights = getIndicatorLights();
  const state = IndicatorLights.getState();

  return {
    blue: { left: state.blue.left, right: state.blue.right },
    yellow: state.yellow,
    red: state.red,
  };
}

/**
 * Toggle/set a specific light
 */
async function handleToggleLight(args, context) {
  validateToolArgs('toggle_light', args);

  const { light, state: targetState } = args;
  const IndicatorLights = getIndicatorLights();
  const currentState = IndicatorLights.getState();

  let previousState;
  let currentStateValue;

  switch (light) {
    case 'blue-left':
      previousState = currentState.blue.left;
      if (previousState !== targetState) {
        IndicatorLights.toggleBlueLeft();
      }
      currentStateValue = targetState;
      break;

    case 'blue-right':
      previousState = currentState.blue.right;
      if (previousState !== targetState) {
        IndicatorLights.toggleBlueRight();
      }
      currentStateValue = targetState;
      break;

    case 'red':
      previousState = currentState.red;
      if (previousState !== targetState) {
        IndicatorLights.toggleRed();
      }
      currentStateValue = targetState;
      break;

    case 'yellow':
      previousState = currentState.yellow;
      // Need direct manipulation since no toggleYellow exposed
      if (previousState !== targetState) {
        // Access internal state via getState and mutate
        const state = IndicatorLights.getState();
        state.yellow = targetState;
        const yellowLight = document.getElementById('yellowLight');
        if (yellowLight) {
          yellowLight.classList.toggle('on', targetState);
          yellowLight.setAttribute('aria-label', `Yellow indicator light, currently ${targetState ? 'ON' : 'OFF'}, toggles randomly every 5-15 seconds`);
        }
        // Update status and terminal
        if (IndicatorLights.updateStatus) IndicatorLights.updateStatus();
        if (IndicatorLights.appendTerminalLine) {
          IndicatorLights.appendTerminalLine(`Yellow: ${targetState ? 'ON' : 'OFF'}`, 'output');
        }
      }
      currentStateValue = targetState;
      break;

    default:
      throw normalizeError(new Error(`Invalid light: ${light}`), { code: 'invalid_light' });
  }

  return {
    light,
    previousState,
    currentState: currentStateValue,
  };
}

/**
 * Set yellow light timing
 */
async function handleSetYellowTiming(args, context) {
  validateToolArgs('set_yellow_timing', args);

  const { minMs, maxMs } = args;
  const IndicatorLights = getIndicatorLights();

  // Get current timing from IndicatorLights if available
  const previousMinMs = IndicatorLights.getYellowTiming?.().minMs || ADAPTER_CONFIG.defaultYellowTiming.minMs;
  const previousMaxMs = IndicatorLights.getYellowTiming?.().maxMs || ADAPTER_CONFIG.defaultYellowTiming.maxMs;

  // Set new timing
  if (IndicatorLights.setYellowTiming) {
    IndicatorLights.setYellowTiming(minMs, maxMs);
  } else {
    // Fallback: direct manipulation
    // This would need the yellowTimer to be accessible
    console.warn('[Adapter] setYellowTiming not exposed on IndicatorLights');
  }

  return {
    previousMinMs,
    previousMaxMs,
    currentMinMs: minMs,
    currentMaxMs: maxMs,
  };
}

export {
  handleGetLightStatus,
  handleToggleLight,
  handleSetYellowTiming,
};