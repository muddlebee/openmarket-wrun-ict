//@lang=wrun-ts
// Smart Money Concepts
// A wrun port of "Smart Money Concepts [LuxAlgo]" (Pine Script v5), © LuxAlgo.
// The original and this adaptation are licensed under Attribution-NonCommercial-ShareAlike 4.0
// International (CC BY-NC-SA 4.0): https://creativecommons.org/licenses/by-nc-sa/4.0/
//
// Ported: internal and swing structure (BOS / CHoCH), swing point labels, strong / weak high and low,
// internal and swing order blocks, fair value gaps (chart timeframe) and premium / discount zones.
// Left out: equal highs / lows and daily / weekly / monthly levels (the ICT Liquidity Map draws those),
// candle colouring, and fair value gaps from another timeframe.

section("Smart Money Concepts");
param.choice("mode", ["Historical", "Present"], "Present", { label: "Mode", description: "Historical keeps past structure on the chart; Present keeps only the most recent of each kind" });
param.choice("style", ["Colored", "Monochrome"], "Colored", { label: "Style", description: "Indicator color theme" });

section("Real time internal structure");
param.bool("show_internals", true, { label: "Show internal structure" });
param.choice("internal_bull", ["All", "BOS", "CHoCH"], "All", { when: "show_internals", label: "Bullish structure" });
param.color("internal_bull_color", "#089981", { when: "show_internals", label: "Bullish color" });
param.choice("internal_bear", ["All", "BOS", "CHoCH"], "All", { when: "show_internals", label: "Bearish structure" });
param.color("internal_bear_color", "#F23645", { when: "show_internals", label: "Bearish color" });
param.bool("internal_confluence", false, { when: "show_internals", label: "Confluence filter", description: "Filter non significant internal structure breakouts" });
param.int("internal_label_size", 9, { when: "show_internals", min: 6, max: 20, label: "Internal label size" });

section("Real time swing structure");
param.bool("show_structure", true, { label: "Show swing structure" });
param.choice("swing_bull", ["All", "BOS", "CHoCH"], "All", { when: "show_structure", label: "Bullish structure" });
param.color("swing_bull_color", "#089981", { label: "Bullish color" });
param.choice("swing_bear", ["All", "BOS", "CHoCH"], "All", { when: "show_structure", label: "Bearish structure" });
param.color("swing_bear_color", "#F23645", { label: "Bearish color" });
param.int("swing_label_size", 11, { when: "show_structure", min: 6, max: 20, label: "Swing label size" });
param.bool("show_swings", false, { label: "Show swing points", description: "HH / HL / LH / LL labels on swing points" });
param.int("swings_length", 50, { min: 10, max: 200, label: "Swing length (bars)" });
param.bool("show_high_low", true, { label: "Show strong / weak high / low" });

section("Order blocks");
param.bool("show_internal_ob", true, { label: "Internal order blocks" });
param.int("internal_ob_count", 5, { when: "show_internal_ob", min: 1, max: 20, label: "Internal order blocks shown" });
param.bool("show_swing_ob", false, { label: "Swing order blocks" });
param.int("swing_ob_count", 5, { when: "show_swing_ob", min: 1, max: 20, label: "Swing order blocks shown" });
param.choice("ob_filter", ["Atr", "Cumulative Mean Range"], "Atr", { label: "Order block filter", description: "Method used to filter out volatile order blocks" });
param.choice("ob_mitigation", ["Close", "High/Low"], "High/Low", { label: "Order block mitigation" });
param.color("internal_bull_ob_color", "#3179F5", { when: "show_internal_ob", label: "Internal bullish OB" });
param.color("internal_bear_ob_color", "#F77C80", { when: "show_internal_ob", label: "Internal bearish OB" });
param.color("swing_bull_ob_color", "#1848CC", { when: "show_swing_ob", label: "Bullish OB" });
param.color("swing_bear_ob_color", "#B22833", { when: "show_swing_ob", label: "Bearish OB" });

section("Fair value gaps");
param.bool("show_fvg", false, { label: "Fair value gaps" });
param.bool("fvg_auto", true, { when: "show_fvg", label: "Auto threshold", description: "Filter out non significant fair value gaps" });
param.int("fvg_extend", 1, { when: "show_fvg", min: 0, max: 50, label: "Extend FVG (bars)" });
param.color("fvg_bull_color", "#00FF68", { when: "show_fvg", label: "Bullish FVG" });
param.color("fvg_bear_color", "#FF0008", { when: "show_fvg", label: "Bearish FVG" });

section("Premium & discount zones");
param.bool("show_zones", false, { label: "Premium / discount zones" });
param.color("premium_color", "#F23645", { when: "show_zones", label: "Premium zone" });
param.color("equilibrium_color", "#878B94", { when: "show_zones", label: "Equilibrium zone" });
param.color("discount_color", "#089981", { when: "show_zones", label: "Discount zone" });

input("high", ohlcv.high);
chart.interval_sec();

const gIBB = output("internal_bullish_bos", none, overlay, { description: "1 on an internal bullish BOS" });
const gIBC = output("internal_bullish_choch", none, overlay, { description: "1 on an internal bullish CHoCH" });
const gISB = output("internal_bearish_bos", none, overlay, { description: "1 on an internal bearish BOS" });
const gISC = output("internal_bearish_choch", none, overlay, { description: "1 on an internal bearish CHoCH" });
const gSBB = output("bullish_bos", none, overlay, { description: "1 on a swing bullish BOS" });
const gSBC = output("bullish_choch", none, overlay, { description: "1 on a swing bullish CHoCH" });
const gSSB = output("bearish_bos", none, overlay, { description: "1 on a swing bearish BOS" });
const gSSC = output("bearish_choch", none, overlay, { description: "1 on a swing bearish CHoCH" });
const gIOBu = output("bullish_internal_ob_break", none, overlay, { description: "1 when price breaks a bullish internal order block" });
const gIOBe = output("bearish_internal_ob_break", none, overlay, { description: "1 when price breaks a bearish internal order block" });
const gSOBu = output("bullish_swing_ob_break", none, overlay, { description: "1 when price breaks a bullish swing order block" });
const gSOBe = output("bearish_swing_ob_break", none, overlay, { description: "1 when price breaks a bearish swing order block" });
const gFVGu = output("bullish_fvg", none, overlay, { description: "1 on a new bullish fair value gap" });
const gFVGe = output("bearish_fvg", none, overlay, { description: "1 on a new bearish fair value gap" });
alert("internal_bullish_bos_alert", { when: gIBB, title: "Internal Bullish BOS", message: "{{symbol}}: internal bullish BOS formed" });
alert("internal_bullish_choch_alert", { when: gIBC, title: "Internal Bullish CHoCH", message: "{{symbol}}: internal bullish CHoCH formed" });
alert("internal_bearish_bos_alert", { when: gISB, title: "Internal Bearish BOS", message: "{{symbol}}: internal bearish BOS formed" });
alert("internal_bearish_choch_alert", { when: gISC, title: "Internal Bearish CHoCH", message: "{{symbol}}: internal bearish CHoCH formed" });
alert("bullish_bos_alert", { when: gSBB, title: "Bullish BOS", message: "{{symbol}}: bullish BOS formed" });
alert("bullish_choch_alert", { when: gSBC, title: "Bullish CHoCH", message: "{{symbol}}: bullish CHoCH formed" });
alert("bearish_bos_alert", { when: gSSB, title: "Bearish BOS", message: "{{symbol}}: bearish BOS formed" });
alert("bearish_choch_alert", { when: gSSC, title: "Bearish CHoCH", message: "{{symbol}}: bearish CHoCH formed" });
alert("bullish_internal_ob_break_alert", { when: gIOBu, title: "Bullish Internal OB Breakout", message: "{{symbol}}: price broke a bullish internal OB" });
alert("bearish_internal_ob_break_alert", { when: gIOBe, title: "Bearish Internal OB Breakout", message: "{{symbol}}: price broke a bearish internal OB" });
alert("bullish_swing_ob_break_alert", { when: gSOBu, title: "Bullish Swing OB Breakout", message: "{{symbol}}: price broke a bullish swing OB" });
alert("bearish_swing_ob_break_alert", { when: gSOBe, title: "Bearish Swing OB Breakout", message: "{{symbol}}: price broke a bearish swing OB" });
alert("bullish_fvg_alert", { when: gFVGu, title: "Bullish FVG", message: "{{symbol}}: bullish FVG formed" });
alert("bearish_fvg_alert", { when: gFVGe, title: "Bearish FVG", message: "{{symbol}}: bearish FVG formed" });

