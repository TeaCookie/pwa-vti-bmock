(function attachAdapterErrors(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NeedleAdapterErrors = api;
})(typeof self !== 'undefined' ? self : globalThis, function createErrors() {
  'use strict';

  class AdapterError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'AdapterError';
      this.code = code;
      if (details !== undefined) this.details = details;
    }
  }

  function normalizeError(error) {
    if (error && typeof error.code === 'string' && typeof error.message === 'string') {
      return {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
        retryable: error.retryable === true
      };
    }
    return {
      code: 'execution_failed',
      message: 'The tool could not be completed. No further error details are available.',
      retryable: false
    };
  }

  return Object.freeze({ AdapterError, normalizeError });
});
