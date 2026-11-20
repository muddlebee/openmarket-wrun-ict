//@lang=wrun-ts
// ICT Liquidity Map
// The liquidity pools ICT trades from: previous day and week highs/lows, older untouched daily highs/lows,
// Asia / London / NY AM / NY PM session highs/lows, equal highs/lows ($$$) and the New York midnight open.
// Buy-side (old highs) in one color above price, sell-side (old lows) in another below. A taken level turns
// into a grey dashed line that ends on the sweep candle, so the day's raids stay readable, and clears later.
// A corner readout names the nearest untouched pool on each side: the draw on liquidity.
// Two views. Focus (default): at most 5 lines for a live decision. Review: the full map, where session
// detail fades with age (raided today or yesterday) and day / week levels keep a few days of raid history.

section("View");
param.choice("view", ["Focus", "Review"], "Focus", { label: "View", description: "Focus: at most 5 lines. The nearest untouched pool above and below price, the next day / week level beyond each, and the last sweep. Review: the full map with every session level and sweep, for going back over a day" });

section("Trading day");
param.choice("day_mode", ["Market trade date (auto)", "CME day 18:00-17:00 New York", "New York midnight"], "CME day 18:00-17:00 New York", { label: "Day starts", description: "ICT uses the CME day (18:00 to 17:00 New York) for indices like NQ and XYZ100. Auto takes the exchange's own date (US stocks the New York date, crypto the UTC date)" });
param.bool("rth_only", false, { label: "Regular hours only", description: "Build day and week levels from regular-session bars only (stocks: 09:30 to 16:00)" });

section("Day and week");
param.bool("show_daily", true, { label: "Previous day high / low (PDH / PDL)" });
param.int("old_days", 3, { min: 0, max: 10, label: "Older untouched day highs / lows", description: "Days before yesterday whose high or low is still intact (tagged by weekday)", when: "show_daily" });
param.bool("show_weekly", true, { label: "Previous week high / low (PWH / PWL)" });
param.bool("show_mo", true, { label: "New York midnight open", description: "Review view only", when: "view=1" });

section("Sessions");
param.bool("show_asia", true, { label: "Asia high / low" });
param.session("asia", "20:00-00:00", { tz: "America/New_York", label: "Asia", when: "show_asia" });
param.bool("show_london", true, { label: "London high / low" });
param.session("london", "02:00-05:00", { tz: "America/New_York", label: "London", when: "show_london" });
param.bool("show_am", true, { label: "NY AM high / low" });
param.session("ny_am", "09:30-12:00", { tz: "America/New_York", label: "NY AM", when: "show_am" });
param.bool("show_pm", false, { label: "NY PM high / low" });
param.session("ny_pm", "13:30-16:00", { tz: "America/New_York", label: "NY PM", when: "show_pm" });
param.int("session_days", 2, { min: 1, max: 5, label: "Session detail (days)", description: "A raided session high / low stays this many trading days. 2 = raided today or yesterday. Untouched ones stay for the history window" });

section("Equal highs / lows");
param.bool("show_equal", true, { label: "Equal highs / lows ($$$)" });
param.number("eq_tol_pct", 0.03, { min: 0.0, max: 1.0, step: 0.01, label: "Equal tolerance (%)", description: "Two intact swing points this close count as equal", when: "show_equal" });
param.int("swing_len", 3, { min: 1, max: 20, label: "Swing strength (bars)", description: "Bars a swing must beat on each side", when: "show_equal" });
param.int("eq_keep", 3, { min: 1, max: 6, label: "Equal pools kept per side", when: "show_equal" });

section("Display");
param.bool("keep_swept", true, { label: "Keep swept levels", description: "A taken level stays as a grey dashed line ending on the sweep candle" });
param.bool("swept_tags", true, { label: "Tags on swept levels", when: "keep_swept" });
param.int("swept_days", 3, { min: 1, max: 5, label: "History kept (days)", description: "Raided day / week levels and untouched session levels stay this many trading days. 3 = today, yesterday and the day before" });
param.color("swept_color", "#9598A1", { label: "Swept (day / week)", when: "keep_swept" });
param.color("swept_dim_color", "#5D606B", { label: "Swept (session)", when: "keep_swept" });
param.bool("show_hud", true, { label: "Draw on liquidity readout", description: "Top-right: the nearest untouched pool above and below" });
param.bool("tag_prices", true, { label: "Price in tags" });
param.int("tag_size", 11, { min: 8, max: 20, label: "Tag size" });
param.int("key_width", 2, { min: 1, max: 4, label: "Day / week / $$$ line width" });
param.color("bsl_color", "#F23645", { label: "Buy-side (highs)" });
param.color("ssl_color", "#089981", { label: "Sell-side (lows)" });
param.color("mo_color", "#B2B5BE", { label: "Midnight open", when: "show_mo" });

