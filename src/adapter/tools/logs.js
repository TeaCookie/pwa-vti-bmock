/**
 * Log Tool Handlers
 * Implements: read_logs, create_log_entry (and Needle 3 expanded versions),
 * update_log_entry (expanded), delete_log_entry, clear_logs, export_logs, import_logs
 */

import { validateToolArgs, validateImportData } from '../validation.js';
import { normalizeError } from '../errors.js';

/**
 * Get IndicatorLights API from window
 */
function getIndicatorLights() {
  if (!window.IndicatorLights) {
    throw new Error('IndicatorLights not initialized');
  }
  return window.IndicatorLights;
}

/**
 * Read logs for one or all columns
 */
async function handleReadLogs(args, context) {
  validateToolArgs('read_logs', args);

  const IndicatorLights = getIndicatorLights();
  const { column = 'all', limit, offset = 0 } = args;

  const columns = column === 'all' ? ['blue', 'yellow', 'red'] : [column];
  const result = { totalCount: { blue: 0, yellow: 0, red: 0 } };

  for (const col of columns) {
    let entries = IndicatorLights.readLogs(col);
    result.totalCount[col] = entries.length;

    if (limit) {
      entries = entries.slice(0, limit);
    }
    if (offset) {
      entries = entries.slice(offset);
    }

    if (column === 'all') {
      result[col] = entries;
    } else {
      result.entries = entries;
    }
  }

  return result;
}

/**
 * Create log entry - unified handler for all columns
 */
function createLogEntry(column, data, time) {
  const IndicatorLights = getIndicatorLights();
  return IndicatorLights.createLogEntry(column, data, time);
}

/**
 * Create Blue log entry (Needle 3 expanded tool)
 */
async function handleCreateBlueLogEntry(args, context) {
  validateToolArgs('create_blue_log_entry', args);
  const { time, left, right } = args;
  const entry = createLogEntry('blue', { left, right }, time);
  return { entry, action: entry.updatedAt ? 'updated' : 'created' };
}

/**
 * Create Yellow log entry (Needle 3 expanded tool)
 */
async function handleCreateYellowLogEntry(args, context) {
  validateToolArgs('create_yellow_log_entry', args);
  const { time, on } = args;
  const entry = createLogEntry('yellow', { on }, time);
  return { entry, action: entry.updatedAt ? 'updated' : 'created' };
}

/**
 * Create Red log entry (Needle 3 expanded tool)
 */
async function handleCreateRedLogEntry(args, context) {
  validateToolArgs('create_red_log_entry', args);
  const { time, transition } = args;
  const entry = createLogEntry('red', { transition }, time);
  return { entry, action: entry.updatedAt ? 'updated' : 'created' };
}

/**
 * Update log entry - unified handler
 */
function updateLogEntry(column, id, data, time) {
  const IndicatorLights = getIndicatorLights();
  const updateData = { ...data };
  if (time) updateData.time = time;
  return IndicatorLights.updateLogEntry(column, id, updateData);
}

/**
 * Update Blue log entry (Needle 3 expanded tool)
 */
async function handleUpdateBlueLogEntry(args, context) {
  validateToolArgs('update_blue_log_entry', args);
  const { id, left, right, time } = args;
  const data = {};
  if (left !== undefined) data.left = left;
  if (right !== undefined) data.right = right;
  const entry = updateLogEntry('blue', id, data, time);
  if (!entry) throw normalizeError(new Error('Entry not found'), { code: 'entry_not_found' });
  return { entry };
}

/**
 * Update Yellow log entry (Needle 3 expanded tool)
 */
async function handleUpdateYellowLogEntry(args, context) {
  validateToolArgs('update_yellow_log_entry', args);
  const { id, on, time } = args;
  const data = {};
  if (on !== undefined) data.on = on;
  const entry = updateLogEntry('yellow', id, data, time);
  if (!entry) throw normalizeError(new Error('Entry not found'), { code: 'entry_not_found' });
  return { entry };
}

/**
 * Update Red log entry (Needle 3 expanded tool)
 */
async function handleUpdateRedLogEntry(args, context) {
  validateToolArgs('update_red_log_entry', args);
  const { id, transition, time } = args;
  const data = {};
  if (transition !== undefined) data.transition = transition;
  const entry = updateLogEntry('red', id, data, time);
  if (!entry) throw normalizeError(new Error('Entry not found'), { code: 'entry_not_found' });
  return { entry };
}

/**
 * Delete log entry
 */