output("z0", none, overlay);
output("z1", none, overlay);
output("z2", none, overlay);
output("z3", none, overlay);
output("z4", none, overlay);
output("z5", none, overlay);
output("z6", none, overlay);
output("z7", none, overlay);
output("z8", none, overlay);
output("z9", none, overlay);
output("z10", none, overlay);
output("z11", none, overlay);
output("z12", none, overlay);
output("z13", none, overlay);
output("z14", none, overlay);
output("z15", none, overlay);
output("z16", none, overlay);
output("z17", none, overlay);
output("z18", none, overlay);
output("z19", none, overlay);
output("z20", none, overlay);
output("z21", none, overlay);
output("z22", none, overlay);
output("z23", none, overlay);
output("z24", none, overlay);
output("z25", none, overlay);
output("z26", none, overlay);
output("z27", none, overlay);
output("z28", none, overlay);
output("z29", none, overlay);
output("z30", none, overlay);
output("z31", none, overlay);
output("z32", none, overlay);
output("z33", none, overlay);
output("z34", none, overlay);
output("z35", none, overlay);
output("z36", none, overlay);
output("z37", none, overlay);
output("z38", none, overlay);
output("z39", none, overlay);
output("z40", none, overlay);
output("z41", none, overlay);
output("z42", none, overlay);
output("z43", none, overlay);
output("z44", none, overlay);
output("z45", none, overlay);
output("z46", none, overlay);
output("z47", none, overlay);
output("z48", none, overlay);
output("z49", none, overlay);
output("z50", none, overlay);
output("z51", none, overlay);
output("z52", none, overlay);
output("z53", none, overlay);
output("z54", none, overlay);
output("z55", none, overlay);
output("z56", none, overlay);
output("z57", none, overlay);
output("z58", none, overlay);
output("z59", none, overlay);
output("z60", none, overlay);
output("z61", none, overlay);
output("z62", none, overlay);
output("z63", none, overlay);
output("z64", none, overlay);
output("z65", none, overlay);
output("z66", none, overlay);
output("z67", none, overlay);
output("z68", none, overlay);
output("z69", none, overlay);
output("z70", none, overlay);
output("z71", none, overlay);
output("z72", none, overlay);
output("z73", none, overlay);
output("z74", none, overlay);
output("z75", none, overlay);
output("z76", none, overlay);
output("z77", none, overlay);
output("z78", none, overlay);
output("z79", none, overlay);
output("z80", none, overlay);
output("z81", none, overlay);
output("z82", none, overlay);
output("z83", none, overlay);
output("z84", none, overlay);
output("z85", none, overlay);
output("z86", none, overlay);
output("z87", none, overlay);
output("z88", none, overlay);
output("z89", none, overlay);
output("z90", none, overlay);
output("z91", none, overlay);
output("z92", none, overlay);
output("z93", none, overlay);
output("z94", none, overlay);
output("z95", none, overlay);
output("z96", none, overlay);
output("z97", none, overlay);
output("z98", none, overlay);
output("z99", none, overlay);
output("z100", none, overlay);
output("z101", none, overlay);
output("z102", none, overlay);
output("z103", none, overlay);
output("z104", none, overlay);
output("z105", none, overlay);
output("z106", none, overlay);
output("z107", none, overlay);
output("z108", none, overlay);
output("z109", none, overlay);
output("z110", none, overlay);
output("z111", none, overlay);
output("z112", none, overlay);
output("z113", none, overlay);
output("z114", none, overlay);
output("z115", none, overlay);
output("z116", none, overlay);
output("z117", none, overlay);
output("z118", none, overlay);
output("z119", none, overlay);
output("z120", none, overlay);
output("z121", none, overlay);
output("z122", none, overlay);
output("z123", none, overlay);
output("z124", none, overlay);
output("z125", none, overlay);
output("z126", none, overlay);
output("z127", none, overlay);
output("z128", none, overlay);
output("z129", none, overlay);
output("z130", none, overlay);
output("z131", none, overlay);
output("z132", none, overlay);
output("z133", none, overlay);
output("z134", none, overlay);
output("z135", none, overlay);
output("z136", none, overlay);
output("z137", none, overlay);
output("z138", none, overlay);
output("z139", none, overlay);
output("z140", none, overlay);
output("z141", none, overlay);
output("z142", none, overlay);
output("z143", none, overlay);
output("z144", none, overlay);
output("z145", none, overlay);
output("z146", none, overlay);
output("z147", none, overlay);
output("z148", none, overlay);
output("z149", none, overlay);
output("z150", none, overlay);
output("z151", none, overlay);
output("z152", none, overlay);
output("z153", none, overlay);
output("z154", none, overlay);
string("tag", { max_bytes: 32 });
handles.line({ width: 1, line_style: "solid" });
handles.label({ text: "tag", size: 10, style: "plain", padding: 2 });
handles.box({ opacity: 0.2, border_width: 0 });

const BULLISH = 1; const BEARISH = -1;
const MONO_BULLISH: i32 = rgba(178, 181, 190, 255);
const MONO_BEARISH: i32 = rgba(93, 96, 107, 255);

// ---- Bar history: raw and "parsed" highs / lows (a high volatility bar swaps them), and bar times ----
const RING = 8192;
const rH = new StaticArray<f64>(RING); const rL = new StaticArray<f64>(RING);
const rPH = new StaticArray<f64>(RING); const rPL = new StaticArray<f64>(RING);
const rT = new StaticArray<f64>(RING);
let idx: i32 = 0; // bar_index of the bar being evaluated
function at(a: StaticArray<f64>, i: i32): f64 { return unchecked(a[i & (RING - 1)]); }
function oldest(): i32 { return idx - RING + 1 > 0 ? idx - RING + 1 : 0; }

