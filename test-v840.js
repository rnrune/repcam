// v8.40: mature lock must not be stolen (halvmark→dips on mw3uun14); kill switch repcam.halvmarkDips=off restores steal.
const assert = require('assert');
const R = require('./reps.js');
const { load, replay } = require('./eval/real/run.js');
const id = 'mw3uun1418e0dd87';
R.RELOCK_CFG.mode = 'on';
let r = replay(load(id), 0);
assert.strictEqual(r.ex, 'halvmark', 'on: halvmark');
assert.strictEqual(r.reps, 9, 'on: 9 reps');
R.RELOCK_CFG.mode = 'off';
r = replay(load(id), 0);
assert.strictEqual(r.ex, 'dips', 'off: dips steal');
assert.strictEqual(r.reps, 9, 'off: 9 dips reps');
R.RELOCK_CFG.mode = 'shadow';
r = replay(load(id), 0);
assert.strictEqual(r.ex, 'halvmark', 'shadow: keep halvmark');
console.log('test-v840 ok');
