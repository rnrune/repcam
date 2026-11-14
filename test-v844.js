// v8.44: RDL «bar set down» — a last halvmark rep ≥2.5× the set's median amplitude after a long gap is dropped (mw3uun14 9→8,
// GT 8 since Rune 14 Nov: first lift and putting the bar down are not reps). Kill switch repcam.rdlTail=off|shadow (= baseline 9).
const assert = require('assert');
const R = require('./reps.js');
const run = require('./eval/real/run.js');
const rp = () => run.replay(run.load('mw3uun1418e0dd87'), 0);
let r = rp(); assert.strictEqual(r.ex, 'halvmark'); assert.strictEqual(r.reps, 8, 'on: 8');
R.RDL_TAIL_CFG.mode = 'shadow'; R.RDL_TAIL_CFG.shadowLog.length = 0; r = rp(); assert.strictEqual(r.reps, 9, 'shadow = baseline 9'); assert.ok(R.RDL_TAIL_CFG.shadowLog.length > 0, 'shadow logged');
R.RDL_TAIL_CFG.mode = 'off'; r = rp(); assert.strictEqual(r.reps, 9, 'off = baseline 9');
R.RDL_TAIL_CFG.mode = 'on';
console.log('test-v844 ok');
