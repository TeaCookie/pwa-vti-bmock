/**
 * Audit Logger for Tool Adapter
 * Tracks model-initiated vs user-initiated actions
 */

import { ADAPTER_CONFIG } from './config.js';

const AUDIT_STORAGE_KEY = 'indicatorAuditLog';

class AuditLogger {
  constructor(config = {}) {
    this.enabled = config.auditEnabled !== false;
    this.persist = config.auditPersistToStorage || false;
    this.maxEntries = config.auditMaxEntries || 1000;
    this.entries = [];

    // Load from storage if persistence enabled
    if (this.persist) {
      this.loadFromStorage();
    }
  }

  /**
   * Sanitize arguments for logging (remove sensitive data)
   */
  sanitizeArgs(args) {
    if (!args || typeof args !== 'object') return args;

    const sanitized = { ...args };
    // For this app, no sensitive data, but keep the pattern
    return sanitized;
  }

  /**
   * Add an audit entry
   */
  log(tool, source, args, result, durationMs) {
    if (!this.enabled) return;

    const entry = {
      id: 'audit_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      tool,
      source, // 'user' | 'model'
      args: this.sanitizeArgs(args),
      result: result?.error ? 'error' : 'success',
      errorCode: result?.error ? result.code : undefined,
      durationMs,
    };

    this.entries.push(entry);

    // Trim to max entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Persist if enabled
    if (this.persist) {
      this.saveToStorage();
    }

    return entry;
  }

  /**
   * Get audit log entries
   */
  getEntries(limit = 100) {
    return this.entries.slice(-limit);
  }

  /**
   * Clear audit log
   */
  clear() {
    this.entries = [];
    if (this.persist) {
      this.saveToStorage();
    }
  }

  /**
   * Save to localStorage
   */
  saveToStorage() {
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(this.entries));
    } catch (error) {
      console.warn('[Audit] Failed to save to localStorage:', error);
    }
  }

  /**
   * Load from localStorage
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (stored) {
        this.entries = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('[Audit] Failed to load from localStorage:', error);
      this.entries = [];
    }
  }

  /**
   * Get audit statistics
   */
  getStats() {
    const total = this.entries.length;
    const bySource = { user: 0, model: 0 };
    const byTool = {};
    const byResult = { success: 0, error: 0 };

    for (const entry of this.entries) {
      bySource[entry.source] = (bySource[entry.source] || 0) + 1;
      byTool[entry.tool] = (byTool[entry.tool] || 0) + 1;
      byResult[entry.result] = (byResult[entry.result] || 0) + 1;
    }

    return { total, bySource, byTool, byResult };
  }
}

// Singleton instance
let auditLoggerInstance = null;

/**
 * Get or create audit logger instance
 */
export function getAuditLogger(config) {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger(config);
  }
  return auditLoggerInstance;
}

/**
 * Reset audit logger (for testing)
 */
export function resetAuditLogger() {
  auditLoggerInstance = null;
}