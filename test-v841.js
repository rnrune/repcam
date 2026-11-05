// v8.41: Bulgarian rear-foot split (ankDx high percentile) vs squat; kill switch repcam.bulgSquat=off restores median ankDx.
const assert = require('assert');
const R = require('./reps.js');
const { load, replay } = require('./eval/real/run.js');
const id = 'mw3v0giwaffe81c2';
const squat = 'mvr3gojt95bd64ea';

R.SPLIT_CFG.ankDxQ = 0.85;
R.SPLIT_CFG.mode = 'on';
let r = replay(load(id), 0);
assert.strictEqual(r.ex, 'bulgarsk', 'on: bulgarsk (not knebøy)');
assert.ok(r.reps >= 8, 'on: at least one foot of reps, got ' + r.reps);

r = replay(load(squat), 0);
assert.strictEqual(r.ex, 'knebøy', 'on: squat still knebøy');
assert.strictEqual(r.reps, 8, 'on: squat 8');

R.SPLIT_CFG.ankDxQ = 0.5; // kill switch off
r = replay(load(id), 0);
assert.strictEqual(r.ex, 'knebøy', 'off: knebøy misread restored');

R.SPLIT_CFG.ankDxQ = 0.85;
R.SPLIT_CFG.mode = 'shadow';
r = replay(load(id), 0);
assert.strictEqual(r.ex, 'bulgarsk', 'shadow: same as on (feature quantile)');

console.log('test-v841 ok');
