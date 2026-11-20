#!/usr/bin/env python3
"""Build the QA variant of the indicator: the same source plus numeric dumps of every level on the newest bar.

The editor console prints large numbers in 5-digit scientific notation, so every dumped value stays a
whole number under 100000: prices split into whole and fraction, times as minutes since QA_BASE.
Writes qa-build.wrun.ts and qa-transform.js (the same transform, to apply inside the editor page).
"""
import json, sys, calendar, datetime
src_path = sys.argv[1] if len(sys.argv) > 1 else '../ict-liquidity-map.wrun.ts'
out_dir = sys.argv[2] if len(sys.argv) > 2 else '.'
BASE = calendar.timegm(datetime.datetime(2026, 10, 1).timetuple())
K = 32
DECL = 'output("a{k}", none, overlay); output("b{k}", none, overlay); output("c{k}", none, overlay); output("e{k}", none, overlay); output("f{k}", none, overlay); output("g{k}", none, overlay); output("h{k}", none, overlay);'
CODE = '    s = ds({k}); out_a{k}(da(s)); out_b{k}(db(s)); out_c{k}(dc(s)); out_e{k}(de(s)); out_f{k}(df(s)); out_g{k}(dg(s)); out_h{k}(dh(s));'
DIAG_DECL = ' '.join(f'output("d_{n}", none, overlay);' for n in ['n','dayno','curday','barsec','mopi','mopf','mot','lastfed','t','handover','started','livec','liveo','histc','first','asof'])
HELPERS = f'''
// ---- QA dump: every level as small whole numbers the console prints exactly ----
const QA_BASE: f64 = {BASE}.0; // 2026-10-01 00:00 UTC
const QA_ASOF: f64 = 0.0; // minutes since QA_BASE: the engine stops before the candle opening then (0 = runs to now)
let qaFirst: f64 = NaN; // the first candle the engine took
const qaIdx = new StaticArray<i32>({K});
let qaN: i32 = 0;
function qaScan(): void {{ qaN = 0; for (let i = 0; i < cap; i += 1) {{ if (unchecked(lvState[i]) != 0) {{ if (qaN < {K}) qaIdx[qaN] = i; qaN += 1; }} }} }}
function qm(x: f64): f64 {{ return isNaN(x) ? NaN : (x - QA_BASE) / 60.0; }}
function ds(k: i32): i32 {{ return k < qaN && k < {K} ? unchecked(qaIdx[k]) : -1; }}
function da(s: i32): f64 {{ if (s < 0) return NaN; const w = Math.floor(unchecked(lvPrice[s])); return unchecked(lvHigh[s]) == 1 ? w : -w; }}
function db(s: i32): f64 {{ if (s < 0) return NaN; const p = unchecked(lvPrice[s]); return Math.round((p - Math.floor(p)) * 10000.0); }}
function dc(s: i32): f64 {{ return s < 0 ? NaN : f64(unchecked(lvMask[s])); }}
function de(s: i32): f64 {{ return s < 0 ? NaN : f64(weekdayOf(unchecked(lvForm[s])) * 1000 + unchecked(lvWd[s]) * 100 + unchecked(lvState[s]) * 10 + unchecked(lvDrawn[s])); }}
function df(s: i32): f64 {{ return s < 0 || unchecked(lvState[s]) != 2 ? NaN : f64(unchecked(lvSweptHm[s])); }}
function dg(s: i32): f64 {{ return s < 0 ? NaN : qm(unchecked(lvTs[s])); }}
function dh(s: i32): f64 {{ return s < 0 || unchecked(lvState[s]) != 2 ? NaN : qm(unchecked(lvSweptTs[s])); }}
'''
TAIL_HEAD = '  if (bar.isLast()) {\n    qaScan();\n    let s: i32 = 0;\n'
TAIL_END = ('\n    out_d_n(f64(qaN)); out_d_dayno(dayNo); out_d_curday(curDay); out_d_barsec(barSec);'
            ' out_d_mopi(Math.floor(moPrice)); out_d_mopf(Math.round((moPrice - Math.floor(moPrice)) * 10000.0)); out_d_mot(qm(moT));'
            ' out_d_lastfed(qm(lastFed)); out_d_t(qm(t)); out_d_handover(qm(handover)); out_d_started(started ? 1.0 : 0.0);'
            ' out_d_livec(f64(in_live_cells())); out_d_liveo(in_live_cells() > 0 ? unchecked(in_live_view()[0]) / 60000.0 : NaN); out_d_histc(f64(in_hist_cells())); out_d_first(qm(qaFirst)); out_d_asof(QA_ASOF);\n  }\n}\n')