// ---- Pivots: 0 swing high, 1 swing low, 2 internal high, 3 internal low ----
const pvCur = new StaticArray<f64>(4); const pvLast = new StaticArray<f64>(4);
const pvCrossed = new StaticArray<i32>(4); const pvT = new StaticArray<f64>(4); const pvIdx = new StaticArray<i32>(4);
const pvPrev = new StaticArray<f64>(4); // the level as the structure check saw it one bar ago (for the cross)
const legState = new StaticArray<i32>(2); // 0 swing, 1 internal: 0 bearish leg, 1 bullish leg
const trend = new StaticArray<i32>(2);    // 0 swing, 1 internal: +1, -1, or 0 before the first break

// ---- Trailing swing extremes (strong / weak high and low, premium / discount) ----
let trTop: f64 = NaN; let trBottom: f64 = NaN; let trT: f64 = NaN; let trIdx: i32 = 0;
let trTopT: f64 = NaN; let trBottomT: f64 = NaN;
// what the lines show: the values as they stood before this bar's structure update
let hlTop: f64 = NaN; let hlBottom: f64 = NaN; let hlTopT: f64 = NaN; let hlBottomT: f64 = NaN; let hlTrend: i32 = 0;
let znT: f64 = NaN; let znIdx: i32 = 0;

// ---- Structure breaks drawn: a line from the pivot to the break, and a BOS / CHoCH tag ----
const MAXS = 120;
const stT1 = new StaticArray<f64>(MAXS); const stT2 = new StaticArray<f64>(MAXS); const stMid = new StaticArray<f64>(MAXS);
const stLevel = new StaticArray<f64>(MAXS); const stKind = new StaticArray<i32>(MAXS); // 0 empty; else 1 + choch*1 + bearish*2 + internal*4
let stNext: i32 = 4;
// ---- Swing point labels ----
const MAXW = 40;
const swT = new StaticArray<f64>(MAXW); const swLevel = new StaticArray<f64>(MAXW); const swKind = new StaticArray<i32>(MAXW); // 0 empty, 1 HH, 2 LH, 3 HL, 4 LL
let swNext: i32 = 2;
// ---- Order blocks: list 0 swing, list 1 internal, newest first ----
const MAXOB = 100;
const obTop = new StaticArray<f64>(2 * MAXOB); const obBottom = new StaticArray<f64>(2 * MAXOB);
const obT = new StaticArray<f64>(2 * MAXOB); const obBias = new StaticArray<i32>(2 * MAXOB);
const obN = new StaticArray<i32>(2);
// ---- Fair value gaps, newest first ----
const MAXF = 100;
const fvTop = new StaticArray<f64>(MAXF); const fvBottom = new StaticArray<f64>(MAXF);
const fvT1 = new StaticArray<f64>(MAXF); const fvT2 = new StaticArray<f64>(MAXF); const fvBias = new StaticArray<i32>(MAXF);
let fvN: i32 = 0; let fvCum: f64 = 0.0;

// ---- Handles: one id space ----
const SHOWN_OB = 20;
function makeLines(first: i32, count: i32): LineHandle[] { const out: LineHandle[] = []; for (let i = 0; i < count; i += 1) out.push(draw.line(first + i)); return out; }
function makeLabels(first: i32, count: i32): LabelHandle[] { const out: LabelHandle[] = []; for (let i = 0; i < count; i += 1) out.push(draw.label(first + i)); return out; }
function makeBoxes(first: i32, count: i32): BoxHandle[] { const out: BoxHandle[] = []; for (let i = 0; i < count; i += 1) out.push(draw.box(first + i)); return out; }
const stLines = makeLines(0, MAXS);
const stTags = makeLabels(MAXS, MAXS);
const swTags = makeLabels(2 * MAXS, MAXW);
const obBoxes = makeBoxes(2 * MAXS + MAXW, 2 * SHOWN_OB);
const fvBoxes = makeBoxes(2 * MAXS + MAXW + 2 * SHOWN_OB, MAXF);
const BASE = 2 * MAXS + MAXW + 2 * SHOWN_OB + MAXF;
const topLine = draw.line(BASE); const bottomLine = draw.line(BASE + 1);
const topTag = draw.label(BASE + 2); const bottomTag = draw.label(BASE + 3);
const zoneBoxes = makeBoxes(BASE + 4, 3);
const zoneTags = makeLabels(BASE + 7, 3);

// ---- Settings ----
let present = true; let mono = false;
let showInternals = true; let internalBull: i32 = 0; let internalBear: i32 = 0; let confluence = false; let internalSize: i32 = 9;
let showStructure = true; let swingBull: i32 = 0; let swingBear: i32 = 0; let swingSize: i32 = 11;
let showSwings = false; let swingsLength: i32 = 50; let showHighLow = true;
let showInternalOb = true; let internalObCount: i32 = 5; let showSwingOb = false; let swingObCount: i32 = 5;
let obFilterAtr = true; let obMitigationClose = false;
let showFvg = false; let fvgAuto = true; let fvgExtend: f64 = 1.0; let showZones = false;
let inkIBull: i32 = 0; let inkIBear: i32 = 0; let inkSBull: i32 = 0; let inkSBear: i32 = 0;
let inkIObBull: i32 = 0; let inkIObBear: i32 = 0; let inkSObBull: i32 = 0; let inkSObBear: i32 = 0;
let inkFvgBull: i32 = 0; let inkFvgBear: i32 = 0; let inkPremium: i32 = 0; let inkEq: i32 = 0; let inkDiscount: i32 = 0;
let barSec: f64 = 60.0;

// ---- Per bar state ----
let prevOpen: f64 = NaN; let prevClose: f64 = NaN; let prevT: f64 = NaN;
let trN: i32 = 0; let trSum: f64 = 0.0; let atr: f64 = NaN; let trCum: f64 = 0.0;
let aIBB = 0; let aIBC = 0; let aISB = 0; let aISC = 0; let aSBB = 0; let aSBC = 0; let aSSB = 0; let aSSC = 0;
let aIOBu = 0; let aIOBe = 0; let aSOBu = 0; let aSOBe = 0; let aFVGu = 0; let aFVGe = 0;

function onStart(): void {
  present = i32(p_mode()) == 1; mono = i32(p_style()) == 1;
  showInternals = pb_show_internals(); internalBull = i32(p_internal_bull()); internalBear = i32(p_internal_bear());
  confluence = pb_internal_confluence(); internalSize = i32(p_internal_label_size());
  showStructure = pb_show_structure(); swingBull = i32(p_swing_bull()); swingBear = i32(p_swing_bear()); swingSize = i32(p_swing_label_size());
  showSwings = pb_show_swings(); swingsLength = i32(p_swings_length()); showHighLow = pb_show_high_low();
  showInternalOb = pb_show_internal_ob(); internalObCount = i32(p_internal_ob_count());
  showSwingOb = pb_show_swing_ob(); swingObCount = i32(p_swing_ob_count());
  obFilterAtr = i32(p_ob_filter()) == 0; obMitigationClose = i32(p_ob_mitigation()) == 0;
  showFvg = pb_show_fvg(); fvgAuto = pb_fvg_auto(); fvgExtend = p_fvg_extend(); showZones = pb_show_zones();
  inkIBull = fromPacked(p_internal_bull_color()); inkIBear = fromPacked(p_internal_bear_color());
  inkSBull = fromPacked(p_swing_bull_color()); inkSBear = fromPacked(p_swing_bear_color());
  inkIObBull = fromPacked(p_internal_bull_ob_color()); inkIObBear = fromPacked(p_internal_bear_ob_color());
  inkSObBull = fromPacked(p_swing_bull_ob_color()); inkSObBear = fromPacked(p_swing_bear_ob_color());
  inkFvgBull = fromPacked(p_fvg_bull_color()); inkFvgBear = fromPacked(p_fvg_bear_color());
  inkPremium = fromPacked(p_premium_color()); inkEq = fromPacked(p_equilibrium_color()); inkDiscount = fromPacked(p_discount_color());
  if (mono) { // the Monochrome theme replaces every bullish and bearish colour
    inkIBull = MONO_BULLISH; inkSBull = MONO_BULLISH; inkIObBull = MONO_BULLISH; inkSObBull = MONO_BULLISH; inkFvgBull = MONO_BULLISH; inkDiscount = MONO_BULLISH;
    inkIBear = MONO_BEARISH; inkSBear = MONO_BEARISH; inkIObBear = MONO_BEARISH; inkSObBear = MONO_BEARISH; inkFvgBear = MONO_BEARISH; inkPremium = MONO_BEARISH;
  }
  barSec = p_chart_interval_sec();
  showFvg = true; showSwingOb = true; showZones = true; showSwings = true; present = true; // QA: everything on
  for (let k = 0; k < 4; k += 1) { pvCur[k] = NaN; pvLast[k] = NaN; pvPrev[k] = NaN; }
}

