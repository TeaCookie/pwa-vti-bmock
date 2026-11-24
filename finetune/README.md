# Fine-tuning Needle 3 for the v5 tools

Plan: <https://claude.ai/artifact/8HbLNBnenL6mjuvEiaMT3f>. The model stays Needle 3; we tune it with `cactus finetune`
and judge the **raw model output** (no guard, no confidence threshold) in `needle/test.html`.

```
finetune/
  tools.train.json   the tools exactly as the engine sees them (generated from needle/tools.v5.json)
  seed.mjs           template examples (query, reasoning, answers) for the v5 tools
  build_data.mjs     tools | seed | check   (check validates, dedupes, drops eval prompts, prints stats)
  lib.mjs            shared validation (reuses needle/validate.js and needle/guard.js column rules)
  check_len.py       token length per example with the real tokenizer (run in WSL)
  make_manifest.mjs  .cact -> needle/assets.<name>.json for the test page
  data/              seed.jsonl (ignored), augmented.jsonl (ignored), train.jsonl (committed)
  checkpoints/       LoRA adapters (Git LFS)
  models/            built .cact files (Git LFS)
  results/           JSON saved from the test page, training logs
```

Everything below runs from the project root in the WSL terminal.

## Experiment 1 results (done)

Experiment 1 worked. The fine-tuned 20-layer model beat the untuned base by a wide margin on both sets, with no
post-model layers involved. It cleared every quality gate. It missed the size gate (63 MB against 30 MB), and the
hold-out score may be inflated.

| Raw model output, no guard | Strict, dev (83) | Strict, hold-out (37) | Wrong calls on 15 off-topic prompts | Median latency | Size |
| --- | --- | --- | --- | --- | --- |
| Untuned base | 58 (70%) | 25 (68%) | 9 on dev, 6 on hold-out | 849 ms | 35 MB |
| exp1, 20 layers | 80 (96%) | 37 (100%) | 0 on both | 804 ms | 63 MB |

**Quality gates.** Overall raw strict was 96% on dev and 100% on hold-out, against the 90% gate. There were no wrong
calls on off-topic or read prompts, and no truncation errors (the base had one, on "list the red logs").

**Size gate.** At 63 MB the model is about double the 30 MB target. That is the next experiment. Median latency of
804 ms is under the 1.2 s gate.

**Dev failures.** Three misses in 83 cases, all on prompts that do not appear in the training data:
- "what does the clock say" returned no call.
- "show the terminal history" returned `get_clock_time`.
- "turn on red and turn off yellow" set yellow to true instead of false.

These look like gaps in template coverage rather than a problem with the approach. Adding template variants for these
shapes is the likely fix, but it should be done after the sealed hold-out exists, so the fix is not tuned on the
prompts that exposed it.

**Contamination.** The training templates and the eval prompts were written by the same person. The hold-out is not
sealed, and 39 of the 120 v5 eval prompts overlap with training at Jaccard 0.8 or higher. A perfect hold-out score is
therefore weaker evidence than it looks. The dev score and the zero false calls on off-topic prompts are more
convincing, because the base's failures there were so consistent.

**Training run** (`results/exp1_train.log`). Validation loss bottomed out at epoch 8 (0.0835) and drifted up to 0.0998
by epoch 20 while training loss went to about 0. That is mild overfitting. Accuracy on the held-out 10% of the
training file was 184/196 exact. Epochs 8 to 10 would likely give the same result in about a third of the time,
roughly 1.2 hours instead of 3+. The reasoning strings also look correct.

## Experiment 2 (planned): smaller model

Question: how many layers can be dropped before accuracy falls under the gates, and does the 30 MB target hold?

1. **Retrain at 10 epochs.** Do this first: a depth ladder is only worth trusting if every depth comes from the same
   consistent training run. Same command as step 2 below with `--epochs 10` and new output names
   (`exp2_adapter.safetensors`, `exp2_train.log`).
2. **Depth ladder.** Build the same adapter at several depths, for example 20, 14, 10 and 8 layers, and make a
   manifest for each. Rebuilding is cheap; it is only `cactus build`. The exact flag combination below is an
   assumption: check `cactus build --help` before running it.
   ```bash
   for N in 20 14 10 8; do
     cactus build --lora finetune/checkpoints/exp2_adapter.safetensors --layers $N --out finetune/models/exp2_${N}l.cact
     node finetune/make_manifest.mjs finetune/models/exp2_${N}l.cact
   done
   ```
3. **Score every depth** on dev and hold-out in `needle/test.html` with `manifest=assets.exp2_<N>l.json`, as in
   step 4 below. Compare strict accuracy, off-topic false calls, median latency and file size against the gates.
   It is not known whether shallow slices trained this way keep their accuracy; this ladder is how we find out.
4. **Sealed hold-out.** Write 20 to 30 prompts yourself, in your own phrasing, without opening the training templates
   (`seed.mjs`) while you do it. Save them as a new cases file in the same format as `needle/cases.holdout.v5.json`
   (suggested name `needle/cases.sealed.v5.json`). Before training anything else, add its file name to the `names` list in
   `loadEvalPrompts()` in `finetune/lib.mjs`, so `build_data.mjs check` drops any training row that matches one of
   its prompts and they can never reach `train.jsonl`. Run each depth on it once. This gives a
   clean generalization number and shows whether the 100% hold-out score holds up.

