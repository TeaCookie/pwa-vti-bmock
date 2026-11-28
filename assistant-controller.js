(function attachNeedleAssistantController(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NeedleAssistantController = api;
  if (root && root.document) {
    const initialize = () => {
      if (root.NeedleAssistantControllerInstance || !root.NeedleClient || !root.NeedleAssistantUIInstance) return;
      root.NeedleAssistantControllerInstance = api.createAssistantController({
        root, Client: root.NeedleClient, adapter: root.NeedleToolAdapterInstance
      });
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
  }
})(typeof window !== 'undefined' ? window : globalThis, function createNeedleAssistantControllerModule() {
  'use strict';
  const MODEL_MANIFEST = './needle/assets.exp1_20l.json';
  const TOOL_SCHEMA = './needle/tools.v5.json';

  function formatProgress(message) {
    const names = { runtime: 'Loading inference runtime', 'model-download': 'Downloading fine-tuned model',
      verify: 'Verifying model assets', load: 'Loading model into memory', tools: 'Registering tool schema' };
    const label = names[message.stage] || 'Preparing assistant';
    if (Number.isFinite(message.loaded) && Number.isFinite(message.total) && message.total > 0)
      return label + ' · ' + Math.round(message.loaded / message.total * 100) + '%';
    return label;
  }

  function createAssistantController(options = {}) {
    const root = options.root, Client = options.Client;
    const adapter = options.adapter || (root && root.NeedleToolAdapterInstance);
    if (!root || !Client) throw new TypeError('A window-like root and NeedleClient constructor are required.');
    const manifestUrl = new URL(options.manifestUrl || MODEL_MANIFEST, root.location.href).href;
    const toolsUrl = new URL(options.toolsUrl || TOOL_SCHEMA, root.location.href).href;
    let client = null, initPromise = null, queue = Promise.resolve(), disposed = false, activeCall = null;

    function emit(name, detail) { root.dispatchEvent(new root.CustomEvent(name, { detail })); }
    function ensureClient() {
      if (!client) client = new Client({ manifestUrl, toolsUrl, onProgress: (progress) =>
        emit('needle:assistant-status', { message: formatProgress(progress), loading: true,
          stage: progress.stage, loaded: progress.loaded, total: progress.total }) });
      return client;
    }
    function initialize() {
      const active = ensureClient();
      if (initPromise && active.worker) return initPromise;
      if (!active.worker) initPromise = null;
      if (!initPromise) {
        emit('needle:assistant-status', { message: 'Starting on-device assistant…', loading: true });
        initPromise = active.init().catch((error) => { initPromise = null; throw error; });
      }
      return initPromise;
    }
    function handleConfirmation(event) {
      if (!activeCall || disposed) return;
      const request = event && event.detail && event.detail.request;
      if (request && request.tool === activeCall.tool) {
        emit('needle:assistant-tool-state', { ...activeCall, state: 'awaiting_confirmation',
          message: request.description || 'Waiting for confirmation' });
      } else if (!request) {
        emit('needle:assistant-tool-state', { ...activeCall, state: 'running' });
      }
    }
    async function dispatchCalls(calls) {
      if (!Array.isArray(calls)) {
        const result = { success: false, tool: null,
          error: { code: 'invalid_calls', message: 'Needle returned a malformed tool-call collection.' } };
        emit('needle:assistant-tool-result', { index: 0, total: 1, tool: null, state: 'failed', result });
        emit('needle:assistant-tool-summary', { total: 1, succeeded: 0, failed: 1 });
        return { succeeded: 0, failed: 1 };
      }
      if (calls.length && (!adapter || typeof adapter.executeCalls !== 'function')) {
        const result = { success: false, tool: null,
          error: { code: 'adapter_unavailable', message: 'The application tool adapter is not available.' } };
        emit('needle:assistant-tool-result', { index: 0, total: calls.length, tool: null, state: 'failed', result });
        emit('needle:assistant-tool-summary', { total: calls.length, succeeded: 0, failed: calls.length });
        return { succeeded: 0, failed: calls.length };
      }
      let succeeded = 0, failed = 0;
      for (let index = 0; index < calls.length; index++) {
        if (disposed) break;
        const call = calls[index], tool = call && typeof call.name === 'string' ? call.name : null;
        activeCall = { index, total: calls.length, tool };
        emit('needle:assistant-tool-state', { ...activeCall, state: 'running' });
        let result;
        try {
          const outcomes = await adapter.executeCalls([call]);
          result = Array.isArray(outcomes) && outcomes.length === 1 ? outcomes[0] :
            { success: false, tool, error: { code: 'invalid_adapter_result', message: 'The tool adapter returned an invalid result.' } };
        } catch {
          result = { success: false, tool, error: { code: 'execution_failed', message: 'The tool could not be completed.' } };
        }
        const success = !!result && result.success === true;
        if (success) succeeded++; else failed++;
        emit('needle:assistant-tool-result', { index, total: calls.length, tool,
          state: success ? 'succeeded' : 'failed', result });
      }
      activeCall = null;
      const summary = { total: calls.length, succeeded, failed };
      emit('needle:assistant-tool-summary', summary);
      return summary;
    }
    async function processMessage(text) {
      if (disposed) return;
      emit('needle:assistant-status', { message: 'Preparing assistant…', loading: true });
      try {
        const active = ensureClient();
        await initialize();
        if (disposed) return;
        emit('needle:assistant-status', { message: 'Thinking…', loading: true });
        const result = await active.complete(text);
        if (disposed) return;
        const raw = typeof result.raw === 'string' ? result.raw : '';
        emit('needle:assistant-completion', { raw, result });
        emit('needle:assistant-response', { text: raw, raw, result });
        const summary = await dispatchCalls(result.calls);
        if (disposed) return;
        emit('needle:assistant-status', { message: summary.failed ? 'Completed with tool errors' : 'Ready', loading: false });
      } catch (error) {
        if (disposed) return;
        if (error && typeof error.raw === 'string') {
          emit('needle:assistant-completion', { raw: error.raw, error });
          emit('needle:assistant-response', { text: error.raw, raw: error.raw, error });
        }
        emit('needle:assistant-error', { message: error && error.message ? error.message :
          'The assistant could not complete that request.', code: error && error.code ? error.code : 'inference', recoverable: true });
      }
    }
    function handleSubmit(event) {
      const text = event && event.detail && event.detail.text;
      if (typeof text !== 'string' || !text.trim() || disposed) return;
      queue = queue.then(() => processMessage(text)).catch((error) => {
        if (!disposed) emit('needle:assistant-error', { message: error && error.message ? error.message :
          'Assistant request failed.', code: error && error.code ? error.code : 'inference', recoverable: true });
      });
    }
    root.addEventListener('needle:assistant-submit', handleSubmit);
    root.addEventListener('needle:assistant-confirmation', handleConfirmation);
    return Object.freeze({
      initialize, submit: (text) => handleSubmit({ detail: { text } }),
      dispose() {
        if (disposed) return;
        disposed = true;
        root.removeEventListener('needle:assistant-submit', handleSubmit);
        root.removeEventListener('needle:assistant-confirmation', handleConfirmation);
        if (client) client.terminate();
      },
      getClient: () => client, getQueue: () => queue
    });
  }
  return Object.freeze({ MODEL_MANIFEST, TOOL_SCHEMA, formatProgress, createAssistantController });
});
