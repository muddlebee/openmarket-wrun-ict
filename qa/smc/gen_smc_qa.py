#!/usr/bin/env python3
"""Build the QA variant of smart-money-concepts.wrun.ts: the same source, every feature switched on,
plus a dump of its state on the newest bar as whole numbers under 100000 (the editor console prints
larger numbers rounded). Writes smc-qa.wrun.ts and prints the dump's field names in order."""
import sys, json
src = open(sys.argv[1] if len(sys.argv) > 1 else '../../smart-money-concepts.wrun.ts', encoding='utf-8').read()
BASE = 1790812800  # 2026-10-01 00:00 UTC

F = []  # (name, expression)
def price(name, e): F.append((name + '_w', f'qw({e})')); F.append((name + '_f', f'qf({e})'))
F += [('first', 'qm(qaFirst)'), ('idx', 'f64(idx - 1)'), ('trend_swing', 'f64(unchecked(trend[0]) + 1)'), ('trend_internal', 'f64(unchecked(trend[1]) + 1)')]
price('atr', 'atr')
for k, n in enumerate(['swing_high', 'swing_low', 'internal_high', 'internal_low']):
    price(n, f'unchecked(pvCur[{k}])'); F.append((n + '_back', f'f64(idx - 1 - unchecked(pvIdx[{k}]))')); F.append((n + '_crossed', f'f64(unchecked(pvCrossed[{k}]))'))
price('trail_top', 'trTop'); F.append(('trail_top_t', 'qm(trTopT)')); price('trail_bottom', 'trBottom'); F.append(('trail_bottom_t', 'qm(trBottomT)'))
for k, n in enumerate(['ibb', 'ibc', 'isb', 'isc', 'sbb', 'sbc', 'ssb', 'ssc', 'iobu', 'iobe', 'sobu', 'sobe', 'fvgu', 'fvge']):
    F.append(('count_' + n, f'f64(unchecked(qaCount[{k}]))'))
for li, n in ((0, 'swing'), (1, 'internal')):
    F.append((f'ob_{n}_n', f'f64(unchecked(obN[{li}]))'))
    for i in range(5):
        on = f'{i} < unchecked(obN[{li}])'; b = li * 100 + i
        F.append((f'ob_{n}_{i}_top_w', f'{on} ? qw(unchecked(obTop[{b}])) : NaN')); F.append((f'ob_{n}_{i}_top_f', f'{on} ? qf(unchecked(obTop[{b}])) : NaN'))
        F.append((f'ob_{n}_{i}_bottom_w', f'{on} ? qw(unchecked(obBottom[{b}])) : NaN')); F.append((f'ob_{n}_{i}_bottom_f', f'{on} ? qf(unchecked(obBottom[{b}])) : NaN'))
        F.append((f'ob_{n}_{i}_t', f'{on} ? qm(unchecked(obT[{b}])) : NaN')); F.append((f'ob_{n}_{i}_bias', f'{on} ? f64(unchecked(obBias[{b}]) + 1) : NaN'))
F.append(('fvg_n', 'f64(fvN)'))
for i in range(5):
    on = f'{i} < fvN'
    F.append((f'fvg_{i}_top_w', f'{on} ? qw(unchecked(fvTop[{i}])) : NaN')); F.append((f'fvg_{i}_top_f', f'{on} ? qf(unchecked(fvTop[{i}])) : NaN'))
    F.append((f'fvg_{i}_bottom_w', f'{on} ? qw(unchecked(fvBottom[{i}])) : NaN')); F.append((f'fvg_{i}_bottom_f', f'{on} ? qf(unchecked(fvBottom[{i}])) : NaN'))
    F.append((f'fvg_{i}_t1', f'{on} ? qm(unchecked(fvT1[{i}])) : NaN')); F.append((f'fvg_{i}_bias', f'{on} ? f64(unchecked(fvBias[{i}]) + 1) : NaN'))
