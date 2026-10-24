#!/usr/bin/env node
// v8.7 camera-motion eval: replays the eval clips (exercise + negatives) with SYNTHETIC camera motion applied to the
// MediaPipe landmarks, the way the app would see them, and compares the v8.6 engine (no gate) with v8.7 (camera gate).
//  * handheld: someone films handheld — tremor (2–8 Hz, ~0.5–1 % of the frame), slow pan/follow (±6–10 %, 12–25 s period),
//    gentle roll (±3°) and zoom/drift (±6 %). Must still count correctly.
//  * large: handheld + every 12–25 s a big abrupt event (0.3–1.2 s): picking the phone up / bumping / re-propping —
//    translation 8–25 % of the frame, transient rotation 10–30° (lands within ±10° of upright), scale 0.75–1.3, violent shake, pose dropouts (motion blur); the phone
//    either lands in a new framing or returns; or 2–5 s of the phone swaying in the hand / being carried / fiddled with
//    (rotation ±15–35° and translation at 0.4–1 Hz, i.e. rhythmic like reps). Also run on "static" clips (person standing/sitting/resting).
// Sensor (DeviceMotion) readings are synthesized from the same camera path (image shift ≈ 60° FOV), so "vision only" =
// sensor denied/unavailable, "vision+sensor" = permission granted.
// Usage: node eval/camera.js [--lm DIR] [--seeds N] [--json out.json]
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LM = arg('--lm', process.env.REPCAM_LM || '/workspace/repcam-eval/lm');
const R = require(path.join(__dirname, '..', 'reps.js')), R86 = require(path.join(__dirname, 'reps_v86.js')); // v8.6 engine, frozen copy
const E = m => m === 'v86' ? R86 : R;
const man = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const SEEDS = +arg('--seeds', 2), MIN_AUTO_REPS = 2;
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const hash = str => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// camera path: per frame {dx, dy (frame units), rot (deg), sc, drop (bool), gyro (deg/s), acc (m/s²)}
function camPath(n, fps, cond, rnd, mg = { x: 1, y: 1 }) {
  const U = (a, b) => a + (b - a) * rnd(), sgn = () => rnd() < 0.5 ? -1 : 1, P = [];
  const sh = [0, 1, 2].map(() => ({ f: U(2, 8), a: U(0.002, 0.004), p: U(0, 6.28), q: U(0, 6.28) }));
  // the person filming keeps the athlete framed: the pan never pushes the body out of the shot
  const pan = { ax: Math.min(U(0.06, 0.10), mg.x), ay: Math.min(U(0.02, 0.04), mg.y), T: U(12, 25), p: U(0, 6.28) }, roll = { a: U(1, 3), T: U(8, 16) }, zm = { a: U(0.03, 0.06), T: U(15, 30) };
  const ev = []; if (cond === 'large') { let t = U(4, 12); while (t < n / fps) { const d = U(0.3, 1.2), stay = rnd() < 0.6;
    if (rnd() < 0.4) { const sd = U(2, 5); ev.push({ sway: true, t0: t, d: sd, A: U(15, 35), f: U(0.4, 1.0), ax: U(0.05, 0.15), ay: U(0.03, 0.1) }); t += sd + U(12, 25); continue; }
    ev.push({ t0: t, d, stay, tx: sgn() * U(0.08, 0.25), ty: sgn() * U(0.04, 0.15), tr: sgn() * U(0, 10), tp: sgn() * U(10, 30), ts: rnd() < 0.5 ? U(0.75, 0.9) : U(1.1, 1.3), sa: U(0.02, 0.05) }); t += d + U(12, 25); } }
  let base = { dx: 0, dy: 0, rot: 0, sc: 1 };
  for (let i = 0; i < n; i++) {
    const t = i / fps; let x = { dx: 0, dy: 0, rot: 0, sc: 1, drop: false };
    for (const s of sh) { x.dx += s.a * Math.sin(6.283 * s.f * t + s.p); x.dy += s.a * Math.sin(6.283 * s.f * 1.13 * t + s.q); }
    const NO = process.env.CAM_NO || '';
    if (NO.includes('shake')) x.dx = x.dy = 0;
    if (NO.includes('pan')) pan.ax = pan.ay = 0; if (NO.includes('roll')) roll.a = 0; if (NO.includes('zoom')) zm.a = 0;
    x.dx += pan.ax * Math.sin(6.283 * t / pan.T + pan.p); x.dy += pan.ay * Math.sin(6.283 * t / pan.T * 0.7); x.rot += roll.a * Math.sin(6.283 * t / roll.T); x.sc *= 1 + zm.a * Math.sin(6.283 * t / zm.T);
    let off = { ...base };
    for (const e of ev) { if (t < e.t0) continue;
      if (e.sway) { if (t < e.t0 + e.d) { const ph = 6.283 * e.f * (t - e.t0), env = Math.min(1, (t - e.t0) / 0.5, (e.t0 + e.d - t) / 0.5);
        x.rot += env * e.A * Math.sin(ph); x.dx += env * e.ax * Math.sin(ph + 1); x.dy += env * e.ay * Math.sin(2 * ph); x.drop = rnd() < 0.15; x.ev = true; x.blur = 0.5 * e.ax * env; } continue; } const k = Math.min(1, (t - e.t0) / e.d), w = 0.5 - 0.5 * Math.cos(Math.PI * k), bump = e.stay ? w : Math.sin(Math.PI * k);
      const tgt = { dx: e.tx, dy: e.ty, rot: e.tr, sc: e.ts };
      if (t >= e.t0 + e.d) { if (e.stay) base = off = tgt; continue; }
      off = { dx: base.dx + (tgt.dx - base.dx) * bump, dy: base.dy + (tgt.dy - base.dy) * bump, rot: base.rot + (tgt.rot - base.rot) * bump, sc: base.sc + (tgt.sc - base.sc) * bump };
      off.dx += e.sa * Math.sin(6.283 * 9 * t); off.dy += e.sa * Math.cos(6.283 * 7 * t); off.rot += e.tp * Math.sin(Math.PI * k) + 5 * e.sa / 0.03 * Math.sin(6.283 * 6 * t); // big transient tilt, the phone lands roughly upright
      x.drop = rnd() < 0.35; x.ev = true; x.blur = e.sa; }
    x.dx += off.dx; x.dy += off.dy; x.rot += off.rot; x.sc *= off.sc; P.push(x);
  }
  for (let i = 0; i < n; i++) { const a = P[Math.max(0, i - 1)], b = P[i], dt = 1 / fps;
    const g = Math.hypot((b.dx - a.dx) * 60, (b.dy - a.dy) * 60, b.rot - a.rot) / dt; // deg/s
    // image motion of a handheld phone is mostly rotation (gyro); linear acceleration (gravity removed) is small while
    // holding (~0.1–0.4 m/s² noise) and large only during the events, modelled as 1 frame width ≈ 1 m of phone travel
    const ev = P[i].ev ? 1 : 0, c0 = P[Math.max(0, i - 2)];
    b.gyro = g; b.acc = 0.25 * rnd() + ev * Math.hypot(b.dx - 2 * a.dx + c0.dx, b.dy - 2 * a.dy + c0.dy) / dt / dt; }
  return P;
}
// motion blur: MediaPipe does not see a rigid copy of the pose while the phone moves fast — keypoints jitter and wander
// independently (smoothed noise, σ ≈ the event's shake amplitude), on top of the frames it loses entirely
const blurN = [];
function apply(fr, c, asp, rnd) {
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 2;
  for (let k = 0; k < 33; k++) { const b = blurN[k] ||= [0, 0], sg = c.blur || 0; b[0] = 0.6 * b[0] + (sg ? 0.8 * sg * gauss() : 0); b[1] = 0.6 * b[1] + (sg ? 0.8 * sg * gauss() : 0); }
  if (!fr || c.drop) return null;
  const r = c.rot * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
  return fr.map((p, k) => { let x = (p[0] - 0.5) * asp, y = p[1] - 0.5; const X = (co * x - si * y) * c.sc, Y = (si * x + co * y) * c.sc;
    const nx = X / asp + 0.5 + c.dx + (blurN[k] ? blurN[k][0] : 0), ny = Y + 0.5 + c.dy + (blurN[k] ? blurN[k][1] : 0), o = (a, b) => a < -0.02 || a > 1.02 || b < -0.02 || b > 1.02, out = o(nx, ny) && !o(p[0], p[1]); // pushed out of the frame by the camera
    return [nx, ny, p[2], out ? Math.min(p[3] ?? 1, 0.1) : p[3]]; });
}
// how far the body (median over the clip) is from the frame edges, so a handheld pan can stay inside it
function margin(d) { const xs = [], ys = []; for (const f of d.frames) { if (!f) continue; let a = 1, b = 0, c = 1, e = 0;
  for (const p of f.slice(0, 33)) if ((p[3] ?? 1) > 0.5 && p[0] > 0 && p[0] < 1 && p[1] > 0 && p[1] < 1) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); e = Math.max(e, p[1]); }
  if (b > a) { xs.push(Math.min(a, 1 - b)); ys.push(Math.min(c, 1 - e)); } }
  const q = v => v.sort((x, y) => x - y)[Math.floor(v.length * 0.1)] ?? 0;
  return { x: Math.max(0.02, q(xs) - 0.01), y: Math.max(0.01, q(ys) - 0.01) }; }
