// v8.8 unit tests: real-user feedback regressions (eval/real). Head-on push-ups after a kneeling setup must count the true
// reps, never be picked as RDL (halvmark), never pick up a kg default from another exercise, and the first push-up only
// counts once a plank (top) has been held.
const R = require('./reps.js'), assert = require('assert'), real = require('./eval/real/run.js');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
for (const e of real.man()) for (const hz of [0, 30]) {
  const r = real.replay(real.load(e.id), hz), tag = `${e.id}@${hz || 'log'}Hz`;
  ok(r.ex === e.exercise, `${tag}: exercise ${r.ex} ≠ ${e.exercise}`); ok(r.reps === e.gt, `${tag}: reps ${r.reps} ≠ ${e.gt}`); ok(r.kg === e.kg, `${tag}: kg ${r.kg}`);
  ok(r.times.every((t, i) => !i || t - r.times[i - 1] >= 0.45), `${tag}: rep times distinct + spaced ${r.times}`);
}
// plank must be established before the first rep: posture failing before t=6 s rejects the first descent as setup
{ const d = real.load('mvmtfqlo8d46051c'), why = [], P = R.createCounter('armhevinger').def.posture;
  let tNow = 0; const c = R.createCounter('armhevinger', { posture: (g, ref) => tNow >= 6 && P(g, ref), onReject: w => why.push(w) });
  for (const a of d.frames) { tNow = a[0]; const lm = []; for (let i = 0; i < 33; i++) lm.push({ x: a[1 + 3 * i], y: a[2 + 3 * i], visibility: a[3 + 3 * i] }); c.update(lm, a[0] * 1000, d.w / d.h); }
  c.flush(); ok(why.includes('setup'), 'first descent without a held plank rejected as setup: ' + why); ok(c.reps === 4, 'remaining reps counted: ' + c.reps + ' ' + c.repTimes);
  ok(c.repTimes[0] > 6, 'no rep before the plank'); }
// a prone head-on body is never a standing hinge
{ const d = real.load('mvmtju2917da1c69'), rec = R.createRecognizer(); let hm = 0, nn = 0;
  for (const a of d.frames) { const lm = []; for (let i = 0; i < 33; i++) lm.push({ x: a[1 + 3 * i], y: a[2 + 3 * i], visibility: a[3 + 3 * i] }); const r = rec.update(lm, a[0] * 1000, d.w / d.h);
    if (a[0] > 14 && a[0] < 21) { nn++; if (r.best === 'halvmark') hm++; } }
  ok(hm / nn < 0.2, `halvmark best on ${hm}/${nn} push-up frames`); }
console.log(n + ' v8.8 real-clip tests passed');
