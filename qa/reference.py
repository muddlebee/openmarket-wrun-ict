#!/usr/bin/env python3
"""Independent reference for the ICT Liquidity Map indicator.

Rebuilds every day, week and session level, and every raid, from raw exchange candles, with its own
calendar code (zoneinfo, datetime) rather than the indicator's clock arithmetic. Equal highs / lows are
left out on purpose: they depend on the chart's swings, so they are checked separately for soundness.

The rules, as the indicator documents them:
  trading day   CME day, 18:00 to 17:00 New York, Monday to Friday (the 17:00 hour and the weekend are no day)
  week          Monday to Friday trading days
  sessions      Asia 20:00-00:00 (Sun-Thu evenings), London 02:00-05:00, NY AM 09:30-12:00 (Mon-Fri), New York time
  a level       the high / low of a whole period (seen from its first candle), live from the first candle after it
  a raid        the first candle from then on that trades through it (strictly beyond the price)
  merging       a new level within 0.002% of a live level on the same side joins that line
  day levels    the newest is PDH / PDL; older ones keep their weekday; at most 3 older untouched ones per side
  week levels   only the last whole week
  history       a raided day / week level stays 3 trading days, a raided session level 2;
                an untouched session level stays 3 trading days from the day it formed
"""
import json, sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone, time as dtime
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
SESSIONS = [  # name, start, end, weekdays of the start (Mon=0 .. Sun=6)
    ("Asia", dtime(20, 0), dtime(0, 0), {6, 0, 1, 2, 3}),
    ("London", dtime(2, 0), dtime(5, 0), {0, 1, 2, 3, 4}),
    ("NY AM", dtime(9, 30), dtime(12, 0), {0, 1, 2, 3, 4}),
]
KEY = {"PDH", "PDL", "PWH", "PWL", "ODH", "ODL"}
KEEP_OLD_DAYS, KEY_HISTORY, SESSION_HISTORY, SESSION_LIFE = 3, 3, 2, 3


# Where the chart's feed (OpenMarket) and the exchange's own candles (Hyperliquid) disagree, the chart wins:
# the indicator can only see the chart. Each entry was read from both sources by hand.
#   2026-11-05 15:45 UTC: low 26636 on OpenMarket (1m candle 15:53), 26637 on Hyperliquid. One tick, in a fast drop.
FEED_DIFFERENCES = {"2026-11-05T15:45": {"l": 26636.0, "5m": "2026-11-05T15:50"}}


