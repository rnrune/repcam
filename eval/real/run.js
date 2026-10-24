#!/usr/bin/env node
// Real-user regression clips (app feedback, landmarks only — no video in git). Replays each clip EXACTLY like app.js
// processFrame in auto mode: camera gate -> every counter -> recognizer -> picker -> lock at 2 reps. Frames carry their own
// timestamps (≈10 Hz as logged by the app); --hz 30 linearly upsamples to the live camera rate.
// Usage: node eval/real/run.js [--reps path] [--hz 30]   exit code 1 on any mismatch.
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const R = require(path.resolve(arg('--reps', path.join(__dirname, '..', '..', 'reps.js'))));
const DEFAULT_KG = { knebøy: 20, bulgarsk: 0, pullups: 0, dips: 0, benkpress: 20, skråbenk: 20, halvmark: 40, roing: 30, armhevinger: 0, situps: 0 };
function upsample(F, hz) { const o = []; for (let i = 0; i + 1 < F.length; i++) { const a = F[i], b = F[i + 1], dt = b[0] - a[0];
  const n = dt > 0.5 ? 1 : Math.max(1, Math.round(dt * hz)); for (let k = 0; k < n; k++) o.push(a.map((x, j) => x + (b[j] - x) * k / n)); } o.push(F[F.length - 1]); return o; }
function replay(d, hz) {
  const F = hz ? upsample(d.frames, hz) : d.frames, asp = d.w / d.h, cs = {}, rec = R.createRecognizer(), pick = R.createPicker(), gate = R.createCameraGate();
  for (const id of R.IDS) cs[id] = R.createCounter(id);
  let auto = null, lock = null;
  for (const a of F) { const lm = []; for (let i = 0; i < 33; i++) lm.push({ x: a[1 + 3 * i], y: a[2 + 3 * i], visibility: a[3 + 3 * i] });
    const ms = a[0] * 1000, cam = !gate.update(lm, ms, asp).ok; for (const id of R.IDS) cs[id].update(lm, ms, asp, cam);
    const p = pick.update(rec.update(lm, ms, asp, cam), ms); if (!lock && p) auto = p; if (auto && !lock && cs[auto].reps >= 2) lock = auto; }
  const ex = lock || auto, reps = ex ? cs[ex].flush() : 0;
  return { ex, reps, kg: DEFAULT_KG[ex] ?? 0, times: ex ? cs[ex].repTimes.map(t => +t.toFixed(1)) : [] };
}
module.exports = { replay, man: () => JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8')), load: id => JSON.parse(fs.readFileSync(path.join(__dirname, id + '.lm.json'), 'utf8')) };
if (require.main === module) {
  const hz = +arg('--hz', 0) || 0; let bad = 0;
  console.log('| Clip | GT | Pred | Exercise (GT → pred) | kg | Rep times (s) |\n|---|---|---|---|---|---|');
  for (const e of module.exports.man()) { const r = replay(module.exports.load(e.id), hz), ok = r.ex === e.exercise && r.reps === e.gt && r.kg === e.kg; if (!ok) bad++;
    console.log(`| ${ok ? '✓' : '✗'} ${e.id} | ${e.gt} | ${r.reps} | ${e.exercise} → ${r.ex} | ${r.kg} | ${r.times.join(', ')} |`); }
  process.exit(bad ? 1 : 0);
}
