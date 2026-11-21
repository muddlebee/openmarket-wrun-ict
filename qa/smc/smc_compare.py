#!/usr/bin/env python3
"""Compare dumps of the Smart Money Concepts port with the Pine-logic reference on the same candles.

usage: smc_compare.py dumps/<file>.txt     (each line: <tag> | <bar time> | z0,z1,...)
The tag names the chart interval (m5, m15, m30, h1); a bn_ prefix means ETHUSDT on Binance spot,
no prefix xyz:XYZ100 on Hyperliquid.
"""
import json, sys, time, urllib.request, calendar, os
from smc_reference import run, NA

BASE = 1790812800
SEC = {"m1": 60, "m5": 300, "m15": 900, "m30": 1800, "h1": 3600}
HL = {60: "1m", 300: "5m", 900: "15m", 1800: "30m", 3600: "1h"}
NAMES = json.load(open("smc-qa.json"))["names"]


def binance(sec, start, end, symbol="ETHUSDT"):
    """Binance spot klines: the candles a chart of BINANCE ETHUSDT shows."""
    path = f"data_bn_{HL[sec]}_{start}_{end}.json"
    if os.path.exists(path): return json.load(open(path))
    out, s = [], start * 1000
    while s <= end * 1000:
        url = f"https://data-api.binance.vision/api/v3/klines?symbol={symbol}&interval={HL[sec]}&startTime={s}&endTime={end * 1000}&limit=1000"
        got = json.load(urllib.request.urlopen(url, timeout=60))
        if not got: break
        out += [(k[0] // 1000, float(k[1]), float(k[2]), float(k[3]), float(k[4])) for k in got]
        s = got[-1][0] + 1
        if len(got) < 1000: break
    json.dump(out, open(path, "w"))
    return out


def candles(sec, start, end):
    path = f"data_{HL[sec]}_{start}_{end}.json"
    if os.path.exists(path): return json.load(open(path))
    out, s = [], start * 1000
    while s <= end * 1000:
        body = json.dumps({"type": "candleSnapshot", "req": {"coin": "xyz:XYZ100", "interval": HL[sec], "startTime": s, "endTime": end * 1000 + sec * 1000}}).encode()
        got = json.load(urllib.request.urlopen(urllib.request.Request("https://api.hyperliquid.xyz/info", data=body, headers={"Content-Type": "application/json"}), timeout=60))
        new = [c for c in got if not out or c["t"] > out[-1][0] * 1000]
        if not new: break
        out += [(c["t"] // 1000, float(c["o"]), float(c["h"]), float(c["l"]), float(c["c"])) for c in new]
        s = out[-1][0] * 1000 + 1
        if len(got) < 4000: break
    out = [c for c in out if start <= c[0] <= end]
    json.dump(out, open(path, "w"))
    return out


def expected(ref):
    """The reference's state in the dump's field order."""
    e = {}
    def price(n, x): e[n + "_w"] = NA if x is NA else float(int(x // 1)); e[n + "_f"] = NA if x is NA else float(round((x - x // 1) * 10000))
    def mins(t): return NA if t is NA else (t - BASE) / 60.0
    e["trend_swing"] = ref["trend"]["swing"] + 1.0; e["trend_internal"] = ref["trend"]["internal"] + 1.0
    price("atr", ref["atr"])
    for n, p in ref["pivots"].items():
        price(n, p.current); e[n + "_back"] = float(ref["index"] - p.index); e[n + "_crossed"] = 1.0 if p.crossed else 0.0
    tr = ref["trailing"]
    price("trail_top", tr["top"]); e["trail_top_t"] = mins(tr["top_time"]); price("trail_bottom", tr["bottom"]); e["trail_bottom_t"] = mins(tr["bottom_time"])
    for k, v in ref["counts"].items(): e["count_" + k] = float(v)
    for n in ("swing", "internal"):
        lst = ref["obs"][n]; e[f"ob_{n}_n"] = float(len(lst))
        for i in range(5):
            b = lst[i] if i < len(lst) else None
            price(f"ob_{n}_{i}_top", b["top"] if b else NA); price(f"ob_{n}_{i}_bottom", b["bottom"] if b else NA)
            e[f"ob_{n}_{i}_t"] = mins(b["time"]) if b else NA; e[f"ob_{n}_{i}_bias"] = b["bias"] + 1.0 if b else NA
    e["fvg_n"] = float(len(ref["fvgs"]))
    for i in range(5):
        g = ref["fvgs"][i] if i < len(ref["fvgs"]) else None
        price(f"fvg_{i}_top", g["top"] if g else NA); price(f"fvg_{i}_bottom", g["bottom"] if g else NA)
        e[f"fvg_{i}_t1"] = mins(g["t1"]) if g else NA; e[f"fvg_{i}_bias"] = g["bias"] + 1.0 if g else NA
    for n, key in (("swing_bull", ("swing", "bull")), ("swing_bear", ("swing", "bear")), ("internal_bull", ("internal", "bull")), ("internal_bear", ("internal", "bear"))):
        s = ref["last_structure"].get(key)
        e[f"st_{n}_kind"] = 0.0 if s is None else 1.0 + (1 if s["choch"] else 0) + (2 if key[1] == "bear" else 0) + (4 if key[0] == "internal" else 0)
        price(f"st_{n}_level", s["level"] if s else NA); e[f"st_{n}_t1"] = mins(s["t1"]) if s else NA; e[f"st_{n}_t2"] = mins(s["t2"]) if s else NA
    return e


def main(path):
    total = 0
    for line in open(path):
        if not line.strip() or line.startswith("#"): continue
        tag, when, vals = [p.strip() for p in line.split("|")]
        bn = tag.startswith("bn_")
        sec = SEC[tag.split("_")[1 if bn else 0]]
        got = {n: (NA if v in ("NaN", "null") else float(v)) for n, v in zip(NAMES, vals.split(","))}
        first = BASE + int(got["first"]) * 60
        last = calendar.timegm(time.strptime(when[:19], "%Y-%m-%dT%H:%M:%S"))
        bars = binance(sec, first, last) if bn else candles(sec, first, last)
        # the QA build dumps before evaluating the newest (forming) bar: the state is that of the closed bars
        use = bars[:-1] if bars and bars[-1][0] == last else bars
        alt = dict(swings_length=20, atr_filter=False, mitigation_close=True, confluence=True, fvg_auto=False) if tag.endswith("_alt") else {}
        exp = expected(run(use, bar_sec=sec, **alt))
        bad = [f"{n}: indicator {got[n]} reference {exp[n]}" for n in NAMES if n in exp and not (got[n] == exp[n] or (got[n] is not NA and exp[n] is not NA and abs(got[n] - exp[n]) < 1e-6))]
        if got["idx"] != len(use) - 1: bad.append(f"bar count: indicator {got['idx'] + 1} reference {len(use)}")
        best = ("closed bars", bad); bars = use
        print(f"{tag:>5} {len(bars)} bars from {time.strftime('%d %b %H:%M', time.gmtime(first))} UTC, {len(NAMES) - 2} values  ->  {'MATCH' if not best[1] else 'MISMATCH'} ({best[0]})")
        for b in best[1][:25]: print("       ", b)
        total += len(best[1])
    print("TOTAL MISMATCHES", total)
    return total


if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1]) else 0)