for i, n in enumerate(['swing_bull', 'swing_bear', 'internal_bull', 'internal_bear']):
    on = f'unchecked(stKind[{i}]) != 0'
    F.append((f'st_{n}_kind', f'f64(unchecked(stKind[{i}]))')); F.append((f'st_{n}_level_w', f'{on} ? qw(unchecked(stLevel[{i}])) : NaN')); F.append((f'st_{n}_level_f', f'{on} ? qf(unchecked(stLevel[{i}])) : NaN'))
    F.append((f'st_{n}_t1', f'{on} ? qm(unchecked(stT1[{i}])) : NaN')); F.append((f'st_{n}_t2', f'{on} ? qm(unchecked(stT2[{i}])) : NaN'))

decl = '\n'.join(f'output("z{i}", none, overlay);' for i in range(len(F)))
helpers = f'''
// ---- QA dump ----
const QA_BASE: f64 = {BASE}.0;
let qaFirst: f64 = NaN;
const qaCount = new StaticArray<i32>(14);
function qw(x: f64): f64 {{ return isNaN(x) ? NaN : Math.floor(x); }}
function qf(x: f64): f64 {{ return isNaN(x) ? NaN : Math.round((x - Math.floor(x)) * 10000.0); }}
function qm(x: f64): f64 {{ return isNaN(x) ? NaN : (x - QA_BASE) / 60.0; }}
'''
count = ('  if (isNaN(qaFirst)) qaFirst = t;\n  qaCount[0] += aIBB; qaCount[1] += aIBC; qaCount[2] += aISB; qaCount[3] += aISC; qaCount[4] += aSBB; qaCount[5] += aSBC; qaCount[6] += aSSB; qaCount[7] += aSSC;\n'
         '  qaCount[8] += aIOBu; qaCount[9] += aIOBe; qaCount[10] += aSOBu; qaCount[11] += aSOBe; qaCount[12] += aFVGu; qaCount[13] += aFVGe;\n')
dump = '  if (bar.isLast()) {\n' + '\n'.join(f'    out_z{i}({e});' for i, (_, e) in enumerate(F)) + '\n  }\n'
A1 = 'string("tag", { max_bytes: 32 });'; A2 = 'function onBar(): void {'; A3 = '  if (bar.isLast()) render(t);\n'; A4 = '  barSec = p_chart_interval_sec();\n'; A5 = '  prevOpen = o; prevClose = c; prevT = t;\n  idx += 1;\n}'
for a in (A1, A2, A3, A4, A5): assert src.count(a) == 1, a
qa = src.replace(A1, decl + '\n' + A1).replace(A2, helpers + A2).replace(A3, count + A3)
qa = qa.replace(A4, A4 + '  showFvg = true; showSwingOb = true; showZones = true; showSwings = true; present = true; // QA: everything on\n')
# The dump is written on the newest bar INSTEAD of evaluating it: the bar is still forming, so the state
# dumped is the state after the last closed bar, which a reference can reproduce exactly.
A6 = '  if (isNaN(h) || isNaN(l) || isNaN(c)) return;\n'
assert src.count(A6) == 1
qa = qa.replace(A6, A6 + dump.replace('  if (bar.isLast()) {\n', '  if (bar.isLast()) { // QA: dump and stop\n').replace('\n  }\n', '\n    return;\n  }\n'))
open('smc-qa.wrun.ts', 'w', encoding='utf-8').write(qa)
json.dump(dict(names=[n for n, _ in F], decl=decl, helpers=helpers, count=count, dump=dump, A=[A1, A2, A3, A4, A5, A6], srcLen=len(src), srcSum=sum(map(ord, src)), qaLen=len(qa), qaSum=sum(map(ord, qa))), open('smc-qa.json', 'w'))
print(len(F), 'fields; clean', len(src), sum(map(ord, src)), 'qa', len(qa), sum(map(ord, qa)))
