#!/usr/bin/env python3
"""Reference for the Smart Money Concepts port: the LuxAlgo Pine script's logic, re-implemented bar by bar.

Written from the Pine source (not from the wrun port) so the two can be compared on the same candles.
It covers what the port covers: swing and internal structure, trailing extremes, order blocks and
fair value gaps on the chart's timeframe. It cannot run Pine itself, so it checks that the port
computes what this reading of the Pine script says, not that this reading matches TradingView.
"""
import math

NA = None
BULLISH, BEARISH = 1, -1


class Pivot:
    def __init__(self, t):
        self.current = NA; self.last = NA; self.crossed = False; self.time = t; self.index = 0


class Leg:
    """Pine: var leg = 0; set by high[size] > ta.highest(size) / low[size] < ta.lowest(size); ta.change(leg)."""
    def __init__(self): self.value = 0

    def change(self, highs, lows, i, size):
        before = self.value
        if i >= size:
            if highs[i - size] > max(highs[i - size + 1:i + 1]): self.value = 0
            elif lows[i - size] < min(lows[i - size + 1:i + 1]): self.value = 1
        return self.value - before if i >= 1 else 0


def run(bars, swings_length=50, atr_filter=True, mitigation_close=False, confluence=False,
        fvg_auto=True, fvg_extend=1, bar_sec=900):
    """bars: (time, open, high, low, close), oldest first. Returns the state after the last bar."""
    highs, lows, parsed_high, parsed_low, times = [], [], [], [], []
    t0 = bars[0][0]
    swing_high, swing_low, internal_high, internal_low = Pivot(t0), Pivot(t0), Pivot(t0), Pivot(t0)
    swing_leg, internal_leg = Leg(), Leg()
    trend = {"swing": 0, "internal": 0}
    trailing = dict(top=NA, bottom=NA, time=NA, index=0, top_time=NA, bottom_time=NA)
    obs = {"swing": [], "internal": []}
    fvgs = []
    counts = dict.fromkeys(["ibb", "ibc", "isb", "isc", "sbb", "sbc", "ssb", "ssc", "iobu", "iobe", "sobu", "sobe", "fvgu", "fvge"], 0)
    last_structure = {}
    prev_level = {}
    atr = NA; tr_values = []; tr_cum = 0.0; fvg_cum = 0.0

    for i, (t, o, h, l, c) in enumerate(bars):
        # volatility measure
        if i >= 1:
            pc = bars[i - 1][4]
            tr = max(h - l, abs(h - pc), abs(l - pc))
            tr_cum += tr; tr_values.append(tr)
            if len(tr_values) == 200: atr = sum(tr_values) / 200.0
            elif len(tr_values) > 200: atr = (atr * 199.0 + tr) / 200.0
        vol = atr if atr_filter else (tr_cum / i if i >= 1 else NA)
        wild = vol is not NA and (h - l) >= 2 * vol
        highs.append(h); lows.append(l); times.append(t)
        parsed_high.append(l if wild else h); parsed_low.append(h if wild else l)

        # trailing extremes, updated before this bar's structure
        if trailing["top"] is not NA:
            trailing["top"] = max(h, trailing["top"])
            if trailing["top"] == h: trailing["top_time"] = t
        if trailing["bottom"] is not NA:
            trailing["bottom"] = min(l, trailing["bottom"])
            if trailing["bottom"] == l: trailing["bottom_time"] = t

        # fair value gaps price traded through are deleted (the loop skips the element after a removal)
        k = 0
        while k < len(fvgs):
            g = fvgs[k]
            if (l < g["bottom"] and g["bias"] == BULLISH) or (h > g["top"] and g["bias"] == BEARISH): fvgs.pop(k)
            k += 1

        # getCurrentStructure(swingsLength) and getCurrentStructure(5, internal)
        for leg, size, hi_p, lo_p, internal in ((swing_leg, swings_length, swing_high, swing_low, False),
                                                (internal_leg, 5, internal_high, internal_low, True)):
            ch = leg.change(highs, lows, i, size)
            if ch == 0: continue
            p = lo_p if ch == 1 else hi_p
            p.last = p.current
            p.current = lows[i - size] if ch == 1 else highs[i - size]
            p.crossed = False; p.time = times[i - size]; p.index = i - size
            if not internal:
                trailing["time"] = p.time; trailing["index"] = p.index
                if ch == 1: trailing["bottom"] = p.current; trailing["bottom_time"] = p.time
                else: trailing["top"] = p.current; trailing["top_time"] = p.time

        # displayStructure(internal) then displayStructure()
        pc = bars[i - 1][4] if i >= 1 else NA
        for name, hi_p, lo_p in (("internal", internal_high, internal_low), ("swing", swing_high, swing_low)):
            internal = name == "internal"
            bullish_bar = bearish_bar = True
            if confluence:
                bullish_bar = h - max(c, o) > min(c, o - l)
                bearish_bar = h - max(c, o) < min(c, o - l)
            was_h = prev_level.get((name, "h"), NA); was_l = prev_level.get((name, "l"), NA)
            lv_h, lv_l = hi_p.current, lo_p.current
            prev_level[(name, "h")] = lv_h; prev_level[(name, "l")] = lv_l
            for side in ("bull", "bear"):
                p = hi_p if side == "bull" else lo_p
                lv = lv_h if side == "bull" else lv_l
                was = was_h if side == "bull" else was_l
                other = swing_high.current if side == "bull" else swing_low.current
                extra = True
                if internal:
                    extra = lv is not NA and other is not NA and lv != other and (bullish_bar if side == "bull" else bearish_bar)
                if lv is NA or was is NA or pc is NA: continue
                crossed = (c > lv and pc <= was) if side == "bull" else (c < lv and pc >= was)
                if not (crossed and not p.crossed and extra): continue
                against = BEARISH if side == "bull" else BULLISH
                choch = trend[name] == against
                counts[("i" if internal else "s") + ("b" if side == "bull" else "s") + ("c" if choch else "b")] += 1
                p.crossed = True
                trend[name] = BULLISH if side == "bull" else BEARISH
                last_structure[(name, side)] = dict(level=lv, t1=p.time, t2=t, choch=choch)
                # storeOrdeBlock
                bias = BULLISH if side == "bull" else BEARISH
                if bias == BEARISH:
                    seg = parsed_high[p.index:i]; at = p.index + seg.index(max(seg))
                else:
                    seg = parsed_low[p.index:i]; at = p.index + seg.index(min(seg))
                lst = obs[name]
                if len(lst) >= 100: lst.pop()
                lst.insert(0, dict(top=parsed_high[at], bottom=parsed_low[at], time=times[at], bias=bias))

        # deleteOrderBlocks(internal) then deleteOrderBlocks()
        bear_src = c if mitigation_close else h
        bull_src = c if mitigation_close else l
        for name in ("internal", "swing"):
            lst = obs[name]; k = 0
            while k < len(lst):
                b = lst[k]; gone = False
                if bear_src > b["top"] and b["bias"] == BEARISH: gone = True; counts["iobe" if name == "internal" else "sobe"] += 1
                elif bull_src < b["bottom"] and b["bias"] == BULLISH: gone = True; counts["iobu" if name == "internal" else "sobu"] += 1
                if gone: lst.pop(k)
                k += 1

        # drawFairValueGaps on the chart's timeframe
        if i >= 1:
            po, pcl, pt = bars[i - 1][1], bars[i - 1][4], bars[i - 1][0]
            delta = (pcl - po) / (po * 100.0)
            fvg_cum += abs(delta)
            if i >= 2:
                threshold = fvg_cum / i * 2 if fvg_auto else 0.0
                h2, l2 = highs[i - 2], lows[i - 2]
                if l > h2 and pcl > h2 and delta > threshold:
                    counts["fvgu"] += 1; fvgs.insert(0, dict(top=l, bottom=h2, t1=pt, t2=t + fvg_extend * bar_sec, bias=BULLISH)); del fvgs[100:]
                if h < l2 and pcl < l2 and -delta > threshold:
                    counts["fvge"] += 1; fvgs.insert(0, dict(top=h, bottom=l2, t1=pt, t2=t + fvg_extend * bar_sec, bias=BEARISH)); del fvgs[100:]

    n = len(bars) - 1
    return dict(index=n, trend=trend, atr=atr, trailing=trailing, counts=counts, obs=obs, fvgs=fvgs, last_structure=last_structure,
                pivots=dict(swing_high=swing_high, swing_low=swing_low, internal_high=internal_high, internal_low=internal_low))