async function handleDeleteLogEntry(args, context) {
  validateToolArgs('delete_log_entry', args);
  const { column, id, confirm } = args;

  const IndicatorLights = getIndicatorLights();
  const success = IndicatorLights.deleteLogEntry(column, id);

  if (!success) {
    throw normalizeError(new Error('Entry not found'), { code: 'entry_not_found' });
  }

  return { success: true, deletedId: id };
}

/**
 * Clear all logs for a column
 */
async function handleClearLogs(args, context) {
  validateToolArgs('clear_logs', args);
  const { column, confirm, dryRun } = args;

  const IndicatorLights = getIndicatorLights();
  const currentLogs = IndicatorLights.readLogs(column);
  const deletedCount = currentLogs.length;

  if (dryRun) {
    return { column, deletedCount, dryRun: true };
  }

  IndicatorLights.clearLogs(column);

  return { column, deletedCount, dryRun: false };
}

/**
 * Export logs
 */
async function handleExportLogs(args, context) {
  validateToolArgs('export_logs', args);
  const { format = 'json', includeMetadata = true } = args;

  const IndicatorLights = getIndicatorLights();
  const blue = IndicatorLights.readLogs('blue');
  const yellow = IndicatorLights.readLogs('yellow');
  const red = IndicatorLights.readLogs('red');

  const entryCounts = {
    blue: blue.length,
    yellow: yellow.length,
    red: red.length,
    total: blue.length + yellow.length + red.length,
  };

  let data;

  if (format === 'json') {
    const exportData = { blue, yellow, red };
    if (!includeMetadata) {
      // Strip metadata fields
      for (const col of ['blue', 'yellow', 'red']) {
        exportData[col] = exportData[col].map(({ createdAt, updatedAt, ...rest }) => rest);
      }
    }
    data = JSON.stringify(exportData, null, 2);
  } else {
    // CSV format
    const headers = ['column', 'id', 'time', 'data', 'createdAt', 'updatedAt'];
    const rows = [headers.join(',')];

    for (const [col, entries] of Object.entries({ blue, yellow, red })) {
      for (const entry of entries) {
        let dataStr = '';
        if (col === 'blue') {
          dataStr = `left:${entry.left},right:${entry.right}`;
        } else if (col === 'yellow') {
          dataStr = `on:${entry.on}`;
        } else if (col === 'red') {
          dataStr = `transition:${entry.transition}`;
        }

        const row = [
          col,
          entry.id,
          entry.time,
          `"${dataStr}"`,
          includeMetadata ? entry.createdAt : '',
          includeMetadata ? (entry.updatedAt || '') : '',
        ];
        rows.push(row.join(','));
      }
    }

    data = rows.join('\n');
  }

  return { format, data, entryCounts, exportedAt: Date.now() };
}

/**
 * Import logs
 */
async function handleImportLogs(args, context) {
  validateToolArgs('import_logs', args);
  const { data, mode = 'replace', confirm, dryRun } = args;

  // Validate import data
  const validation = validateImportData(data);
  if (!validation.valid) {
    return {
      mode,
      imported: { blue: 0, yellow: 0, red: 0, total: 0 },
      errors: validation.errors,
      dryRun: true, // Force dry-run on validation error
    };
  }

  const IndicatorLights = getIndicatorLights();

  if (dryRun) {
    // Preview: count what would be imported
    const imported = {
      blue: data.blue.length,
      yellow: data.yellow.length,
      red: data.red.length,
      total: data.blue.length + data.yellow.length + data.red.length,
    };
    return { mode, imported, errors: [], dryRun: true };
  }

  const imported = { blue: 0, yellow: 0, red: 0, total: 0 };
  const errors = [];

  if (mode === 'replace') {
    // Clear all columns first
    IndicatorLights.clearLogs('blue');
    IndicatorLights.clearLogs('yellow');
    IndicatorLights.clearLogs('red');
  }

  // Import each column
  for (const [column, entries] of Object.entries(data)) {
    for (const entry of entries) {
      try {
        // Remove metadata fields for createLogEntry
        const { id, createdAt, updatedAt, time, ...entryData } = entry;
        IndicatorLights.createLogEntry(column, entryData, time);
        imported[column]++;
        imported.total++;
      } catch (error) {
        errors.push({ column, error: error.message, entry });
      }
    }
  }

  return { mode, imported, errors, dryRun: false };
}

// Export all handlers and the helper function
export {
  getIndicatorLights,
  handleReadLogs,
  handleCreateBlueLogEntry,
  handleCreateYellowLogEntry,
  handleCreateRedLogEntry,
  handleUpdateBlueLogEntry,
  handleUpdateYellowLogEntry,
  handleUpdateRedLogEntry,
  handleDeleteLogEntry,
  handleClearLogs,
  handleExportLogs,
  handleImportLogs,
};