input("high", ohlcv.high);
input("tdate", time.trade_date);
input("tsess", time.session);
// 15m candles from about two weeks back, so day, week and session levels never depend on how much
// history the chart happens to load. Charts at 1h and up load enough of their own and skip it.
input("hist", candles.cells, { interval: "15m", bars: 1500, max_cells: 5000, chart_interval_below: "1h" });
const bslGate = output("bsl_swept", none, overlay, { description: "1 on a bar that sweeps buy-side liquidity" });
const sslGate = output("ssl_swept", none, overlay, { description: "1 on a bar that sweeps sell-side liquidity" });
output("nearest_bsl", none, overlay, { description: "The closest untouched buy-side level above the close" });
output("nearest_ssl", none, overlay, { description: "The closest untouched sell-side level below the close" });
alert("bsl_sweep", { when: bslGate, title: "Buy-side liquidity swept", message: "{{symbol}}: buy-side liquidity swept, close {{close}}", description: "Price traded above an untouched high" });
alert("ssl_sweep", { when: sslGate, title: "Sell-side liquidity swept", message: "{{symbol}}: sell-side liquidity swept, close {{close}}", description: "Price traded below an untouched low" });

string("tag", { max_bytes: 64 });
string("hud", { max_bytes: 128 });
handles.line({ width: 1, line_style: "solid" });
handles.label({ text: "tag", size: 11, style: "knockout", padding: 3 });

