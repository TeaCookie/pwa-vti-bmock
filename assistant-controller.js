(function attachNeedleAssistantController(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NeedleAssistantController = api;
  if (root && root.document) {
    const initialize = () => {
      if (!root.NeedleClient || !root.NeedleAssistantUIInstance) return;
      root.NeedleAssistantControllerInstance = api.createAssistantController({
        root,
        Client: root.NeedleClient
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
    const stageNames = {
      runtime: 'Loading inference runtime',
      'model-download': 'Downloading fine-tuned model',
      verify: 'Verifying model assets',
      load: 'Loading model into memory',
      tools: 'Registering tool schema'
    };
    const label = stageNames[message.stage] || 'Preparing assistant';
    if (Number.isFinite(message.loaded) && Number.isFinite(message.total) && message.total > 0) {
      return label + ' · ' + Math.round(message.loaded / message.total * 100) + '%';
    }
    return label;
  }

  function createAssistantController(options = {}) {
    const root = options.root;
    const Client = options.Client;
    if (!root || !Client) throw new TypeError('A window-like root and NeedleClient constructor are required.');

    const manifestUrl = new URL(options.manifestUrl || MODEL_MANIFEST, root.location.href).href;
    const toolsUrl = new URL(options.toolsUrl || TOOL_SCHEMA, root.location.href).href;
    let client = null;
    let initPromise = null;
    let queue = Promise.resolve();
    let disposed = false;

    function emit(name, detail) {
      root.dispatchEvent(new root.CustomEvent(name, { detail }));
    }

    function ensureClient() {
      if (!client) {
        client = new Client({
          manifestUrl,
          toolsUrl,
          onProgress: (progress) => emit('needle:assistant-status', {
            message: formatProgress(progress),
            loading: true,
            stage: progress.stage,
            loaded: progress.loaded,
            total: progress.total
          })
        });
      }
      return client;
    }

    function initialize() {
      const activeClient = ensureClient();
      if (initPromise && activeClient.worker) return initPromise;
      if (!activeClient.worker) initPromise = null;
      if (!initPromise) {
        emit('needle:assistant-status', { message: 'Starting on-device assistant…', loading: true });
        initPromise = activeClient.init().catch((error) => {
          initPromise = null;
          throw error;
        });
      }
      return initPromise;
    }

    async function processMessage(text) {
      if (disposed) return;
      emit('needle:assistant-status', { message: 'Preparing assistant…', loading: true });
      try {
        const activeClient = ensureClient();
        await initialize();
        if (disposed) return;
        emit('needle:assistant-status', { message: 'Thinking…', loading: true });
        const result = await activeClient.complete(text);
        if (disposed) return;
        const raw = typeof result.raw === 'string' ? result.raw : '';
        // Preserve the model's exact output for display and the downstream parser/tool dispatcher.
        emit('needle:assistant-completion', { raw, result });
        emit('needle:assistant-response', { text: raw, raw, result });
        emit('needle:assistant-status', { message: 'Ready', loading: false });
      } catch (error) {
        if (disposed) return;
        if (error && typeof error.raw === 'string') {
          emit('needle:assistant-completion', { raw: error.raw, error });
          emit('needle:assistant-response', { text: error.raw, raw: error.raw, error });
        }
        emit('needle:assistant-error', {
          message: error && error.message ? error.message : 'The assistant could not complete that request.',
          code: error && error.code ? error.code : 'inference',
          recoverable: true
        });
      }
    }

    function handleSubmit(event) {
      const text = event && event.detail && event.detail.text;
      if (typeof text !== 'string' || !text.trim() || disposed) return;
      // Needle's WASM engine is stateful and single-threaded; serialize all completions.
      queue = queue.then(() => processMessage(text)).catch((error) => {
        if (!disposed) emit('needle:assistant-error', {
          message: error && error.message ? error.message : 'Assistant request failed.',
          code: error && error.code ? error.code : 'inference',
          recoverable: true
        });
      });
    }

    root.addEventListener('needle:assistant-submit', handleSubmit);

    return Object.freeze({
      initialize,
      submit: (text) => handleSubmit({ detail: { text } }),
      dispose() {
        if (disposed) return;
        disposed = true;
        root.removeEventListener('needle:assistant-submit', handleSubmit);
        if (client) client.terminate();
      },
      getClient: () => client,
      getQueue: () => queue
    });
  }

  return Object.freeze({ MODEL_MANIFEST, TOOL_SCHEMA, formatProgress, createAssistantController });
});
