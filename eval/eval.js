#!/usr/bin/env node
// Offline accuracy harness: runs the SAME reps.js used by the app over MediaPipe landmarks
// extracted (in Chrome, same tasks-vision model as the app) from the videos listed in manifest.json.
// Usage: node eval/eval.js [--lm DIR] [--reps path/to/reps.js] [--json out.json] [--verbose]
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LM = arg('--lm', process.env.REPCAM_LM || '/workspace/repcam-eval/lm');
const R = require(path.resolve(arg('--reps', path.join(__dirname, '..', 'reps.js'))));
const man = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const verbose = process.argv.includes('--verbose');
function run(e) {
  const f = path.join(LM, (e.lm || e.id) + '.json'); if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, 'utf8')), asp = d.w / d.h;
  const c = R.createCounter(e.exercise), rec = R.createRecognizer(), votes = {};
  d.frames.forEach((fr, i) => {
    const t = i / d.fps; if (e.start && t < e.start) return; if (e.end && t > e.end) return;
    const ms = t * 1000; c.update(fr, ms, asp);
    const r = rec.update(fr, ms, asp);
    if (r.best && t - (e.start || 0) >= 3) votes[r.best] = (votes[r.best] || 0) + 1;
  });
  c.flush?.();
  const rb = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return { pred: c.reps, rec: rb ? rb[0] : null, times: c.repTimes.map(x => +x.toFixed(1)) };
}
// Negative clips (exercise "none": walking, loading plates, sitting, standing): replay them the way the app does —
// every counter runs, the recognizer picks the exercise — and count a FALSE SET when the recognized exercise reaches
// the app's auto-save minimum (MIN_AUTO_REPS = 2 in app.js).
const MIN_AUTO_REPS = 2;
function runNeg(e) {
  const f = path.join(LM, (e.lm || e.id) + '.json'); if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, 'utf8')), asp = d.w / d.h, cs = {}, rec = R.createRecognizer(), votes = {};
  for (const id of R.IDS) cs[id] = R.createCounter(id);
  d.frames.forEach((fr, i) => { const ms = i / d.fps * 1000; for (const id of R.IDS) cs[id].update(fr, ms, asp);
    const r = rec.update(fr, ms, asp); if (r.best && i / d.fps >= 3) votes[r.best] = (votes[r.best] || 0) + 1; });
  const rb = Object.entries(votes).sort((a, b) => b[1] - a[1])[0], recEx = rb ? rb[0] : null;
  const reps = recEx ? (cs[recEx].flush?.(), cs[recEx].reps) : 0;
  return { rec: recEx, reps, falseSet: reps >= MIN_AUTO_REPS };
}
const negRows = [];
for (const e of man.filter(x => x.exercise === 'none')) {
  const r = runNeg(e); if (!r) { console.error('missing landmarks', e.id); continue; }
  negRows.push({ ...e, ...r });
  if (verbose || r.falseSet) console.log(`${r.falseSet ? '✗' : '✓'} none/${e.activity.padEnd(14)} ${e.id.padEnd(11)} rec=${r.rec} reps=${r.reps}`);
}
const rows = [], per = {}, byView = {};
for (const e of man.filter(x => x.exercise !== 'none')) {
  const r = run(e); if (!r) { console.error('missing landmarks', e.id); continue; }
  const err = r.pred - e.gt; rows.push({ ...e, ...r, err });
  const p = per[e.exercise] ||= { n: 0, exact: 0, abs: 0, gt: 0, recN: 0, recOk: 0 };
  p.n++; p.gt += e.gt; p.abs += Math.abs(err); if (!err) p.exact++;
  const pv = byView[e.exercise + '|' + e.view] ||= { n: 0, exact: 0, abs: 0 }; pv.n++; pv.abs += Math.abs(err); if (!err) pv.exact++;
  if (e.gt > 0) { p.recN++; if (r.rec === e.exercise) p.recOk++; }
  if (verbose || err) console.log(`${err ? '✗' : '✓'} ${e.exercise.padEnd(9)} ${e.id.padEnd(11)} gt=${e.gt} pred=${r.pred} rec=${r.rec} ${verbose ? r.times.join(',') : ''}`);
}
console.log('\n| Exercise | Videos | GT reps | Exact | MAE | Recognition |\n|---|---|---|---|---|---|');
let T = { n: 0, exact: 0, abs: 0, gt: 0, recN: 0, recOk: 0 };
for (const [k, p] of Object.entries(per)) {
  for (const x in T) T[x] += p[x];
  console.log(`| ${k} | ${p.n} | ${p.gt} | ${p.exact}/${p.n} (${Math.round(100 * p.exact / p.n)}%) | ${(p.abs / p.n).toFixed(2)} | ${p.recOk}/${p.recN} |`);
}
console.log(`| **all** | ${T.n} | ${T.gt} | ${T.exact}/${T.n} (${Math.round(100 * T.exact / T.n)}%) | ${(T.abs / T.n).toFixed(2)} | ${T.recOk}/${T.recN} (${Math.round(100 * T.recOk / T.recN)}%) |`);
console.log('\n| Exercise | View | Videos | Exact | MAE |\n|---|---|---|---|---|');
const V = {};
for (const [k, p] of Object.entries(byView).sort()) { const [ex, vw] = k.split('|'); const q = V[vw] ||= { n: 0, exact: 0, abs: 0 }; q.n += p.n; q.exact += p.exact; q.abs += p.abs;
  console.log(`| ${ex} | ${vw} | ${p.n} | ${p.exact}/${p.n} | ${(p.abs / p.n).toFixed(2)} |`); }
console.log('\n| View (all exercises) | Videos | Exact | MAE |\n|---|---|---|---|');
for (const [vw, q] of Object.entries(V)) console.log(`| ${vw} | ${q.n} | ${q.exact}/${q.n} (${Math.round(100 * q.exact / q.n)}%) | ${(q.abs / q.n).toFixed(2)} |`);
if (negRows.length) {
  console.log('\n| Negative activity | Clips | False sets (≥' + MIN_AUTO_REPS + ' reps) | FP rate |\n|---|---|---|---|');
  const A = {}; for (const r of negRows) { const a = A[r.activity] ||= { n: 0, fp: 0 }; a.n++; if (r.falseSet) a.fp++; }
  let n = 0, fp = 0; for (const [k, a] of Object.entries(A)) { n += a.n; fp += a.fp; console.log(`| ${k} | ${a.n} | ${a.fp} | ${Math.round(100 * a.fp / a.n)}% |`); }
  console.log(`| **all** | ${n} | ${fp} | ${Math.round(100 * fp / n)}% |`);
}
const out = arg('--json'); if (out) fs.writeFileSync(out, JSON.stringify({ per, byView, rows, negRows }, null, 1));