// The time of a bar by its index: from history when it is still kept, else by even spacing.
function timeOf(i: i32): f64 {
  if (i >= oldest() && i <= idx) return at(rT, i);
  return at(rT, idx) - f64(idx - i) * barSec;
}

// Pine `leg(size)` with ta.change: +1 at the start of a bullish leg (a swing low is confirmed `size` bars
// back), -1 at the start of a bearish leg (a swing high), 0 otherwise.
function legChange(k: i32, size: i32): i32 {
  const before = unchecked(legState[k]);
  if (idx >= size) {
    let hi = -Infinity; let lo = Infinity;
    for (let j = 0; j < size; j += 1) { const h = at(rH, idx - j); const l = at(rL, idx - j); if (h > hi) hi = h; if (l < lo) lo = l; }
    if (at(rH, idx - size) > hi) legState[k] = 0;
    else if (at(rL, idx - size) < lo) legState[k] = 1;
  }
  return idx >= 1 ? unchecked(legState[k]) - before : 0;
}

function addSwingLabel(t: f64, level: f64, kind: i32): void {
  let i = kind <= 2 ? 1 : 0; // Present: the newest high label and the newest low label
  if (!present) { i = swNext; swNext += 1; if (swNext >= MAXW) swNext = 2; }
  swT[i] = t; swLevel[i] = level; swKind[i] = kind;
}

// Pine `getCurrentStructure(size, false, internal)`: store the new pivot and the trailing swing extremes.
function currentStructure(size: i32, internal: bool): void {
  const ch = legChange(internal ? 1 : 0, size);
  if (ch == 0) return;
  const k = (internal ? 2 : 0) + (ch == 1 ? 1 : 0);
  pvLast[k] = unchecked(pvCur[k]);
  pvCur[k] = ch == 1 ? at(rL, idx - size) : at(rH, idx - size);
  pvCrossed[k] = 0; pvT[k] = at(rT, idx - size); pvIdx[k] = idx - size;
  if (internal) return;
  const cur = unchecked(pvCur[k]); const last = unchecked(pvLast[k]);
  if (ch == 1) {
    trBottom = cur; trT = unchecked(pvT[k]); trIdx = unchecked(pvIdx[k]); trBottomT = unchecked(pvT[k]);
    if (showSwings) addSwingLabel(unchecked(pvT[k]), cur, cur < last ? 4 : 3);
  } else {
    trTop = cur; trT = unchecked(pvT[k]); trIdx = unchecked(pvIdx[k]); trTopT = unchecked(pvT[k]);
    if (showSwings) addSwingLabel(unchecked(pvT[k]), cur, cur > last ? 1 : 2);
  }
}

// Pine `storeOrdeBlock`: the most extreme "parsed" bar between the pivot and now becomes an order block.
function storeOrderBlock(k: i32, internal: bool, bias: i32): void {
  let from = unchecked(pvIdx[k]); if (from < oldest()) from = oldest();
  if (from >= idx) return;
  let best = from;
  for (let i = from + 1; i < idx; i += 1) {
    if (bias == BEARISH) { if (at(rPH, i) > at(rPH, best)) best = i; }
    else if (at(rPL, i) < at(rPL, best)) best = i;
  }
  const li = internal ? 1 : 0; const b = li * MAXOB;
  let n = unchecked(obN[li]); if (n >= MAXOB) n = MAXOB - 1;
  for (let i = n; i > 0; i -= 1) { obTop[b + i] = unchecked(obTop[b + i - 1]); obBottom[b + i] = unchecked(obBottom[b + i - 1]); obT[b + i] = unchecked(obT[b + i - 1]); obBias[b + i] = unchecked(obBias[b + i - 1]); }
  obTop[b] = at(rPH, best); obBottom[b] = at(rPL, best); obT[b] = at(rT, best); obBias[b] = bias;
  obN[li] = n + 1;
}

// Pine `deleteOrderBlocks`: an order block price has traded (or closed) through is removed.
function deleteOrderBlocks(internal: bool, bearSrc: f64, bullSrc: f64): void {
  const li = internal ? 1 : 0; const b = li * MAXOB;
  let i = 0;
  while (i < unchecked(obN[li])) {
    let crossed = false;
    if (bearSrc > unchecked(obTop[b + i]) && unchecked(obBias[b + i]) == BEARISH) { crossed = true; if (internal) aIOBe = 1; else aSOBe = 1; }
    else if (bullSrc < unchecked(obBottom[b + i]) && unchecked(obBias[b + i]) == BULLISH) { crossed = true; if (internal) aIOBu = 1; else aSOBu = 1; }
    if (crossed) {
      const n = unchecked(obN[li]);
      for (let j = i; j < n - 1; j += 1) { obTop[b + j] = unchecked(obTop[b + j + 1]); obBottom[b + j] = unchecked(obBottom[b + j + 1]); obT[b + j] = unchecked(obT[b + j + 1]); obBias[b + j] = unchecked(obBias[b + j + 1]); }
      obN[li] = n - 1;
    }
    i += 1; // as the original's loop: the block that slid into this place is checked on the next bar
  }
}

function addStructure(k: i32, choch: bool, bearish: bool, internal: bool, t: f64): void {
  let i = (internal ? 2 : 0) + (bearish ? 1 : 0); // Present: the newest of each of the four kinds
  if (!present) { i = stNext; stNext += 1; if (stNext >= MAXS) stNext = 4; }
  stT1[i] = unchecked(pvT[k]); stT2[i] = t; stLevel[i] = unchecked(pvCur[k]);
  stMid[i] = timeOf(i32(Math.round(0.5 * f64(unchecked(pvIdx[k]) + idx))));
  stKind[i] = 1 + (choch ? 1 : 0) + (bearish ? 2 : 0) + (internal ? 4 : 0);
}

function passes(filter: i32, choch: bool): bool { return filter == 0 || (filter == 1 && !choch) || (filter == 2 && choch); }

