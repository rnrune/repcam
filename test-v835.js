// v8.35 regression (landmarks only): the full mvnok2vt recording must save exactly one set, dips 12 —
// no false 'curl 2' from arm movements before mounting, and the dismount after rep 12 is not a rep.
// Also mvnogfwn (weighted dips, hands-off dismount) = dips 12.
const fs = require('fs'), assert = require('assert');
const X = require('./eval/real/run.js'), R = require('./reps.js');
const sets = id => { const S = []; X.replay(X.load(id), 0, { onKeep: r => S.push({ ex: r.ex, reps: r.reps }) }); return S; };
assert.strictEqual(R.minSet('curl'), 3); assert.strictEqual(R.minSet('dips'), 2);
assert.deepStrictEqual(sets('mvnok2vt347693bc'), [{ ex: 'dips', reps: 12 }]);
assert.deepStrictEqual(sets('mvnogfwn500e341f').slice(-1), [{ ex: 'dips', reps: 12 }]);
console.log('test-v835 ok');
