(function attachAdapterConfirmations(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NeedleAdapterConfirmations = api;
})(typeof self !== 'undefined' ? self : globalThis, function createConfirmations() {
  'use strict';

  const { AdapterError } = typeof module !== 'undefined' && module.exports
    ? require('./errors.js') : self.NeedleAdapterErrors;

  async function requireConfirmation(confirmAction, request) {
    if (typeof confirmAction !== 'function') {
      throw new AdapterError(
        'confirmation_required',
        'This action requires explicit confirmation in the application.'
      );
    }
    const approved = await confirmAction(Object.freeze({ ...request }));
    if (approved !== true) {
      throw new AdapterError('confirmation_cancelled', 'The action was cancelled. No changes were made.');
    }
  }

  return Object.freeze({ requireConfirmation });
});
