#!/usr/bin/env python3
"""Compare indicator dumps (read from the editor console by the QA build) with the independent reference.

usage: compare.py dumps/<file>.txt [more files]
Each dump line:  <tag> at <bar time> ... | <diag k:v ...> | <rows: a,b,c,e,f,g,h;...>
  a signed whole price (negative = sell-side)   b fraction * 10000        c kind bit mask
  e [formWd*1000 + wd*100 +] state*10 + drawn   f raid time, minutes of the New York day
  g origin, minutes since QA_BASE               h raid, minutes since QA_BASE
"""
import sys
from reference import load, run, hybrid, local

BASE = 1790812800  # 2026-10-01 00:00 UTC
BITS = ["PDH", "PDL", "PWH", "PWL", "ASH", "ASL", "LOH", "LOL", "AMH", "AML", "PMH", "PML", "EQH", "EQL", "ODH", "ODL"]
EQ = {"EQH", "EQL"}
WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


def num(x):
    return None if x in ("NaN", "", "null") else float(x)


def parse(line):
    head, diag, rows = [p.strip() for p in line.split("|")]
    d = {k: num(v) for k, v in (kv.split(":") for kv in diag.split())}
    out = []
    for r in rows.split(";"):
        a, b, c, e, f, g, h = [num(x) for x in r.split(",")]
        kinds = {BITS[i] for i in range(16) if int(c) >> i & 1}
        e = int(e)
        out.append(dict(side="high" if a > 0 else "low", price=abs(a) + b / 10000.0, kinds=kinds,
                        live=(e // 10) % 10 == 1, drawn=e % 10 == 1,
                        wd=WD[(e // 100) % 10] if e >= 100 else None, form_wd=WD[(e // 1000) % 10] if e >= 100 else None,
                        swept_hm=None if f is None else int(f), origin=BASE + int(g) * 60,
                        swept_at=None if h is None else BASE + int(h) * 60))
    return head.split()[0], d, out


def key(lv):
    return (lv["side"], round(lv["price"], 4))


def diff(tag, dump, ref_levels, check_wd):
    """Named levels only. Returns the list of mismatches."""
    bad = []
    got = {key(lv): lv for lv in dump if lv["kinds"] - EQ}
    want = {key(lv): lv for lv in ref_levels}
    for k in sorted(set(got) | set(want)):
        g, w = got.get(k), want.get(k)
        if g is None: bad.append(f"missing in indicator: {k} {w['kinds']}"); continue
        if w is None: bad.append(f"extra in indicator: {k} {sorted(g['kinds'])}"); continue
        if g["kinds"] - EQ != set(w["kinds"]): bad.append(f"{k}: kinds {sorted(g['kinds'] - EQ)} vs reference {w['kinds']}")
        if g["live"] != w["live"]: bad.append(f"{k}: live {g['live']} vs reference {w['live']}")
        if g["origin"] != w["origin"]: bad.append(f"{k}: origin {local(g['origin']):%a %H:%M} vs reference {local(w['origin']):%a %H:%M}")
        if g["swept_at"] != w["swept_at"]:
            bad.append(f"{k}: raid {g['swept_at'] and local(g['swept_at']).strftime('%a %H:%M')} vs reference {w['swept_at'] and local(w['swept_at']).strftime('%a %H:%M')}")
        if g["swept_hm"] != w["swept_hm"]: bad.append(f"{k}: raid clock {g['swept_hm']} vs reference {w['swept_hm']}")
        if check_wd and g["wd"] is not None:
            if set(w["kinds"]) & {"ODH", "ODL", "PDH", "PDL"} and g["wd"] != w["wd"]: bad.append(f"{k}: weekday {g['wd']} vs reference {w['wd']}")
            if not set(w["kinds"]) & {"PDH", "PDL", "PWH", "PWL", "ODH", "ODL"} and g["form_wd"] != w["form_wd"]:
                bad.append(f"{k}: session day {g['form_wd']} vs reference {w['form_wd']}")
    return bad


def main(path):
    c15 = load("data/xyz100_15m.csv"); c5 = load("data/xyz100_5m.csv"); c1 = load("data/xyz100_1m.csv")
    fine = {300: c5, 60: c1}
    total_bad = 0
    for line in open(path):
        if not line.strip() or line.startswith("#"): continue
        tag, d, dump = parse(line)
        bar = int(d["barsec"]); last = BASE + int(d["lastfed"]) * 60
        mode = tag.split("_")[0] if tag.split("_")[0] in ("ny", "utc", "rth") else "cme"  # a "Day starts" setting forced in the QA build
        if bar < 900:
            feedc = hybrid(c15, fine[bar], BASE + int(d["handover"]) * 60); live_len = bar
        else:
            feedc = c15; live_len = 900
        if d.get("first") is not None:  # start the reference on the candle the indicator started on
            first = BASE + int(d["first"]) * 60
            feedc = [c for c in feedc if c[0] >= first]
        results = []
        if d.get("asof") and d["asof"] < 90000:  # above 90000 the value is only a build marker: the engine ran live
            # The QA build froze the engine before the candle opening at `asof`: a past moment, replayed.
            ref = run(feedc, BASE + int(d["asof"]) * 60, mode)
            results.append((f"as of {local(BASE + int(d['asof']) * 60):%a %d %b %H:%M} ET", diff(tag, dump, ref.snapshot(), True), ref))
        else:
            # The newest candle was still forming when the dump was read: the indicator had seen part of it.
            # It must agree with the reference either before that candle or after it.
            for label, until in (("with the forming candle", last + live_len), ("closed candles only", last)):
                ref = run(feedc, until, mode)
                results.append((label, diff(tag, dump, ref.snapshot(), True), ref))
        label, bad, ref = min(results, key=lambda r: len(r[1]))
        named = [lv for lv in dump if lv["kinds"] - EQ]
        eq_only = [lv for lv in dump if not (lv["kinds"] - EQ)]
        if ref.mo is None: mo_ok = d["mot"] is None
        else: mo_ok = d["mot"] is not None and abs(ref.mo[1] - (d["mopi"] + d["mopf"] / 10000.0)) < 1e-6 and ref.mo[0] == BASE + int(d["mot"]) * 60
        print(f"{tag:>10}  bar {bar:>4}s  named levels {len(named):>2} (reference {len(ref.snapshot())})  equal-only {len(eq_only)}  "
              f"midnight open {'ok' if mo_ok else 'MISMATCH'}  ->  {'MATCH' if not bad else 'MISMATCH'} ({label})")
        for b in bad: print("        ", b)
        total_bad += len(bad) + (0 if mo_ok else 1)
    print("TOTAL MISMATCHES", total_bad)
    return total_bad


if __name__ == "__main__":
    sys.exit(1 if sum(main(p) for p in sys.argv[1:]) else 0)