// Pine `displayStructure(internal)`: a close through the last pivot is a BOS, or a CHoCH against the trend.
function displayStructure(internal: bool, t: f64, o: f64, h: f64, l: f64, c: f64): void {
  let bullishBar = true; let bearishBar = true;
  if (confluence) {
    bullishBar = h - Math.max(c, o) > Math.min(c, o - l);
    bearishBar = h - Math.max(c, o) < Math.min(c, o - l);
  }
  const ti = internal ? 1 : 0;
  const kh = internal ? 2 : 0; const kl = kh + 1;
  const lvH = unchecked(pvCur[kh]); const lvL = unchecked(pvCur[kl]);
  const wasH = unchecked(pvPrev[kh]); const wasL = unchecked(pvPrev[kl]);
  pvPrev[kh] = lvH; pvPrev[kl] = lvL;

  let extra = true;
  if (internal) extra = !isNaN(lvH) && !isNaN(unchecked(pvCur[0])) && lvH != unchecked(pvCur[0]) && bullishBar;
  if (!isNaN(lvH) && !isNaN(wasH) && !isNaN(prevClose) && c > lvH && prevClose <= wasH && unchecked(pvCrossed[kh]) == 0 && extra) {
    const choch = unchecked(trend[ti]) == BEARISH;
    if (internal) { if (choch) aIBC = 1; else aIBB = 1; } else { if (choch) aSBC = 1; else aSBB = 1; }
    pvCrossed[kh] = 1; trend[ti] = BULLISH;
    if (internal ? showInternals && passes(internalBull, choch) : showStructure && passes(swingBull, choch)) addStructure(kh, choch, false, internal, t);
    if ((internal && showInternalOb) || (!internal && showSwingOb)) storeOrderBlock(kh, internal, BULLISH);
  }

  extra = true;
  if (internal) extra = !isNaN(lvL) && !isNaN(unchecked(pvCur[1])) && lvL != unchecked(pvCur[1]) && bearishBar;
  if (!isNaN(lvL) && !isNaN(wasL) && !isNaN(prevClose) && c < lvL && prevClose >= wasL && unchecked(pvCrossed[kl]) == 0 && extra) {
    const choch = unchecked(trend[ti]) == BULLISH;
    if (internal) { if (choch) aISC = 1; else aISB = 1; } else { if (choch) aSSC = 1; else aSSB = 1; }
    pvCrossed[kl] = 1; trend[ti] = BEARISH;
    if (internal ? showInternals && passes(internalBear, choch) : showStructure && passes(swingBear, choch)) addStructure(kl, choch, true, internal, t);
    if ((internal && showInternalOb) || (!internal && showSwingOb)) storeOrderBlock(kl, internal, BEARISH);
  }
}

// Pine `deleteFairValueGaps`: a gap price has traded through is removed.
function deleteFairValueGaps(h: f64, l: f64): void {
  let i = 0;
  while (i < fvN) {
    const bias = unchecked(fvBias[i]);
    if ((l < unchecked(fvBottom[i]) && bias == BULLISH) || (h > unchecked(fvTop[i]) && bias == BEARISH)) {
      for (let j = i; j < fvN - 1; j += 1) { fvTop[j] = unchecked(fvTop[j + 1]); fvBottom[j] = unchecked(fvBottom[j + 1]); fvT1[j] = unchecked(fvT1[j + 1]); fvT2[j] = unchecked(fvT2[j + 1]); fvBias[j] = unchecked(fvBias[j + 1]); }
      fvN -= 1;
    }
    i += 1;
  }
}

function addFairValueGap(top: f64, bottom: f64, t1: f64, t2: f64, bias: i32): void {
  let n = fvN; if (n >= MAXF) n = MAXF - 1;
  for (let i = n; i > 0; i -= 1) { fvTop[i] = unchecked(fvTop[i - 1]); fvBottom[i] = unchecked(fvBottom[i - 1]); fvT1[i] = unchecked(fvT1[i - 1]); fvT2[i] = unchecked(fvT2[i - 1]); fvBias[i] = unchecked(fvBias[i - 1]); }
  fvTop[0] = top; fvBottom[0] = bottom; fvT1[0] = t1; fvT2[0] = t2; fvBias[0] = bias;
  fvN = n + 1;
}

// Pine `drawFairValueGaps` on the chart's own timeframe: a three bar gap whose middle bar moved enough.
function fairValueGaps(t: f64, h: f64, l: f64): void {
  if (idx < 1) return;
  const delta = (prevClose - prevOpen) / (prevOpen * 100.0);
  fvCum += Math.abs(delta);
  if (idx < 2) return;
  const threshold = fvgAuto ? fvCum / f64(idx) * 2.0 : 0.0;
  const high2 = at(rH, idx - 2); const low2 = at(rL, idx - 2);
  if (l > high2 && prevClose > high2 && delta > threshold) { aFVGu = 1; addFairValueGap(l, high2, prevT, t + fvgExtend * barSec, BULLISH); }
  if (h < low2 && prevClose < low2 && -delta > threshold) { aFVGe = 1; addFairValueGap(h, low2, prevT, t + fvgExtend * barSec, BEARISH); }
}

function tagText(s: string): void { sb_clear(); sb_text(s); }

