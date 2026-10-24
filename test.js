// Unit tests for the rep engine: legacy angle counter + per-exercise state machines on synthetic landmark signals.
const R = require('./reps.js'); const assert = require('assert');
const { angle, createAngleCounter, createCounter, createRecognizer, IDS } = R;
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
ok(Math.abs(angle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }) - 90) < 1e-9);
ok(Math.abs(angle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 0, y: -1 }) - 180) < 1e-9);
// ---- legacy v1 knee-angle counter
function runA(seq) { const c = createAngleCounter(); let r; for (const a of seq) r = c.update(a); return r.reps; }
const rep = () => [...Array(10).fill(170), ...Array(10).fill(80), ...Array(10).fill(170)];
ok(runA(rep()) === 1); ok(runA([].concat(rep(), rep(), rep())) === 3);
ok(runA([...Array(10).fill(170), 60, ...Array(10).fill(170)]) === 0);

// ---- synthetic skeleton (normalized coords, y down). p = 0 rest .. 1 full depth/contraction
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
function pose(ex, p, noise = 0.004) {
  const P = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 0.95]);
  const set = (i, x, y) => { P[i] = [x + rnd() * noise, y + rnd() * noise, 0, 0.95]; };
  let sh = 0.30, hip = 0.55, kn = 0.72, an = 0.90, wrX = 0.5, wrY = 0.55, elY = 0.42, shX = 0.5, hipX = 0.5, split = 0, nose = 0.22;
  if (ex === 'knebøy' || ex === 'bulgarsk') { const d = 0.17 * p; sh += d; hip += d; nose += d; wrY = sh + 0.05; elY = sh + 0.1; if (ex === 'bulgarsk') split = 0.22; }
  if (ex === 'pullups') { const d = -0.22 * p; sh = 0.40 + d; hip = 0.65 + d; kn = 0.80 + d; an = 0.95 + d; nose = 0.32 + d; wrY = 0.10; elY = (sh + wrY) / 2; }
  if (ex === 'dips') { const d = 0.12 * p; sh = 0.30 + d; hip = 0.55 + d; kn = 0.70 + d; an = 0.80 + d; nose = 0.22 + d; wrY = 0.45; elY = 0.38 + d / 2; }
  // incline bench, side view: torso ~45 deg from vertical
  if (ex === 'skråbenk') { shX = 0.50; hipX = 0.70; sh = 0.45; hip = 0.66; kn = 0.62; an = 0.80; nose = 0.38; wrX = 0.47; wrY = 0.18 + 0.20 * p; elY = 0.35 + 0.08 * p; }
  // flat bench, side view: shoulders level with hips
  if (ex === 'benkpress') { shX = 0.40; hipX = 0.70; sh = 0.55; hip = 0.57; kn = 0.52; an = 0.75; nose = 0.54; wrX = 0.40; wrY = 0.30 + 0.20 * p; elY = 0.45 + 0.08 * p; }
  if (ex === 'halvmark') { const a = (10 + 70 * p) * Math.PI / 180; shX = 0.5 - 0.25 * Math.sin(a); sh = 0.55 - 0.25 * Math.cos(a); nose = sh - 0.06; wrX = shX; wrY = sh + 0.25; elY = sh + 0.12; kn = 0.73; }
  if (ex === 'roing') { const a = 60 * Math.PI / 180; shX = 0.5 - 0.25 * Math.sin(a); sh = 0.55 - 0.25 * Math.cos(a); nose = sh - 0.05; wrX = shX + 0.02; wrY = sh + 0.25 - 0.16 * p; elY = sh + 0.1; kn = 0.73; }
  // push-up, side view: body horizontal, hands planted on the floor, shoulders travel down as p -> 1 (bottom)
  if (ex === 'armhevinger') { shX = 0.35; hipX = 0.62; sh = 0.48 + 0.18 * p; hip = 0.52 + 0.08 * p; nose = sh - 0.02; wrX = 0.30; wrY = 0.78; elY = (sh + wrY) / 2; kn = 0.56 + 0.04 * p; an = 0.60 + 0.04 * p; }
  // sit-up, side view: torso rotates up about the hips (lying at p=0 -> sitting at p=1), knees bent and feet planted
  if (ex === 'situps') { const a = (6 + 78 * p) * Math.PI / 180; hipX = 0.60; hip = 0.60; shX = 0.60 - 0.27 * Math.cos(a); sh = 0.60 - 0.27 * Math.sin(a); nose = sh - 0.02; wrX = shX; wrY = sh - 0.03; elY = sh + 0.02; kn = 0.50; an = 0.64; split = 0.2; }
  set(0, shX, nose);
  for (const s of [0, 1]) {
    const o = s ? 0.04 : -0.04;
    set(11 + s, shX + o, sh); set(13 + s, (shX + wrX) / 2 + o, elY); set(15 + s, wrX + o, wrY);
    set(23 + s, hipX + o, hip); set(25 + s, hipX + o + (s ? split / 2 : -split / 2) * 0.5, kn + (s && split ? 0.05 : 0)); set(27 + s, hipX + o + (s ? split : -split), an);
  }
  return P;
}
// profile: list of [durationSec, pFrom, pTo]
function play(ex, segs, { fps = 15, noise, drop = [] } = {}) {
  const c = createCounter(ex); let t = 0;
  for (const [dur, a, b] of segs) for (let i = 0; i < dur * fps; i++, t += 1 / fps) {
    const p = a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * i / (dur * fps)));
    const dropped = drop.some(([s, e]) => t >= s && t < e);
    c.update(dropped ? null : pose(ex, p, noise), t * 1000, 1);
  }
  return c.flush();
}
const reps = (k, down = 1, up = 1, depth = 1, rest = 0.6) => { const s = [[rest, 0, 0]]; for (let i = 0; i < k; i++) s.push([down, 0, depth], [up, depth, 0], [0.3, 0, 0]); s.push([1.5, 0, 0]); return s; };
for (const ex of IDS) {
  ok(play(ex, reps(5)) === 5, ex + ': 5 clean reps');
  ok(play(ex, reps(3, 2, 2)) === 3, ex + ': slow reps');
  ok(play(ex, reps(6, 0.45, 0.45)) === 6, ex + ': fast reps');
  ok(play(ex, reps(4), { noise: 0.012 }) === 4, ex + ': noisy landmarks');
  ok(play(ex, reps(4, 1, 1, 0.12)) === 0, ex + ': tiny wobble is not a rep');
  { // one corrupted landmark frame (e.g. mis-detection) inside a rest period
    const c = createCounter(ex); let t = 0;
    for (let i = 0; i < 60; i++, t += 1 / 15) c.update(pose(ex, i === 30 ? 1 : 0), t * 1000, 1);
    ok(c.flush() === 0, ex + ': single-frame glitch is not a rep'); }
  // starts in the bottom position (e.g. recording starts mid-rep): first half-rep ignored
  ok(play(ex, [[0.5, 1, 1], [1, 1, 0], [0.5, 0, 0], ...reps(2).slice(1)]) === 2, ex + ': start in bottom');
  // 3 reps, then a long dropout, then 2 more: counts survive tracking loss
  ok(play(ex, [...reps(3), [3, 0, 0], ...reps(2)], { drop: [[9.3, 11.5]] }) === 5, ex + ': dropout keeps count');
  // a set with mostly full reps and one half rep: the half rep is rejected by the adaptive threshold
  ok(play(ex, [[0.6, 0, 0], [1, 0, 1], [1, 1, 0], [1, 0, 1], [1, 1, 0], [1, 0, 0.3], [1, 0.3, 0], [1, 0, 1], [1, 1, 0], [1.5, 0, 0]]) === 3, ex + ': half rep rejected');
}
// recognizer: each synthetic exercise should be recognized as itself (on clean synthetic poses)
for (const ex of IDS) {
  const r = createRecognizer(); let t = 0, out;
  for (const [dur, a, b] of reps(4)) for (let i = 0; i < dur * 15; i++, t += 1 / 15) out = r.update(pose(ex, a + (b - a) * i / (dur * 15)), t * 1000, 1);
  ok(out.best === ex, 'recognizer ' + ex + ' -> ' + out.best);
}

