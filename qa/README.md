# QA: does the indicator show the right levels?

The check compares two things that share no code:

1. **The indicator itself, running on OpenMarket.** A QA build of the source (the same code plus a dump of
   every level as plain numbers) runs in the indicator editor. Each number is read back through the editor
   console, so nothing is read off a screenshot.
2. **An independent reference** (`reference.py`). It rebuilds every day, week and session level, and every
   raid, from raw Hyperliquid candles, with its own calendar code (`zoneinfo`, `datetime`).

`compare.py` then demands an exact match on every named level: price, name, untouched or raided, the candle
that made it, the candle that raided it, the raid's New York clock time, and the weekday in its tag.

## Result (2026-11-20, xyz:XYZ100)

| Run | What it covers | States | Result |
|---|---|---|---|
| `run1_live` | The live chart on 1m, 5m, 15m, 30m, 1h, forming candle included | 5 | 5 match |
| `run2_past_15m` | 13 past moments on a 15m chart: first days of data, weekend, Sunday open, week rollover, session closes, the 17:00 break, day rollover | 13 | 13 match |
| `run3_past_1h` | 6 past moments on a 1h chart, starting before the 1 Nov daylight-saving change | 6 | 6 match |
| `run4_past_5m` | 4 past moments on a 5m chart (15m history, then the chart's own bars) | 4 | 4 match |
| `run6_day_modes` | New York midnight, UTC midnight, and Regular hours only, live and at a past moment | 6 | 6 match |
| `run5_focus` | Which lines the Focus view draws, at three prices | 3 | 3 match |

Two more checks, by eye on the chart: a 4h chart shows only the note "use a 1h chart or lower", and the Review
view on 5m, 15m and 1h reads as the dumps say.

### What the testing found and fixed

- **Levels differed by timeframe.** On a 1h chart, sessions were built from 1h bars, so the 09:30 New York open
  was invisible and Thursday's NY AM high came out as 27693 instead of 27764. The engine now runs on 15m
  candles on 15m and coarser charts.
- **A gap on fine charts.** Where 15m history handed over to the chart's own 5m bars, up to 10 minutes could
  fall between the two. The handover now sits on a boundary both share.
- **A day level could start too early.** When a day or session level landed on an existing equal-highs line it
  inherited that line's start, days earlier. It now starts at its own candle.
- **Late levels.** On a 15m or coarser chart a new level only appeared when the 15m candle after it closed.
  The forming candle is now part of the engine.

### One difference that is the data, not the code

The Nov 5 NY AM low is 26636 on OpenMarket (its 1m candle at 15:53 UTC) and 26637 on Hyperliquid's own candles.
The indicator can only see the chart, so the reference takes OpenMarket's value there (`FEED_DIFFERENCES` in
`reference.py`). It was the only difference in about 16 days of 15m candles that any level touched.

## What this does not prove

- **The rules themselves.** The reference follows the rules the indicator documents. It proves the indicator
  applies them correctly to real data. It does not prove they are the right rules for your trading.
- **Equal highs and lows** are not in the reference: they depend on the chart's swings. They were only checked
  for behaving sensibly next to named levels.
- **Not tested:** the NY PM session switched on, custom session hours, the spring daylight-saving change,
  markets other than XYZ100, a pool of more than 48 levels, and whether alerts fire (the indicator was a draft).
- **Replay.** OpenMarket has no bar replay that I could find, in the chart or in the indicator docs. Past
  moments were tested by freezing the engine at a chosen time in the QA build instead.

## Run it again

```sh
sh run_all.sh            # every recorded dump against the reference
python3 reference.py     # print the reference's level list for the newest candle
```

To record new dumps:

1. `python3 fetch_candles.py` refreshes `data/`.
2. `python3 gen_qa_build.py` writes `qa-build.wrun.ts` and `qa-transform.js` from `../ict-liquidity-map.wrun.ts`.
3. On the chart page, with the indicator open in the editor, run `qa-transform.js` and then `page_driver.js`
   in the browser console, and call `__asofRun`, `__focusRun` or `__modeRun` (examples in the file).
4. Paste each `__compact(tag)` line into a file under `dumps/` and run `compare.py` on it.
5. Put the clean source back (`__load(__clean)`) and check its length before trading from the chart.

### Reading a dump line

`<tag> ... | <engine state> | <one entry per level>`, each level as `a,b,c,e,f,g,h`:

| Field | Meaning |
|---|---|
| a, b | Price: whole part (negative for a sell-side level) and fraction times 10000 |
| c | Which names sit on the line, as bits: PDH PDL PWH PWL, Asia H/L, London H/L, NY AM H/L, NY PM H/L, EQH EQL, older day H/L |
| e | Weekday the level formed, weekday of a day level, state (1 untouched, 2 raided), drawn or not |
| f | Raid time as minutes of the New York day |
| g, h | The candle that made the level and the candle that raided it, in minutes since 2026-10-01 00:00 UTC |

Every value is a whole number under 100000 because the editor console prints larger numbers rounded.
