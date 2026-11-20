// QA driver for the OpenMarket indicator editor. Paste into the browser console of the chart page
// (or run through browser automation) with the indicator open in the editor, after qa-transform.js
// from gen_qa_build.py has put its templates on window.__P and the clean source on window.__clean.
//
// What it does: loads a QA variant of the source into the editor, runs it, then types each dump
// output's name into the editor console and reads back the value the console prints for the newest bar.

const sleep = ms => new Promise(r => setTimeout(r, ms));
window.__sum = x => { let c = 0; for (const ch of x) c += ch.codePointAt(0); return c; };
window.__cmv = document.querySelector('.cm-content').cmTile.view;   // the CodeMirror view
window.__run = () => [...document.querySelectorAll('button')].filter(b => /^\s*Run\b/.test(b.textContent))[0].click();
window.__load = src => { const v = window.__cmv; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: src } }); window.__run(); };

// The QA source: the clean source plus the dump (see gen_qa_build.py), optionally frozen at a past moment.
window.__qaSrc = asof => {
  const P = window.__P; let s = window.__clean;
  if (s.length !== P.srcLen || window.__sum(s) !== P.srcSum) throw new Error('clean source mismatch');
  const rng = [...Array(P.K).keys()];
  const decl = rng.map(k => P.DECL.replaceAll('{k}', k)).join('\n') + '\n' + P.DIAG;
  const code = rng.map(k => P.CODE.replaceAll('{k}', k)).join('\n');
  s = s.replace(P.A3, () => P.A3 + P.G3).replace(P.A4, () => P.A4 + P.G4);
  s = s.replace(P.A1, () => decl + '\n' + P.A1).replace(P.A2, () => P.HELPERS + P.A2).replace(/\s+$/, '');
  s = s.slice(0, -1) + P.TH + code + P.TE;
  if (s.length !== P.qaLen || window.__sum(s) !== P.qaSum) throw new Error('qa build mismatch');
  if (asof) s = s.replace('const QA_ASOF: f64 = 0.0;', () => 'const QA_ASOF: f64 = ' + asof + '.0;');
  return s;
};

// Read outputs by name through the editor console. Each answer is "<name> = <value> · <bar time>".
window.__dump = async names => {
  const inp = document.querySelector('input[placeholder^="Type an expression"]');
  let root = inp; for (let i = 0; i < 6; i++) root = root.parentElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const cnt = (t, k) => t.split(k).length - 1;
  const out = [];
  for (const n of names) {
    const key = '\n' + n + ' = '; const c0 = cnt(root.innerText, key);
    setter.call(inp, n); inp.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(15); inp.closest('form').requestSubmit();
    let got = null;
    for (let i = 0; i < 120 && got === null; i++) {   // wait for a NEW answer, never an older one
      await sleep(25); const txt = root.innerText;
      if (cnt(txt, key) > c0) got = txt.slice(txt.lastIndexOf(key) + key.length).split('\n')[0];
    }
    out.push([n, got]);
  }
  return out;
};

// One full dump, once the build on the chart is the one asked for (chart interval and frozen-at marker).
window.__dumpAll = async (tag, barsec, asof) => {
  const P = window.__P; window.__res = window.__res || {}; delete window.__res[tag];
  const num = r => r.map(([n, v]) => [n, v == null ? null : v.split(' · ')[0], v == null ? null : v.split(' · ')[1]]);
  for (let i = 0; i < 60; i++) {
    const b = num(await window.__dump(['d_barsec', 'd_asof']));
    if (b[0][1] !== null && +b[0][1] === barsec && +b[1][1] === (asof || 0)) break;
    await sleep(500);
  }
  const D = [...P.DIAG.matchAll(/"(d_\w+)"/g)].map(m => m[1]);
  const d = num(await window.__dump(D));
  const n = Math.min(P.K, +d[0][1]);
  const names = []; for (let k = 0; k < n; k++) for (const c of 'abcefgh') names.push(c + k);
  const lv = num(await window.__dump(names));
  const d2 = num(await window.__dump(['d_n', 'd_lastfed', 'd_t']));
  const res = { tag, at: d[0][2], diag: Object.fromEntries(d.map(x => [x[0], x[1]])), rows: [],
    times: [...new Set(lv.concat(d, d2).map(x => x[2]))], stable: d2[0][1] === d[0][1] && d2[1][1] === d[7][1] };
  for (let k = 0; k < n; k++) res.rows.push(lv.slice(k * 7, k * 7 + 7).map(x => x[1]));
  window.__res[tag] = res; return res;
};

// One dump as a line for dumps/*.txt.
window.__compact = tag => {
  const r = window.__res && window.__res[tag]; if (!r) return 'pending ' + tag;
  return tag + ' at ' + r.at.slice(5, 16) + ' times ' + r.times.length + ' stable ' + r.stable + ' | ' +
    Object.entries(r.diag).map(([k, v]) => k.slice(2) + ':' + v).join(' ') + ' | ' + r.rows.map(x => x.join(',')).join(';');
};

// Variants. Consecutive runs must differ in their frozen-at value: it is how a dump knows the new build is up.
// A value above 90000 freezes nothing (it is in the future) and only serves as that marker.
const variant = async (src, tag, barsec, asof) => { window.__load(src); await sleep(2800); await window.__dumpAll(tag, barsec, asof); };

// Past moments: asofRun([52860, 56115, ...], 900, 'q15_')   (minutes since 2026-10-01 00:00 UTC)
window.__asofRun = async (list, barsec, prefix) => { for (const a of list) await variant(window.__qaSrc(a), prefix + a, barsec, a); };

// Focus view, with the price handed to the picker: focusRun([[57045, 27300], [63225, 28250]], 900)
window.__focusRun = async (list, barsec) => {
  for (const [asof, close] of list) {
    let s = window.__qaSrc(asof).replace('showAll = i32(p_view());', () => 'showAll = 0; // QA: Focus view');
    if (close) s = s.replace('if (bar.isLast()) render(c);', () => 'if (bar.isLast()) render(' + close + '.0); // QA: a fixed price');
    await variant(s, 'f_' + asof + '_' + close, barsec, asof);
  }
};

// Other "Day starts" settings: modeRun([['ny', 2, false, 99991], ['utc', 0, false, 99992], ['rth', 1, true, 99993]], 900)
window.__modeRun = async (list, barsec) => {
  for (const [name, dayMode, rth, asof] of list) {
    const s = window.__qaSrc(asof).replace('dayMode = i32(p_day_mode()); rthOnly = pb_rth_only();',
      () => 'dayMode = ' + dayMode + '; rthOnly = ' + rth + '; // QA: a forced Day starts setting');
    await variant(s, name + '_' + asof, barsec, asof);
  }
};

// When done, put the clean source back and check it: window.__load(window.__clean)
