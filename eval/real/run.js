#!/usr/bin/env node
// Real-user regression clips (app feedback, landmarks only — no video in git). Replays each clip EXACTLY like app.js
// processFrame in auto mode: camera gate -> every counter -> recognizer -> picker -> lock at 2 reps. Frames carry their own
// timestamps (≈10 Hz as logged by the app); --hz 30 linearly upsamples to the live camera rate.
// Usage: node eval/real/run.js [--reps path] [--hz 30]   exit code 1 on any mismatch.
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const R = require(path.resolve(arg('--reps', path.join(__dirname, '..', '..', 'reps.js'))));
const DEFAULT_KG = { knebøy: 20, bulgarsk: 0, pullups: 0, dips: 0, benkpress: 20, skråbenk: 20, halvmark: 40, roing: 30, armhevinger: 0, situps: 0, vsitup: 15, curl: 20 };
function upsample(F, hz, jit = 0) { let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; const o = []; for (let i = 0; i + 1 < F.length; i++) { const a = F[i], b = F[i + 1], dt = b[0] - a[0];
  const n = dt > 0.5 ? 1 : Math.max(1, Math.round(dt * hz)); for (let k = 0; k < n; k++) { const f = k ? Math.min(0.99, Math.max(0.01, (k + jit * (rnd() - 0.5)) / n)) : 0; o.push(a.map((x, j) => !j ? x + (b[j] - x) * f : HOLD ? x : (j % 3 && Math.abs(b[j] - x) > JUMP) || (j % 3 === 0 && Math.abs(b[j] - x) > 0.3) ? (f < 0.5 ? x : b[j]) : x + (b[j] - x) * f)); } } o.push(F[F.length - 1]); return o; }
