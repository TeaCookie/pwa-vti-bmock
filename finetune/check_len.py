#!/usr/bin/env python3
"""Token length of every training example, using the same tokenizer and rendering `cactus finetune` uses.

    python finetune/check_len.py finetune/data/train.jsonl [--cap 2048]

`cactus finetune` silently cuts examples longer than --max-len, and a cut example loses its answer.
Run this once WSL has the cactus package installed (it fetches the tokenizer on first use).
"""
import argparse
import sys

from cactus.model.finetune import read_examples, render_example
from cactus.model.tokenizer import get_tokenizer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--cap", type=int, default=2048, help="the --max-len you plan to pass")
    args = ap.parse_args()

    tok = get_tokenizer()
    lengths = []
    for ex in read_examples(args.path):
        prompt, target = render_example(ex)
        lengths.append(len(tok.encode(prompt)) + len(tok.encode(target)) + 2)
    if not lengths:
        sys.exit("no examples")
    lengths.sort()
    pick = lambda q: lengths[min(len(lengths) - 1, int(q * len(lengths)))]
    print(f"examples {len(lengths)}  min {lengths[0]}  median {pick(0.5)}  p95 {pick(0.95)}  max {lengths[-1]}")
    over = sum(1 for n in lengths if n > args.cap)
    print(f"over --max-len {args.cap}: {over}")
    for cap in (1024, 1536, 2048):
        print(f"  would be cut at {cap}: {sum(1 for n in lengths if n > cap)}")
    if over:
        sys.exit(1)


if __name__ == "__main__":
    main()
