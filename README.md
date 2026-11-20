# ICT Liquidity Map for OpenMarket (wrun)

A custom OpenMarket indicator that marks the liquidity pools an ICT trader works from, and which of them have
been raided: previous day and week highs and lows, older untouched daily levels, Asia / London / New York
session highs and lows, equal highs and lows, and the New York midnight open.

Built and checked on `xyz:XYZ100` (Hyperliquid's Nasdaq 100 perpetual), the proxy for NQ.

- `ict-liquidity-map.wrun.ts` is the indicator.
- `qa/` is the test harness: an independent reference, the values read out of the live indicator, and the comparison.

## Install

1. Open a chart on openmarket.xyz, then Indicators, New indicator.
2. Paste the whole of `ict-liquidity-map.wrun.ts` into the editor and press Run.
3. Press Publish to use it on other devices and to arm its alerts. A draft lives in one browser only.

## What it draws

| Colour | Meaning |
|---|---|
| Red line, runs right | Untouched buy-side liquidity (an old high above price) |
| Green line, runs right | Untouched sell-side liquidity (an old low below price) |
| Grey dashed line, stops at a candle | A day or week level that was raided, ending on the candle that raided it |
| Dim dotted line, stops at a candle | A session level that was raided |

Tags read `PDH 27764`, `Wed H 27530 01:30` (Wednesday's high, raided at 01:30 New York), `Thu London L 09:45`.
A corner readout names the nearest untouched pool on each side.

Two views:

- **Focus** (default): at most 5 lines. The nearest untouched pool above and below price, the next day or week
  level beyond each, and the most recent raid.
- **Review**: the full map. Day and week levels keep 3 trading days of raid history. Session levels stay while
  untouched, or when raided today or yesterday.

## How the levels are built

| Level | Rule |
|---|---|
| Trading day | CME day, 18:00 to 17:00 New York, Monday to Friday (the default). New York midnight and UTC midnight are settings |
| PDH / PDL | High and low of the last whole trading day. Older days keep their weekday name; at most 3 older untouched ones per side |
| PWH / PWL | High and low of the last whole Monday to Friday week |
| Sessions | Asia 20:00 to 00:00, London 02:00 to 05:00, NY AM 09:30 to 12:00, NY PM 13:30 to 16:00 (off by default), New York time |
| Equal highs / lows | Two confirmed swing points within a tolerance (0.03% by default), tagged `$$$` |
| Raid | The first candle after the level formed that trades through it (strictly beyond the price) |

A period becomes a level only when it was seen from its first candle, so a half-loaded day or week never
produces a wrong high or low.

### One answer on every timeframe

Levels must not depend on the chart's timeframe, so the indicator does not build them from the chart's bars
when those are too coarse:

| Chart | Where levels come from |
|---|---|
| 1m to 5m | The chart's own bars, after 15m history for the days the chart has not loaded |
| 15m up to (not including) 4h | 15m candles, including the one still forming. Tested on 15m, 30m and 1h |
| 4h and above | Off, with a note. Those bars straddle the 18:00 rollover |

## Things to know before trading it

- **Raid times are to the candle.** On a 15m or higher chart a raid at 18:35 is tagged 18:30, the open of the
  15m candle that did it. On a 5m chart recent raids are to the 5m candle.
- **Equal highs and lows depend on the chart's swings**, so they differ between timeframes by nature. Day, week
  and session levels do not.
- **The chart's feed is the truth the indicator sees.** In testing, one candle differed by one point between
  OpenMarket and Hyperliquid's own candles (2026-11-05, low 26636 against 26637). A level at such an extreme
  follows the chart.
- **Verified on XYZ100 only.** NQ futures on CME are display-only on OpenMarket and were not tested.
- A tag close to the top of the pane can sit under the corner readout. Scroll the price scale to read it.

## Alerts and outputs

`bsl_swept` and `ssl_swept` are 1 on a bar that raids buy-side or sell-side liquidity, each with an alert.
`nearest_bsl` and `nearest_ssl` are the closest untouched level on each side.

## QA

See [qa/README.md](qa/README.md). In short: 34 engine states (live on five timeframes, past moments replayed on
three, every "Day starts" setting) match an independent reference exactly, and the Focus view draws the lines
its rules call for in 3 of 3 checks.
