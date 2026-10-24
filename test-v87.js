// v8.7 unit tests: camera-motion robustness (Reps.createCameraGate + counter/recognizer camMoving flag).
// Handheld filming (tremor, slow pan, gentle roll/zoom) must keep counting; big/abrupt phone motion must not make reps or sets.
const R = require('./reps.js'), assert = require('assert');
const { createCounter, createRecognizer, createPicker, createCameraGate, IDS } = R;
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const POSE_SRC = require('fs').readFileSync(__dirname + '/test.js', 'utf8');
eval(POSE_SRC.slice(POSE_SRC.indexOf('// ---- synthetic skeleton'), POSE_SRC.indexOf('// profile: list of')).replace(/^let seed/m, 'var seed').replace(/^function pose/m, 'var pose = function pose').replace(/^const rnd/m, 'var rnd'));
// camera transform about the frame centre: shift (frame units), roll (deg), zoom
const cam = (P, { dx = 0, dy = 0, rot = 0, sc = 1 } = {}) => { const r = rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return P.map(([x, y, z, v]) => { const X = x - 0.5, Y = y - 0.5; return [0.5 + (c * X - s * Y) * sc + dx, 0.5 + (s * X + c * Y) * sc + dy, z, v]; }); };
const handheld = t => ({ dx: 0.004 * Math.sin(2 * Math.PI * 4.3 * t) + 0.06 * Math.sin(2 * Math.PI * t / 16), dy: 0.004 * Math.sin(2 * Math.PI * 5.1 * t + 1) + 0.02 * Math.sin(2 * Math.PI * t / 11),
  rot: 2 * Math.sin(2 * Math.PI * t / 10), sc: 1 + 0.04 * Math.sin(2 * Math.PI * t / 20) });
const ease = (a, b, i, N) => a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * i / N));
const repsProfile = (k, down = 1, up = 1) => { const s = [[0.6, 0, 0]]; for (let i = 0; i < k; i++) s.push([down, 0, 1], [up, 1, 0], [0.3, 0, 0]); s.push([1.5, 0, 0]); return s; };
// play a profile through gate + counter like the app; camAt(t) -> camera transform, sensorAt(t) -> {gyro, acc} | null
function play(ex, segs, { camAt = () => ({}), sensorAt = () => null, fps = 15, gate = true } = {}) {
  const c = createCounter(ex), g = createCameraGate(); let t = 0, paused = 0;
  for (const [dur, a, b] of segs) for (let i = 0; i < dur * fps; i++, t += 1 / fps) {
    const f = cam(pose(ex, ease(a, b, i, dur * fps)), camAt(t)), moving = gate && !g.update(f, t * 1000, 1, sensorAt(t)).ok;
    if (moving) paused++; c.update(f, t * 1000, 1, moving);
  }
  return { reps: c.flush(), paused };
}
// 1) clean + handheld exercise sets: the vision gate never fires, every rep counts (body-relative signals cancel the camera)
for (const ex of IDS) {
  const a = play(ex, repsProfile(5)); ok(a.reps === 5 && a.paused === 0, ex + ': clean set, gate quiet (' + JSON.stringify(a) + ')');
  const b = play(ex, repsProfile(5, 1.2, 1.2), { camAt: handheld, sensorAt: t => ({ gyro: 8 + 6 * Math.abs(Math.sin(9 * t)), acc: 0.2 }) });
  ok(b.reps === 5 && b.paused === 0, ex + ': handheld filming (tremor + slow pan + roll + zoom, gyro ~10°/s) counts 5/5 (' + JSON.stringify(b) + ')');
}
// 2) the sensor: a pick-up/bump (gyro 150°/s) pauses; tremor (15°/s) and a slow pan (35°/s) do not; no sensor = vision only
{ const g = createCameraGate(); let r; for (let i = 0; i < 30; i++) r = g.update(pose('knebøy', 0), i * 66, 1, { gyro: 15, acc: 0.3 }); ok(r.ok, 'tremor does not pause');
  for (let i = 30; i < 60; i++) r = g.update(pose('knebøy', 0), i * 66, 1, { gyro: 35, acc: 0.5 }); ok(r.ok, 'slow handheld pan (35°/s) does not pause');
  r = g.update(pose('knebøy', 0), 60 * 66, 1, { gyro: 150, acc: 6 }); r = g.update(pose('knebøy', 0), 61 * 66, 1, { gyro: 140, acc: 5 }); ok(!r.ok && r.why === 'sensor', 'pick-up (150°/s) pauses');
  r = g.update(pose('knebøy', 0), 62 * 66 + 400, 1, { gyro: 5, acc: 0.1 }); ok(!r.ok && r.settling, 'still paused while settling');
  r = g.update(pose('knebøy', 0), 62 * 66 + 900, 1, { gyro: 5, acc: 0.1 }); ok(r.ok, 'resumes after the settle period');
  const g2 = createCameraGate(); r = g2.update(pose('knebøy', 0), 0, 1, { gyro: 200, acc: 0 }); r = g2.update(pose('knebøy', 0), 66, 1, null); ok(r.ok, 'one sensor spike is not enough; null sensor is fine'); }
// 3) vision fallback (no sensor): the whole pose jumps/zooms/rolls together -> pause; resumes afterwards
for (const [name, tf] of [['shift', k => ({ dx: 0.35 * k, dy: 0.15 * k })], ['zoom', k => ({ sc: 1 + 1.5 * k })], ['roll', k => ({ rot: 45 * k })]]) {
  const g = createCameraGate(); let paused = 0, after;
  for (let i = 0; i < 90; i++) { const t = i / 15, k = t < 2 ? 0 : t < 3 ? (t - 2) / 1 : 1; const r = g.update(cam(pose('knebøy', 0), tf(k)), t * 1000, 1, null); if (!r.ok) paused++; after = r; }
  ok(paused >= 3 && after.ok, 'vision: rigid ' + name + ' of every keypoint pauses, then resumes (' + paused + ' frames)'); }
