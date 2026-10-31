// v8.32: row lead-in (bar lifted into position) dropped; archive tier skipped by default, run with --all
const assert = require('assert'), R = require('./reps.js'), run = require('./eval/real/run.js');
const e = run.man().find(x => x.id === 'mvvfl1ka-row'), d0 = run.load(e.lm), d = { ...d0, frames: d0.frames.filter(a => a[0] >= e.win[0] && a[0] <= e.win[1]) };
let r = run.replay(d, 0); assert.strictEqual(r.ex, 'roing'); assert.strictEqual(r.reps, 10); assert(r.times[0] > 119, 'lead-in 117.3 s dropped');
const L = R.EX.roing.leadGap; R.EX.roing.leadGap = { ...L, mode: 'shadow' }; assert.strictEqual(run.replay(d, 0).reps, 11, 'shadow keeps it'); R.EX.roing.leadGap = null; assert.strictEqual(run.replay(d, 0).reps, 11, 'off'); R.EX.roing.leadGap = L;
const m = run.man(); assert(m.every(x => 'angle' in x), 'angle field'); assert(m.filter(x => x.tier === 'archive').length >= 19);
console.log('test-v832 ok');
