// v8.31 dips: stale pre-set amplitudes forgotten (ampIdle) + dismount = shoulders never back to the set's top (tailTop); full recordings
const assert = require('assert'), R = require('./reps.js'), run = require('./eval/real/run.js');
const full = id => run.replay(run.load(id), 0);
let r = full('mvvfr0478a996584'); assert.strictEqual(r.ex, 'dips'); assert.strictEqual(r.reps, 12); assert(r.times[0] > 44 && r.times[0] < 45.5, 'jump-up ~43 s not a rep');
r = full('mvvfo3h7de7ad609'); assert.strictEqual(r.reps, 12); assert(r.times[r.times.length - 1] < 68, 'shallow 68.8 s step-down dropped');
const t = R.EX.dips.tailTop; R.EX.dips.tailTop = { ...t, mode: 'shadow' }; const logs = []; const c0 = R.createCounter;
assert.strictEqual(full('mvvfo3h7de7ad609').reps, 13, 'shadow mode keeps the rep'); R.EX.dips.tailTop = t;
const ai = R.EX.dips.ampIdle; R.EX.dips.ampIdle = null; assert.strictEqual(full('mvvfr0478a996584').reps, 8, 'kill switch restores old behaviour'); R.EX.dips.ampIdle = ai;
console.log('test-v831 ok');
