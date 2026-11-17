/**
 * Promise wrapper around needle.worker.js.
 *
 *   const needle = new NeedleClient({ onProgress });
 *   await needle.init();                       // loads runtime + model, registers tools.json
 *   const r = await needle.complete('turn on the red light');
 *   r.calls        // [{ name, arguments }]  already validated; [] means "no tool fits"
 *   r.suppressed   // calls the engine held back for low confidence
 *   r.confidence, r.timings, r.latencyMs, r.raw
 *
 * Failures reject with an Error that has .code (see the worker header) and, for
 * invalid-output, .raw. Nothing here parses model text.
 */
export class NeedleClient {
  constructor(options = {}) {
    this.workerUrl = options.workerUrl || new URL('./needle.worker.js', import.meta.url);
    this.manifestUrl = options.manifestUrl || new URL('./assets.manifest.json', import.meta.url).href;
    this.toolsUrl = options.toolsUrl || new URL('./tools.json', import.meta.url).href;
    this.onProgress = options.onProgress || (() => {});
    this.timeoutMs = options.timeoutMs || 60000;
    this.worker = null;
    this.pending = new Map();
    this.nextId = 0;
    this.initWaiter = null;
  }

  async init() {
    if (this.initWaiter) return this.initWaiter.promise;
    const toolsResponse = await fetch(this.toolsUrl);
    if (!toolsResponse.ok) throw this._error('asset-fetch', 'tools.json: HTTP ' + toolsResponse.status);
    const tools = await toolsResponse.json();

    // Absolute URL: the worker resolves it itself, and the page's service worker is not involved.
    const manifestUrl = new URL(this.manifestUrl, location.href).href;

    this.worker = new Worker(this.workerUrl); // classic worker on purpose (importScripts)
    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.onerror = (e) => this._failAll(this._error('model-load', e.message || 'worker error'));

    this.initWaiter = {};
    this.initWaiter.promise = new Promise((resolve, reject) => {
      this.initWaiter.resolve = resolve;
      this.initWaiter.reject = reject;
    });
    this.worker.postMessage({ type: 'init', manifestUrl, tools });
    return this.initWaiter.promise;
  }

  complete(text, opts = {}) {
    if (!this.worker) return Promise.reject(this._error('not-ready', 'call init() first'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(this._error('timeout', 'no answer after ' + this.timeoutMs + ' ms'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ type: 'complete', id, text, opts });
    });
  }

  terminate() {
    if (this.worker) this.worker.terminate();
    this._failAll(this._error('not-ready', 'client terminated'));
    this.worker = null;
    this.initWaiter = null;
  }

  _onMessage(m) {
    switch (m.type) {
      case 'progress':
        this.onProgress(m);
        break;
      case 'ready':
        if (this.initWaiter) this.initWaiter.resolve(m);
        break;
      case 'result': {
        const p = this.pending.get(m.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(m.id);
        p.resolve(m);
        break;
      }
      case 'error': {
        const err = this._error(m.code, m.message);
        err.raw = m.raw;
        if (m.id === undefined || m.id === null) {
          if (this.initWaiter) this.initWaiter.reject(err);
          return;
        }
        const p = this.pending.get(m.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(m.id);
        p.reject(err);
        break;
      }
    }
  }

  _failAll(err) {
    if (this.initWaiter && this.initWaiter.reject) this.initWaiter.reject(err);
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(err); }
    this.pending.clear();
  }

  _error(code, message) {
    return Object.assign(new Error(message), { code });
  }
}