const load = e => { const f = path.join(LM, (e.lm || e.id) + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
function frames(d, cond, seed) { const asp = d.w / d.h; if (cond === 'clean') return d.frames.map(f => ({ lm: f, s: { gyro: 1, acc: 0.1 } }));
  blurN.length = 0; const rnd = rng(seed), P = camPath(d.frames.length, d.fps, cond, rnd, margin(d)); return d.frames.map((f, i) => ({ lm: apply(f, P[i], asp, rnd), s: { gyro: P[i].gyro, acc: P[i].acc } })); }
// mode: 'v86' (no gate, camera flags ignored), 'vision', 'sensor' (vision + DeviceMotion)
function runEx(e, d, F, mode) {
  const R = E(mode), asp = d.w / d.h, c = R.createCounter(e.exercise, process.env.CAM_DBG === e.id ? { onReject: (w, p) => console.error('reject', w, p.t.toFixed(1), JSON.stringify(p.q && { x0: p.q.x0, x1: p.q.x1, xMin: p.q.xMin, xMax: p.q.xMax, bad: p.q.bad, n: p.q.n, pose: p.q.pose })) } : {}), rec = R.createRecognizer(), gate = R.createCameraGate?.(), votes = {};
  F.forEach(({ lm, s }, i) => { const t = i / d.fps; if (e.start && t < e.start) return; if (e.end && t > e.end) return; const ms = t * 1000;
    const cam = mode === 'v86' || mode === 'nogate' ? false : !gate.update(lm, ms, asp, mode === 'sensor' ? s : null).ok;
    if (process.env.CAM_DBG === e.id && cam !== global.lastCam) { global.lastCam = cam; console.error(t.toFixed(1), cam ? 'PAUSE' : 'resume', F[i].s.gyro.toFixed(0)); }
    if (process.env.CAM_DBG === e.id && c.reps !== global.lastR) { global.lastR = c.reps; console.error(t.toFixed(1), 'rep', c.reps); }
    if (process.env.CAM_GSTAT) { (global.GS ||= { n: 0, g: 0 }).n++; if (cam) GS.g++; }
    c.update(lm, ms, asp, cam); const r = rec.update(lm, ms, asp, cam); if (r.best && t - (e.start || 0) >= 3) votes[r.best] = (votes[r.best] || 0) + 1; });
  c.flush(); const rb = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]; return { pred: c.reps, rec: rb ? rb[0] : null };
}
function runNeg(e, d, F, mode) {
  const R = E(mode), asp = d.w / d.h, cs = {}, rec = R.createRecognizer(), pick = R.createPicker(), gate = R.createCameraGate?.();
  for (const id of R.IDS) cs[id] = R.createCounter(id);
  let lock = null, best = 0, auto = null;
  F.forEach(({ lm, s }, i) => { const ms = i / d.fps * 1000; const cam = mode === 'v86' || mode === 'nogate' ? false : !gate.update(lm, ms, asp, mode === 'sensor' ? s : null).ok;
    for (const id of R.IDS) cs[id].update(lm, ms, asp, cam); auto = pick.update(rec.update(lm, ms, asp, cam), ms);
    if (process.env.CAM_DBG === e.id) { const ex = lock || auto, k = cam + '|' + ex + '|' + (ex ? cs[ex].reps : 0); if (k !== global.lk) { global.lk = k; console.error((i / d.fps).toFixed(1), k, s.gyro.toFixed(0)); } }
    const ex = lock || auto; if (ex && cs[ex].reps > best) best = cs[ex].reps; if (ex && cs[ex].reps >= MIN_AUTO_REPS) lock = ex; });
  const manual = R.IDS.filter(id => { cs[id].flush(); return cs[id].reps >= MIN_AUTO_REPS; }).length;
  return { reps: best, falseSet: best >= MIN_AUTO_REPS, manual };
}
const MODES = (arg('--modes') || 'v86,nogate,vision,sensor').split(','), CONDS = (arg('--conds') || 'clean,handheld,large').split(','), res = {};
const only = arg('--only'), sel = x => !only || only.split(',').includes(x.id);
const exClips = man.filter(x => x.exercise !== 'none' && sel(x)), negClips = man.filter(x => x.exercise === 'none' && sel(x));
for (const cond of CONDS) for (const mode of MODES) {
  const K = cond + '|' + mode, A = res[K] = { per: {}, view: {}, neg: { n: 0, fs: 0, reps: 0, man: 0 }, over: 0, under: 0 };
  const seeds = cond === 'clean' ? 1 : SEEDS;
  for (let sd = 0; sd < seeds; sd++) {
    for (const e of exClips) { const d = load(e); if (!d) continue; const r = runEx(e, d, frames(d, cond, hash(e.id) + 101 * sd), mode), err = r.pred - e.gt;
      const p = A.per[e.exercise] ||= { n: 0, exact: 0, abs: 0, over: 0, under: 0, rec: 0, recN: 0 }; p.n++; p.abs += Math.abs(err); if (!err) p.exact++; if (err > 0) p.over += err; else p.under -= err;
      if (e.gt > 0) { p.recN++; if (r.rec === e.exercise) p.rec++; }
      if (process.env.CAM_V && err !== 0) console.error(K, e.exercise, e.id, e.gt, r.pred, r.rec);
      const v = A.view[e.view] ||= { n: 0, exact: 0, abs: 0 }; v.n++; v.abs += Math.abs(err); if (!err) v.exact++; }
    for (const e of negClips) { const d = load(e); if (!d) continue; const r = runNeg(e, d, frames(d, cond, hash(e.id) + 101 * sd), mode);
      if (process.env.CAM_V && r.falseSet) console.error(K, 'FALSE SET', e.id, e.activity, r.reps);
      A.neg.n++; if (r.falseSet) A.neg.fs++; A.neg.reps += r.reps; A.neg.man += r.manual; }
  }
  const T = Object.values(A.per).reduce((s, p) => ({ n: s.n + p.n, exact: s.exact + p.exact, abs: s.abs + p.abs, over: s.over + p.over, under: s.under + p.under }), { n: 0, exact: 0, abs: 0, over: 0, under: 0 });
  A.all = T; console.error(`${K}: exact ${T.exact}/${T.n} MAE ${(T.abs / T.n).toFixed(2)} over ${T.over} under ${T.under} | neg false sets ${A.neg.fs}/${A.neg.n} reps ${A.neg.reps} manual ${A.neg.man}`);
}
if (global.GS) console.error('gated frames', GS.g, '/', GS.n);
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
console.log('## Summary (' + SEEDS + ' random camera paths per clip for handheld/large)\n\n| Condition | Engine | Exercise clips exact | MAE | Extra reps (overcount) | Missed reps | Negatives: false sets | Negatives: reps shown | Manual pick: counters reaching 2 |\n|---|---|---|---|---|---|---|---|---|');
const NM = { v86: 'v8.6', nogate: 'v8.7 body-relative only (no gate)', vision: 'v8.7 vision only (motion permission denied)', sensor: 'v8.7 vision + DeviceMotion' };
for (const K in res) { const [c, m] = K.split('|'), A = res[K], T = A.all;
  console.log(`| ${c} | ${NM[m]} | ${T.exact}/${T.n} (${pct(T.exact, T.n)}) | ${(T.abs / T.n).toFixed(2)} | ${T.over} | ${T.under} | ${A.neg.fs}/${A.neg.n} (${pct(A.neg.fs, A.neg.n)}) | ${A.neg.reps} | ${A.neg.man}/${A.neg.n * R.IDS.length} |`); }
for (const c of CONDS) { console.log(`\n## Per exercise — ${c}\n\n| Exercise | ` + MODES.map(m => NM[m] + ' exact / MAE / over / rec').join(' | ') + ' |\n|---|' + MODES.map(() => '---|').join(''));
  for (const ex of Object.keys(res[c + '|' + MODES[0]].per)) console.log(`| ${ex} | ` + MODES.map(m => { const p = res[c + '|' + m].per[ex]; return `${p.exact}/${p.n} · ${(p.abs / p.n).toFixed(2)} · +${p.over} · ${p.rec}/${p.recN}`; }).join(' | ') + ' |');
  console.log(`\n| View — ${c} | ` + MODES.map(m => NM[m] + ' exact / MAE').join(' | ') + ' |\n|---|' + MODES.map(() => '---|').join(''));
  for (const v of Object.keys(res[c + '|' + MODES[0]].view)) console.log(`| ${v} | ` + MODES.map(m => { const p = res[c + '|' + m].view[v]; return `${p.exact}/${p.n} · ${(p.abs / p.n).toFixed(2)}`; }).join(' | ') + ' |'); }
const out = arg('--json'); if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
