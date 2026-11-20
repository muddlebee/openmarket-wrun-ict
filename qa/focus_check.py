#!/usr/bin/env python3
"""Check which lines the Focus view draws, from dumps taken with Focus forced on.

Focus draws at most 5 lines:
  1. the nearest untouched level at or above price, and the nearest at or below
  2. the next untouched day / week level beyond each of those
  3. the most recent raid (when one candle raided several levels, a day / week level stands for it)
"""
import sys
from compare import parse

KEYK = {"PDH", "PDL", "PWH", "PWL", "ODH", "ODL"}


def expected(levels, c):
    live = [l for l in levels if l["live"]]
    above = sorted((l for l in live if l["side"] == "high" and l["price"] >= c), key=lambda l: l["price"])
    below = sorted((l for l in live if l["side"] == "low" and l["price"] <= c), key=lambda l: -l["price"])
    picks = []
    if above:
        picks.append(above[0])
        nxt = [l for l in above if l["kinds"] & KEYK and l["price"] > above[0]["price"]]
        if nxt: picks.append(nxt[0])
    if below:
        picks.append(below[0])
        nxt = [l for l in below if l["kinds"] & KEYK and l["price"] < below[0]["price"]]
        if nxt: picks.append(nxt[0])
    swept = [l for l in levels if not l["live"]]
    last = None
    if swept:
        latest = max(l["swept_at"] for l in swept)
        tie = [l for l in swept if l["swept_at"] == latest]
        last = ([l for l in tie if l["kinds"] & KEYK] or tie)
    return picks, last


def main(path):
    bad = 0
    for line in open(path):
        if not line.strip() or line.startswith("#"): continue
        tag, d, levels = parse(line)
        c = float(tag.split("_")[2])
        picks, last = expected(levels, c)
        want = {(l["side"], l["price"]) for l in picks}
        got = {(l["side"], l["price"]) for l in levels if l["drawn"]}
        raid_ok = True
        if last is not None:
            raid = got - want
            raid_ok = len(raid) == 1 and next(iter(raid)) in {(l["side"], l["price"]) for l in last}
            if not raid_ok and len(raid) == 0:  # the last raid may itself be none of the picks only
                raid_ok = False
        ok = want <= got and raid_ok and len(got) <= 5
        bad += 0 if ok else 1
        names = ", ".join(f"{'+'.join(sorted(l['kinds']))} {l['price']:.0f}" for l in levels if l["drawn"])
        print(f"{tag:>15}  price {c:.0f}  draws {len(got)} of {len(levels)} levels: {names}  ->  {'MATCH' if ok else 'MISMATCH'}")
    print("TOTAL MISMATCHES", bad)
    return bad


if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1]) else 0)