Gates carried over from experiment 1: raw strict at least 90%, no wrong calls on off-topic or read prompts, no
truncation errors, median latency under 1.2 s, size at most 30 MB.

## Experiment 1 runbook: full depth (20 layers), raw output

Question: how far does training move raw accuracy on the same dev (83) and hold-out (37) prompts?
Untuned raw baseline (from your saved v5 pages): dev 58/83 strict (70%), hold-out 25/37 (68%).

### 0. One-time setup
```bash
git lfs install                       # sudo apt install git-lfs  if the command is missing
git fetch origin needle3-finetune-exp1 && git switch needle3-finetune-exp1
source ~/path/to/your/venv/bin/activate   # the env where cactus is installed; otherwise:
#   python3 -m venv .venv && source .venv/bin/activate && pip install "cactus-compute[train,gpu]"
python -c "import jax; print(jax.devices())"   # must list a CUDA device, not only CpuDevice
echo ${OPENROUTER_API_KEY:+key is set}
```

### 1. Build the data
```bash
node finetune/build_data.mjs tools                    # tools.train.json (unchanged unless tools.v5.json changed)
node finetune/build_data.mjs seed --n 1800            # finetune/data/seed.jsonl, template examples

# independent phrasing from an LLM, using the same tool schemas. Use the model you used before.
cactus generate-data --augment finetune/data/seed.jsonl --num-samples 800 --batch-size 25 --workers 8 \
  --output finetune/data/augmented.jsonl              # (add --model <openrouter model> if you had one)

# validate everything, drop bad / duplicate / eval prompts, print the mix
node finetune/build_data.mjs check finetune/data/augmented.jsonl --out finetune/data/train.jsonl
python finetune/check_len.py finetune/data/train.jsonl --cap 2048
```
`augmented.jsonl` already contains the seed rows, so only it goes into `check`.
Read the `check` output: the `dropped:` list shows what the LLM got wrong (spilled fields, invented times);
`mix:` should have roughly 15-20% no-call examples; the overlap block tells you how much the eval flatters the model.
`check_len.py` tells you the longest example: if "would be cut at 1024" is 0 use `--max-len 1024` below, otherwise 2048.

### 2. Train (log it)
```bash
mkdir -p finetune/checkpoints finetune/results
cactus finetune finetune/data/train.jsonl \
  --epochs 20 --batch-size 16 --lr 1e-4 --lora-rank 32 --lora-alpha 64 \
  --max-len 2048 --val-split 0.1 --seed 42 \
  --checkpoint-dir finetune/checkpoints --out finetune/checkpoints/exp1_adapter.safetensors \
  2>&1 | tee finetune/results/exp1_train.log
```
If it runs out of GPU memory, rerun with `--batch-size 8`. Watch the validation line: stop worrying once it stops
improving; if it is still dropping at epoch 20, rerun with `--epochs 40`. Validation is a random 10% of the same
file, so near-duplicate prompts leak into it: trust the browser test, not the validation number.

### 3. Build the .cact and a manifest
```bash
mkdir -p finetune/models
cactus build --lora finetune/checkpoints/exp1_adapter.safetensors --out finetune/models/exp1_20l.cact
ls -l finetune/models/exp1_20l.cact                   # about 60 MB at 4 bits
node finetune/make_manifest.mjs finetune/models/exp1_20l.cact
```

### 4. Test in the browser (raw)
```bash
python3 -m http.server 8000                           # leave running; open the URLs in Windows Chrome/Edge
```
Open, press **Load model**, **Run all cases**, then **Save results (JSON)**, and move the files into `finetune/results/`:

- dev: `http://127.0.0.1:8000/needle/test.html?tools=tools.v5.json&cases=cases.v5.json&manifest=assets.exp1_20l.json`
- hold-out: `http://127.0.0.1:8000/needle/test.html?tools=tools.v5.json&cases=cases.holdout.v5.json&manifest=assets.exp1_20l.json`
- untuned again, so the baseline is also a JSON we can compare case by case (no `manifest` parameter):
  `http://127.0.0.1:8000/needle/test.html?tools=tools.v5.json&cases=cases.v5.json` and the hold-out equivalent.

A locally built model has no confidence value, so the threshold sweep is replaced by a note. That is expected.
Hard-refresh (Ctrl+Shift+R) once so the browser takes the new test page.

### 5. Commit and push everything
```bash
git add finetune needle/assets.exp1_20l.json needle/test.html needle/test
git commit -m "finetune: experiment 1 data, adapter, 20-layer model, results"
git push -u origin needle3-finetune-exp1
```

### What to send back
The four result JSONs, `finetune/results/exp1_train.log`, and the `check` and `check_len.py` output. Gates and
what comes next (depth ladder with `cactus build --layers N`, then pre-model layers) are in the plan doc.
