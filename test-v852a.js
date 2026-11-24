// v8.52a: end the current locked set after a long pause / station change, so the next
// exercise is not absorbed into the same count (mwv461fe: dips 8 + curl 10 became dips 19).
// Kill switch: localStorage repcam.pauseEnd = off | shadow | on (default shadow).
// Thresholds in Reps.PAUSE_END_CFG (gapMs, gapFactor, requireLock).
const assert = require('assert'), fs = require('fs');
const app = fs.readFileSync('./app.js', 'utf8'), html = fs.readFileSync('./index.html', 'utf8');
const R = require('./reps.js');
const V = /APP_VERSION = '([\d.]+)'/.exec(app)[1];
assert(+V >= 8.52 && html.includes('app.js?v=' + V) && html.includes('style.css?v=' + V) && html.includes('reps.js?v=' + V));

assert.strictEqual(R.PAUSE_END_CFG.mode, 'shadow');
assert.strictEqual(R.PAUSE_END_CFG.gapMs, 8000);
assert.strictEqual(R.PAUSE_END_CFG.gapFactor, 3);
assert.strictEqual(R.PAUSE_END_CFG.requireLock, true);
assert.equal(typeof R.pauseReady, 'function');
assert(app.includes("localStorage.getItem('repcam.pauseEnd')"));
assert(app.includes('Reps.pauseReady(counters[pEx], tSec, pEx)'));
assert(app.includes("pauseMode === 'on'") && app.includes('finishPending()'));
assert(app.includes('pauseLog') && app.includes('[pauseEnd]'));
assert(fs.readFileSync('./eval/real/run.js', 'utf8').includes("arg('--pauseEnd'"));

function mk(reps, t0, last, held, step) {
  const s = step || 1.2, times = []; for (let i = 0; i < reps; i++) times.push(t0 + i * s);
  return { reps, repTimes: times, lastRepT: last, heldLock: !!held, plateEnded: false };
}

// 8 dips, last at 67.5, t=76 (>= 8 s and >> 3× median 1.2) → ready
const dips = mk(8, 59.16, 67.54, true, 1.2);
assert.strictEqual(R.pauseReady(dips, 75.54, 'dips'), true);
assert.strictEqual(R.pauseReady(dips, 74.0, 'dips'), false); // 6.5 s, under gapMs
assert.strictEqual(R.pauseReady({ ...dips, heldLock: false }, 76, 'dips'), false);

// a 6.94 s gap after 3 bench reps (mwv2ywq) must NOT end the set: under 8 s
const bench = mk(3, 109.95, 113.10 + 6.94, true, 1.5);
bench.repTimes = [109.95, 111.24, 113.10];
bench.lastRepT = 113.10;
assert.strictEqual(R.pauseReady(bench, 113.10 + 6.94, 'benkpress'), false);
assert.strictEqual(R.pauseReady(bench, 113.10 + 8.0, 'benkpress'), true); // 8 s and 8 > 3×~1.15

// slow set: median gap 4 s → factor 3 requires 12 s, not just 8
const slow = mk(6, 0, 20, true, 4);
assert.strictEqual(R.pauseReady(slow, 20 + 8, 'halvmark'), false);
assert.strictEqual(R.pauseReady(slow, 20 + 12, 'halvmark'), true);

// replay: mwv461fe full clip — off stays one dips set; on keeps dips and curl separately
const run = require('./eval/real/run.js');
const d = run.load('mwv461fe3063a6e0');
function official(mode) {
  const prev = R.PAUSE_END_CFG.mode; R.PAUSE_END_CFG.mode = mode;
  const kept = []; const r = run.replay(d, 0, { onKeep: x => kept.push(x.ex + '×' + x.reps) });
  R.PAUSE_END_CFG.mode = prev; return { ex: r.ex, reps: r.reps, kept };
}
const off = official('off'), on = official('on'), sh = official('shadow');
assert.strictEqual(off.ex, 'dips');
assert(off.reps >= 15, 'off should still merge: ' + off.reps);
assert.deepStrictEqual(off.kept, sh.kept, 'shadow must follow the old path');
assert(on.kept.includes('dips×8'), 'on should save dips×8, kept ' + on.kept.join(','));
assert(on.kept.some(k => /^(curl|bulgarsk|roing|knebøy)×(9|10|11)$/.test(k)), 'on should save a later ~10-rep set (curl ID is 8.52c), kept ' + on.kept.join(','));
assert(!on.kept.some(k => /^dips×(1[89]|2\d)$/.test(k)), 'must not keep merged dips, kept ' + on.kept.join(','));

console.log('test-v852a OK');