// ---- Level kinds: even = buy-side (a high), odd = sell-side (a low) ----
const PDH = 0; const PDL = 1; const PWH = 2; const PWL = 3;
const ASH = 4; const ASL = 5; const LOH = 6; const LOL = 7;
const AMH = 8; const AML = 9; const PMH = 10; const PML = 11;
const EQH = 12; const EQL = 13; const ODH = 14; const ODL = 15;
const KINDS = 16;
const NAMES = ["PDH", "PDL", "PWH", "PWL", "Asia H", "Asia L", "London H", "London L", "NY AM H", "NY AM L", "NY PM H", "NY PM L", "EQH $$$", "EQL $$$", "H", "L"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SESSION_MASK: i32 = (1 << ASH) | (1 << ASL) | (1 << LOH) | (1 << LOL) | (1 << AMH) | (1 << AML) | (1 << PMH) | (1 << PML);

// ---- The level pool: one line handle and one label handle per slot ----
const MAXL = 48;
const lvPrice = new StaticArray<f64>(MAXL);
const lvTs = new StaticArray<f64>(MAXL);
const lvMask = new StaticArray<i32>(MAXL);   // every kind that sits on this line
const lvHigh = new StaticArray<i32>(MAXL);   // 1 buy-side, 0 sell-side
const lvState = new StaticArray<i32>(MAXL);  // 0 empty, 1 live, 2 swept
const lvSeq = new StaticArray<i32>(MAXL);    // creation order, oldest first out
const lvWd = new StaticArray<i32>(MAXL);     // weekday of the day a daily level came from
const lvSweptDay = new StaticArray<f64>(MAXL); // trading-day count of the sweep
const lvSweptTs = new StaticArray<f64>(MAXL);
const lvSweptHm = new StaticArray<i32>(MAXL); // New York clock minute of the sweep
const lvForm = new StaticArray<f64>(MAXL);   // the trading day the level formed in (a calendar key, for its name)
const lvFormNo = new StaticArray<f64>(MAXL); // the same day as a trading-day count, for ageing
const want = new StaticArray<i32>(MAXL);     // 1 for the slots this render draws
const lvTagged = new StaticArray<i32>(MAXL); // 1 while its label handle exists
const lvDrawn = new StaticArray<i32>(MAXL);  // 1 while its line handle exists

function makeLines(first: i32, count: i32): LineHandle[] { const out: LineHandle[] = []; for (let i = 0; i < count; i += 1) out.push(draw.line(first + i)); return out; }
function makeLabels(first: i32, count: i32): LabelHandle[] { const out: LabelHandle[] = []; for (let i = 0; i < count; i += 1) out.push(draw.label(first + i)); return out; }
const lines = makeLines(0, MAXL);
const tags = makeLabels(MAXL, MAXL);
const moLine = draw.line(2 * MAXL);
const moTag = draw.label(2 * MAXL + 1);
const hudTag = draw.label(2 * MAXL + 2);

// ---- A running high and low with the time of the candle that made each ----
class HiLo {
  hi: f64 = NaN; hiTs: f64 = NaN; lo: f64 = NaN; loTs: f64 = NaN; has: bool = false;
  full: bool = false;  // seen from its first candle: only a whole period becomes a level
  armed: bool = false; // a candle outside the period has been seen, so the next start is a true start
  add(h: f64, l: f64, t: f64): void {
    if (!this.has) { this.hi = h; this.hiTs = t; this.lo = l; this.loTs = t; this.has = true; return; }
    if (h > this.hi) { this.hi = h; this.hiTs = t; }
    if (l < this.lo) { this.lo = l; this.loTs = t; }
  }
}

// ---- Swing points kept for equal highs / lows ----
const PIV = 24;
const pvHi = new StaticArray<f64>(PIV); const pvHiTs = new StaticArray<f64>(PIV); const pvHiAlive = new StaticArray<i32>(PIV);
const pvLo = new StaticArray<f64>(PIV); const pvLoTs = new StaticArray<f64>(PIV); const pvLoAlive = new StaticArray<i32>(PIV);
let pvHiNext: i32 = 0; let pvLoNext: i32 = 0;
const TIMES = 64;
const times = new StaticArray<f64>(TIMES);
let barIdx: i32 = 0;

// ---- Settings ----
let showAll: i32 = 0; let dayMode: i32 = 1; let rthOnly = false; // showAll: 1 in the Review view
let showDaily = true; let oldDays: i32 = 3; let showWeekly = true; let showMo = true;
let showAsia = true; let showLondon = true; let showAm = true; let showPm = false;
let showEqual = true; let tol: f64 = 0.0003; let swingLen: i32 = 3; let eqKeep: i32 = 3;
let keepSwept = true; let sweptTags = true; let sweptDays: f64 = 3.0; let sessionDays: f64 = 2.0; let showHud = true;
let tagPrices = true; let tagSize: i32 = 11; let keyWidth: f64 = 2.0;
let bslInk: i32 = 0; let sslInk: i32 = 0; let sweptInk: i32 = 0; let sweptDimInk: i32 = 0; let moInk: i32 = 0;
const cap: i32 = MAXL;

// ---- State ----
let asiaSess = new Session("2000-0000");
let londonSess = new Session("0200-0500");
let amSess = new Session("0930-1200");
let pmSess = new Session("1330-1600");
let clock = new Clock();
let swings = new Swings(3, 3);
const dayR = new HiLo(); const weekR = new HiLo();
const asiaR = new HiLo(); const londonR = new HiLo(); const amR = new HiLo(); const pmR = new HiLo();
let curDay: f64 = NaN; let curWeek: f64 = NaN; let lastPruned: f64 = NaN;
let seq: i32 = 0; let moT: f64 = NaN; let moPrice: f64 = NaN;
let dayNo: f64 = 0.0; // trading days seen so far: weekends and holidays do not age a level
let t: f64 = NaN; let prevT: f64 = NaN; let width: f64 = NaN;
let nowT: f64 = NaN; // the candle the engine is on

function pad2(n: i32): string { return n < 10 ? "0" + n.toString() : n.toString(); }
function spec(startMin: f64, endMin: f64): string {
  const s = i32(startMin) % 1440; const e = i32(endMin) % 1440;
  return pad2(s / 60) + pad2(s % 60) + "-" + pad2(e / 60) + pad2(e % 60);
}

function onStart(): void {
  showAll = i32(p_view());
  dayMode = i32(p_day_mode()); rthOnly = pb_rth_only();
  showDaily = pb_show_daily(); oldDays = i32(p_old_days()); showWeekly = pb_show_weekly(); showMo = showAll == 1 && pb_show_mo();
  showAsia = pb_show_asia(); showLondon = pb_show_london(); showAm = pb_show_am(); showPm = pb_show_pm();
  showEqual = pb_show_equal(); tol = p_eq_tol_pct() / 100.0; swingLen = i32(p_swing_len()); eqKeep = i32(p_eq_keep());
  keepSwept = pb_keep_swept(); sweptTags = pb_swept_tags(); sweptDays = p_swept_days(); sessionDays = p_session_days(); showHud = pb_show_hud();
  tagPrices = pb_tag_prices(); tagSize = i32(p_tag_size()); keyWidth = p_key_width();
  bslInk = fromPacked(p_bsl_color()); sslInk = fromPacked(p_ssl_color());
  sweptInk = fromPacked(p_swept_color()); sweptDimInk = fromPacked(p_swept_dim_color()); moInk = fromPacked(p_mo_color());
  // Asia opens Sunday to Thursday evening; London and New York Monday to Friday (0 = Sunday).
  asiaSess = new Session(spec(p_asia_start(), p_asia_end()), SESSION_TZ_IDS[i32(p_asia_tz())], "01234");
  londonSess = new Session(spec(p_london_start(), p_london_end()), SESSION_TZ_IDS[i32(p_london_tz())], "12345");
  amSess = new Session(spec(p_ny_am_start(), p_ny_am_end()), SESSION_TZ_IDS[i32(p_ny_am_tz())], "12345");
  pmSess = new Session(spec(p_ny_pm_start(), p_ny_pm_end()), SESSION_TZ_IDS[i32(p_ny_pm_tz())], "12345");
  clock = new Clock("America/New_York");
  swings = new Swings(swingLen, swingLen);
}

function bit(kind: i32): i32 { return 1 << kind; }
function isSessionOnly(mask: i32): bool { return (mask & ~SESSION_MASK) == 0; }
function inkOf(i: i32): i32 { return unchecked(lvHigh[i]) == 1 ? bslInk : sslInk; }
function limitOf(kind: i32): i32 {
  if ((bit(kind) & SESSION_MASK) != 0) return 99; // session levels age out by day instead
  if (kind == ODH || kind == ODL) return oldDays;
  if (kind == EQH || kind == EQL) return eqKeep;
  return 1;
}

// The tag text of slot i into the shared builder: every kind on the line, then the price.
function writeTag(i: i32, swept: bool): void {
  const mask = unchecked(lvMask[i]);
  sb_clear();
  // A session level from an earlier day carries that day's name: "Wed London H".
  const form = unchecked(lvForm[i]);
  if ((mask & KEY_MASK) == 0 && (mask & SESSION_MASK) != 0 && !isNaN(form) && form != curDay) { sb_text(WEEKDAYS[weekdayOf(form)]); sb_text(" "); }
  let first = true;
  for (let k = 0; k < KINDS; k += 1) {
    if ((mask & bit(k)) == 0) continue;
    if (!first) sb_text(" · ");
    if (k == ODH || k == ODL) { sb_text(WEEKDAYS[unchecked(lvWd[i])]); sb_text(" "); }
    sb_text(NAMES[k]);
    first = false;
  }
  // The price: always on a live level; on a swept one only for a day / week level, so a session tag stays short.
  if (tagPrices && (!swept || (mask & KEY_MASK) != 0)) { sb_text(" "); sbPrice(unchecked(lvPrice[i])); }
  // A swept tag ends with the New York time of the sweep: the grey line already says it was taken.
  if (swept) {
    const hm = unchecked(lvSweptHm[i]);
    sb_text(" "); sb_text(pad2(hm / 60)); sb_text(":"); sb_text(pad2(hm % 60));
  }
}

// A price without a needless ".00": whole prices print whole, others to the cent.
function sbPrice(p: f64): void {
  if (Math.abs(p - Math.round(p)) < 1e-9) sb_f64(p, 0); else sb_f64(p, 2);
}

// Draw slot i from its state. A live level runs right with its tag; a swept one stops on the sweep candle,
// in two tiers: a day / week level in the brighter grey, dashed; a session level dimmer, dotted, smaller.
// A swept tag ends at the sweep, on the side of the line no candle reached before it (above a high, below a low).
// Nothing draws as history replays: render() draws the chosen slots on the newest bar.
function paint(i: i32): void {
  const price = unchecked(lvPrice[i]);
  const ts = unchecked(lvTs[i]);
  const line = lines[i];
  if (unchecked(lvState[i]) == 1) {
    const x2 = nowT > ts ? nowT : ts + 1.0;
    line.set(ts, price, x2, price).extend(Extend.Right).color(inkOf(i));
    if (isSessionOnly(unchecked(lvMask[i]))) line.width(1.0).style(LineStyle.Dotted);
    else line.width(keyWidth).style(LineStyle.Solid);
    writeTag(i, false);
    tags[i].set(x2, price).text(str_tag_sb).color(inkOf(i)).size(tagSize).align(ALIGN_RIGHT).valign(VALIGN_MIDDLE).stickyRight(true);
    lvTagged[i] = 1;
  } else {
    const end = unchecked(lvSweptTs[i]);
    const key = (unchecked(lvMask[i]) & KEY_MASK) != 0;
    const ink = key ? sweptInk : sweptDimInk;
    line.set(ts, price, end, price).extend(Extend.None).color(ink).style(key ? LineStyle.Dashed : LineStyle.Dotted).width(1.0);
    if (sweptTags) {
      const small = tagSize - 2 < 8 ? 8 : tagSize - 2;
      writeTag(i, true);
      tags[i].set(end, price).text(str_tag_sb).color(ink).stickyRight(false).align(ALIGN_RIGHT).valign(unchecked(lvHigh[i]) == 1 ? VALIGN_BOTTOM : VALIGN_TOP).size(key ? tagSize - 1 : small);
      lvTagged[i] = 1;
    } else if (unchecked(lvTagged[i]) == 1) { tags[i].delete(); lvTagged[i] = 0; }
  }
  lvDrawn[i] = 1;
}

function unpaint(i: i32): void {
  if (unchecked(lvDrawn[i]) == 0) return;
  lines[i].delete();
  if (unchecked(lvTagged[i]) == 1) { tags[i].delete(); lvTagged[i] = 0; }
  lvDrawn[i] = 0;
}

function freeSlot(i: i32): void {
  if (unchecked(lvState[i]) == 0) return;
  unpaint(i);
  lvState[i] = 0;
}

// Take one kind off line i; a line left with no kind is removed.
function clearKind(i: i32, kind: i32): void {
  const rest = unchecked(lvMask[i]) & ~bit(kind);
  if (rest == 0) { freeSlot(i); return; }
  lvMask[i] = rest;
}

// Keep at most `keep` lines carrying `kind`, removing the oldest first.
// Older day highs / lows count only while untouched: their raided lines are history, cleared by day.
function trimKind(kind: i32, keep: i32): void {
  const liveOnly = kind == ODH || kind == ODL;
  while (true) {
    let count = 0; let oldest = -1;
    for (let j = 0; j < cap; j += 1) {
      const st = unchecked(lvState[j]);
      if (st == 0 || (liveOnly && st != 1) || (unchecked(lvMask[j]) & bit(kind)) == 0) continue;
      count += 1;
      if (oldest < 0 || unchecked(lvSeq[j]) < unchecked(lvSeq[oldest])) oldest = j;
    }
    if (count <= keep || oldest < 0) return;
    clearKind(oldest, kind);
  }
}

// Yesterday's PDH / PDL becomes an older day level (tagged by weekday) when a new one arrives.
function ageDaily(kind: i32, olderKind: i32): void {
  for (let j = 0; j < cap; j += 1) {
    if (unchecked(lvState[j]) == 0 || (unchecked(lvMask[j]) & bit(kind)) == 0) continue;
    // Untouched or raided, it keeps its weekday name: "Wed H", or "Wed H swept 01:00 ET" as history.
    lvMask[j] = (unchecked(lvMask[j]) & ~bit(kind)) | bit(olderKind);
  }
  trimKind(olderKind, oldDays);
}

function addLevel(kind: i32, price: f64, ts: f64, now: f64, wd: i32): void {
  if (isNaN(price) || isNaN(ts)) return;
  if (kind == PDH) ageDaily(PDH, ODH);
  if (kind == PDL) ageDaily(PDL, ODL);
  trimKind(kind, limitOf(kind) - 1);
  const high = kind % 2 == 0 ? 1 : 0;
  const near = Math.max(Math.abs(price) * 0.00002, 1e-9);
  // Same side, same price, still live: put this kind on that line instead of drawing a second one.
  for (let j = 0; j < cap; j += 1) {
    if (unchecked(lvState[j]) != 1 || unchecked(lvHigh[j]) != high) continue;
    if (Math.abs(unchecked(lvPrice[j]) - price) > near) continue;
    lvMask[j] = unchecked(lvMask[j]) | bit(kind);
    if (kind == PDH || kind == PDL) lvWd[j] = wd;
    return;
  }
  let i = -1;
  for (let j = 0; j < cap; j += 1) { if (unchecked(lvState[j]) == 0) { i = j; break; } }
  if (i < 0) { // full: reuse the oldest swept line, else the oldest line
    for (let j = 0; j < cap; j += 1) {
      if (unchecked(lvState[j]) == 2 && (i < 0 || unchecked(lvSeq[j]) < unchecked(lvSeq[i]))) i = j;
    }
    if (i < 0) for (let j = 0; j < cap; j += 1) { if (i < 0 || unchecked(lvSeq[j]) < unchecked(lvSeq[i])) i = j; }
    freeSlot(i);
  }
  lvPrice[i] = price; lvTs[i] = ts; lvMask[i] = bit(kind); lvHigh[i] = high; lvState[i] = 1;
  lvSeq[i] = seq; seq += 1; lvWd[i] = wd; lvForm[i] = curDay; lvFormNo[i] = dayNo;
}

function sweepLevel(i: i32, now: f64): void {
  if (!keepSwept) { freeSlot(i); return; }
  lvState[i] = 2; lvSweptDay[i] = dayNo; lvSweptTs[i] = now; lvSweptHm[i] = clock.hour() * 60 + clock.minute();
}

// Once a trading day: detail fades with age.
//   day / week levels    a raided one stays `swept_days` trading days (3: today, yesterday, the day before)
//   session levels       a raided one stays `session_days` (2: raided today or yesterday);
//                        an untouched one stays `swept_days`, counted from the day it formed
//   equal highs / lows   a raided one clears at the next day
const KEY_MASK: i32 = (1 << PDH) | (1 << PDL) | (1 << PWH) | (1 << PWL) | (1 << ODH) | (1 << ODL);
function dailyUpkeep(): void {
  for (let i = 0; i < cap; i += 1) {
    const st = unchecked(lvState[i]);
    if (st == 0) continue;
    const mask = unchecked(lvMask[i]);
    if ((mask & KEY_MASK) != 0) {
      // A day / week level names itself; a session name merged onto it would go stale, so it goes.
      if ((mask & SESSION_MASK) != 0) lvMask[i] = mask & ~SESSION_MASK;
      if (st == 2 && dayNo - unchecked(lvSweptDay[i]) >= sweptDays) freeSlot(i);
    } else if ((mask & SESSION_MASK) != 0) {
      if (st == 2) { if (dayNo - unchecked(lvSweptDay[i]) >= sessionDays) freeSlot(i); }
      else if (dayNo - unchecked(lvFormNo[i]) >= sweptDays) freeSlot(i);
    } else if (st == 2 && dayNo - unchecked(lvSweptDay[i]) >= 1.0) freeSlot(i);
  }
}

function closeRange(r: HiLo, hiKind: i32, loKind: i32, on: bool, now: f64, wd: i32): void {
  if (r.has && r.full && on) {
    addLevel(hiKind, r.hi, r.hiTs, now, wd);
    addLevel(loKind, r.lo, r.loTs, now, wd);
  }
  r.has = false;
  r.full = false;
}

// A session's tracker: arm on a candle outside it, mark whole when an armed session opens.
function trackSession(s: Session, r: HiLo, h: f64, l: f64, t: f64): void {
  if (!s.isIn()) { r.armed = true; return; }
  if (s.isFirst()) { r.full = r.armed; r.has = false; }
  r.add(h, l, t);
}

// The trading day this bar belongs to, as days since 1970-01-01, or NaN when the bar sits outside every day.
function dayKeyOf(t: f64, tdate: f64): f64 {
  const local = t + f64(clock.offsetSec()); // New York wall time, in seconds
  if (dayMode == 1) {
    if (clock.hour() == 17) return NaN; // the CME daily break
    const key = Math.floor((local + 6.0 * 3600.0) / 86400.0); // 18:00 New York opens the next day
    const wd = i32((key + 4.0) % 7.0); // 0 Sunday .. 6 Saturday
    if (wd == 0 || wd == 6) return NaN; // the weekend
    return key;
  }
  if (dayMode == 2) return Math.floor(local / 86400.0);
  return isNaN(tdate) ? Math.floor(local / 86400.0) : Math.floor(tdate / 86400.0);
}
function weekdayOf(key: f64): i32 { return i32((key + 4.0) % 7.0); }

// The name of the first kind on line i, for the readout.
function hudName(i: i32): void {
  const mask = unchecked(lvMask[i]);
  for (let k = 0; k < KINDS; k += 1) {
    if ((mask & bit(k)) == 0) continue;
    if (k == ODH || k == ODL) { sb_text(WEEKDAYS[unchecked(lvWd[i])]); sb_text(" "); }
    sb_text(NAMES[k]);
    return;
  }
}

// One candle through the engine: the chart's own bars, and before them the 15m history.
// Equal highs / lows and the outputs run on chart bars only, after this.
function step(t: f64, o: f64, h: f64, l: f64, c: f64, tdate: f64, tsess: f64, coarse: bool): void {
  clock.update(t);
  nowT = t;
  // 1. Close what ended before this bar: its highs and lows become levels.
  const dk = dayKeyOf(t, tdate);
  const counted = !isNaN(dk) && (!rthOnly || tsess == 1.0);
  if (counted && dk != curDay) {
    if (!isNaN(curDay)) closeRange(dayR, PDH, PDL, showDaily, t, weekdayOf(curDay));
    dayR.full = !isNaN(curDay); // the first day seen started before the data did
    const wk = Math.floor((dk + 3.0) / 7.0); // weeks start on Monday
    if (wk != curWeek) {
      if (!isNaN(curWeek)) closeRange(weekR, PWH, PWL, showWeekly, t, 0);
      weekR.full = !isNaN(curWeek);
      curWeek = wk;
    }
    curDay = dk;
    dayNo += 1.0;
  }
  if (!isNaN(curDay) && curDay != lastPruned) { dailyUpkeep(); lastPruned = curDay; }
  asiaSess.update(t); londonSess.update(t); amSess.update(t); pmSess.update(t);
  if (asiaSess.closed()) closeRange(asiaR, ASH, ASL, showAsia && !coarse, t, 0);
  if (londonSess.closed()) closeRange(londonR, LOH, LOL, showLondon && !coarse, t, 0);
  if (amSess.closed()) closeRange(amR, AMH, AML, showAm && !coarse, t, 0);
  if (pmSess.closed()) closeRange(pmR, PMH, PML, showPm && !coarse, t, 0);

  // 2. New York midnight open: the open of the bar that holds 00:00.
  if (showMo && !coarse && clock.isNewDay() && clock.hour() == 0) { moT = t; moPrice = o; }

  // 3. Sweeps: this candle trading through an untouched level.
  for (let i = 0; i < cap; i += 1) {
    if (unchecked(lvState[i]) != 1) continue;
    const price = unchecked(lvPrice[i]);
    if (unchecked(lvHigh[i]) == 1) {
      if (h > price) { sweepLevel(i, t); bslHit = 1; }
    } else if (l < price) { sweepLevel(i, t); sslHit = 1; }
  }

  // 4. Grow the open day, week and sessions with this bar.
  if (counted) { dayR.add(h, l, t); weekR.add(h, l, t); }
  trackSession(asiaSess, asiaR, h, l, t);
  trackSession(londonSess, londonR, h, l, t);
  trackSession(amSess, amR, h, l, t);
  trackSession(pmSess, pmR, h, l, t);

}

// The newest bar draws the chart. Review draws every level; Focus keeps only what a decision needs:
//   1. the nearest untouched pool above price and the nearest below: the two candidate draws
//   2. the next day / week level beyond each: where price can run once the first pool is taken
//   3. the most recent sweep: which side was just raided
function render(c: f64): void {
  let a1 = -1; let a2 = -1; let b1 = -1; let b2 = -1; let sw = -1;
  for (let i = 0; i < cap; i += 1) {
    const st = unchecked(lvState[i]);
    if (st == 0) continue;
    const price = unchecked(lvPrice[i]);
    if (st == 2) {
      if (sw < 0) { sw = i; continue; }
      const ti = unchecked(lvSweptTs[i]); const tw = unchecked(lvSweptTs[sw]);
      // the latest sweep; when one candle took several levels, the day / week level stands for it
      if (ti > tw || (ti == tw && (unchecked(lvMask[i]) & KEY_MASK) != 0 && (unchecked(lvMask[sw]) & KEY_MASK) == 0)) sw = i;
      continue;
    }
    if (unchecked(lvHigh[i]) == 1) { if (price >= c && (a1 < 0 || price < unchecked(lvPrice[a1]))) a1 = i; }
    else if (price <= c && (b1 < 0 || price > unchecked(lvPrice[b1]))) b1 = i;
  }
  for (let i = 0; i < cap; i += 1) {
    if (unchecked(lvState[i]) != 1 || (unchecked(lvMask[i]) & KEY_MASK) == 0) continue;
    const price = unchecked(lvPrice[i]);
    if (unchecked(lvHigh[i]) == 1) {
      if (a1 >= 0 && price > unchecked(lvPrice[a1]) && (a2 < 0 || price < unchecked(lvPrice[a2]))) a2 = i;
    } else if (b1 >= 0 && price < unchecked(lvPrice[b1]) && (b2 < 0 || price > unchecked(lvPrice[b2]))) b2 = i;
  }
  for (let i = 0; i < cap; i += 1) want[i] = showAll; // Review: every slot. Focus: none, then the picks
  if (a1 >= 0) want[a1] = 1;
  if (a2 >= 0) want[a2] = 1;
  if (b1 >= 0) want[b1] = 1;
  if (b2 >= 0) want[b2] = 1;
  if (sw >= 0) want[sw] = 1;
  for (let i = 0; i < cap; i += 1) {
    if (unchecked(lvState[i]) != 0 && unchecked(want[i]) == 1) paint(i);
    else unpaint(i);
  }
  // New York midnight open (Review): the open of the candle that holds 00:00.
  if (showMo && !isNaN(moT)) {
    moLine.set(moT, moPrice, moT + 60.0, moPrice).color(moInk).width(1.0).style(LineStyle.Dashed).extend(Extend.Right);
    sb_clear(); sb_text("Midnight open");
    if (tagPrices) { sb_text(" "); sbPrice(moPrice); }
    moTag.set(nowT, moPrice).text(str_tag_sb).color(moInk).size(tagSize - 1).align(ALIGN_RIGHT).valign(VALIGN_MIDDLE).stickyRight(true);
  }
}

let backfilled = false;
let bslHit = 0; let sslHit = 0;

function onBar(): void {
  prevT = t;
  t = bar.time();
  if (!isNaN(prevT) && t > prevT && (isNaN(width) || t - prevT < width)) width = t - prevT;
  const o = bar.open();
  const h = bar.high();
  const l = bar.low();
  const c = bar.close();
  if (isNaN(h) || isNaN(l)) return;

  // Before the first chart bar: run the 15m history that ends before it.
  if (!backfilled) {
    backfilled = true;
    const n = in_hist_cells();
    if (n > 0) {
      const v = in_hist_view();
      const tuples = v.length >= n * 6 ? n : n / 6;
      for (let k = 0; k < tuples; k += 1) {
        const b = k * 6;
        const ct = t + unchecked(v[b]) / 1000.0;
        if (ct + 900.0 > t) continue; // only candles that closed before the chart's first bar
        step(ct, unchecked(v[b + 1]), unchecked(v[b + 2]), unchecked(v[b + 3]), unchecked(v[b + 4]), NaN, 1.0, false);
      }
    }
  }

  times[barIdx % TIMES] = t;
  barIdx += 1;
  const coarse = !isNaN(width) && width >= 14400.0; // 4h and up: sessions are one or two bars, skip them
  bslHit = 0; sslHit = 0;
  step(t, o, h, l, c, in_tdate(), in_tsess(), coarse);
  const bsl = bslHit; const ssl = sslHit;

  // 5. Equal highs / lows from confirmed swings that are still intact.
  swings.update(h, l);
  for (let j = 0; j < PIV; j += 1) {
    if (unchecked(pvHiAlive[j]) == 1 && h > unchecked(pvHi[j]) * (1.0 + tol)) pvHiAlive[j] = 0;
    if (unchecked(pvLoAlive[j]) == 1 && l < unchecked(pvLo[j]) * (1.0 - tol)) pvLoAlive[j] = 0;
  }
  const back = barIdx - 1 - swingLen;
  if (back >= 0) {
    const swingTs = unchecked(times[back % TIMES]);
    if (swings.newHigh()) {
      const p2 = swings.lastHigh();
      if (showEqual) {
        for (let j = 0; j < PIV; j += 1) {
          if (unchecked(pvHiAlive[j]) != 1) continue;
          const p1 = unchecked(pvHi[j]);
          if (Math.abs(p2 - p1) <= tol * p1) {
            addLevel(EQH, Math.max(p1, p2), unchecked(pvHiTs[j]), t, 0);
            pvHiAlive[j] = 0;
            break;
          }
        }
      }
      const k = pvHiNext % PIV; pvHiNext += 1;
      pvHi[k] = p2; pvHiTs[k] = swingTs; pvHiAlive[k] = 1;
    }
    if (swings.newLow()) {
      const p2 = swings.lastLow();
      if (showEqual) {
        for (let j = 0; j < PIV; j += 1) {
          if (unchecked(pvLoAlive[j]) != 1) continue;
          const p1 = unchecked(pvLo[j]);
          if (Math.abs(p2 - p1) <= tol * p1) {
            addLevel(EQL, Math.min(p1, p2), unchecked(pvLoTs[j]), t, 0);
            pvLoAlive[j] = 0;
            break;
          }
        }
      }
      const k = pvLoNext % PIV; pvLoNext += 1;
      pvLo[k] = p2; pvLoTs[k] = swingTs; pvLoAlive[k] = 1;
    }
  }

  // 6. The draw on liquidity: the nearest untouched pool on each side.
  let above = -1; let below = -1;
  for (let i = 0; i < cap; i += 1) {
    if (unchecked(lvState[i]) != 1) continue;
    const price = unchecked(lvPrice[i]);
    if (unchecked(lvHigh[i]) == 1) { if (price > c && (above < 0 || price < unchecked(lvPrice[above]))) above = i; }
    else if (price < c && (below < 0 || price > unchecked(lvPrice[below]))) below = i;
  }
  out_bsl_swept(f64(bsl));
  out_ssl_swept(f64(ssl));
  out_nearest_bsl(above >= 0 ? unchecked(lvPrice[above]) : NaN);
  out_nearest_ssl(below >= 0 ? unchecked(lvPrice[below]) : NaN);

  if (bar.isLast()) render(c);

  if (showHud && bar.isLast()) {
    sb_clear();
    sb_text("BSL above  ");
    if (above >= 0) { hudName(above); sb_text(" "); sbPrice(unchecked(lvPrice[above])); sb_text("  +"); sb_f64((unchecked(lvPrice[above]) - c) / c * 100.0, 2); sb_text("%"); }
    else sb_text("none untouched");
    sb_text("\nSSL below  ");
    if (below >= 0) { hudName(below); sb_text(" "); sbPrice(unchecked(lvPrice[below])); sb_text("  -"); sb_f64((c - unchecked(lvPrice[below])) / c * 100.0, 2); sb_text("%"); }
    else sb_text("none untouched");
    hudTag.set(16, 40).text(str_hud_sb).anchor(ANCHOR_TOP_RIGHT).align(ALIGN_RIGHT).size(tagSize).color(rgba(209, 212, 220, 255));
  }
}
