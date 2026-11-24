# Indicator Lights PWA

A vanilla HTML/CSS/JS Progressive Web App with three flat LED indicator lights, a digital clock, a manual logging
table and a command terminal. No build step; it deploys straight to Netlify.

Alongside the app, this repo is the workspace for an **ongoing experiment**: getting a small on-device
tool-calling model (Cactus Needle 3, running in a Web Worker) to turn plain-language requests such as
"turn off the right blue light" into calls on the app's tools. The model is **not wired into the app yet**.
See [Needle experiment](#needle-experiment-in-progress) for where it stands.

## Status

| Area | State |
| --- | --- |
| Indicator lights PWA (`index.html`, `app.js`, `styles.css`) | Complete and stable |
| Needle 3 test harness (`needle/`) | Working; used to score tool sets and models |
| Fine-tuning pipeline (`finetune/`) | Experiment 1 done; experiment 2 planned |
| Model wired into the app | Not started, waiting on the experiments below |

## App features

- **Blue light**: two halves (left/right), each toggled independently by click or keyboard
- **Yellow light**: toggles on its own at random intervals of 5-15 seconds
- **Red light**: simple on/off toggle
- **Digital clock** (HH:MM) in the header
- **Manual log table** with three independent columns (blue, yellow, red), full create/edit/delete, saved in `localStorage`
- **Terminal** with command history (up/down arrows), saved in `localStorage`; type `help` for the command list
- **Responsive**: terminal sits right of the lights on desktop, below on tablet, between lights and logs on mobile
- **PWA**: installable, works offline through a cache-first Service Worker
- **Accessible**: keyboard navigation, ARIA labels, `prefers-reduced-motion` and high-contrast support

## Repository layout

```
index.html, styles.css, app.js   the app
manifest.json, sw.js, icons/     PWA manifest, service worker, icon
netlify.toml                     deployment config
needle/                          Needle 3 test harness: tool sets, scored cases, worker, validator, guard, Node tests
finetune/                        fine-tuning data, scripts, training log, results (see finetune/README.md)
docs/                            earlier design notes: tool discovery, model selection, tool interface design
```

Details for each experiment folder are in [`needle/README.md`](needle/README.md) and
[`finetune/README.md`](finetune/README.md).

## Run locally

The Service Worker needs HTTPS (or `localhost`) to register.

```bash
npx netlify-cli dev          # recommended: HTTPS like production
# or
npx serve .                  # or: python3 -m http.server 8000
```

The model test page is at `/needle/test.html` on the same server.

## Tests

The Node tests cover the validator, the guard, the fine-tuning data checks and the worker call sequence (against a
fake Cactus runtime). They say nothing about the real model's accuracy; the browser test page does that.

```bash
node --test needle/test/*.test.mjs
```

On Node 22, pass the files as shown. Passing the directory is treated as a module path and fails.

## Needle experiment (in progress)

The goal is a model small and fast enough to run on-device that maps a request to one of nine tools
(`get_light_status`, `get_clock_time`, `read_logs`, `get_terminal_history`, `toggle_light`, `set_log_entry`,
`delete_log_entry`, `clear_logs`, `export_logs`), or to correctly call nothing when the request is off-topic.
Progress is judged on the **raw model output**: no guard and no confidence threshold.

The path so far: tool-set experiments on the untuned model (3, 16, lean, merged, v2 to v5 tool sets), an app-side
guard, then fine-tuning. Those histories live in `needle/README.md`.

### Experiment 1: fine-tuned 20-layer model (done)

Experiment 1 worked. The fine-tuned 20-layer model beat the untuned base by a wide margin on both sets, with no
post-model layers involved. It cleared every quality gate. It missed the size gate (63 MB against 30 MB), and the
hold-out score may be inflated.

| Raw model output, no guard | Untuned base | exp1, 20 layers | Gate |
| --- | --- | --- | --- |
| Strict, dev (83 cases) | 58 (70%) | 80 (96%) | at least 90% |
| Strict, hold-out (37 cases) | 25 (68%) | 37 (100%) | at least 90% |
| Wrong calls on 15 off-topic prompts | 9 on dev, 6 on hold-out | 0 on both | none |
| Truncation errors | 1 ("list the red logs") | 0 | none |
| Median latency | 849 ms | 804 ms | under 1.2 s |
| Model size | 35 MB | **63 MB** | **30 MB (missed)** |

Things to keep in mind when reading this:

- **The hold-out is not sealed.** The same person wrote both the training templates and the eval prompts, and 39 of
  the 120 v5 eval prompts overlap with training at Jaccard 0.8 or higher. A perfect hold-out score is weaker evidence
  than it looks. The dev score and the zero false calls on off-topic prompts are more convincing, because the base
  model's failures there were so consistent.
- **Three dev misses**, all on prompts that are not in the training data: "what does the clock say" returned no call;
  "show the terminal history" returned `get_clock_time`; "turn on red and turn off yellow" set yellow to true instead
  of false. These look like gaps in template coverage rather than a problem with the approach.
- **Mild overfitting.** Validation loss bottomed out at epoch 8 (0.0835) and drifted up to 0.0998 by epoch 20 while
  training loss went to about 0. Accuracy on the held-out 10% of the training file was 184/196 exact. Epochs 8 to 10
  would probably give the same result in about a third of the time (roughly 1.2 hours instead of 3+).
- **Size is the open problem**, not accuracy.

### Next: experiment 2

1. Retrain at `--epochs 10`, so every model in the next step is trained the same way.
2. Build at several depths with `cactus build --layers N` (for example 20, 14, 10 and 8) and run the dev and hold-out
   sets on each. Rebuilding is cheap. Whether shallow slices trained this way keep their accuracy is not known; that
   is exactly what the depth ladder measures.
3. **Seal a hold-out.** Write 20 to 30 prompts in your own phrasing, without looking at the training templates, and
   keep them out of training. That gives a clean generalization number and shows whether the 100% hold-out score
   holds up.

Until experiment 2 reports, treat the fine-tuned model as a research result, not something shipped in the app.

## Deploy to Netlify

1. **Drag and drop**: drop the project folder on <https://app.netlify.com/drop>.
2. **Git integration**: connect the repository in Netlify, build command `echo 'No build step required'`,
   publish directory `.`.
3. **CLI**: `npx netlify-cli deploy --prod --dir .`

Netlify serves HTTPS, which the Service Worker requires.

## Customization

Colors are CSS custom properties in `styles.css` (`--blue-on-left`, `--yellow-on`, `--red-on`, and so on).
Yellow timing is the random interval in `app.js`:

```javascript
const interval = Math.random() * 10000 + 5000; // 5-15 seconds
```

## Browser support

Chrome/Edge 70+, Firefox 65+, Safari 13.1+, and current mobile browsers. The Needle test page additionally needs
Web Workers with WebAssembly and the Cache API.

## License

MIT License. Feel free to use and modify.
