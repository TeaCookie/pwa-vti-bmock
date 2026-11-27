(function attachYellowLightController(root, factory) {
  const createController = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = createController;
  if (root) root.createYellowLightController = createController;
})(typeof window !== 'undefined' ? window : globalThis, function createFactory() {
  'use strict';

  const LABEL_PREFIX = 'Yellow indicator light, currently ';
  const LABEL_SUFFIX = ', toggles randomly every 5-15 seconds';

  return function createYellowLightController({ getState, setState, light, updateStatus }) {
    if (typeof getState !== 'function' || typeof setState !== 'function' ||
        !light?.classList || typeof light.setAttribute !== 'function' ||
        typeof updateStatus !== 'function') {
      throw new TypeError('Yellow light controller requires state access, a light element, and a status updater');
    }

    function set(isOn) {
      if (typeof isOn !== 'boolean') throw new TypeError('yellow state must be a boolean');
      setState(isOn);
      light.classList.toggle('on', isOn);
      light.setAttribute('aria-label', LABEL_PREFIX + (isOn ? 'ON' : 'OFF') + LABEL_SUFFIX);
      updateStatus();
      return isOn;
    }

    return Object.freeze({
      set,
      toggle: () => set(!getState())
    });
  };
});
