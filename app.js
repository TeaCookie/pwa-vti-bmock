/**
 * Flat LED Indicator Lights PWA with Logging & Terminal
 * Three realistic flat LED indicator lights with manual logging and terminal
 */

// ============================================
// STATE MANAGEMENT
// ============================================
const state = {
  blue: { left: false, right: false },
  yellow: false,
  red: false,
  logs: {
    blue: [],
    yellow: [],
    red: []
  },
  terminalHistory: [],
  terminalHistoryIndex: -1
};

// ============================================
// DOM ELEMENTS
// ============================================
// Lights
const blueLeft = document.getElementById('blueLeft');
const blueRight = document.getElementById('blueRight');
const yellowLight = document.getElementById('yellowLight');
const redLight = document.getElementById('redLight');
const statusText = document.getElementById('statusText');

// Clock
const clockEl = document.getElementById('clock');

// Terminal
const terminalOutput = document.getElementById('terminalOutput');
const terminalInput = document.getElementById('terminalInput');
const terminalToggle = document.getElementById('terminalToggle');

// Log columns
const blueLogEntries = document.getElementById('blueLogEntries');
const yellowLogEntries = document.getElementById('yellowLogEntries');
const redLogEntries = document.getElementById('redLogEntries');

// Add log buttons
const addBlueLog = document.getElementById('addBlueLog');
const addYellowLog = document.getElementById('addYellowLog');
const addRedLog = document.getElementById('addRedLog');

// Modal
const logModal = document.getElementById('logModal');
const modalTitle = document.getElementById('modalTitle');
const modalClose = document.getElementById('modalClose');
const modalCancel = document.getElementById('modalCancel');
const modalSubmit = document.getElementById('modalSubmit');
const modalDelete = document.getElementById('modalDelete');
const modalEntryId = document.getElementById('modalEntryId');
const modalColumnType = document.getElementById('modalColumnType');
const modalTime = document.getElementById('modalTime');
const modalBlueLeft = document.getElementById('modalBlueLeft');
const modalBlueRight = document.getElementById('modalBlueRight');
const modalYellowOn = document.getElementById('modalYellowOn');
const modalRedTransition = document.getElementById('modalRedTransition');
const blueFields = document.getElementById('blueFields');
const yellowFields = document.getElementById('yellowFields');
const redFields = document.getElementById('redFields');

// Yellow light timer
let yellowTimer = null;
let clockTimer = null;
let currentEditingEntry = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/** Generate unique ID */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/** Format time as HH:MM */
function formatTime(date = new Date()) {
  return date.toTimeString().slice(0, 5);
}