A1 = 'string("tag", { max_bytes: 64 });'
A2 = 'function onBar(): void {'
A3 = 'function step(t: f64, o: f64, h: f64, l: f64): void {\n'
G3 = '  if (QA_ASOF > 0.0 && t >= QA_BASE + QA_ASOF * 60.0) return; // QA: frozen at a past moment\n  if (isNaN(qaFirst)) qaFirst = t;\n'
A4 = '  if (isNaN(price) || isNaN(ts)) return;\n'
G4 = '  if (QA_ASOF > 0.0 && now >= QA_BASE + QA_ASOF * 60.0) return; // QA: frozen at a past moment\n'

def build(s):
    assert s.count(A1) == 1 and s.count(A2) == 1 and s.count(A3) == 1 and s.count(A4) == 1
    s = s.replace(A3, A3 + G3).replace(A4, A4 + G4)
    decl = '\n'.join(DECL.replace('{k}', str(k)) for k in range(K)) + '\n' + DIAG_DECL
    code = '\n'.join(CODE.replace('{k}', str(k)) for k in range(K))
    s = s.replace(A1, decl + '\n' + A1).replace(A2, HELPERS + A2).rstrip()
    assert s.endswith('}')
    return s[:-1] + TAIL_HEAD + code + TAIL_END

src = open(src_path, encoding='utf-8').read()
qa = build(src)
open(f'{out_dir}/qa-build.wrun.ts', 'w', encoding='utf-8').write(qa)
P = dict(K=K, DECL=DECL, CODE=CODE, DIAG=DIAG_DECL, HELPERS=HELPERS, TH=TAIL_HEAD, TE=TAIL_END, A1=A1, A2=A2, A3=A3, G3=G3, A4=A4, G4=G4,
         srcLen=len(src), srcSum=sum(map(ord, src)), qaLen=len(qa), qaSum=sum(map(ord, qa)))
js = ('(()=>{const P=' + json.dumps(P, ensure_ascii=False) + ';window.__P=P;const v=window.__cmv||document.querySelector(".cm-content").cmTile.view;window.__cmv=v;'
      'const sum=x=>{let c=0;for(const ch of x)c+=ch.codePointAt(0);return c;};'
      'let s=window.__clean&&window.__clean.length===P.srcLen?window.__clean:v.state.doc.toString();'
      'if(s.length!==P.srcLen||sum(s)!==P.srcSum)return "CLEAN MISMATCH "+s.length+" "+sum(s);window.__clean=s;'
      'const rng=[...Array(P.K).keys()];const decl=rng.map(k=>P.DECL.replaceAll("{k}",k)).join("\\n")+"\\n"+P.DIAG;'
      'const code=rng.map(k=>P.CODE.replaceAll("{k}",k)).join("\\n");'
      's=s.replace(P.A3,()=>P.A3+P.G3).replace(P.A4,()=>P.A4+P.G4);s=s.replace(P.A1,()=>decl+"\\n"+P.A1).replace(P.A2,()=>P.HELPERS+P.A2).replace(/\\s+$/,"");'
      's=s.slice(0,-1)+P.TH+code+P.TE;if(s.length!==P.qaLen||sum(s)!==P.qaSum)return "QA MISMATCH "+s.length+" "+sum(s);'
      'window.__qa=s;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:s}});return "qa build in editor "+s.length;})()')
open(f'{out_dir}/qa-transform.js', 'w', encoding='utf-8').write(js)
print('clean', P['srcLen'], P['srcSum'], 'qa', P['qaLen'], P['qaSum'], 'base', BASE, 'js', len(js))