def load(path):
    """Candles as (open time, open, high, low), oldest first, from data/<name>.csv or a Hyperliquid JSON dump."""
    if path.endswith(".json"):
        rows = [(c["t"] // 1000, float(c["o"]), float(c["h"]), float(c["l"])) for c in json.load(open(path))]
    else:
        rows = [tuple(float(x) if i else int(x) for i, x in enumerate(line.split(",")[:4])) for line in open(path) if line[0].isdigit()]
    fixes = {}
    for when, fix in FEED_DIFFERENCES.items():
        for stamp in (when, fix.get("5m")):
            if stamp: fixes[int(datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc).timestamp())] = fix["l"]
    return [(t, o, h, min(l, fixes[t]) if t in fixes else l) for t, o, h, l in rows]


def local(t):
    return datetime.fromtimestamp(t, timezone.utc).astimezone(NY)


def trading_day(lt, mode="cme"):
    """The trading date of a New York wall time under a "Day starts" setting, or None outside every day.

    cme   18:00 to 17:00 New York, Monday to Friday (the 17:00 hour and the weekend are no day)
    ny    the New York calendar date        utc   the UTC calendar date
    rth   the CME day, counting only 09:30 to 16:00 New York, Monday to Friday ("Regular hours only")
    """
    if mode == "ny":
        return lt.date()
    if mode == "utc":
        return lt.astimezone(timezone.utc).date()
    if lt.hour == 17:
        return None
    d = lt.date() + timedelta(days=1) if lt.hour >= 18 else lt.date()
    if d.weekday() >= 5:
        return None
    if mode == "rth" and not (lt.weekday() < 5 and dtime(9, 30) <= lt.time() < dtime(16, 0)):
        return None
    return d


def session_of(lt):
    """(name, start date) of the session holding this wall time, or None."""
    for name, start, end, days in SESSIONS:
        if end == dtime(0, 0):
            inside = lt.time() >= start
        else:
            inside = start <= lt.time() < end
        if inside and lt.weekday() in days:
            return name, lt.date()
    return None


@dataclass
class Level:
    side: str            # "high" (buy-side) or "low" (sell-side)
    price: float
    origin: int          # open time of the candle that made the extreme
    kinds: set
    seq: int
    form_no: int         # trading-day count when it became a level
    wd: str = ""         # weekday of the day a day level came from
    form_day: object = None
    live: bool = True
    swept_at: int = 0
    swept_no: int = 0


@dataclass
class Range:
    hi: float = float("nan"); hi_t: int = 0; lo: float = float("nan"); lo_t: int = 0
    has: bool = False; whole: bool = False

    def add(self, h, l, t):
        if not self.has:
            self.hi, self.hi_t, self.lo, self.lo_t, self.has = h, t, l, t, True
            return
        if h > self.hi: self.hi, self.hi_t = h, t
        if l < self.lo: self.lo, self.lo_t = l, t


class Reference:
    def __init__(self, mode="cme"):
        self.mode = mode
        self.levels = []
        self.seq = 0
        self.day_no = 0
        self.cur_day = None
        self.cur_week = None
        self.day = Range(); self.week = Range()
        self.sess = {name: Range() for name, *_ in SESSIONS}
        self.sess_open = {name: None for name, *_ in SESSIONS}   # the session instance being tracked
        self.sess_armed = {name: False for name, *_ in SESSIONS}
        self.mo = None  # (time, price) of the last New York midnight open
        self.prev_date = None

    # -- level bookkeeping --
    def _drop_kind(self, lv, kind):
        lv.kinds.discard(kind)
        if not lv.kinds:
            self.levels.remove(lv)

    def _add(self, kind, side, price, origin, wd=""):
        if kind in ("PDH", "PDL"):
            older = "ODH" if kind == "PDH" else "ODL"
            for lv in list(self.levels):
                if kind in lv.kinds:
                    lv.kinds.discard(kind); lv.kinds.add(older)
            while True:
                untouched = sorted((lv for lv in self.levels if lv.live and older in lv.kinds), key=lambda x: x.seq)
                if len(untouched) <= KEEP_OLD_DAYS: break
                self._drop_kind(untouched[0], older)
        if kind in ("PWH", "PWL"):
            for lv in list(self.levels):
                if kind in lv.kinds: self._drop_kind(lv, kind)
        tol = max(abs(price) * 0.00002, 1e-9)
        for lv in self.levels:
            if lv.live and lv.side == side and abs(lv.price - price) <= tol:
                lv.kinds.add(kind)
                if kind in ("PDH", "PDL"): lv.wd = wd
                return
        self.levels.append(Level(side, price, origin, {kind}, self.seq, self.day_no, wd, self.cur_day))
        self.seq += 1

    def _publish(self, rng, hi_kind, lo_kind, wd=""):
        if rng.has and rng.whole:
            self._add(hi_kind, "high", rng.hi, rng.hi_t, wd)
            self._add(lo_kind, "low", rng.lo, rng.lo_t, wd)
        rng.has = False; rng.whole = False

    def _upkeep(self):
        for lv in list(self.levels):
            if lv.kinds & KEY:
                lv.kinds &= KEY | {"EQH", "EQL"}
                if not lv.live and self.day_no - lv.swept_no >= KEY_HISTORY: self.levels.remove(lv)
            else:
                if not lv.live:
                    if self.day_no - lv.swept_no >= SESSION_HISTORY: self.levels.remove(lv)
                elif self.day_no - lv.form_no >= SESSION_LIFE: self.levels.remove(lv)

    # -- one candle --
    def step(self, t, o, h, l):
        lt = local(t)
        d = trading_day(lt, self.mode)
        # 1. periods that ended before this candle become levels
        if d is not None and d != self.cur_day:
            if self.cur_day is not None:
                self._publish(self.day, "PDH", "PDL", self.cur_day.strftime("%a"))
            self.day.whole = self.cur_day is not None
            wk = d.isocalendar()[:2]
            if wk != self.cur_week:
                if self.cur_week is not None: self._publish(self.week, "PWH", "PWL")
                self.week.whole = self.cur_week is not None
                self.cur_week = wk
            self.cur_day = d
            self.day_no += 1
            self._upkeep()
        s = session_of(lt)
        for name, *_ in SESSIONS:
            inside = s is not None and s[0] == name
            if self.sess_open[name] is not None and (not inside or s != self.sess_open[name]):
                kinds = {"Asia": ("ASH", "ASL"), "London": ("LOH", "LOL"), "NY AM": ("AMH", "AML")}[name]
                self._publish(self.sess[name], *kinds)
                self.sess_open[name] = None
        # 2. New York midnight open
        if lt.hour == 0 and lt.date() != self.prev_date:
            self.mo = (t, o)
        self.prev_date = lt.date()
        # 3. raids
        for lv in self.levels:
            if not lv.live: continue
            if (lv.side == "high" and h > lv.price) or (lv.side == "low" and l < lv.price):
                lv.live = False; lv.swept_at = t; lv.swept_no = self.day_no
        # 4. grow what is open
        if d is not None:
            self.day.add(h, l, t); self.week.add(h, l, t)
        for name, *_ in SESSIONS:
            inside = s is not None and s[0] == name
            if not inside:
                self.sess_armed[name] = True
                continue
            if self.sess_open[name] is None:
                self.sess_open[name] = s
                self.sess[name] = Range(whole=self.sess_armed[name])
            self.sess[name].add(h, l, t)

    def snapshot(self):
        out = []
        for lv in self.levels:
            out.append(dict(side=lv.side, price=lv.price, kinds=sorted(lv.kinds), live=lv.live, origin=lv.origin,
                            swept_at=lv.swept_at if not lv.live else None,
                            swept_hm=(local(lv.swept_at).hour * 60 + local(lv.swept_at).minute) if not lv.live else None,
                            wd=lv.wd, form_wd=lv.form_day.strftime("%a") if lv.form_day else ""))
        return sorted(out, key=lambda x: -x["price"])


def run(candles, until=None, mode="cme"):
    """Feed candles (t, o, h, l), oldest first; `until` stops before the candle opening at that time."""
    ref = Reference(mode)
    for t, o, h, l in candles:
        if until is not None and t >= until: break
        ref.step(t, o, h, l)
    return ref


def hybrid(coarse, fine, handover, coarse_sec=900):
    """What a fine chart sees: 15m candles that closed by the handover, then the chart's own candles."""
    return [c for c in coarse if c[0] + coarse_sec <= handover] + [c for c in fine if c[0] >= handover]


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/xyz100_15m.csv"
    ref = run(load(path), mode=sys.argv[2] if len(sys.argv) > 2 else "cme")
    for lv in ref.snapshot():
        st = "live " if lv["live"] else "swept"
        when = "" if lv["live"] else local(lv["swept_at"]).strftime(" raided %a %H:%M ET")
        print(f'{st} {lv["side"]:4} {lv["price"]:>9.2f} {"+".join(lv["kinds"]):12} {lv["wd"]:3} from {local(lv["origin"]).strftime("%a %d %H:%M ET")}{when}')
    if ref.mo: print("midnight open", ref.mo[1], local(ref.mo[0]).strftime("%a %d %H:%M ET"))
