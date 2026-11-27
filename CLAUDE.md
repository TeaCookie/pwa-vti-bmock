# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**pwa-vti-bmock** has two parts:

1. **The app**: a vanilla HTML/CSS/JS Progressive Web App with three flat LED indicator lights, a digital clock, a manual logging system and a command terminal. No build step; it deploys directly to Netlify.
2. **An ongoing experiment** (`needle/`, `finetune/`): getting a small on-device tool-calling model (Cactus Needle 3, in a Web Worker) to turn plain-language requests into calls on the app's tools. **The model is not wired into the app** and nothing in `app.js` or `index.html` references it.

## Current State

- **App**: complete and stable. Changes here are normal feature or bug work.
- **Model experiment**: in progress. Experiment 1 (fine-tuned 20-layer model) cleared the accuracy, off-topic and latency gates but missed the size gate (63 MB vs 30 MB), and its hold-out score may be inflated because the hold-out is not sealed. Experiment 2 (retrain at 10 epochs, depth ladder, sealed hold-out) is planned. Numbers and caveats are in `README.md` and `finetune/README.md`.
- **Keep model evaluation separate from application integration.** Experiment 2 is intended to improve or replace the model artifact; it is not a prerequisite for implementing the tool adapter, application handlers, UI confirmation, or their tests. Keep model loading/configuration replaceable so a later artifact can be swapped without redesigning the integration. Do not describe Experiment 1 as production-ready: it missed the 30 MB size gate (63 MB actual), and its hold-out score has a contamination caveat.
- **No build system and no `package.json`.** There is a Node test suite (see Commands) but no test framework dependency.

## Project Structure

```
pwa-vti-bmock/
├── index.html, styles.css, app.js   # The app: lights, clock, log CRUD, terminal, modal, localStorage
├── manifest.json, sw.js             # PWA manifest and Service Worker (sw.js ignores /needle/)
├── netlify.toml                     # Netlify deployment config
├── icons/icon.svg                   # Source SVG icon (maskable, any size)
├── needle/                          # Model test harness (not part of the shipped app)
│   ├── tools.*.json                 # Tool sets under test (v5 is current: 9 tools)
│   ├── cases.*.json                 # Scored prompt sets (dev, hold-out, per tool set)
│   ├── needle.worker.js             # Web Worker: Cactus runtime, model, cactus_complete, validation
│   ├── needle-client.js             # init()/complete() promise API for the page
│   ├── validate.js                  # Output parsing and scoring (shared by worker, page, tests)
│   ├── guard.js                     # App-side domain gate and per-column field cleanup (not used when scoring raw output)
│   ├── test.html                    # Test page; takes ?tools=, ?cases=, ?manifest=
│   ├── assets*.json                 # Pinned runtime/model manifests (assets.exp1_20l.json = fine-tuned model)
│   └── test/*.test.mjs              # Node tests
├── finetune/                        # Fine-tuning pipeline: data, scripts, training logs, results (see its README)
├── docs/                            # Earlier design notes (tool discovery, model selection, tool interface design)
└── README.md
```

## Commands

### Local Development
```bash
# Netlify CLI (recommended - provides HTTPS for SW)
npx netlify-cli dev

# Or simple HTTP server (SW won't register without HTTPS; localhost is fine for the model test page)
npx serve .
# or
python3 -m http.server 8000
```

### Tests
```bash
node --test needle/test/*.test.mjs
```
Pass the files with the glob. On Node 22, passing the directory (`needle/test`) is treated as a module path and fails with `MODULE_NOT_FOUND`. These tests use a fake Cactus runtime: they check validation, the guard, data checks and the worker call sequence, not the real model's accuracy. Accuracy is measured in the browser at `/needle/test.html`.