// Negatives (Rune between sets: walks around, sits down / stands up, bends to load plates, stands still).
// Replayed like the app: every counter runs, the recognizer picks the exercise, and a set is auto-saved only with
// 2+ reps (MIN_AUTO_REPS in app.js). None of these may produce a saved set.
function appSim(frameAt, secs, fps = 15) {
  const cs = {}; for (const id of IDS) cs[id] = createCounter(id);
  // same as the app: Reps.createPicker() picks the exercise, the set locks at 2 reps; report the most reps the active
  // exercise ever showed
  const r = createRecognizer(), pk = R.createPicker(); let lock = null, best = 0, bestEx = null;
  for (let i = 0; i < secs * fps; i++) { const t = i / fps, f = frameAt(t);
    for (const id of IDS) cs[id].update(f, t * 1000, 1);
    const auto = pk.update(r.update(f, t * 1000, 1), t * 1000), ex = lock || auto;
    if (ex) { if (cs[ex].reps >= best) { best = cs[ex].reps; bestEx = ex; } if (cs[ex].reps >= 2) lock = ex; } }
  if (bestEx && !best) best = cs[bestEx].flush();
  return { ex: bestEx || pk.current, reps: best };
}
const shift = (P, dx, dy) => P.map(([x, y, z, v]) => [x + dx, y + dy, z, v]);
const standing = () => pose('none', 0);
const NEG = {
  'standing still': t => standing(),
  'walking across the frame': t => { const P = shift(standing(), -0.35 + 0.09 * (t % 8), 0.012 * Math.abs(Math.sin(Math.PI * 1.8 * t)));
    const sw = 0.07 * Math.sin(Math.PI * 1.8 * t); P[27][0] += sw; P[28][0] -= sw; P[25][0] += sw / 2; P[26][0] -= sw / 2; return P; },
  'walking toward/away from the camera': t => { const k = 0.75 + 0.25 * Math.sin(t / 3); return standing().map(([x, y, z, v]) => [0.5 + (x - 0.5) * k, 0.5 + (y - 0.5) * k + 0.01 * Math.sin(Math.PI * 1.8 * t), z, v]); },
  'sitting down, resting, standing up': t => { const p = t < 2 ? 0 : t < 3.5 ? (t - 2) / 1.5 : t < 12 ? 1 : t < 13.5 ? 1 - (t - 12) / 1.5 : 0; return pose('knebøy', p * 1.2); },
  'bending once to load a plate, then standing': t => pose('halvmark', t > 3 && t < 6 ? Math.sin(Math.PI * (t - 3) / 3) : 0),
};
for (const [name, fn] of Object.entries(NEG)) { const r = appSim(fn, 18); ok(r.reps < 2, 'negative: ' + name + ' -> no saved set (rec=' + r.ex + ', reps=' + r.reps + ')'); }

