// v8.42: Bulgarian undercount — lower minAmp (0.14); kill switch repcam.bulgCount=off|shadow restores 0.18 (true shadow).
const assert = require('assert');
const path = require('path');

function loadFresh() {
  delete require.cache[require.resolve('./reps.js')];
  delete require.cache[require.resolve('./eval/real/run.js')];
  return { R: require('./reps.js'), run: require('./eval/real/run.js') };
}

let { R, run } = loadFresh();
assert.strictEqual(R.BULG_COUNT_CFG.minAmp, 0.14);
assert.strictEqual(R.EX.bulgarsk.minAmp, 0.14);
let r = run.replay(run.load('mw3v3mef43e63298'), 0);
assert.strictEqual(r.ex, 'bulgarsk');
assert.strictEqual(r.reps, 8, 'on: tail clip 8');
r = run.replay(run.load('mw3v0giwaffe81c2'), 0);
assert.strictEqual(r.ex, 'bulgarsk');
assert.ok(r.reps >= 14, 'on: main clip near 16, got ' + r.reps);

// off = baseline 0.18
({ R, run } = loadFresh());
R.BULG_COUNT_CFG.minAmp = 0.18; R.BULG_COUNT_CFG.mode = 'off'; R.EX.bulgarsk.minAmp = 0.18;
r = run.replay(run.load('mw3v3mef43e63298'), 0);
assert.strictEqual(r.reps, 5, 'off: baseline undercount');

// shadow = same as off (baseline behavior)
({ R, run } = loadFresh());
R.BULG_COUNT_CFG.minAmp = 0.18; R.BULG_COUNT_CFG.mode = 'shadow'; R.EX.bulgarsk.minAmp = 0.18;
r = run.replay(run.load('mw3v3mef43e63298'), 0);
assert.strictEqual(r.reps, 5, 'shadow: baseline undercount');

// squat untouched
({ R, run } = loadFresh());
r = run.replay(run.load('mvr3gojt95bd64ea'), 0);
assert.strictEqual(r.ex, 'knebøy');
assert.strictEqual(r.reps, 8);

console.log('test-v842 ok');