// The newest bar draws everything from the stored state.
function render(t: f64): void {
  const right = t + 20.0 * barSec;
  // structure breaks
  for (let i = 0; i < MAXS; i += 1) {
    const kind = unchecked(stKind[i]);
    if (kind == 0) { stLines[i].delete(); stTags[i].delete(); continue; }
    const v = kind - 1; const choch = (v & 1) != 0; const bearish = (v & 2) != 0; const internal = (v & 4) != 0;
    const ink = internal ? (bearish ? inkIBear : inkIBull) : (bearish ? inkSBear : inkSBull);
    const level = unchecked(stLevel[i]);
    stLines[i].set(unchecked(stT1[i]), level, unchecked(stT2[i]), level).color(ink).width(1.0).style(internal ? LineStyle.Dashed : LineStyle.Solid).extend(Extend.None);
    tagText(choch ? "CHoCH" : "BOS");
    stTags[i].set(unchecked(stMid[i]), level).text(str_tag_sb).color(ink).size(internal ? internalSize : swingSize).valign(bearish ? VALIGN_TOP : VALIGN_BOTTOM);
  }
  // swing point labels
  for (let i = 0; i < MAXW; i += 1) {
    const kind = unchecked(swKind[i]);
    if (kind == 0 || !showSwings) { swTags[i].delete(); continue; }
    tagText(kind == 1 ? "HH" : kind == 2 ? "LH" : kind == 3 ? "HL" : "LL");
    swTags[i].set(unchecked(swT[i]), unchecked(swLevel[i])).text(str_tag_sb).color(kind <= 2 ? inkSBear : inkSBull).size(swingSize).valign(kind <= 2 ? VALIGN_BOTTOM : VALIGN_TOP);
  }
  // order blocks: the newest few of each list, from their bar to the right edge
  for (let li = 0; li < 2; li += 1) {
    const internal = li == 1;
    const on = internal ? showInternalOb : showSwingOb;
    let shown = internal ? internalObCount : swingObCount;
    if (shown > unchecked(obN[li])) shown = unchecked(obN[li]);
    if (!on) shown = 0;
    for (let i = 0; i < SHOWN_OB; i += 1) {
      const box = obBoxes[li * SHOWN_OB + i];
      if (i >= shown) { box.delete(); continue; }
      const b = li * MAXOB + i; const bear = unchecked(obBias[b]) == BEARISH;
      const ink = internal ? (bear ? inkIObBear : inkIObBull) : (bear ? inkSObBear : inkSObBull);
      box.set(unchecked(obT[b]), unchecked(obTop[b]), t + barSec, unchecked(obBottom[b])).color(ink).fill(ink).opacity(0.2).border(internal ? 0.0 : 1.0).extend(Extend.Right);
    }
  }
  // fair value gaps
  for (let i = 0; i < MAXF; i += 1) {
    const box = fvBoxes[i];
    if (i >= fvN || !showFvg) { box.delete(); continue; }
    const ink = unchecked(fvBias[i]) == BULLISH ? inkFvgBull : inkFvgBear;
    box.set(unchecked(fvT1[i]), unchecked(fvTop[i]), unchecked(fvT2[i]), unchecked(fvBottom[i])).color(ink).fill(ink).opacity(0.3).border(1.0);
  }
  // strong / weak high and low
  if (showHighLow && !isNaN(hlTop) && !isNaN(hlTopT)) {
    topLine.set(hlTopT, hlTop, right, hlTop).color(inkSBear).width(1.0);
    tagText(hlTrend == BEARISH ? "Strong High" : "Weak High");
    topTag.set(right, hlTop).text(str_tag_sb).color(inkSBear).size(9).align(ALIGN_RIGHT).valign(VALIGN_BOTTOM);
  } else { topLine.delete(); topTag.delete(); }
  if (showHighLow && !isNaN(hlBottom) && !isNaN(hlBottomT)) {
    bottomLine.set(hlBottomT, hlBottom, right, hlBottom).color(inkSBull).width(1.0);
    tagText(hlTrend == BULLISH ? "Strong Low" : "Weak Low");
    bottomTag.set(right, hlBottom).text(str_tag_sb).color(inkSBull).size(9).align(ALIGN_RIGHT).valign(VALIGN_TOP);
  } else { bottomLine.delete(); bottomTag.delete(); }
  // premium / discount zones of the current swing range
  if (showZones && !isNaN(hlTop) && !isNaN(hlBottom) && !isNaN(znT)) {
    const mid = timeOf(i32(Math.round(0.5 * f64(znIdx + idx))));
    zoneBoxes[0].set(znT, hlTop, t, 0.95 * hlTop + 0.05 * hlBottom).color(inkPremium).fill(inkPremium).opacity(0.2).border(0.0);
    tagText("Premium"); zoneTags[0].set(mid, hlTop).text(str_tag_sb).color(inkPremium).size(10).valign(VALIGN_BOTTOM);
    zoneBoxes[1].set(znT, 0.525 * hlTop + 0.475 * hlBottom, t, 0.525 * hlBottom + 0.475 * hlTop).color(inkEq).fill(inkEq).opacity(0.2).border(0.0);
    tagText("Equilibrium"); zoneTags[1].set(t, 0.5 * (hlTop + hlBottom)).text(str_tag_sb).color(inkEq).size(10).align(ALIGN_LEFT).valign(VALIGN_MIDDLE);
    zoneBoxes[2].set(znT, 0.95 * hlBottom + 0.05 * hlTop, t, hlBottom).color(inkDiscount).fill(inkDiscount).opacity(0.2).border(0.0);
    tagText("Discount"); zoneTags[2].set(mid, hlBottom).text(str_tag_sb).color(inkDiscount).size(10).valign(VALIGN_TOP);
  } else { for (let i = 0; i < 3; i += 1) { zoneBoxes[i].delete(); zoneTags[i].delete(); } }
}


