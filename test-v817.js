// v8.17: bench body-size reference recovers fast after a close-up (refTau/refTauBelow), squat/split-squat reps with an
// upside-down pose flip are rejected (flipMax), and the 30 Oct clips replay as truth.
const assert = require('assert'), R = require('./reps.js'), run = require('./eval/real/run.js');
assert.strictEqual(R.EX.benkpress.refTauBelow, 0.5); assert.strictEqual(R.EX.skråbenk.refTau, 12);
assert.strictEqual(R.EX.knebøy.flipMax, 0.2); assert.strictEqual(R.EX.bulgarsk.flipMax, 0.2);
const m = run.man(), get = id => { const e = m.find(x => x.id === id), d = run.load(e.lm || e.id); return run.replay(e.win ? { ...d, frames: d.frames.filter(a => a[0] >= e.win[0] && a[0] <= e.win[1]) } : d, 0); };
const b = get('mvvelxx5-bench'); assert.strictEqual(b.ex, 'benkpress'); assert.strictEqual(b.reps, 12);
assert.ok(get('mvveg0gceee8b71a').reps < 2, 'plate loading is not a set');
const s = require('fs').readFileSync('app.js', 'utf8'); assert.ok(/function fitStage/.test(s) && /fitStageSoon\(true\)/.test(s), 'resume re-fits the stage');
console.log('test-v817 ok');
