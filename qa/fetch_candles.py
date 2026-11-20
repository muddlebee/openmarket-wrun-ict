#!/usr/bin/env python3
"""Download xyz:XYZ100 candles from Hyperliquid into data/*.csv (open time, open, high, low, close)."""
import json, os, time, urllib.request


def fetch(interval, start_ms, end_ms, coin="xyz:XYZ100"):
    out, s = [], start_ms
    while s < end_ms:
        body = json.dumps({"type": "candleSnapshot", "req": {"coin": coin, "interval": interval, "startTime": s, "endTime": end_ms}}).encode()
        req = urllib.request.Request("https://api.hyperliquid.xyz/info", data=body, headers={"Content-Type": "application/json"})
        got = json.load(urllib.request.urlopen(req, timeout=60))
        new = [c for c in got if not out or c["t"] > out[-1]["t"]]
        if not new: break
        out += new; s = out[-1]["t"] + 1
        if len(got) < 4000: break
    return out


if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)
    now = int(time.time() * 1000)
    for interval, days in (("15m", 45), ("5m", 17.2), ("1m", 3.4)):
        rows = fetch(interval, now - int(days * 86400e3), now)
        with open(f"data/xyz100_{interval}.csv", "w") as f:
            f.write(f"# xyz:XYZ100 {interval} candles from api.hyperliquid.xyz (candleSnapshot): open time (epoch seconds, UTC), open, high, low, close\n")
            for c in rows:
                f.write(f"{c['t'] // 1000},{float(c['o']):g},{float(c['h']):g},{float(c['l']):g},{float(c['c']):g}\n")
        print(interval, len(rows), time.strftime("%m-%d %H:%M", time.gmtime(rows[0]["t"] / 1000)), "to", time.strftime("%m-%d %H:%M", time.gmtime(rows[-1]["t"] / 1000)))