/** Format date for display */
function formatDateTime(date = new Date()) {
  return date.toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Save logs to localStorage */
function saveLogs() {
  localStorage.setItem('indicatorLogs', JSON.stringify(state.logs));
}

/** Load logs from localStorage */
function loadLogs() {
  const saved = localStorage.getItem('indicatorLogs');
  if (saved) {
    try {
      state.logs = JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse logs:', e);
      state.logs = { blue: [], yellow: [], red: [] };
    }
  }
  renderAllLogs();
}

/** Save terminal history */
function saveTerminalHistory() {
  localStorage.setItem('terminalHistory', JSON.stringify(state.terminalHistory.slice(-100)));
}

/** Load terminal history */
function loadTerminalHistory() {
  const saved = localStorage.getItem('terminalHistory');
  if (saved) {
    try {
      state.terminalHistory = JSON.parse(saved);
      state.terminalHistory.forEach(line => appendTerminalLine(line.text, line.type));
    } catch (e) {
      console.error('Failed to parse terminal history:', e);
    }
  }
}

// ============================================
// CLOCK
// ============================================

/** Update clock display */
function updateClock() {
  clockEl.textContent = formatTime();
}

/** Start clock timer */
function startClock() {
  updateClock();
  clockTimer = setInterval(updateClock, 1000);
}

// ============================================
// LIGHT CONTROLS
// ============================================

/** Update status text */
function updateStatus() {
  const parts = [];

  if (state.blue.left || state.blue.right) {
    const sides = [];
    if (state.blue.left) sides.push('Left');
    if (state.blue.right) sides.push('Right');
    parts.push(`Blue: ${sides.join(' + ')} ON`);
  } else {
    parts.push('Blue: OFF');
  }

  parts.push(`Yellow: ${state.yellow ? 'ON' : 'OFF'}`);
  parts.push(`Red: ${state.red ? 'ON' : 'OFF'}`);

  statusText.textContent = parts.join(' | ');
}

/** Toggle blue half */
function toggleBlueHalf(side) {
  state.blue[side] = !state.blue[side];
  const half = side === 'left' ? blueLeft : blueRight;
  half.classList.toggle('on', state.blue[side]);
  half.setAttribute('aria-pressed', state.blue[side]);
  updateStatus();
  appendTerminalLine(`Blue ${side}: ${state.blue[side] ? 'ON' : 'OFF'}`, 'output');
}

/** Schedule yellow random toggle */
function scheduleYellowToggle() {
  if (yellowTimer) clearTimeout(yellowTimer);

  const interval = Math.random() * 10000 + 5000;

  yellowTimer = setTimeout(() => {
    state.yellow = !state.yellow;
    yellowLight.classList.toggle('on', state.yellow);
    yellowLight.setAttribute('aria-label', `Yellow indicator light, currently ${state.yellow ? 'ON' : 'OFF'}, toggles randomly every 5-15 seconds`);
    updateStatus();
    scheduleYellowToggle();
  }, interval);
}

/** Toggle red */
function toggleRed() {
  state.red = !state.red;
  redLight.classList.toggle('on', state.red);
  redLight.setAttribute('aria-pressed', state.red);
  redLight.setAttribute('aria-label', `Red indicator light, currently ${state.red ? 'ON' : 'OFF'}, click to toggle`);
  updateStatus();
  appendTerminalLine(`Red: ${state.red ? 'ON' : 'OFF'}`, 'output');
}

// ============================================
// LOG CRUD OPERATIONS
// ============================================

/** Create or update a log entry (upsert by timestamp) */
function createLogEntry(column, data, time = null) {
  const entryTime = time || formatTime();

  // Check if entry with same time exists (upsert behavior)
  const existingIndex = state.logs[column].findIndex(entry => entry.time === entryTime);

  if (existingIndex !== -1) {
    // Update existing entry
    state.logs[column][existingIndex] = {
      ...state.logs[column][existingIndex],
      ...data,
      time: entryTime,
      updatedAt: Date.now()
    };
    saveLogs();
    renderLogColumn(column);
    appendTerminalLine(`Log updated: ${column.toUpperCase()} at ${entryTime}`, 'info');
    return state.logs[column][existingIndex];
  }

  // Create new entry
  const entry = {
    id: generateId(),
    time: entryTime,
    ...data,
    createdAt: Date.now()
  };

  state.logs[column].unshift(entry); // Add to beginning
  saveLogs();
  renderLogColumn(column);
  appendTerminalLine(`Log created: ${column.toUpperCase()} at ${entry.time}`, 'info');
  return entry;
}

/** Read all log entries for a column */
function readLogs(column) {
  return [...state.logs[column]];
}

/** Read single log entry */
function readLogEntry(column, id) {
  return state.logs[column].find(entry => entry.id === id);
}

/** Update a log entry */
function updateLogEntry(column, id, data) {
  const index = state.logs[column].findIndex(entry => entry.id === id);
  if (index === -1) return null;

  state.logs[column][index] = { ...state.logs[column][index], ...data };
  saveLogs();
  renderLogColumn(column);
  appendTerminalLine(`Log updated: ${column.toUpperCase()} ${id}`, 'info');
  return state.logs[column][index];
}

/** Delete a log entry */
function deleteLogEntry(column, id) {
  const index = state.logs[column].findIndex(entry => entry.id === id);
  if (index === -1) return false;

  state.logs[column].splice(index, 1);
  saveLogs();
  renderLogColumn(column);
  appendTerminalLine(`Log deleted: ${column.toUpperCase()} ${id}`, 'info');
  return true;
}

/** Clear all logs for a column */
function clearLogs(column) {
  state.logs[column] = [];
  saveLogs();
  renderLogColumn(column);
  appendTerminalLine(`Logs cleared: ${column.toUpperCase()}`, 'info');
}

// ============================================
// LOG RENDERING
// ============================================

/** Render all log columns */
function renderAllLogs() {
  renderLogColumn('blue');
  renderLogColumn('yellow');
  renderLogColumn('red');
}

/** Render single log column */
function renderLogColumn(column) {
  const container = column === 'blue' ? blueLogEntries :
                    column === 'yellow' ? yellowLogEntries : redLogEntries;

  const entries = state.logs[column];

  if (entries.length === 0) {
    container.innerHTML = '<div class="log-empty">No entries yet. Click + to add.</div>';
    return;
  }

  container.innerHTML = entries.map(entry => createLogEntryHTML(column, entry)).join('');
}

/** Attach event delegation for log entries (edit/delete buttons) */
function initLogEntryDelegation() {
  const containers = {
    blue: blueLogEntries,
    yellow: yellowLogEntries,
    red: redLogEntries
  };

  Object.entries(containers).forEach(([column, container]) => {
    if (container._logDelegationAttached) return;
    container._logDelegationAttached = true;

    container.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.log-entry-btn.edit');
      const deleteBtn = e.target.closest('.log-entry-btn.delete');

      if (editBtn) {
        e.preventDefault();
        openModal(column, editBtn.dataset.id);
      } else if (deleteBtn) {
        e.preventDefault();
        const id = deleteBtn.dataset.id;
        deleteLogEntry(column, id);
      }
    });
  });
}

