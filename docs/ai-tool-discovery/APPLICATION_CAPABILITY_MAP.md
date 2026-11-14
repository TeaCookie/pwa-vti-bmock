# Application Capability Map

## Repository Overview

- **Repository**: pwa-vti-bmock (Progressive Web App - Virtual Terminal Indicator - Blue Mock)
- **Commit**: 4c282fd (main branch)
- **Type**: Vanilla HTML/CSS/JS Progressive Web App
- **Runtime**: Browser (HTTPS required for Service Worker)
- **Build System**: None - pure vanilla, no build step
- **Deploy Target**: Netlify (drag-and-drop or CLI)

## Architecture & Entry Points

```
┌─────────────────────────────────────────────────────────────────┐
│                      Browser / PWA                              │
├─────────────────────────────────────────────────────────────────┤
│  index.html  ──►  app.js  ◄──►  localStorage (persistence)     │
│     │              │                                               │
│     │              ├─► Clock (setInterval 1s)                   │
│     │              ├─► Yellow Light (random setTimeout 5-15s)   │
│     │              ├─► Blue/Red Lights (click/keyboard events)  │
│     │              ├─► Log CRUD (3 columns)                     │
│     │              ├─► Terminal (command processor)             │
│     │              └─► Modal (dialog element)                   │
│     │                                                           │
│     ▼                                                           │
│  styles.css  ──► CSS Custom Properties (theming)               │
│     │                                                           │
│     ▼                                                           │
│  manifest.json ──► PWA metadata, icons                         │
│     │                                                           │
│     ▼                                                           │
│  sw.js  ──► Service Worker (cache-first, offline fallback)     │
│     │                                                           │
│     ▼                                                           │
│  netlify.toml ──► Deployment config, headers, caching          │
└─────────────────────────────────────────────────────────────────┘
```

## Major User-Facing Capabilities

### 1. Indicator Light Control
| Light | Behavior | Interaction |
|-------|----------|-------------|
| **Blue** | Split horizontally into left/right halves | Click or keyboard (Enter/Space) on each half independently |
| **Yellow** | Auto-toggles randomly every 5-15 seconds | Read-only (automatic); can be toggled via terminal |
| **Red** | Simple on/off toggle | Click or keyboard (Enter/Space) |

**Source**: `app.js:167-200` (toggle functions), `index.html:22-40` (DOM), `styles.css:148-252` (LED styling)

### 2. Digital Clock
- Updates every second in HH:MM format
- Displayed in header
- Accessible via `aria-live="polite"`

**Source**: `app.js:133-142` (clock functions), `index.html:17` (clock element)

### 3. Manual Logging System (3 Independent Columns)
Each column has distinct data model and UI:

| Column | Data Model | Fields |
|--------|------------|--------|
| **Blue** | `{ left: boolean, right: boolean, time: "HH:MM" }` | Left checkbox, Right checkbox, Time input |
| **Yellow** | `{ on: boolean, time: "HH:MM" }` | On/Off checkbox, Time input |
| **Red** | `{ transition: "on-to-off"\|"off-to-on", time: "HH:MM" }` | Transition select (on-to-off / off-to-on), Time input |

**Operations** (all in `app.js:206-282`):
- `createLogEntry(column, data, time?)` - Create or upsert by timestamp
- `readLogs(column)` - Read all entries for column
- `readLogEntry(column, id)` - Read single entry
- `updateLogEntry(column, id, data)` - Update entry
- `deleteLogEntry(column, id)` - Delete entry
- `clearLogs(column)` - Clear all entries for column

**Persistence**: localStorage key `indicatorLogs` (app.js:93-109)

**UI**: Modal dialog (`index.html:89-130`, `app.js:382-487`)

### 4. Command Terminal
**Layout** (responsive):
- Desktop (≥900px): Fixed 350px width, right of lights panel
- Tablet (600-899px): Full width below lights, max-height 200px
- Mobile (<600px): Full width between lights and logs, fixed 6-line height (180px)

**Available Commands** (`app.js:510-821`):
| Command | Description |
|---------|-------------|
| `help` | Show all commands |
| `clear` | Clear terminal output |
| `history` | Show command history |
| `time` | Show current date/time |
| `status` | Show all light states |
| `logs [blue\|yellow\|red\|all]` | Show log summary |
| `log <col> <data>` | Create log entry |
| `set <col> <time> <data>` | Upsert log entry by timestamp |
| `delete <col> <time>` | Delete log entry by timestamp |
| `blue <left\|right\|both\|none> [time]` | Log blue state |
| `yellow <on\|off> [time]` | Log yellow state |
| `red <on-to-off\|off-to-on> [time]` | Log red transition |
| `toggle <blue-left\|blue-right\|yellow\|red>` | Toggle light state |

**Features**: Command history (↑/↓ arrows), persists last 100 lines to localStorage (`terminalHistory`)

**Source**: `app.js:493-909`, `index.html:44-54`, `styles.css:314-411`

### 5. PWA Features
- **Manifest**: `display: standalone`, SVG + PNG icons, theme colors
- **Service Worker**: Cache-first strategy, offline fallback to index.html
- **HTTPS Required**: Service Worker only registers on HTTPS (Netlify provides)

**Source**: `manifest.json`, `sw.js`, `netlify.toml`

### 6. Accessibility & Theming
- Full keyboard navigation (Tab, Enter, Space)
- ARIA labels and live regions
- `prefers-reduced-motion` support (disables animations)
- `prefers-contrast: high` mode support
- CSS custom properties for all colors (easy theming)

**Source**: `styles.css:737-766`, `index.html` (ARIA attributes)

## Data Flows

```
User Interaction (click/keyboard/terminal)
         │
         ▼
    Event Listeners (app.js:827-921)
         │
         ▼
    State Mutations (state object, app.js:9-20)
         │
         ├──► UI Updates (DOM manipulation, render functions)
         ├──► localStorage Persistence (saveLogs, saveTerminalHistory)
         └──► Terminal Output (appendTerminalLine)
```

## Dependencies & External Integrations

| Dependency | Purpose | Location |
|------------|---------|----------|
| **Netlify** | Hosting, HTTPS, CDN | `netlify.toml` |
| **Service Worker API** | Offline caching | `sw.js` |
| **localStorage** | Client-side persistence | `app.js:93-127` |
| **Dialog API** | Modal dialogs | `index.html:89-130`, `app.js:382-487` |
| **JSZip (CDN)** | Icon generation tool | `icons/generate-icons.html:214` |

## Source File Map

| File | Purpose | Key Exports/Functions |
|------|---------|----------------------|
| `index.html` | Main HTML structure | DOM elements, ARIA |
| `app.js` | All application logic | `state`, CRUD functions, terminal, light controls |
| `styles.css` | Styling & theming | CSS custom properties, responsive breakpoints |
| `manifest.json` | PWA metadata | Name, icons, display mode |
| `sw.js` | Service Worker | Cache management, fetch handling |
| `netlify.toml` | Deployment config | Headers, caching, redirects |
| `icons/icon.svg` | Source icon | Maskable, any size |
| `icons/generate-icons.html` | Icon generator tool | Canvas rendering, JSZip |

## Inspection Limitations

- No test files found in repository
- No TypeScript/type definitions
- No build pipeline to inspect
- No backend/API - purely client-side
- No authentication/authorization system
- Generated PNG icons not present (would need `generate-icons.html` run)