// ---- QA dump ----
const QA_BASE: f64 = 1790812800.0;
let qaFirst: f64 = NaN;
const qaCount = new StaticArray<i32>(14);
function qw(x: f64): f64 { return isNaN(x) ? NaN : Math.floor(x); }
function qf(x: f64): f64 { return isNaN(x) ? NaN : Math.round((x - Math.floor(x)) * 10000.0); }
function qm(x: f64): f64 { return isNaN(x) ? NaN : (x - QA_BASE) / 60.0; }
function onBar(): void {
  const t = bar.time(); const o = bar.open(); const h = bar.high(); const l = bar.low(); const c = bar.close();
  if (isNaN(h) || isNaN(l) || isNaN(c)) return;
  if (bar.isLast()) { // QA: dump and stop
    out_z0(qm(qaFirst));
    out_z1(f64(idx - 1));
    out_z2(f64(unchecked(trend[0]) + 1));
    out_z3(f64(unchecked(trend[1]) + 1));
    out_z4(qw(atr));
    out_z5(qf(atr));
    out_z6(qw(unchecked(pvCur[0])));
    out_z7(qf(unchecked(pvCur[0])));
    out_z8(f64(idx - 1 - unchecked(pvIdx[0])));
    out_z9(f64(unchecked(pvCrossed[0])));
    out_z10(qw(unchecked(pvCur[1])));
    out_z11(qf(unchecked(pvCur[1])));
    out_z12(f64(idx - 1 - unchecked(pvIdx[1])));
    out_z13(f64(unchecked(pvCrossed[1])));
    out_z14(qw(unchecked(pvCur[2])));
    out_z15(qf(unchecked(pvCur[2])));
    out_z16(f64(idx - 1 - unchecked(pvIdx[2])));
    out_z17(f64(unchecked(pvCrossed[2])));
    out_z18(qw(unchecked(pvCur[3])));
    out_z19(qf(unchecked(pvCur[3])));
    out_z20(f64(idx - 1 - unchecked(pvIdx[3])));
    out_z21(f64(unchecked(pvCrossed[3])));
    out_z22(qw(trTop));
    out_z23(qf(trTop));
    out_z24(qm(trTopT));
    out_z25(qw(trBottom));
    out_z26(qf(trBottom));
    out_z27(qm(trBottomT));
    out_z28(f64(unchecked(qaCount[0])));
    out_z29(f64(unchecked(qaCount[1])));
    out_z30(f64(unchecked(qaCount[2])));
    out_z31(f64(unchecked(qaCount[3])));
    out_z32(f64(unchecked(qaCount[4])));
    out_z33(f64(unchecked(qaCount[5])));
    out_z34(f64(unchecked(qaCount[6])));
    out_z35(f64(unchecked(qaCount[7])));
    out_z36(f64(unchecked(qaCount[8])));
    out_z37(f64(unchecked(qaCount[9])));
    out_z38(f64(unchecked(qaCount[10])));
    out_z39(f64(unchecked(qaCount[11])));
    out_z40(f64(unchecked(qaCount[12])));
    out_z41(f64(unchecked(qaCount[13])));
    out_z42(f64(unchecked(obN[0])));
    out_z43(0 < unchecked(obN[0]) ? qw(unchecked(obTop[0])) : NaN);
    out_z44(0 < unchecked(obN[0]) ? qf(unchecked(obTop[0])) : NaN);
    out_z45(0 < unchecked(obN[0]) ? qw(unchecked(obBottom[0])) : NaN);
    out_z46(0 < unchecked(obN[0]) ? qf(unchecked(obBottom[0])) : NaN);
    out_z47(0 < unchecked(obN[0]) ? qm(unchecked(obT[0])) : NaN);
    out_z48(0 < unchecked(obN[0]) ? f64(unchecked(obBias[0]) + 1) : NaN);
    out_z49(1 < unchecked(obN[0]) ? qw(unchecked(obTop[1])) : NaN);
    out_z50(1 < unchecked(obN[0]) ? qf(unchecked(obTop[1])) : NaN);
    out_z51(1 < unchecked(obN[0]) ? qw(unchecked(obBottom[1])) : NaN);
    out_z52(1 < unchecked(obN[0]) ? qf(unchecked(obBottom[1])) : NaN);
    out_z53(1 < unchecked(obN[0]) ? qm(unchecked(obT[1])) : NaN);
    out_z54(1 < unchecked(obN[0]) ? f64(unchecked(obBias[1]) + 1) : NaN);
    out_z55(2 < unchecked(obN[0]) ? qw(unchecked(obTop[2])) : NaN);
    out_z56(2 < unchecked(obN[0]) ? qf(unchecked(obTop[2])) : NaN);
    out_z57(2 < unchecked(obN[0]) ? qw(unchecked(obBottom[2])) : NaN);
    out_z58(2 < unchecked(obN[0]) ? qf(unchecked(obBottom[2])) : NaN);
    out_z59(2 < unchecked(obN[0]) ? qm(unchecked(obT[2])) : NaN);
    out_z60(2 < unchecked(obN[0]) ? f64(unchecked(obBias[2]) + 1) : NaN);
    out_z61(3 < unchecked(obN[0]) ? qw(unchecked(obTop[3])) : NaN);
    out_z62(3 < unchecked(obN[0]) ? qf(unchecked(obTop[3])) : NaN);
    out_z63(3 < unchecked(obN[0]) ? qw(unchecked(obBottom[3])) : NaN);
    out_z64(3 < unchecked(obN[0]) ? qf(unchecked(obBottom[3])) : NaN);
    out_z65(3 < unchecked(obN[0]) ? qm(unchecked(obT[3])) : NaN);
    out_z66(3 < unchecked(obN[0]) ? f64(unchecked(obBias[3]) + 1) : NaN);
    out_z67(4 < unchecked(obN[0]) ? qw(unchecked(obTop[4])) : NaN);
    out_z68(4 < unchecked(obN[0]) ? qf(unchecked(obTop[4])) : NaN);
    out_z69(4 < unchecked(obN[0]) ? qw(unchecked(obBottom[4])) : NaN);
    out_z70(4 < unchecked(obN[0]) ? qf(unchecked(obBottom[4])) : NaN);
    out_z71(4 < unchecked(obN[0]) ? qm(unchecked(obT[4])) : NaN);
    out_z72(4 < unchecked(obN[0]) ? f64(unchecked(obBias[4]) + 1) : NaN);
    out_z73(f64(unchecked(obN[1])));
    out_z74(0 < unchecked(obN[1]) ? qw(unchecked(obTop[100])) : NaN);
    out_z75(0 < unchecked(obN[1]) ? qf(unchecked(obTop[100])) : NaN);
    out_z76(0 < unchecked(obN[1]) ? qw(unchecked(obBottom[100])) : NaN);
    out_z77(0 < unchecked(obN[1]) ? qf(unchecked(obBottom[100])) : NaN);
    out_z78(0 < unchecked(obN[1]) ? qm(unchecked(obT[100])) : NaN);
    out_z79(0 < unchecked(obN[1]) ? f64(unchecked(obBias[100]) + 1) : NaN);
    out_z80(1 < unchecked(obN[1]) ? qw(unchecked(obTop[101])) : NaN);
    out_z81(1 < unchecked(obN[1]) ? qf(unchecked(obTop[101])) : NaN);
    out_z82(1 < unchecked(obN[1]) ? qw(unchecked(obBottom[101])) : NaN);
    out_z83(1 < unchecked(obN[1]) ? qf(unchecked(obBottom[101])) : NaN);
    out_z84(1 < unchecked(obN[1]) ? qm(unchecked(obT[101])) : NaN);
    out_z85(1 < unchecked(obN[1]) ? f64(unchecked(obBias[101]) + 1) : NaN);
    out_z86(2 < unchecked(obN[1]) ? qw(unchecked(obTop[102])) : NaN);
    out_z87(2 < unchecked(obN[1]) ? qf(unchecked(obTop[102])) : NaN);
    out_z88(2 < unchecked(obN[1]) ? qw(unchecked(obBottom[102])) : NaN);
    out_z89(2 < unchecked(obN[1]) ? qf(unchecked(obBottom[102])) : NaN);
    out_z90(2 < unchecked(obN[1]) ? qm(unchecked(obT[102])) : NaN);
    out_z91(2 < unchecked(obN[1]) ? f64(unchecked(obBias[102]) + 1) : NaN);
    out_z92(3 < unchecked(obN[1]) ? qw(unchecked(obTop[103])) : NaN);
    out_z93(3 < unchecked(obN[1]) ? qf(unchecked(obTop[103])) : NaN);
    out_z94(3 < unchecked(obN[1]) ? qw(unchecked(obBottom[103])) : NaN);
    out_z95(3 < unchecked(obN[1]) ? qf(unchecked(obBottom[103])) : NaN);
    out_z96(3 < unchecked(obN[1]) ? qm(unchecked(obT[103])) : NaN);
    out_z97(3 < unchecked(obN[1]) ? f64(unchecked(obBias[103]) + 1) : NaN);
    out_z98(4 < unchecked(obN[1]) ? qw(unchecked(obTop[104])) : NaN);
    out_z99(4 < unchecked(obN[1]) ? qf(unchecked(obTop[104])) : NaN);
    out_z100(4 < unchecked(obN[1]) ? qw(unchecked(obBottom[104])) : NaN);
    out_z101(4 < unchecked(obN[1]) ? qf(unchecked(obBottom[104])) : NaN);
    out_z102(4 < unchecked(obN[1]) ? qm(unchecked(obT[104])) : NaN);
    out_z103(4 < unchecked(obN[1]) ? f64(unchecked(obBias[104]) + 1) : NaN);
    out_z104(f64(fvN));
    out_z105(0 < fvN ? qw(unchecked(fvTop[0])) : NaN);
    out_z106(0 < fvN ? qf(unchecked(fvTop[0])) : NaN);
    out_z107(0 < fvN ? qw(unchecked(fvBottom[0])) : NaN);
    out_z108(0 < fvN ? qf(unchecked(fvBottom[0])) : NaN);
    out_z109(0 < fvN ? qm(unchecked(fvT1[0])) : NaN);
    out_z110(0 < fvN ? f64(unchecked(fvBias[0]) + 1) : NaN);
    out_z111(1 < fvN ? qw(unchecked(fvTop[1])) : NaN);
    out_z112(1 < fvN ? qf(unchecked(fvTop[1])) : NaN);
    out_z113(1 < fvN ? qw(unchecked(fvBottom[1])) : NaN);
    out_z114(1 < fvN ? qf(unchecked(fvBottom[1])) : NaN);
    out_z115(1 < fvN ? qm(unchecked(fvT1[1])) : NaN);
    out_z116(1 < fvN ? f64(unchecked(fvBias[1]) + 1) : NaN);
    out_z117(2 < fvN ? qw(unchecked(fvTop[2])) : NaN);
    out_z118(2 < fvN ? qf(unchecked(fvTop[2])) : NaN);
    out_z119(2 < fvN ? qw(unchecked(fvBottom[2])) : NaN);
    out_z120(2 < fvN ? qf(unchecked(fvBottom[2])) : NaN);
    out_z121(2 < fvN ? qm(unchecked(fvT1[2])) : NaN);
    out_z122(2 < fvN ? f64(unchecked(fvBias[2]) + 1) : NaN);
    out_z123(3 < fvN ? qw(unchecked(fvTop[3])) : NaN);
    out_z124(3 < fvN ? qf(unchecked(fvTop[3])) : NaN);
    out_z125(3 < fvN ? qw(unchecked(fvBottom[3])) : NaN);
    out_z126(3 < fvN ? qf(unchecked(fvBottom[3])) : NaN);
    out_z127(3 < fvN ? qm(unchecked(fvT1[3])) : NaN);
    out_z128(3 < fvN ? f64(unchecked(fvBias[3]) + 1) : NaN);
    out_z129(4 < fvN ? qw(unchecked(fvTop[4])) : NaN);
    out_z130(4 < fvN ? qf(unchecked(fvTop[4])) : NaN);
    out_z131(4 < fvN ? qw(unchecked(fvBottom[4])) : NaN);
    out_z132(4 < fvN ? qf(unchecked(fvBottom[4])) : NaN);
    out_z133(4 < fvN ? qm(unchecked(fvT1[4])) : NaN);
    out_z134(4 < fvN ? f64(unchecked(fvBias[4]) + 1) : NaN);
    out_z135(f64(unchecked(stKind[0])));
    out_z136(unchecked(stKind[0]) != 0 ? qw(unchecked(stLevel[0])) : NaN);
    out_z137(unchecked(stKind[0]) != 0 ? qf(unchecked(stLevel[0])) : NaN);
    out_z138(unchecked(stKind[0]) != 0 ? qm(unchecked(stT1[0])) : NaN);
    out_z139(unchecked(stKind[0]) != 0 ? qm(unchecked(stT2[0])) : NaN);
    out_z140(f64(unchecked(stKind[1])));
    out_z141(unchecked(stKind[1]) != 0 ? qw(unchecked(stLevel[1])) : NaN);
    out_z142(unchecked(stKind[1]) != 0 ? qf(unchecked(stLevel[1])) : NaN);
    out_z143(unchecked(stKind[1]) != 0 ? qm(unchecked(stT1[1])) : NaN);
    out_z144(unchecked(stKind[1]) != 0 ? qm(unchecked(stT2[1])) : NaN);
    out_z145(f64(unchecked(stKind[2])));
    out_z146(unchecked(stKind[2]) != 0 ? qw(unchecked(stLevel[2])) : NaN);
    out_z147(unchecked(stKind[2]) != 0 ? qf(unchecked(stLevel[2])) : NaN);
    out_z148(unchecked(stKind[2]) != 0 ? qm(unchecked(stT1[2])) : NaN);
    out_z149(unchecked(stKind[2]) != 0 ? qm(unchecked(stT2[2])) : NaN);
    out_z150(f64(unchecked(stKind[3])));
    out_z151(unchecked(stKind[3]) != 0 ? qw(unchecked(stLevel[3])) : NaN);
    out_z152(unchecked(stKind[3]) != 0 ? qf(unchecked(stLevel[3])) : NaN);
    out_z153(unchecked(stKind[3]) != 0 ? qm(unchecked(stT1[3])) : NaN);
    out_z154(unchecked(stKind[3]) != 0 ? qm(unchecked(stT2[3])) : NaN);
    return;
  }
  aIBB = 0; aIBC = 0; aISB = 0; aISC = 0; aSBB = 0; aSBC = 0; aSSB = 0; aSSC = 0;
  aIOBu = 0; aIOBe = 0; aSOBu = 0; aSOBe = 0; aFVGu = 0; aFVGe = 0;

  // Volatility: Pine ta.atr(200) (Wilder's average, first value on the 201st bar), or the mean true range so far.
  if (idx >= 1) {
    const tr = Math.max(h - l, Math.max(Math.abs(h - prevClose), Math.abs(l - prevClose)));
    trCum += tr; trN += 1;
    if (trN <= 200) { trSum += tr; if (trN == 200) atr = trSum / 200.0; }
    else atr = (atr * 199.0 + tr) / 200.0;
  }
  const vol = obFilterAtr ? atr : (idx >= 1 ? trCum / f64(idx) : NaN);
  const wild = !isNaN(vol) && (h - l) >= 2.0 * vol; // a high volatility bar: its high and low swap for order blocks
  const s = idx & (RING - 1);
  rH[s] = h; rL[s] = l; rPH[s] = wild ? l : h; rPL[s] = wild ? h : l; rT[s] = t;

  if (showHighLow || showZones) {
    // Pine math.max / math.min give na while a side has no swing yet
    if (!isNaN(trTop)) { if (h > trTop) trTop = h; if (trTop == h) trTopT = t; }
    if (!isNaN(trBottom)) { if (l < trBottom) trBottom = l; if (trBottom == l) trBottomT = t; }
  }
  hlTop = trTop; hlBottom = trBottom; hlTopT = trTopT; hlBottomT = trBottomT; hlTrend = unchecked(trend[0]); znT = trT; znIdx = trIdx;

  if (showFvg) deleteFairValueGaps(h, l);

  currentStructure(swingsLength, false);
  currentStructure(5, true);
  if (showInternals || showInternalOb) displayStructure(true, t, o, h, l, c);
  if (showStructure || showSwingOb || showHighLow) displayStructure(false, t, o, h, l, c);
  if (showInternalOb) deleteOrderBlocks(true, obMitigationClose ? c : h, obMitigationClose ? c : l);
  if (showSwingOb) deleteOrderBlocks(false, obMitigationClose ? c : h, obMitigationClose ? c : l);
  if (showFvg) fairValueGaps(t, h, l);

  out_internal_bullish_bos(f64(aIBB)); out_internal_bullish_choch(f64(aIBC)); out_internal_bearish_bos(f64(aISB)); out_internal_bearish_choch(f64(aISC));
  out_bullish_bos(f64(aSBB)); out_bullish_choch(f64(aSBC)); out_bearish_bos(f64(aSSB)); out_bearish_choch(f64(aSSC));
  out_bullish_internal_ob_break(f64(aIOBu)); out_bearish_internal_ob_break(f64(aIOBe)); out_bullish_swing_ob_break(f64(aSOBu)); out_bearish_swing_ob_break(f64(aSOBe));
  out_bullish_fvg(f64(aFVGu)); out_bearish_fvg(f64(aFVGe));

  if (isNaN(qaFirst)) qaFirst = t;
  qaCount[0] += aIBB; qaCount[1] += aIBC; qaCount[2] += aISB; qaCount[3] += aISC; qaCount[4] += aSBB; qaCount[5] += aSBC; qaCount[6] += aSSB; qaCount[7] += aSSC;
  qaCount[8] += aIOBu; qaCount[9] += aIOBe; qaCount[10] += aSOBu; qaCount[11] += aSOBe; qaCount[12] += aFVGu; qaCount[13] += aFVGe;
  if (bar.isLast()) render(t);

  prevOpen = o; prevClose = c; prevT = t;
  idx += 1;
}
