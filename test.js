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
  if (ex === 'skråbenk') { shX = 0.45; hipX = 0.70; sh = 0.55; hip = 0.62; kn = 0.60; an = 0.75; nose = 0.50; wrX = 0.45; wrY = 0.30 + 0.20 * p; elY = 0.45 + 0.08 * p; }
  if (ex === 'halvmark') { const a = (10 + 70 * p) * Math.PI / 180; shX = 0.5 - 0.25 * Math.sin(a); sh = 0.55 - 0.25 * Math.cos(a); nose = sh - 0.06; wrX = shX; wrY = sh + 0.25; elY = sh + 0.12; kn = 0.73; }
  if (ex === 'roing') { const a = 60 * Math.PI / 180; shX = 0.5 - 0.25 * Math.sin(a); sh = 0.55 - 0.25 * Math.cos(a); nose = sh - 0.05; wrX = shX + 0.02; wrY = sh + 0.25 - 0.16 * p; elY = sh + 0.1; kn = 0.73; }
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
console.log(n + ' rep-engine tests passed');