// v8.9: also replays the app's autosave (app.js finishPending, AUTOSAVE_MS = 9 s after the shown count last changed): a stray
// rep is dropped (only that exercise's counter is reset), 2+ reps are saved as a set and counting starts over. The clip ends with the set the app
// logged; when the replay produces several sets (setup junk before/after) the biggest one is reported (the clip's real set).
const AUTOSAVE_S = 9;
if (arg('--tempo', null)) R.TEMPO_CFG.mode = arg('--tempo'); // v8.20: --tempo on|shadow
const plaus = (ex, t) => (!R.plausibleSet || R.plausibleSet(t)) && !(R.TEMPO_CFG && R.TEMPO_CFG.mode === 'on' && R.tempoSlow(ex, t));
const JIT = +((process.argv.includes('--jitter') && process.argv[process.argv.indexOf('--jitter') + 1]) || 0); // v8.26: ±frame jitter (fraction of a frame period)
const JUMP = +arg('--jump', 0.06); // v8.26: a landmark that jumps more than this (image fraction) between logged frames is a tracking glitch, not motion: step, don't ramp
const HOLD = process.argv.includes('--hold'); // v8.26 diagnostic: repeat each logged pose (new timestamps only) instead of interpolating
function replay(d, hz, opt = {}) { // opt.rest: {cfg, active} → v8.15 rest gate (shadow: verdicts only; active: counters wait for READY)
  const G = opt.rest ? require(path.join(__dirname, '..', '..', 'rest.js')).createRestGate(opt.rest.cfg) : null, verdicts = [];
  const F = hz ? upsample(d.frames, hz, opt.jit ?? JIT) : d.frames, asp = d.w / d.h, rec = R.createRecognizer(), pick = R.createPicker(), gate = R.createCameraGate();
  let cs, auto = null, lock = null, shown = 0, shownT = 0, saved = null; const keep = r => { if (G) { const v = G.verdict((r.times[0] ?? 0) * 1000 - 1); verdicts.push({ t: r.times[0], ex: r.ex, reps: r.reps, v }); G.rest(F[i0][0] * 1000); if (opt.rest.active && v === 'would-suppress') return; } if (!saved || r.reps > saved.reps) saved = r; };
  const reset = () => { cs = {}; for (const id of R.IDS) cs[id] = R.createCounter(id); lock = null; shown = 0; };
  const res = ex => { const reps = cs[ex].flush(); return { ex, reps, kg: DEFAULT_KG[ex] ?? 0, times: cs[ex].repTimes.map(t => +t.toFixed(1)) }; };
  reset(); let i0 = 0; if (G) G.rest(F[0][0] * 1000 - 1e9);
  for (const a of F) { i0 = F.indexOf(a, i0); const lm = []; for (let i = 0; i < 33; i++) lm.push({ x: a[1 + 3 * i], y: a[2 + 3 * i], visibility: a[3 + 3 * i] });
    const ms = a[0] * 1000; let cam = !gate.update(lm, ms, asp).ok; if (G) { const armed = G.update(lm, ms, asp); if (opt.rest.active && !armed) { cam = true; pick.reset(); auto = null; } } for (const id of R.IDS) cs[id].update(lm, ms, asp, cam);
    const rc = rec.update(lm, ms, asp, cam), p = pick.update(rc, ms); if (!lock && p) auto = p;
    if (auto && !lock && cs[auto].reps >= 2) lock = auto; else if (lock && R.relock) lock = R.relock(cs, lock, p, a[0], rc.scores);
    const ex = lock || auto, n = ex ? cs[ex].reps : 0;
    // v8.9 (app.js processFrame): background counters forget reps that went stale (no new rep for 9 s) so a later switch
    // to that exercise does not inherit setup junk from minutes ago
    for (const id of R.IDS) if (id !== ex && cs[id].reps > 0 && a[0] - cs[id].lastRepT > AUTOSAVE_S && cs[id].forget) cs[id].forget();
    if (n !== shown) { shown = n; shownT = a[0]; }
    if (n > 0 && a[0] - shownT > AUTOSAVE_S && lock && R.relock && R.relock(cs, lock, p, a[0], rc.scores, true) !== lock) { lock = R.relock(cs, lock, p, a[0], rc.scores, true); shown = cs[lock].reps; shownT = a[0]; }
    else if (n > 0 && a[0] - shownT > AUTOSAVE_S) {  if (n >= 2 && plaus(ex, cs[ex].repTimes)) { keep(res(ex)); reset(); } else { cs[ex] = R.createCounter(ex); shown = 0; } } }
  // the clip ends where the app saved the set: same last-chance re-lock as at an autosave
  if (lock && R.relock) lock = R.relock(cs, lock, null, F[F.length - 1][0] + AUTOSAVE_S, null, true);
  const ex = lock || auto;
  if (ex && cs[ex].reps >= 2 && plaus(ex, cs[ex].repTimes)) keep(res(ex));
  if (G) { const ret = saved || { ex: null, reps: 0, kg: 0, times: [] }; ret.restVerdicts = verdicts; if (opt.rest.active) return ret; }
  if (saved) return saved;
  if (ex) { const r = res(ex); if (plaus(ex, r.times)) return r; return { ...r, reps: 0, times: [] }; }
  return { ex: null, reps: 0, kg: 0, times: [] };
}
module.exports = { replay, man: () => JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8')), load: id => JSON.parse(fs.readFileSync(path.join(__dirname, id + '.lm.json'), 'utf8')) };
// Scoring: a clip is exact when exercise + reps (+ default kg) match; negatives (exercise null, gt 0) pass when nothing is logged.
// Only clips marked `must` (v8.8, also checked at 30 Hz in test-v88) or `regress` (v8.9 clips the engine gets right) fail
// the run (exit 1); the rest are tracked as a score (exact / exercise / MAE / false sets).
if (require.main === module) {
  const hz = +arg('--hz', 0) || 0; let bad = 0, n = 0, exact = 0, exOk = 0, pos = 0, ae = 0, neg = 0, falseSets = 0;
  console.log('| Clip | GT | Pred | Exercise (GT → pred) | kg | Rep times (s) |\n|---|---|---|---|---|---|');
  // v8.13 benchmark tiers (manifest `tier`): core = small stable set that must pass (regression guard), worst = clips the app
  // fails most (test fixes here first, move solved ones to core), pass = solved but not core. --tier core|worst|pass filters.
  const tier = arg('--tier', null), T = {};
  // v8.14: one recording can hold several sets — `lm` names the landmark file, `win: [t0, t1]` the set's time window
  const loadE = e => { const d = module.exports.load(e.lm || e.id); return e.win ? { ...d, frames: d.frames.filter(a => a[0] >= e.win[0] && a[0] <= e.win[1]) } : d; };
  const ids = arg('--ids', null); for (const e of module.exports.man().filter(x => ids ? ids.split(',').includes(x.id) : tier ? x.tier === tier : x.tier !== 'excluded')) { const r = replay(loadE(e), hz); n++;
    let ok;
    if (!e.exercise) { neg++; ok = r.reps < 2; /* v8.13: the app drops a stray single rep (autosave needs 2) */ if (!ok) falseSets++; }
    else { pos++; const exm = r.ex === e.exercise; if (exm) exOk++; ok = exm && r.reps === e.gt && r.kg === e.kg; ae += exm ? Math.abs(r.reps - e.gt) : e.gt; }
    const tt = T[e.tier || '-'] ||= { n: 0, ok: 0 }; tt.n++; if (ok) tt.ok++;
    if (ok) exact++; else if (e.must || e.regress || e.tier === 'core') bad++;
    console.log(`| ${ok ? '✓' : '✗'}${e.must || e.regress || e.tier === 'core' ? '!' : ''} ${e.id} | ${e.gt} | ${r.reps} | ${e.exercise} → ${r.ex} | ${r.kg} | ${r.times.join(', ')} |`); }
  console.log('\ntiers: ' + Object.entries(T).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(' · '));
  console.log(`exact ${exact}/${n} · exercise ${exOk}/${pos} · rep MAE ${(ae / Math.max(1, pos)).toFixed(2)} (wrong exercise = all reps missed) · false sets ${falseSets}/${neg} · must-fail ${bad}`);
  process.exit(bad ? 1 : 0);
}
