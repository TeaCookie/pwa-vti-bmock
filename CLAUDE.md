# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**pwa-vti-bmock** - A vanilla HTML/CSS/JS Progressive Web App featuring three realistic flat LED indicator lights with digital clock, manual logging system, and command terminal. No build step required - deploys directly to Netlify.

## Current State

- **Repository**: Complete PWA with vanilla HTML, CSS, JS
- **Branch**: `main` (clean)
- **No package.json, no build system, no test framework** - pure vanilla JS

## Project Structure

```
pwa-vti-bmock/
├── index.html          # Main HTML with lights, clock, terminal, log table, modal
├── styles.css          # Flat LED styling + responsive layout (terminal right on desktop, below on mobile)
├── app.js              # Light logic, clock, log CRUD, terminal, modal, localStorage persistence
├── manifest.json       # PWA manifest (SVG + PNG icons)
├── sw.js               # Service Worker for offline caching
├── netlify.toml        # Netlify deployment config
├── icons/
│   ├── icon.svg        # Source SVG icon (maskable, any size)
│   ├── generate-icons.html  # Browser tool to generate PNG icons
│   └── icon-*.png      # Generated PNG icons (72-512px)
└── README.md           # Project documentation
```

## Commands

### Local Development
```bash
# Netlify CLI (recommended - provides HTTPS for SW)
npx netlify-cli dev

# Or simple HTTP server (SW won't register without HTTPS)
npx serve .
# or
python -m http.server 8000
```

### Deploy to Netlify
```bash
# Drag & drop folder to https://app.netlify.com/drop
# Or use CLI:
npx netlify-cli deploy --prod --dir .
```

### Generate PNG Icons
```bash
# Open in browser:
open icons/generate-icons.html
# Click "Generate All PNG Icons" → "Download All as ZIP" → extract to icons/
```

## Architecture

### Light Behaviors
- **Blue** (`#blueLeft`, `#blueRight`): Two halves, each independently togglable via click/keyboard
- **Yellow** (`#yellowLight`): Random toggle every 5-15 seconds via `setTimeout` loop
- **Red** (`#redLight`): Simple toggle on click/keyboard

### Digital Clock
- Updates every second via `setInterval`
- Shows HH:MM format in header
- Uses `toTimeString().slice(0,5)` for formatting

### Manual Logging System (3 Columns)
Each column is independent - actual light states DON'T affect log entries.

| Column | Data Model | Purpose |
|--------|------------|---------|
| **Blue** | `{ left: boolean, right: boolean, time: "HH:MM" }` | Log left/right/both/none state at specific time |
| **Yellow** | `{ on: boolean, time: "HH:MM" }` | Log on/off state at specific time |
| **Red** | `{ transition: "on-to-off"|"off-to-on", time: "HH:MM" }` | Log state transition at specific time |

### Log CRUD Operations (in `app.js`)
```javascript
// Create - time defaults to current time
createLogEntry('blue', { left: true, right: false }, '14:30');
createLogEntry('yellow', { on: true });
createLogEntry('red', { transition: 'on-to-off' });

// Read
readLogs('blue');           // All entries
readLogEntry('blue', id);   // Single entry

// Update
updateLogEntry('blue', id, { left: true, time: '15:00' });

// Delete
deleteLogEntry('blue', id);

// Clear all
clearLogs('blue');
```

### Terminal Component
- **Desktop (≥900px)**: Fixed width 350px, anchored right of lights panel
- **Tablet (600-899px)**: Full width, below lights panel, max-height 200px
- **Mobile (<600px)**: Full width, between lights and logs, fixed 6-line height (180px)
- Collapsible on mobile via toggle button
- Command history with ↑/↓ arrows
- Persists last 100 lines to localStorage

**Available Commands:**
```
help                    - Show help
clear                   - Clear terminal
history                 - Show command history
time                    - Show current date/time
status                  - Show all light states
logs [blue|yellow|red|all] - Show log summary
log <col> <data>        - Create log entry
blue <left|right|both|none> [time]
yellow <on|off> [time]
red <on-to-off|off-to-on> [time]
toggle <blue-left|blue-right|yellow|red>
```

### State Management
- Single `state` object in `app.js` tracks lights, logs, terminal history
- Logs persisted to `localStorage` key `indicatorLogs`
- Terminal history persisted to `localStorage` key `terminalHistory`
- `updateStatus()` reflects light states in footer

### Styling Approach
- CSS custom properties for all colors (easy theming)
- CSS animations for glow/pulse effects
- `prefers-reduced-motion` and `prefers-contrast` media queries
- Responsive breakpoints: 900px (desktop), 600px (tablet), 599px (mobile)
- Flat LED design using layered `box-shadow` (no gradients)

### PWA Features
- **Manifest**: `display: standalone`, SVG + PNG icons, theme colors
- **Service Worker**: Cache-first strategy, offline fallback to index.html
- **HTTPS required** for SW registration (Netlify provides automatically)

## Key Files to Modify

| Change | File |
|--------|------|
| Light colors/glow | `styles.css` (CSS custom properties) |
| Yellow timing | `app.js` (interval calculation) |
| Light behaviors | `app.js` (toggle functions) |
| Clock format | `app.js` (`formatTime()`) |
| Log data models | `app.js` (createLogEntry per column) |
| Terminal commands | `app.js` (`processCommand()`) |
| PWA metadata | `manifest.json` |
| Caching headers | `netlify.toml` |
| Offline behavior | `sw.js` |

## Git Workflow

- Main branch: `main`
- No build step - commit source files directly
- Co-author attribution for Claude-assisted commits:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```

## Testing Checklist

- [ ] Blue left/right halves toggle independently
- [ ] Yellow light toggles randomly (5-15s)
- [ ] Red light toggles on click
- [ ] Keyboard navigation works (Tab, Enter, Space)
- [ ] Status text updates correctly
- [ ] Clock updates every second
- [ ] Create log entry in each column (click + button)
- [ ] Edit log entry (click ✎)
- [ ] Delete log entry (click ✕)
- [ ] Modal shows correct fields per column
- [ ] Terminal accepts commands (help, status, logs, blue, yellow, red, toggle)
- [ ] Terminal history works with ↑/↓ arrows
- [ ] Terminal persists across reloads
- [ ] Logs persist across reloads (localStorage)
- [ ] Responsive: terminal right on desktop, below on tablet, between on mobile
- [ ] PWA installs on mobile/desktop
- [ ] Works offline after first load
- [ ] Reduced motion disables animations
- [ ] High contrast mode works