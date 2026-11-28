(function attachNeedleAssistantUI(root) {
  'use strict';

  const STORAGE_KEY = 'needle-assistant-dock-v1';
  const EDGE_GAP = 12;
  const DRAG_THRESHOLD = 8;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getDockPosition(dock, offset, viewport, launcherSize) {
    const maxX = Math.max(EDGE_GAP, viewport.width - launcherSize - EDGE_GAP);
    const maxY = Math.max(EDGE_GAP, viewport.height - launcherSize - EDGE_GAP);
    const ratio = clamp(Number.isFinite(offset) ? offset : 1, 0, 1);
    if (dock === 'left') return { x: EDGE_GAP, y: EDGE_GAP + ratio * Math.max(0, maxY - EDGE_GAP) };
    if (dock === 'bottom') return { x: EDGE_GAP + ratio * Math.max(0, maxX - EDGE_GAP), y: maxY };
    return { x: maxX, y: EDGE_GAP + ratio * Math.max(0, maxY - EDGE_GAP) };
  }

  function getPanelPosition(launcher, panel, viewport, dock) {
    const gap = 12;
    const margin = 12;
    let x = dock === 'left' ? launcher.x + launcher.width + gap : launcher.x - panel.width - gap;
    if (dock === 'bottom') {
      x = launcher.x + launcher.width - panel.width;
    } else if (x < margin || x + panel.width > viewport.width - margin) {
      x = launcher.x + launcher.width + gap;
      if (x + panel.width > viewport.width - margin) x = launcher.x - panel.width - gap;
    }
    let y = dock === 'bottom' ? launcher.y - panel.height - gap : launcher.y + launcher.height / 2 - panel.height;
    if (y < margin) y = launcher.y + launcher.height + gap;
    x = clamp(x, margin, Math.max(margin, viewport.width - panel.width - margin));
    y = clamp(y, margin, Math.max(margin, viewport.height - panel.height - margin));
    return { x, y };
  }

  function createSpeechInput(options = {}) {
    const root = options.root;
    const input = options.input;
    const onState = typeof options.onState === 'function' ? options.onState : () => {};
    const onError = typeof options.onError === 'function' ? options.onError : () => {};
    if (!root || !input) throw new TypeError('A window-like root and editable input are required.');
    const Recognition = root.SpeechRecognition || root.webkitSpeechRecognition;
    if (typeof Recognition !== 'function') {
      onState('unsupported');
      return Object.freeze({ supported: false, start: () => false, stop: () => false });
    }
    const recognition = new Recognition();
    recognition.lang = options.lang || (root.navigator && root.navigator.language) || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    let active = false;
    recognition.onstart = () => { active = true; onState('listening'); };
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex || 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal && result[0] && typeof result[0].transcript === 'string') transcript += result[0].transcript;
      }
      if (transcript.trim()) {
        const existing = input.value.trimEnd();
        input.value = (existing ? existing + ' ' : '') + transcript.trim();
        input.dispatchEvent(new root.Event('input', { bubbles: true }));
      }
    };
    recognition.onerror = (event) => {
      active = false;
      const messages = {
        'not-allowed': 'Microphone permission was denied. Allow microphone access in your browser settings to use voice input.',
        'service-not-allowed': 'The browser speech service is not permitted.',
        'no-speech': 'No speech was detected. Try again.',
        network: 'The browser speech service is unavailable. Check your connection and try again.',
        'audio-capture': 'No microphone was available.'
      };
      onError(messages[event.error] || 'Speech recognition failed. Please try again.');
      onState('idle');
    };
    recognition.onend = () => { active = false; onState('idle'); };
    return Object.freeze({
      supported: true,
      start() {
        if (active) { recognition.stop(); return true; }
        try { recognition.start(); return true; }
        catch (error) {
          onError(error && error.name === 'NotAllowedError'
            ? 'Microphone permission was denied.'
            : 'Could not start speech recognition. Please try again.');
          return false;
        }
      },
      stop() {
        if (!active) return false;
        recognition.stop();
        return true;
      }
    });
  }

  function createAssistantUI(doc) {
    const launcher = doc.getElementById('needleAssistantLauncher');
    const panel = doc.getElementById('needleAssistantPanel');
    const form = doc.getElementById('needleAssistantForm');
    const input = doc.getElementById('needleAssistantInput');
    const output = doc.getElementById('needleAssistantOutput');
    const status = doc.getElementById('needleAssistantStatus');
    const error = doc.getElementById('needleAssistantError');
    const closeButton = doc.getElementById('needleAssistantClose');
    const micButton = doc.getElementById('needleAssistantMic');

    if (!launcher || !panel || !form || !input || !output || !status || !error || !closeButton) {
      return null;
    }

    const viewport = () => ({ width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight });
    const safeInsets = () => {
      const styles = root.getComputedStyle(doc.documentElement);
      const read = (name) => Math.max(0, parseFloat(styles.getPropertyValue(name)) || 0);
      return { top: read('--needle-safe-top'), right: read('--needle-safe-right'), bottom: read('--needle-safe-bottom'), left: read('--needle-safe-left') };
    };
    const launcherSize = () => launcher.getBoundingClientRect().width || 56;
    let dock = 'right';
    let offset = 1;
    let drag = null;
    let suppressClick = false;
    let isOpen = false;

    function saveDock() {
      try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify({ dock, offset })); } catch (_) {}
    }

    function restoreDock() {
      try {
        const saved = JSON.parse(root.localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && ['left', 'right', 'bottom'].includes(saved.dock) && Number.isFinite(saved.offset)) {
          dock = saved.dock;
          offset = clamp(saved.offset, 0, 1);
        }
      } catch (_) {}
    }

    function placeLauncher() {
      const size = launcherSize();
      const view = viewport();
      const safe = safeInsets();
      const point = getDockPosition(dock, offset, {
        width: Math.max(size + EDGE_GAP * 2, view.width - safe.left - safe.right),
        height: Math.max(size + EDGE_GAP * 2, view.height - safe.top - safe.bottom)
      }, size);
      launcher.style.left = (point.x + safe.left) + 'px';
      launcher.style.top = (point.y + safe.top) + 'px';
      launcher.dataset.dock = dock;
      if (isOpen) placePanel();
    }

    function placePanel() {
      if (!isOpen) return;
      const rect = launcher.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const safe = safeInsets();
      const view = viewport();
      const point = getPanelPosition(
        { x: rect.left - safe.left, y: rect.top - safe.top, width: rect.width, height: rect.height },
        { width: panelRect.width || 400, height: panelRect.height || 550 },
        { width: Math.max(1, view.width - safe.left - safe.right), height: Math.max(1, view.height - safe.top - safe.bottom) },
        dock
      );
      panel.style.left = (point.x + safe.left) + 'px';
      panel.style.top = (point.y + safe.top) + 'px';
    }

    function openPanel() {
      isOpen = true;
      panel.hidden = false;
      launcher.setAttribute('aria-expanded', 'true');
      placePanel();
      input.focus({ preventScroll: true });
    }

    function closePanel(returnFocus = true) {
      isOpen = false;
      panel.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
      if (returnFocus) launcher.focus({ preventScroll: true });
    }

    function setStatus(message, loading = false) {
      status.textContent = message;
      status.classList.toggle('is-loading', loading);
      status.setAttribute('aria-busy', String(loading));
      output.setAttribute('aria-busy', String(loading));
    }

    function appendMessage(message, className) {
      const item = doc.createElement('p');
      item.className = 'needle-assistant-message' + (className ? ' ' + className : '');
      item.textContent = message;
      output.appendChild(item);
      output.scrollTop = output.scrollHeight;
    }

    launcher.addEventListener('click', () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (isOpen) closePanel(false);
      else openPanel();
    });

    launcher.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: launcher.offsetLeft,
        originY: launcher.offsetTop,
        moved: false
      };
      if (launcher.setPointerCapture) launcher.setPointerCapture(event.pointerId);
    });

    launcher.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      launcher.dataset.dragging = 'true';
      launcher.style.left = clamp(drag.originX + dx, EDGE_GAP, viewport().width - launcherSize() - EDGE_GAP) + 'px';
      launcher.style.top = clamp(drag.originY + dy, EDGE_GAP, viewport().height - launcherSize() - EDGE_GAP) + 'px';
      if (isOpen) placePanel();
      event.preventDefault();
    });

    function finishDrag(event) {
      if (!drag || (event && drag.pointerId !== event.pointerId)) return;
      if (drag.moved) {
        const rect = launcher.getBoundingClientRect();
        const size = launcherSize();
        const view = viewport();
        const distances = [
          { dock: 'left', distance: rect.left },
          { dock: 'right', distance: view.width - rect.right },
          { dock: 'bottom', distance: view.height - rect.bottom }
        ].sort((a, b) => a.distance - b.distance);
        dock = distances[0].dock;
        const point = dock === 'bottom' ? rect.left : rect.top;
        const max = dock === 'bottom' ? view.width - size - EDGE_GAP * 2 : view.height - size - EDGE_GAP * 2;
        offset = max > 0 ? clamp((point - EDGE_GAP) / max, 0, 1) : 1;
        placeLauncher();
        saveDock();
        suppressClick = true;
      }
      delete launcher.dataset.dragging;
      drag = null;
    }

    launcher.addEventListener('pointerup', finishDrag);
    launcher.addEventListener('pointercancel', finishDrag);
    launcher.addEventListener('lostpointercapture', finishDrag);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message) {
        input.focus();
        return;
      }
      appendMessage(message, 'is-user');
      input.value = '';
      error.hidden = true;
      setStatus('Message sent');
      root.dispatchEvent(new CustomEvent('needle:assistant-submit', { detail: { text: message } }));
      input.focus();
    });

    const speech = createSpeechInput({
      root, input,
      onState(state) {
        if (!micButton) return;
        micButton.setAttribute('aria-pressed', String(state === 'listening'));
        micButton.textContent = state === 'listening' ? 'Stop' : 'Mic';
        micButton.disabled = state === 'unsupported';
        micButton.title = state === 'unsupported' ? 'Speech recognition is not supported by this browser' : 'Use speech to enter editable text';
      },
      onError(message) {
        error.textContent = message;
        error.hidden = false;
      }
    });
    if (micButton) micButton.addEventListener('click', () => {
      error.hidden = true;
      speech.start();
    });
    closeButton.addEventListener('click', () => closePanel());
    doc.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen) closePanel();
    });
    root.addEventListener('resize', placeLauncher);

    root.addEventListener('needle:assistant-status', (event) => {
      if (event.detail && typeof event.detail.message === 'string') {
        setStatus(event.detail.message, event.detail.loading === true);
      }
    });
    root.addEventListener('needle:assistant-response', (event) => {
      if (event.detail && typeof event.detail.text === 'string') {
        appendMessage(event.detail.text, 'is-assistant');
        setStatus('Ready');
        error.hidden = true;
      }
    });
    root.addEventListener('needle:assistant-error', (event) => {
      error.textContent = event.detail && event.detail.message ? event.detail.message : 'The assistant could not complete that request.';
      error.hidden = false;
      setStatus('Something went wrong');
    });
 
    const toolResults = doc.getElementById('needleAssistantToolResults');
    root.addEventListener('needle:assistant-submit', () => {
      if (!toolResults) return;
      toolResults.replaceChildren();
      toolRows.clear();
      toolResults.hidden = true;
    });
    const toolRows = new Map();
    function toolRow(index, total, tool) {
      if (!toolResults) return null;
      let row = toolRows.get(index);
      if (!row) {
        row = doc.createElement('p');
        row.className = 'needle-assistant-tool-result';
        toolResults.appendChild(row);
        toolRows.set(index, row);
      }
      toolResults.hidden = false;
      row.textContent = (index + 1) + '/' + total + ' · ' + (tool || 'Invalid tool call');
      return row;
    }
    root.addEventListener('needle:assistant-tool-state', (event) => {
      const detail = event.detail || {};
      const row = toolRow(detail.index, detail.total, detail.tool);
      if (!row) return;
      const labels = { running: 'Running', awaiting_confirmation: 'Awaiting your confirmation' };
      row.textContent += ' — ' + (labels[detail.state] || detail.state || 'Working');
      if (detail.message) row.textContent += ': ' + detail.message;
      row.dataset.state = detail.state || '';
    });
    root.addEventListener('needle:assistant-tool-result', (event) => {
      const detail = event.detail || {};
      const row = toolRow(detail.index, detail.total, detail.tool);
      if (!row) return;
      const result = detail.result || {};
      if (detail.state === 'succeeded' && result.result !== undefined) {
        row.textContent += ' — Succeeded: ' + JSON.stringify(result.result);
      } else {
        const failure = result.error || {};
        row.textContent += ' — Failed (' + (failure.code || 'unknown') + '): ' + (failure.message || 'No result returned.');
      }
      row.dataset.state = detail.state || 'failed';
    });
    root.addEventListener('needle:assistant-tool-summary', (event) => {
      const detail = event.detail || {};
      if (!toolResults || !detail.total) return;
      const summary = doc.createElement('p');
      summary.className = 'needle-assistant-tool-summary';
      summary.textContent = 'Tools: ' + detail.succeeded + ' succeeded, ' + detail.failed + ' failed (' + detail.total + ' total)';
      toolResults.appendChild(summary);
      toolResults.hidden = false;
    });

    restoreDock();
    placeLauncher();
    return Object.freeze({ open: openPanel, close: closePanel, reposition: placeLauncher });
  }

  const api = Object.freeze({ clamp, getDockPosition, getPanelPosition, createSpeechInput, createAssistantUI });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NeedleAssistantUI = api;
  if (root && root.document) {
    const initialize = () => { root.NeedleAssistantUIInstance = createAssistantUI(root.document); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
  }
})(typeof window !== 'undefined' ? window : globalThis);