/** Create HTML for a log entry */
function createLogEntryHTML(column, entry) {
  let stateBadge = '';

  switch (column) {
    case 'blue':
      if (entry.left && entry.right) {
        stateBadge = '<span class="state-badge blue-both">BOTH</span>';
      } else if (entry.left) {
        stateBadge = '<span class="state-badge blue-left">LEFT</span>';
      } else if (entry.right) {
        stateBadge = '<span class="state-badge blue-right">RIGHT</span>';
      } else {
        stateBadge = '<span class="state-badge" style="background:#333;color:#666">NONE</span>';
      }
      break;

    case 'yellow':
      stateBadge = `<span class="state-badge ${entry.on ? 'yellow-on' : 'yellow-off'}">${entry.on ? 'ON' : 'OFF'}</span>`;
      break;

    case 'red':
      stateBadge = `<span class="state-badge ${entry.transition === 'on-to-off' ? 'red-on-to-off' : 'red-off-to-on'}">${entry.transition === 'on-to-off' ? 'ON → OFF' : 'OFF → ON'}</span>`;
      break;
  }

  return `
    <div class="log-entry" data-id="${entry.id}">
      <div class="log-entry-header">
        <span class="log-entry-time">${entry.time}</span>
        <div class="log-entry-state">${stateBadge}</div>
        <div class="log-entry-actions">
          <button class="log-entry-btn edit" data-id="${entry.id}" aria-label="Edit entry">✎</button>
          <button class="log-entry-btn delete" data-id="${entry.id}" aria-label="Delete entry">✕</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// MODAL HANDLING
// ============================================

/** Open modal for creating/editing log entry */
function openModal(column, entryId = null) {
  currentEditingEntry = entryId;
  modalColumnType.value = column;
  modalEntryId.value = entryId || '';

  // Reset form
  modalTime.value = formatTime();
  modalBlueLeft.checked = false;
  modalBlueRight.checked = false;
  modalYellowOn.checked = false;
  modalRedTransition.value = 'on-to-off';

  // Show/hide fields based on column
  blueFields.style.display = 'none';
  yellowFields.style.display = 'none';
  redFields.style.display = 'none';

  if (entryId) {
    // Editing existing entry
    const entry = readLogEntry(column, entryId);
    if (entry) {
      modalTitle.textContent = 'Edit Entry';
      modalDelete.style.display = 'inline-block';
      modalTime.value = entry.time;

      if (column === 'blue') {
        blueFields.style.display = 'block';
        modalBlueLeft.checked = !!entry.left;
        modalBlueRight.checked = !!entry.right;
      } else if (column === 'yellow') {
        yellowFields.style.display = 'block';
        modalYellowOn.checked = !!entry.on;
      } else if (column === 'red') {
        redFields.style.display = 'block';
        modalRedTransition.value = entry.transition || 'on-to-off';
      }
    }
  } else {
    // Creating new entry
    modalTitle.textContent = 'Add Entry';
    modalDelete.style.display = 'none';

    if (column === 'blue') {
      blueFields.style.display = 'block';
    } else if (column === 'yellow') {
      yellowFields.style.display = 'block';
    } else if (column === 'red') {
      redFields.style.display = 'block';
    }
  }

  logModal.showModal();
  modalTime.focus();
}

/** Close modal */
function closeModal() {
  logModal.close();
  currentEditingEntry = null;
}

/** Handle modal submit */
function handleModalSubmit(e) {
  e.preventDefault();

  const column = modalColumnType.value;
  const entryId = modalEntryId.value;
  const time = modalTime.value;

  let data = {};

  if (column === 'blue') {
    data = {
      left: modalBlueLeft.checked,
      right: modalBlueRight.checked
    };
  } else if (column === 'yellow') {
    data = {
      on: modalYellowOn.checked
    };
  } else if (column === 'red') {
    data = {
      transition: modalRedTransition.value
    };
  }

  if (entryId) {
    updateLogEntry(column, entryId, { time, ...data });
  } else {
    createLogEntry(column, data, time);
  }

  closeModal();
}

/** Handle modal delete */
function handleModalDelete() {
  const column = modalColumnType.value;
  const entryId = modalEntryId.value;

  if (entryId) {
    deleteLogEntry(column, entryId);
    closeModal();
  }
}

// ============================================
// TERMINAL
// ============================================

/** Append line to terminal output */
function appendTerminalLine(text, type = 'output') {
  const line = document.createElement('div');
  line.className = `terminal-line ${type}`;
  line.textContent = text;
  terminalOutput.appendChild(line);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;

  // Save to history
  state.terminalHistory.push({ text, type, time: Date.now() });
  if (state.terminalHistory.length > 100) {
    state.terminalHistory.shift();
  }
  saveTerminalHistory();
}

/** Process terminal command */
function processCommand(cmd) {
  const parts = cmd.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  appendTerminalLine(`> ${cmd}`, 'command');

  switch (command) {
    case 'help':
      showHelp();
      break;

    case 'clear':
      terminalOutput.innerHTML = '';
      break;

    case 'history':
      state.terminalHistory.forEach(h => appendTerminalLine(h.text, h.type));
      break;

    case 'time':
      appendTerminalLine(`Current time: ${formatDateTime()}`, 'info');
      break;

    case 'status':
      appendTerminalLine(`Blue: L=${state.blue.left} R=${state.blue.right} | Yellow: ${state.yellow} | Red: ${state.red}`, 'info');
      break;

    case 'logs':
      showLogsSummary(args[0]);
      break;

    case 'log':
      handleLogCommand(args);
      break;

    case 'set':
      handleSetCommand(args);
      break;

    case 'blue':
      handleBlueCommand(args);
      break;

    case 'yellow':
      handleYellowCommand(args);
      break;

    case 'red':
      handleRedCommand(args);
      break;

    case 'toggle':
      handleToggleCommand(args);
      break;

    case 'delete':
      handleDeleteCommand(args);
      break;

    default:
      appendTerminalLine(`Unknown command: ${command}. Type 'help' for commands.`, 'error');
  }

  terminalInput.value = '';
  state.terminalHistoryIndex = -1;
}

/** Show help */
function showHelp() {
  const help = `
Available Commands:
  help              - Show this help
  clear             - Clear terminal output
  history           - Show command history
  time              - Show current date/time
  status            - Show all light states
  logs [column]     - Show log summary (blue|yellow|red|all)
  log <col> <data>  - Create log entry
  set <col> <time> <data> - Upsert log entry by timestamp (replaces if same time)
  delete <col> <time> - Delete log entry by timestamp
  blue <left|right|both|none> [time] - Log blue state
  yellow <on|off> [time]            - Log yellow state
  red <on-to-off|off-to-on> [time]  - Log red transition
  toggle <color>    - Toggle light (blue-left, blue-right, yellow, red)

Examples:
  blue left 14:30
  yellow on
  red off-to-on 09:15
  toggle blue-right
  set blue 14:30 left right
  set yellow 09:00 on
  set red 18:30 off-to-on
  delete blue 14:30
`;
  appendTerminalLine(help, 'info');
}

/** Show logs summary */
function showLogsSummary(column) {
  if (!column || column === 'all') {
    appendTerminalLine('=== LOG SUMMARY ===', 'info');
    ['blue', 'yellow', 'red'].forEach(col => showLogsSummary(col));
    return;
  }

  const entries = state.logs[column];
  appendTerminalLine(`--- ${column.toUpperCase()} (${entries.length} entries) ---`, 'info');

  if (entries.length === 0) {
    appendTerminalLine('  (empty)', 'output');
    return;
  }

  entries.slice(0, 10).forEach(entry => {
    let desc = '';
    if (column === 'blue') {
      const parts = [];
      if (entry.left) parts.push('L');
      if (entry.right) parts.push('R');
      desc = parts.length ? parts.join('+') : 'none';
    } else if (column === 'yellow') {
      desc = entry.on ? 'ON' : 'OFF';
    } else if (column === 'red') {
      desc = entry.transition === 'on-to-off' ? 'ON→OFF' : 'OFF→ON';
    }
    appendTerminalLine(`  ${entry.time} - ${desc}`, 'output');
  });

  if (entries.length > 10) {
    appendTerminalLine(`  ... and ${entries.length - 10} more`, 'output');
  }
}

/** Handle log command */
function handleLogCommand(args) {
  if (args.length < 2) {
    appendTerminalLine('Usage: log <blue|yellow|red> <data...>', 'error');
    return;
  }

  const column = args[0].toLowerCase();
  const time = args.includes('--time') ? args[args.indexOf('--time') + 1] : formatTime();

  if (column === 'blue') {
    const left = args.includes('left') || args.includes('both');
    const right = args.includes('right') || args.includes('both');
    createLogEntry('blue', { left, right }, time);
  } else if (column === 'yellow') {
    const on = args.includes('on');
    createLogEntry('yellow', { on }, time);
  } else if (column === 'red') {
    const transition = args.includes('off-to-on') ? 'off-to-on' : 'on-to-off';
    createLogEntry('red', { transition }, time);
  } else {
    appendTerminalLine(`Unknown column: ${column}`, 'error');
  }
}

/** Handle blue command */
function handleBlueCommand(args) {
  if (args.length === 0) {
    appendTerminalLine('Usage: blue <left|right|both|none> [time]', 'error');
    return;
  }

  const stateArg = args[0].toLowerCase();
  const time = args[1] || formatTime();

  let left = false, right = false;
  if (stateArg === 'left') left = true;
  else if (stateArg === 'right') right = true;
  else if (stateArg === 'both') { left = true; right = true; }
  else if (stateArg === 'none') { left = false; right = false; }
  else {
    appendTerminalLine('Invalid state. Use: left, right, both, none', 'error');
    return;
  }

  createLogEntry('blue', { left, right }, time);
}

/** Handle yellow command */
function handleYellowCommand(args) {
  if (args.length === 0) {
    appendTerminalLine('Usage: yellow <on|off> [time]', 'error');
    return;
  }

  const on = args[0].toLowerCase() === 'on';
  const time = args[1] || formatTime();

  createLogEntry('yellow', { on }, time);
}

/** Handle red command */
function handleRedCommand(args) {
  if (args.length === 0) {
    appendTerminalLine('Usage: red <on-to-off|off-to-on> [time]', 'error');
    return;
  }

  const transition = args[0].toLowerCase() === 'off-to-on' ? 'off-to-on' : 'on-to-off';
  const time = args[1] || formatTime();

  createLogEntry('red', { transition }, time);
}

/** Handle set command (upsert by timestamp) */
function handleSetCommand(args) {
  if (args.length < 2) {
    appendTerminalLine('Usage: set <blue|yellow|red> <time> [data...]', 'error');
    appendTerminalLine('  blue:   set blue 14:30 left right  (both=left+right, none=empty)', 'info');
    appendTerminalLine('  yellow: set yellow 14:30 on|off', 'info');
    appendTerminalLine('  red:    set red 14:30 on-to-off|off-to-on', 'info');
    return;
  }

  const column = args[0].toLowerCase();
  const time = args[1];

  // Validate time format HH:MM
  if (!/^\d{2}:\d{2}$/.test(time)) {
    appendTerminalLine('Invalid time format. Use HH:MM (e.g., 14:30)', 'error');
    return;
  }

  if (column === 'blue') {
    const left = args.includes('left') || args.includes('both');
    const right = args.includes('right') || args.includes('both');
    createLogEntry('blue', { left, right }, time);
  } else if (column === 'yellow') {
    const on = args.includes('on');
    if (args.length < 3 || (!args.includes('on') && !args.includes('off'))) {
      appendTerminalLine('Usage: set yellow <time> <on|off>', 'error');
      return;
    }
    createLogEntry('yellow', { on }, time);
  } else if (column === 'red') {
    const transition = args.includes('off-to-on') ? 'off-to-on' : 'on-to-off';
    if (args.length < 3 || (!args.includes('on-to-off') && !args.includes('off-to-on'))) {
      appendTerminalLine('Usage: set red <time> <on-to-off|off-to-on>', 'error');
      return;
    }
    createLogEntry('red', { transition }, time);
  } else {
    appendTerminalLine(`Unknown column: ${column}. Use: blue, yellow, red`, 'error');
  }
}

/** Handle toggle command */
function handleToggleCommand(args) {
  if (args.length === 0) {
    appendTerminalLine('Usage: toggle <blue-left|blue-right|yellow|red>', 'error');
    return;
  }

  const target = args[0].toLowerCase();

  switch (target) {
    case 'blue-left':
      toggleBlueHalf('left');
      break;
    case 'blue-right':
      toggleBlueHalf('right');
      break;
    case 'yellow':
      state.yellow = !state.yellow;
      yellowLight.classList.toggle('on', state.yellow);
      updateStatus();
      appendTerminalLine(`Yellow: ${state.yellow ? 'ON' : 'OFF'}`, 'output');
      break;
    case 'red':
      toggleRed();
      break;
    default:
      appendTerminalLine(`Unknown target: ${target}`, 'error');
  }
}

/** Handle delete command (by timestamp) */
function handleDeleteCommand(args) {
  if (args.length < 2) {
    appendTerminalLine('Usage: delete <blue|yellow|red> <time>', 'error');
    return;
  }

  const column = args[0].toLowerCase();
  const time = args[1];

  if (!['blue', 'yellow', 'red'].includes(column)) {
    appendTerminalLine(`Unknown column: ${column}. Use: blue, yellow, red`, 'error');
    return;
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    appendTerminalLine('Invalid time format. Use HH:MM (e.g., 14:30)', 'error');
    return;
  }

  // Find entry by time
  const entry = state.logs[column].find(e => e.time === time);
  if (!entry) {
    appendTerminalLine(`No entry found for ${column.toUpperCase()} at ${time}`, 'error');
    return;
  }

  if (deleteLogEntry(column, entry.id)) {
    appendTerminalLine(`Deleted ${column.toUpperCase()} entry at ${time}`, 'info');
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

function initEventListeners() {
  // Blue light halves
  blueLeft.addEventListener('click', () => toggleBlueHalf('left'));
  blueRight.addEventListener('click', () => toggleBlueHalf('right'));

  blueLeft.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleBlueHalf('left');
    }
  });
  blueRight.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleBlueHalf('right');
    }
  });

  // Red light
  redLight.addEventListener('click', toggleRed);
  redLight.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleRed();
    }
  });

  // Add log buttons
  addBlueLog.addEventListener('click', () => openModal('blue'));
  addYellowLog.addEventListener('click', () => openModal('yellow'));
  addRedLog.addEventListener('click', () => openModal('red'));

  // Modal events
  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);
  modalSubmit.addEventListener('click', handleModalSubmit);
  modalDelete.addEventListener('click', handleModalDelete);

  // Log entry delegation (edit/delete buttons)
  initLogEntryDelegation();

  logModal.addEventListener('click', (e) => {
    if (e.target === logModal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && logModal.open) closeModal();
  });

  // Terminal input
  terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cmd = terminalInput.value.trim();
      if (cmd) processCommand(cmd);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.terminalHistoryIndex < state.terminalHistory.length - 1) {
        state.terminalHistoryIndex++;
        const historyItem = state.terminalHistory[state.terminalHistory.length - 1 - state.terminalHistoryIndex];
        terminalInput.value = historyItem.text;
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.terminalHistoryIndex > 0) {
        state.terminalHistoryIndex--;
        const historyItem = state.terminalHistory[state.terminalHistory.length - 1 - state.terminalHistoryIndex];
        terminalInput.value = historyItem.text;
      } else {
        state.terminalHistoryIndex = -1;
        terminalInput.value = '';
      }
    }
  });

  // Terminal toggle (for mobile)
  terminalToggle.addEventListener('click', () => {
    const output = document.getElementById('terminalOutput');
    const isCollapsed = output.style.display === 'none';
    output.style.display = isCollapsed ? 'block' : 'none';
    terminalToggle.textContent = isCollapsed ? '▼' : '▶';
    terminalToggle.setAttribute('aria-expanded', isCollapsed);
  });

  // Visibility change - pause/resume yellow timer
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (yellowTimer) {
        clearTimeout(yellowTimer);
        yellowTimer = null;
      }
    } else {
      scheduleYellowToggle();
    }
  });
}

// ============================================
// INITIALIZATION
// ============================================

function init() {
  // Set initial ARIA states
  blueLeft.setAttribute('aria-pressed', 'false');
  blueRight.setAttribute('aria-pressed', 'false');
  redLight.setAttribute('aria-pressed', 'false');

  // Load persisted data
  loadLogs();
  loadTerminalHistory();

  // Start timers
  startClock();
  scheduleYellowToggle();

  // Attach event listeners
  initEventListeners();

  // Initial status update
  updateStatus();

  // Welcome message
  appendTerminalLine('Indicator Lights PWA initialized', 'info');
  appendTerminalLine('Type "help" for available commands', 'info');

  console.log('Indicator Lights PWA initialized');
}

// Start when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for testing
window.IndicatorLights = {
  getState: () => ({ ...state }),
  toggleBlueLeft: () => toggleBlueHalf('left'),
  toggleBlueRight: () => toggleBlueHalf('right'),
  toggleRed,
  // Log CRUD
  createLogEntry,
  readLogs,
  readLogEntry,
  updateLogEntry,
  deleteLogEntry,
  clearLogs,
  // Terminal
  appendTerminalLine,
  processCommand
};