// 4) counter: a rep in progress when the phone moves is dropped, confirmed reps are kept, counting resumes cleanly
{ const c = createCounter('knebøy'); let t = 0; const step = (p, m) => { c.update(pose('knebøy', p), t * 1000, 1, m); t += 1 / 15; };
  for (const [d, a, b] of repsProfile(3)) for (let i = 0; i < d * 15; i++) step(ease(a, b, i, d * 15), false);
  ok(c.reps === 3, '3 reps before the phone moves');
  for (let i = 0; i < 15; i++) step(ease(0, 1, i, 15), false); for (let i = 0; i < 15; i++) step(ease(1, 0, i, 15), true); // rep finished while moving
  ok(c.reps === 3, 'rep completed while the phone moves is not counted');
  for (let i = 0; i < 15; i++) step(0, false);
  for (const [d, a, b] of repsProfile(2).slice(1)) for (let i = 0; i < d * 15; i++) step(ease(a, b, i, d * 15), false);
  ok(c.flush() === 5, 'counting resumes after the phone settles (3 + 2 = ' + c.reps + ')'); }
// 5) a moving-phone segment never starts a set: an unpaired first rep made while moving cannot pair with a later one
{ const c = createCounter('knebøy'); let t = 0; const step = (p, m) => { c.update(pose('knebøy', p), t * 1000, 1, m); t += 1 / 15; };
  for (let i = 0; i < 15; i++) step(0, false); for (let i = 0; i < 15; i++) step(ease(0, 1, i, 15), true); for (let i = 0; i < 15; i++) step(ease(1, 0, i, 15), true); for (let i = 0; i < 20; i++) step(0, false);
  for (let i = 0; i < 15; i++) step(ease(0, 1, i, 15), false); for (let i = 0; i < 15; i++) step(ease(1, 0, i, 15), false); for (let i = 0; i < 30; i++) step(0, false);
  ok(c.reps === 0, 'pseudo-rep during phone motion + one real movement is not a set (shown ' + c.reps + ')'); }
// 6) app replay of a person standing still while the phone sways in the hand / is carried (±25° roll + shift, 0.7 Hz, 6 s):
//    with the gate no exercise is picked and no set appears; recognizer and picker see no frames while moving
function appSim(secs, frameAt, sensorAt, useGate) {
  const cs = {}; for (const id of IDS) cs[id] = createCounter(id); const rec = createRecognizer(), pk = createPicker(), g = createCameraGate();
  let lock = null, best = 0, manual = 0;
  for (let i = 0; i < secs * 15; i++) { const t = i / 15, f = frameAt(t), m = useGate && !g.update(f, t * 1000, 1, sensorAt(t)).ok;
    for (const id of IDS) cs[id].update(f, t * 1000, 1, m); const ex = lock || pk.update(rec.update(f, t * 1000, 1, m), t * 1000);
    if (ex && cs[ex].reps > best) best = cs[ex].reps; if (ex && cs[ex].reps >= 2) lock = ex; }
  for (const id of IDS) if (cs[id].flush() >= 2) manual++;
  return { best, manual };
}
const swayCam = t => t > 3 && t < 9 ? { rot: 25 * Math.sin(2 * Math.PI * 0.7 * t), dx: 0.1 * Math.sin(2 * Math.PI * 0.7 * t + 1), dy: 0.05 * Math.sin(2 * Math.PI * 1.4 * t) } : {};
const swayGyro = t => ({ gyro: t > 3 && t < 9 ? 110 + 40 * Math.abs(Math.sin(4.4 * t)) : 6, acc: t > 3 && t < 9 ? 3 : 0.2 });
for (const ex of ['none', 'knebøy', 'benkpress', 'pullups']) {
  const r = appSim(16, t => cam(pose(ex, 0), swayCam(t)), swayGyro, true);
  ok(r.best < 2 && r.manual === 0, 'phone swaying while ' + ex + ' rest pose is held: no set, no manual-pick counter at 2 (' + JSON.stringify(r) + ')'); }
// 7) pausing only on big motion: a full handheld session with one pick-up in the middle keeps the reps before and after
{ const segs = [...repsProfile(4), [3, 0, 0], ...repsProfile(4).slice(1)]; let T = 0; for (const s of segs.slice(0, repsProfile(4).length)) T += s[0];
  const r = play('knebøy', segs, { camAt: t => { const h = handheld(t); if (t > T + 0.5 && t < T + 1.5) { const k = Math.sin(Math.PI * (t - T - 0.5)); h.dx += 0.2 * k; h.rot += 20 * k; } return h; },
    sensorAt: t => ({ gyro: t > T + 0.5 && t < T + 1.5 ? 160 : 10, acc: 0.3 }) });
  ok(r.reps === 8 && r.paused > 10, 'pick-up between two handheld sets: 4 + 4 reps kept (' + JSON.stringify(r) + ')'); }
// 8) a slow handheld pan following the athlete over long slow reps is not "travelling through the frame"
ok(play('knebøy', repsProfile(4, 2.5, 2.5), { camAt: t => ({ dx: 0.05 * t / 4 }) }).reps === 4, 'slow pan (0.0125 frame/s) over slow reps still counts');
console.log(n + ' v8.7 camera-motion tests passed');
