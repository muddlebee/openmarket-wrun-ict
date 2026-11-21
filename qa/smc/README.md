# QA: Smart Money Concepts port

The port (`../../smart-money-concepts.wrun.ts`) was checked against the LuxAlgo Pine script's logic
re-implemented in Python from the Pine source (`smc_reference.py`), on the same candles.

A QA build of the port (`gen_smc_qa.py`: everything switched on, plus a dump of 153 state values as plain
numbers) ran in the OpenMarket editor, and each value was read back through the editor console. The dump is
taken before the forming bar is evaluated, so it is the state after the last closed bar and the reference can
reproduce it exactly.

## Result (2026-11-21, ETHUSDT on Binance spot)

| Chart | Bars | Default settings | Other settings |
|---|---|---|---|
| 5m | 780 | 153 of 153 match | 153 of 153 match |
| 15m | 1542 | 153 of 153 match | 153 of 153 match |
| 1h | 986 | 153 of 153 match | 153 of 153 match |

"Other settings" is mitigation by close, the cumulative mean range filter, the confluence filter on, no auto
FVG threshold, and swing length 20.

The 153 values: swing and internal trend, ATR(200), the four pivots (level, age, crossed), the trailing high
and low with their times, how many bars fired each of the 14 alerts over the whole history, the newest five
order blocks of each kind, the newest five fair value gaps, and the last structure break of each kind.

## What this does and does not prove

- It proves the port computes what this reading of the Pine script says, on real candles, across the whole
  loaded history.
- It does not prove this reading matches TradingView bar for bar: Pine itself was not run. The reference was
  written from the Pine source separately from the port, so a shared misreading is possible but a slip in
  either one shows up as a mismatch.
- Drawing (line ends, label positions, box edges) was checked by eye, in Present and Historical mode.
- Binance was used because its candles can be fetched exactly as the chart shows them. On xyz:XYZ100 the
  chart's feed differs from Hyperliquid's own candles by a tick now and then, which changes results
  legitimately and makes an exact comparison impossible there.

## Run it again

```sh
python3 smc_compare.py dumps/run2_binance.txt
```