// ---- v8.2 strictness: random one-off movements are never counted
for (const ex of IDS) {
  { // one isolated rep-shaped movement: the live count stays 0 (it is only tentative until a matching 2nd rep)
    const c = createCounter(ex); let t = 0;
    for (const [dur, a, b] of [[1, 0, 0], [1, 0, 1], [1, 1, 0], [6, 0, 0]]) for (let i = 0; i < dur * 15; i++, t += 1 / 15)
      c.update(pose(ex, a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * i / (dur * 15)))), t * 1000, 1);
    ok(c.reps === 0, ex + ': a single movement is not shown as a rep'); }
  // two movements with very different size and tempo, far apart, are not a set
  ok(play(ex, [[1, 0, 0], [0.5, 0, 1], [0.5, 1, 0], [10, 0, 0], [3, 0, 0.35], [3, 0.35, 0], [1.5, 0, 0]]) < 2, ex + ': mismatched pair is not a set');
  // the first rep IS counted once the second one matches (2 reps -> 2)
  ok(play(ex, reps(2)) === 2, ex + ': first rep confirmed by the second');
}
{ // non-strict mode keeps the old behaviour (used for diagnostics)
  const c = createCounter('knebøy', { strict: false }); let t = 0;
  for (const [dur, a, b] of [[1, 0, 0], [1, 0, 1], [1, 1, 0], [2, 0, 0]]) for (let i = 0; i < dur * 15; i++, t += 1 / 15)
    c.update(pose('knebøy', a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * i / (dur * 15)))), t * 1000, 1);
  ok(c.reps === 1, 'strict:false counts a single rep immediately'); }
{ // waving the arms up and down while standing is not dips / push-ups / pull-ups (the shoulders do not travel)
  const wave = t => { const P = standing(), d = 0.15 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * t / 1.5));
    for (const i of [15, 16]) P[i] = [P[i][0], 0.55 - d, 0, 0.95]; for (const i of [13, 14]) P[i] = [P[i][0], 0.42 - d / 2, 0, 0.95]; return P; };
  for (const ex of ['dips', 'armhevinger', 'pullups']) { const c = createCounter(ex); for (let i = 0; i < 15 * 12; i++) c.update(wave(i / 15), i / 15 * 1000, 1);
    ok(c.flush() < 2, 'arm waving is not ' + ex); } }
{ // head-on push-up (phone on the floor in front of the head): torso foreshortened, hands on the floor below shoulders
  // and hips, legs hidden. Must be recognized as push-ups, not dips.
  const headOn = p => { const P = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 0.05]);
    const set = (i, x, y, v = 0.95) => { P[i] = [x + rnd() * 0.004, y + rnd() * 0.004, 0, v]; };
    const sh = 0.45 + 0.2 * p, hip = sh + 0.12; set(0, 0.5, sh - 0.12);
    for (const s of [0, 1]) { const o = s ? 0.13 : -0.13; set(11 + s, 0.5 + o, sh); set(13 + s, 0.5 + o * 1.4, (sh + 0.85) / 2); set(15 + s, 0.5 + o * 1.3, 0.85);
      set(23 + s, 0.5 + o * 0.6, hip, 0.6); set(25 + s, 0.5 + o * 0.6, hip + 0.03, 0.1); set(27 + s, 0.5 + o * 0.6, hip + 0.05, 0.05); }
    return P; };
  const r = createRecognizer(), c = createCounter('armhevinger'); let t = 0, out;
  for (const [dur, a, b] of reps(5)) for (let i = 0; i < dur * 15; i++, t += 1 / 15) { const f = headOn(a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * i / (dur * 15)))); out = r.update(f, t * 1000, 1); c.update(f, t * 1000, 1); }
  ok(out.best === 'armhevinger', 'head-on push-up recognized as push-ups (got ' + out.best + ')');
  ok(!(out.scores.dips > out.scores.armhevinger), 'head-on push-up: dips score below push-ups');
  ok(c.flush() === 5, 'head-on push-up: 5 reps counted'); }
console.log(n + ' rep-engine tests passed');