### Deploy to Netlify
```bash
# Drag & drop folder to https://app.netlify.com/drop
# Or use CLI:
npx netlify-cli deploy --prod --dir .
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
- **Manifest**: `display: standalone`, SVG icon (maskable, any size), theme colors
- **Service Worker**: Cache-first strategy, offline fallback to index.html; requests under `/needle/` bypass it so stale worker files are never served
- **HTTPS required** for SW registration (Netlify provides automatically)

## Model Experiment (needle/, finetune/)

### What is being built
A model that maps a request to one of nine v5 tools, or to no call at all when the request is off-topic: `get_light_status`, `get_clock_time`, `read_logs`, `get_terminal_history`, `toggle_light`, `set_log_entry`, `delete_log_entry`, `clear_logs`, `export_logs`. In `set_log_entry`, one closed `entry_state` value replaces the separate `left`/`right`/`on`/`transition` fields (blue: `left|right|both|none`, yellow: `on|off`, red: `on-to-off|off-to-on`), mirroring the terminal vocabulary above.

### Working rules
- **Judge the raw model output**: no guard, no confidence threshold. The guard in `needle/guard.js` is a later layer, not part of the score.
- **Change one thing per run** and compare group tables before and after. Add a case for every new failure before changing anything else.
- **Do not tune on the hold-out.** The current hold-out is not sealed (the same person wrote the training templates and the eval prompts; 39 of 120 v5 eval prompts overlap training at Jaccard 0.8 or higher). A 100% hold-out score is weak evidence. Prefer the dev score and the off-topic false-call count, and use a sealed set of prompts written without looking at the templates for any claim about generalization.
- **Eval prompts must never reach training.** `finetune/build_data.mjs check` drops training rows that match an eval prompt, using the hardcoded `names` list in `loadEvalPrompts()` in `finetune/lib.mjs`. Any new eval file (such as the sealed hold-out) must be added to that list before the next training run.
- **Do not claim more than the data shows.** State the size gate miss (63 MB vs 30 MB) and the contamination caveat whenever quoting experiment 1 numbers.
- **Never edit `needle/validate.js` scoring to make a result look better.** If real engine output differs from what the parser expects, fix the parser in that one file and say so.

### Experiment 1 result (summary)
Fine-tuned 20-layer model vs untuned base, raw output: dev strict 80/83 (96%) vs 58/83 (70%); hold-out strict 37/37 (100%, possibly inflated) vs 25/37 (68%); wrong calls on 15 off-topic prompts 0 vs 9 (dev) and 6 (hold-out); median latency 804 ms vs 849 ms; size 63 MB vs 35 MB. Gates: accuracy at least 90%, no off-topic false calls, no truncation errors, latency under 1.2 s, size at most 30 MB (missed). Three dev misses, all prompts absent from training: "what does the clock say", "show the terminal history", "turn on red and turn off yellow". Training: validation loss bottomed at epoch 8 and rose by epoch 20, so mild overfitting. Full detail: `finetune/README.md`.

### Next (experiment 2)
Retrain at `--epochs 10`, build with `cactus build --layers N` at several depths (for example 20, 14, 10, 8), score each on dev and hold-out, and add a sealed hold-out of 20 to 30 prompts written by the user. Details and commands: `finetune/README.md`.

## Key Files to Modify

| Change | File |
|--------|------|
| Light colors/glow | `styles.css` (CSS custom properties) |
| Yellow timing | `app.js` (interval calculation) |
| Light behaviors | `app.js` (toggle functions) |
| Clock format | `app.js` (`formatTime()`) |
| Log data models | `app.js` (createLogEntry per column) |
| Terminal commands | `app.js` (`processCommand()`) |
| PWA metadata | `manifest.json` (SVG icon only) |
| Caching headers | `netlify.toml` |
| Offline behavior | `sw.js` |
| Tool definitions under test | `needle/tools.*.json` (and regenerate `finetune/tools.train.json`) |
| Scored prompts | `needle/cases.*.json` |
| Training data and templates | `finetune/seed.mjs`, `finetune/build_data.mjs` |

## Git Workflow

- Main branch: `main`. Experiment work happens on `needle3-*` branches; `needle3-finetune-exp1` stacks on all earlier ones, so merging it brings the whole history.
- When merging an experiment branch, use a merge commit or fast-forward, **not squash**. Squashing makes the earlier `needle3-*` branches look unmerged and loses per-experiment history.
- No build step - commit source files directly.
- **Git LFS** is used for model artifacts (`*.safetensors`, `*.cact`). Run `git lfs install` before committing them. Never commit `node_modules/`.
- Co-author attribution for Claude-assisted commits: use the name of the model that did the work, for example:
  ```
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  ```

## Testing Checklist

App:
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

Model experiment:
- [ ] `node --test needle/test/*.test.mjs` passes
- [ ] Raw (no guard) dev and hold-out runs saved to `finetune/results/` for every model compared
- [ ] Size, median latency, off-topic false calls and truncation errors recorded next to accuracy
- [ ] Any hold-out number quoted with its contamination caveat unless it comes from the sealed set
