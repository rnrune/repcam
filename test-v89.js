// v8.9 unit tests: Rune's 2026-10-25 gym session (eval/real, 28 clips). Over-counting (edge/tempo trim, stale background
// counters), EZ curl, re-lock when a set was locked on setup motion, and the longer edit window for the last set.
const R = require('./reps.js'), assert = require('assert'), real = require('./eval/real/run.js'), fs = require('fs');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const man = real.man(), res = {};
for (const e of man.filter(e => /^mvn[no]/.test(e.id))) res[e.id] = real.replay(real.load(e.id));
// clips the engine gets exactly right stay right (log rate; the 30 Hz upsample is checked in eval/results-v8.9.md)
for (const e of man.filter(e => e.regress)) { const r = res[e.id]; ok(r.ex === e.exercise && r.reps === e.gt, `${e.id}: ${r.ex} ${r.reps} ≠ ${e.exercise} ${e.gt} (${r.times})`); }
// session score floor (v8.8 engine: 5/28 exact, 14/23 right exercise)
const pos = man.filter(e => /^mvn[no]/.test(e.id) && e.exercise), neg = man.filter(e => /^mvn[no]/.test(e.id) && !e.exercise);
const exact = man.filter(e => res[e.id] && (e.exercise ? res[e.id].ex === e.exercise && res[e.id].reps === e.gt : res[e.id].reps === 0)).length;
const exOk = pos.filter(e => res[e.id].ex === e.exercise).length, over = pos.filter(e => res[e.id].ex === e.exercise && res[e.id].reps > e.gt + 1).length;
ok(exact >= 12, 'exact ' + exact); ok(exOk >= 22, 'exercise ' + exOk + '/' + pos.length); ok(over <= 3, 'sets over-counted by 2+: ' + over);
// EZ curl: recognised as curl, never as halvmark/knebøy (what v8.8 logged)
for (const id of ['mvnoe7jm75332b16', 'mvnohgsi2c916059']) { ok(res[id].ex === 'curl', id + ' curl: ' + res[id].ex); ok(Math.abs(res[id].reps - 10) <= 1, id + ' reps ' + res[id].reps);
  const d = real.load(id), rec = R.createRecognizer(); let bad = 0, cnt = 0;
  for (const a of d.frames) { const lm = []; for (let i = 0; i < 33; i++) lm.push({ x: a[1 + 3 * i], y: a[2 + 3 * i], visibility: a[3 + 3 * i] }); const r = rec.update(lm, a[0] * 1000, d.w / d.h);
    if (a[0] > 12 && a[0] < 27) { cnt++; if (r.best === 'halvmark' || r.best === 'knebøy') bad++; } }
  ok(bad / cnt < 0.15, `${id}: halvmark/knebøy best on ${bad}/${cnt} curl frames`); }
ok(R.IDS.includes('curl') && R.EX.curl.stillBody > 0, 'curl exercise defined');
// tempo/edge trim: lone setup "reps" well before / after the set's rhythm are dropped, a slowing grind at the end is kept
{ const fake = (times) => { const c = R.createCounter('benkpress'); const d = real.load('mvnnh70nea07ec8a');
    for (const a of d.frames) { const lm = []; for (let i = 0; i < 33; i++) lm.push({ x: a[1 + 3 * i], y: a[2 + 3 * i], visibility: a[3 + 3 * i] }); c.update(lm, a[0] * 1000, d.w / d.h); }
    return c; };
  const c = fake(); c.flush(); ok(c.reps === 6, 'bench 100 kg set 4: 6 reps, got ' + c.reps + ' ' + c.repTimes); }
// stale background counters: forget() clears reps but keeps tracking
{ const c = R.createCounter('roing'); const d = real.load('mvno6wnoab08c185'); let forgot = false;
  for (const a of d.frames) { const lm = []; for (let i = 0; i < 33; i++) lm.push({ x: a[1 + 3 * i], y: a[2 + 3 * i], visibility: a[3 + 3 * i] }); c.update(lm, a[0] * 1000, d.w / d.h);
    if (!forgot && a[0] > 84) { ok(c.reps > 0, 'reps before forget'); c.forget(); forgot = true; ok(c.reps === 0 && c.repTimes.length === 0 && c.lastRepT == null, 'forget clears'); } }
  ok(c.reps >= 3, 'keeps counting after forget: ' + c.reps); }
// re-lock: 2 setup "squats" then 3 presses -> bench; a real 4+ rep set is never re-assigned; atSave without a vote
{ const mk = (times) => ({ reps: times.length, repTimes: times, lastRepT: times.length ? times[times.length - 1] : null });
  ok(R.relock({ knebøy: mk([9, 20]), benkpress: mk([18.9, 20.6, 22.5]) }, 'knebøy', 'benkpress', 22.6) === 'knebøy', 'idle < 5 s keeps lock');
  ok(R.relock({ knebøy: mk([9, 14]), benkpress: mk([18.9, 20.6]) }, 'knebøy', 'benkpress', 20.7) === 'knebøy', 'not yet 3 reps after');
  ok(R.relock({ knebøy: mk([9, 14]), benkpress: mk([18.9, 20.6, 22.5]) }, 'knebøy', 'benkpress', 19.5 + 3.5) === 'benkpress', 'picker + 3 reps after -> bench');
  ok(R.relock({ dips: mk([1, 2, 3, 4]), pullups: mk([10, 12, 14, 16]) }, 'dips', 'pullups', 17) === 'dips', '4+ rep set stays');
  ok(R.relock({ dips: mk([112, 122.2]), pullups: mk([121, 127.8, 129.6]) }, 'dips', null, 131.6, null, true) === 'pullups', 'atSave: more reps after the lock wins');
  ok(R.relock({ benkpress: mk([2.5, 4.4, 8.3]), roing: mk([2.6, 4.4, 8.8, 13.2]) }, 'benkpress', null, 18, null, true) === 'benkpress', 'atSave: +1 rep is not enough over a 3-rep set'); }
// app: the last set stays editable — toast until the next set started and ≥60 s; every set in the log is tappable
{ const app = fs.readFileSync('app.js', 'utf8'); const m = app.match(/SET_TOAST_MIN_MS = (\d+)e3/);
  ok(m && +m[1] >= 60, 'set toast min ≥ 60 s'); ok(/currentReps\(\) > 0 && Date\.now\(\) - setToast\.at >= SET_TOAST_MIN_MS/.test(app), 'hidden only after the next set started');
  ok(/class="logrow"/.test(app) && /openEdit\(b\.dataset\.ts/.test(app), 'log rows open the editor'); ok(/APP_VERSION = '8\.9'/.test(app), 'APP_VERSION 8.9');
  ok(/DEFAULT_KG = \{[^}]*curl: 20/.test(app), 'curl default kg'); }
console.log(n + ' v8.9 tests passed (session exact ' + exact + '/' + man.filter(e => /^mvn[no]/.test(e.id)).length + ', exercise ' + exOk + '/' + pos.length + ')');
