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
if (arg('--sig', null)) R.SIG_CFG.mode = arg('--sig'); // v8.38: off|shadow|on
const SIGLOG = [];
const P = require(path.join(__dirname, '..', '..', 'plate.js')); if (arg('--plate', null)) P.PLATE_MODE.mode = arg('--plate'); // v8.45: off|shadow|on
if (arg('--autoReset', null) && R.AUTO_RESET_CFG) R.AUTO_RESET_CFG.mode = arg('--autoReset'); // v8.46: on|shadow|off
if (arg('--splitSets', null) && R.CUT_SAVE_CFG) R.CUT_SAVE_CFG.mode = arg('--splitSets'); // v8.51: off|shadow|on
if (arg('--tempo', null)) R.TEMPO_CFG.mode = arg('--tempo'); // v8.20: --tempo on|shadow
const plaus = (ex, t) => (!R.plausibleSet || R.plausibleSet(t)) && !(R.TEMPO_CFG && R.TEMPO_CFG.mode === 'on' && R.tempoSlow(ex, t));
const JIT = +((process.argv.includes('--jitter') && process.argv[process.argv.indexOf('--jitter') + 1]) || 0); // v8.26: ±frame jitter (fraction of a frame period)
const JUMP = +arg('--jump', 0.06); // v8.26: a landmark that jumps more than this (image fraction) between logged frames is a tracking glitch, not motion: step, don't ramp
const HOLD = process.argv.includes('--hold'); // v8.26 diagnostic: repeat each logged pose (new timestamps only) instead of interpolating
function replay(d, hz, opt = {}) { // opt.rest: {cfg, active} → v8.15 rest gate (shadow: verdicts only; active: counters wait for READY)
  const G = opt.rest ? require(path.join(__dirname, '..', '..', 'rest.js')).createRestGate(opt.rest.cfg) : null, verdicts = [];
  const F = hz ? upsample(d.frames, hz, opt.jit ?? JIT) : d.frames, asp = d.w / d.h, rec = R.createRecognizer(), pick = R.createPicker(), gate = R.createCameraGate(), sig = R.createSigTracker ? R.createSigTracker() : null;
  let cs, auto = null, lock = null, shown = 0, shownT = 0, saved = null, sigDropped = false; /* v8.47: a set the sig check drops at the clip end is not reported (the app does not save it) */ const keep = r => { if (opt.onKeep) opt.onKeep(r); if (G) { const v = G.verdict((r.times[0] ?? 0) * 1000 - 1); verdicts.push({ t: r.times[0], ex: r.ex, reps: r.reps, v }); G.rest(F[i0][0] * 1000); if (opt.rest.active && v === 'would-suppress') return; } if (!saved || r.reps > saved.reps) saved = r; };
  // v8.45 plate-based bench counter (plate.js): a stored plate track (side angle) feeds wrapped benkpress/skråbenk counters, like app.js
  const feed = opt.plate && P.PLATE_MODE.mode !== 'off' ? P.createFeed(opt.plate) : null;
  const mk = id => { const c = R.createCounter(id); return feed && P.PLATE_MODE.exercises.includes(id) ? P.wrapCounter(c, feed, id) : c; };
  const reset = () => { cs = {}; for (const id of R.IDS) cs[id] = mk(id); lock = null; shown = 0; };
  const resetSaved = ex => { if (!R.SAVE_KEEP_CFG || R.SAVE_KEEP_CFG.mode !== 'on') return reset(); /* v8.47 app saveSet → resetCounters(ex) */ for (const id of R.IDS) { if (id === ex || !cs[id].forget) cs[id] = mk(id); else cs[id].forget(true); } lock = null; shown = 0; };
  const res = ex => { const reps = cs[ex].flush(); return { ex, reps, kg: DEFAULT_KG[ex] ?? 0, times: cs[ex].repTimes.map(t => +t.toFixed(1)) }; };
  const sigKeep = ex => { if (!sig || R.SIG_CFG.mode === 'off') return keep(res(ex)); const v = sig.check(ex, cs[ex].repTimes, cs, R.minSet);
    SIGLOG.push({ cnt: Object.fromEntries(R.IDS.map(i => [i, cs[i].reps]).filter(x => x[1])), ex, reps: cs[ex].reps, why: v.why, to: v.ex, st: v.st && { tilt: +v.st.tilt.toFixed(0), wrAb: +v.st.wrAb.toFixed(2), travel: +v.st.travel.toFixed(2), iqr: +v.st.iqr.toFixed(2), hy: +v.st.hy.toFixed(2) } });
    if (R.SIG_CFG.mode !== 'on' || !v.why) return keep(res(ex)); if (v.drop) { sigDropped = true; return; } /* v8.47: no veto→alt relabel — app.js finishPending only drops (sig veto relabel was eval-only since e80e47a) */ return keep(res(ex)); };
  reset(); let i0 = 0; if (G) G.rest(F[0][0] * 1000 - 1e9);
  for (const a of F) { i0 = F.indexOf(a, i0); const lm = []; for (let i = 0; i < 33; i++) lm.push({ x: a[1 + 3 * i], y: a[2 + 3 * i], visibility: a[3 + 3 * i] });
    const ms = a[0] * 1000; if (feed) feed.now = a[0]; let cam = !gate.update(lm, ms, asp).ok; if (sig) sig.update(lm, ms, asp); if (G) { const armed = G.update(lm, ms, asp); if (opt.rest.active && !armed) { cam = true; pick.reset(); auto = null; } } for (const id of R.IDS) cs[id].update(lm, ms, asp, cam);
    const rc = rec.update(lm, ms, asp, cam), p = pick.update(rc, ms); if (!lock && p) auto = p;
    if (auto && !lock && cs[auto].reps >= 2) lock = auto; else if (lock && R.relock) lock = R.relock(cs, lock, p, a[0], rc.scores);
    if (lock && cs[lock]) cs[lock].heldLock = true;
    const ex = lock || auto, n = ex ? cs[ex].reps : 0;
    // v8.51 (app.js processFrame): save a completed background set before forget() drops it. Shadow: log only, old path decides.
    const splitMode = R.CUT_SAVE_CFG ? R.CUT_SAVE_CFG.mode : 'off';
    if (splitMode !== 'off' && R.readySets) {
      for (const id of R.readySets(cs, a[0], ex)) {
        if (splitMode === 'on') { sigKeep(id); cs[id] = mk(id); }
        else SIGLOG.push({ splitShadow: true, ex: id, reps: cs[id].reps, t: +a[0].toFixed(2) });
      }
    }
    // v8.9 (app.js processFrame): background counters forget reps that went stale (no new rep for 9 s) so a later switch
    // to that exercise does not inherit setup junk from minutes ago
    for (const id of R.IDS) if (id !== ex && cs[id].reps > 0 && a[0] - cs[id].lastRepT > AUTOSAVE_S && cs[id].forget) cs[id].forget();
    if (n !== shown) { shown = n; shownT = a[0]; }
    if (n > 0 && a[0] - shownT > AUTOSAVE_S && lock && R.relock && R.relock(cs, lock, p, a[0], rc.scores, true) !== lock) { lock = R.relock(cs, lock, p, a[0], rc.scores, true); shown = cs[lock].reps; shownT = a[0]; }
    else if (n > 0 && (a[0] - shownT > AUTOSAVE_S || cs[ex].plateEnded)) {  if (n >= (R.minSet ? R.minSet(ex) : 2) && plaus(ex, cs[ex].repTimes)) { sigKeep(ex); resetSaved(ex); if (R.AUTO_RESET_CFG && R.AUTO_RESET_CFG.mode === 'on') { pick.reset(); auto = null; } /* v8.46 app saveSet */ } else { cs[ex] = mk(ex); shown = 0; } } }
  // the clip ends where the app saved the set: same last-chance re-lock as at an autosave
  if (lock && R.relock) lock = R.relock(cs, lock, null, F[F.length - 1][0] + AUTOSAVE_S, null, true);
  const ex = lock || auto;
  sigDropped = false; if (ex && cs[ex].reps >= (R.minSet ? R.minSet(ex) : 2) && plaus(ex, cs[ex].repTimes)) sigKeep(ex);
  if (G) { const ret = saved || { ex: null, reps: 0, kg: 0, times: [] }; ret.restVerdicts = verdicts; if (opt.rest.active) return ret; }
  if (saved) return saved;
  if (ex && !sigDropped) { const r = res(ex); if (plaus(ex, r.times)) return r; return { ...r, reps: 0, times: [] }; }
  return { ex: null, reps: 0, kg: 0, times: [] };
}
// v8.27: old clips {w,h,frames} (≈10 Hz throttled) and new full-rate clips {w,h,landmarks:{enc:'i16b64',…}} or packed `frames` load alike; timestamps as recorded
function normLm(d) { const FB = require(path.join(__dirname, '..', '..', 'feedback.js')); const L = d.landmarks || (d.frames && !Array.isArray(d.frames) ? d.frames : null); return L ? { ...d, frames: FB.unpackLm(L), full: !!L.full } : d; }
module.exports = { SIGLOG, normLm, replay, man: () => JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8')), load: id => normLm(JSON.parse(fs.readFileSync(path.join(__dirname, id + '.lm.json'), 'utf8'))) };
// Scoring: a clip is exact when exercise + reps (+ default kg) match; negatives (exercise null, gt 0) pass when nothing is logged.
// Only clips marked `must` (v8.8, also checked at 30 Hz in test-v88) or `regress` (v8.9 clips the engine gets right) fail
// the run (exit 1); the rest are tracked as a score (exact / exercise / MAE / false sets).
if (require.main === module) {
  const hz = +arg('--hz', 0) || 0; let bad = 0, n = 0, exact = 0, exOk = 0, pos = 0, ae = 0, neg = 0, falseSets = 0;
  console.log('| Clip | GT | Pred | Exercise (GT → pred) | kg | Rep times (s) |\n|---|---|---|---|---|---|');
  // v8.13 benchmark tiers (manifest `tier`): core = small stable set that must pass (regression guard), worst = clips the app
  // fails most (test fixes here first, move solved ones to core), pass = solved but not core. --tier core|worst|pass filters.
  const tier = arg('--tier', null), T = {}, A = {}, PER = {}; const ALL = process.argv.includes('--all'); // v8.32 archive tier with --all; v8.43 PER = per-clip results for --json / --diff const ALL = process.argv.includes('--all'); // v8.32: archive tier = retired duplicates, run with --all (full regression pass before each push)
  // v8.14: one recording can hold several sets — `lm` names the landmark file, `win: [t0, t1]` the set's time window
  const loadE0 = e => { const d = module.exports.load(e.lm || e.id); return e.win ? { ...d, frames: d.frames.filter(a => a[0] >= e.win[0] && a[0] <= e.win[1]) } : d; };
  // v8.48 battery: --idleSim simulates app.js POWER_CFG.idle (nobody in view ≥ noPersonMs → pose at hz). Worst case: the first
  // 1/hz s of frames after every person-less gap ≥ noPersonMs are lost. Not applied to side sessions (app: plateOn() exempts them).
  const IDLE_SIM = process.argv.includes('--idleSim') ? { noPersonS: 3, hz: 5 } : null;
  const idleSim = (d, e) => { if (!IDLE_SIM || e.angle === 'side') return d; const out = []; let prev = null, cut = -1;
    for (const a of d.frames) { if (prev != null && a[0] - prev >= IDLE_SIM.noPersonS) cut = a[0] + 1 / IDLE_SIM.hz; prev = a[0]; if (a[0] >= cut) out.push(a); }
    return { ...d, frames: out }; };
  const loadE = e => idleSim(loadE0(e), e);
  // v8.45: side-angle clips with a stored plate track (tools/plate-track.js) replay the plate feed too (window-filtered like the frames)
  const plateOf = e => { if (!P.PLATE_MODE.angles.includes(e.angle)) return null; const f = path.join(__dirname, (e.lm || e.id) + '.plate.json'); if (!fs.existsSync(f)) return null;
    const t = JSON.parse(fs.readFileSync(f, 'utf8')).track; return e.win ? t.filter(r => r[0] >= e.win[0] && r[0] <= e.win[1]) : t; };
  const ids = arg('--ids', null); for (const e of module.exports.man().filter(x => ids ? ids.split(',').includes(x.id) : tier ? x.tier === tier : x.tier !== 'excluded' && (ALL || x.tier !== 'archive'))) { const r = replay(loadE(e), hz, { plate: plateOf(e) }); n++;
    let ok;
    if (!e.exercise) { neg++; ok = r.reps < 2; /* v8.13: the app drops a stray single rep (autosave needs 2) */ if (!ok) falseSets++; }
    else { pos++; const exm = r.ex === e.exercise; if (exm) exOk++; ok = exm && r.reps === e.gt && r.kg === e.kg; ae += exm ? Math.abs(r.reps - e.gt) : e.gt; }
    const tt = T[e.tier || '-'] ||= { n: 0, ok: 0 }; tt.n++; if (ok) tt.ok++; const ta = A[e.angle || 'unknown'] ||= { n: 0, ok: 0 }; ta.n++; if (ok) ta.ok++; // v8.32: per verified camera angle
    PER[e.id] = { ok, gt: e.gt, exercise: e.exercise || null, ex: r.ex, reps: r.reps, bad: badness(e, r) };
    if (ok) exact++; else if (e.must || e.regress || e.tier === 'core') bad++;
    console.log(`| ${ok ? '✓' : '✗'}${e.must || e.regress || e.tier === 'core' ? '!' : ''} ${e.id} | ${e.gt} | ${r.reps} | ${e.exercise} → ${r.ex} | ${r.kg} | ${r.times.join(', ')} |`); }
  console.log('\nangles: ' + Object.entries(A).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(' · '));
  console.log('\ntiers: ' + Object.entries(T).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(' · '));
  console.log(`exact ${exact}/${n} · exercise ${exOk}/${pos} · rep MAE ${(ae / Math.max(1, pos)).toFixed(2)} (wrong exercise = all reps missed) · false sets ${falseSets}/${neg} · must-fail ${bad}`);
  // v8.43 strict rule: --json FILE saves per-clip results (baseline); --diff FILE compares against a saved baseline on the SAME
  // manifest. Any clip whose badness rises (exact→not, exercise lost, rep error up, new false set) is a regression → exit 1.
  const jo = arg('--json', null); if (jo) fs.writeFileSync(jo, JSON.stringify({ reps: arg('--reps', 'reps.js'), hz, all: ALL, summary: { exact, n, exOk, pos, mae: +(ae / Math.max(1, pos)).toFixed(3), falseSets, neg }, clips: PER }, null, 1));
  const dfile = arg('--diff', null); let regs = 0;
  if (dfile) { const B = JSON.parse(fs.readFileSync(dfile, 'utf8')).clips, fmt = c => c ? `${c.ex || 'none'}×${c.reps}${c.ok ? ' ✓' : ''}` : 'n/a';
    const better = [], worse = [], missing = Object.keys(B).filter(k => !PER[k]);
    for (const [id, c] of Object.entries(PER)) { const b = B[id]; if (!b) { console.log(`diff: NEW ${id} ${fmt(c)} (no baseline)`); continue; }
      if (c.bad > b.bad || (b.ok && !c.ok)) worse.push(`${id}: ${fmt(b)} → ${fmt(c)} (GT ${c.exercise || 'none'}×${c.gt})`); else if (c.bad < b.bad) better.push(`${id}: ${fmt(b)} → ${fmt(c)}`); }
    regs = worse.length; console.log(`\ndiff vs ${dfile}: ${better.length} better · ${worse.length} WORSE · ${missing.length} baseline clips not run`);
    for (const x of better) console.log('  + ' + x); for (const x of worse) console.log('  - WORSE ' + x); if (missing.length) console.log('  ? not run: ' + missing.join(', ')); }
  process.exit(bad || regs ? 1 : 0);
}
// v8.43: per-clip badness for the baseline diff. Wrong exercise = gt + 100 (always worse than any count error); negative = reps logged when ≥2.
function badness(e, r) { if (!e.exercise) return r.reps >= 2 ? 100 + r.reps : 0; return r.ex === e.exercise ? Math.abs(r.reps - e.gt) + (r.kg === e.kg ? 0 : 0.5) : 100 + e.gt; }
