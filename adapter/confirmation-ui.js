(function attachConfirmationUI(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NeedleConfirmationUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function createConfirmationUI() {
  'use strict';

  function createDialogPresenter(dialog, description, confirmButton, cancelButton, manager) {
    if (!dialog || !description || !confirmButton || !cancelButton || !manager) {
      throw new TypeError('A confirmation dialog and manager are required.');
    }
    let activeId = null;

    function present(request) {
      activeId = request.id;
      description.textContent = request.description;
      if (request.tool === 'delete_log_entry' && request.entry) {
        const details = [
          'Column: ' + request.column,
          'Time: ' + request.time,
          'Entry: ' + JSON.stringify(request.entry)
        ].join('\n');
        description.textContent += '\n\n' + details;
      }
      confirmButton.disabled = false;
      cancelButton.disabled = false;
      if (!dialog.open) dialog.showModal();
    }

    function clear() {
      activeId = null;
      if (dialog.open) dialog.close();
    }

    confirmButton.addEventListener('click', () => {
      const request = manager.getPending();
      if (!request || request.id !== activeId) return clear();
      try {
        manager.confirm(request.id, request.operation);
        clear();
      } catch {
        clear();
      }
    });

    cancelButton.addEventListener('click', () => {
      if (activeId) manager.cancel(activeId);
      clear();
    });

    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (activeId) manager.cancel(activeId);
      clear();
    });

    return Object.freeze({ present, clear });
  }

  return Object.freeze({ createDialogPresenter });
});
