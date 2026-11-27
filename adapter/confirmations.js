(function attachAdapterConfirmations(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NeedleAdapterConfirmations = api;
})(typeof self !== 'undefined' ? self : globalThis, function createConfirmations() {
  'use strict';

  const { AdapterError } = typeof module !== 'undefined' && module.exports
    ? require('./errors.js') : self.NeedleAdapterErrors;

  const DEFAULT_TTL_MS = 60_000;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function describeAction(request) {
    if (request.tool === 'clear_logs') {
      const scope = request.column ? request.column + ' log' : 'all logs';
      return 'Permanently delete ' + request.deletedCount + ' entr' +
        (request.deletedCount === 1 ? 'y' : 'ies') + ' from the ' + scope + '.';
    }
    if (request.tool === 'delete_log_entry') {
      return 'Permanently delete the ' + request.column + ' log entry at ' + request.time + '.';
    }
    return 'Approve the requested destructive operation.';
  }

  function createConfirmationManager(options = {}) {
    const ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : DEFAULT_TTL_MS;
    const onPending = typeof options.onPending === 'function' ? options.onPending : () => {};
    let nextId = 0;
    let pending = null;

    function settle(error) {
      if (!pending) return;
      const current = pending;
      pending = null;
      clearTimeout(current.timer);
      if (error) current.reject(error);
      else current.resolve(true);
    }

    function request(input) {
      if (pending) settle(new AdapterError('confirmation_cancelled', 'The previous confirmation was replaced. No changes were made.'));
      const operation = clone(input);
      const id = 'confirmation-' + (++nextId);
      const display = Object.freeze({
        id,
        tool: operation.tool,
        column: operation.column,
        time: operation.time,
        deletedCount: operation.deletedCount,
        entry: operation.entry ? Object.freeze(clone(operation.entry)) : undefined,
        description: describeAction(operation)
      });
      const fingerprint = stable(operation);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending && pending.id === id) {
            settle(new AdapterError('confirmation_expired', 'The confirmation expired. No changes were made.'));
          }
        }, ttlMs);
        pending = { id, operation, fingerprint, display, timer, resolve, reject };
        try {
          onPending(display);
        } catch {
          settle(new AdapterError('confirmation_unavailable', 'The confirmation dialog could not be shown. No changes were made.'));
        }
      });
    }

    function confirm(id, approvedOperation) {
      if (!pending || pending.id !== id) {
        throw new AdapterError('confirmation_mismatch', 'This confirmation is no longer pending.');
      }
      if (approvedOperation === undefined || stable(approvedOperation) !== pending.fingerprint) {
        throw new AdapterError('confirmation_mismatch', 'The approved action does not match the pending operation.');
      }
      settle(null);
      return true;
    }

    function cancel(id) {
      if (!pending || pending.id !== id) return false;
      settle(new AdapterError('confirmation_cancelled', 'The action was cancelled. No changes were made.'));
      return true;
    }

    function reset() {
      if (pending) settle(new AdapterError('confirmation_cancelled', 'The assistant session was reset. No changes were made.'));
    }

    function getPending() {
      return pending ? Object.freeze({ ...pending.display }) : null;
    }

    return Object.freeze({ request, confirm, cancel, reset, getPending });
  }

  return Object.freeze({ createConfirmationManager, describeAction });
});
