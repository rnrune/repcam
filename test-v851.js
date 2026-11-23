// v8.51 (a): split long clips — a completed, previously locked background set is saved (and the clip is cut)
// before forget(), and trimIdle does not discard a segment that still holds a complete unsaved set.
// Kill switch: localStorage repcam.splitSets = off | shadow | on (default on). Thresholds in Reps.CUT_SAVE_CFG.
const assert = require('assert'), fs = require('fs');
const app = fs.readFileSync('./app.js', 'utf8'), html = fs.readFileSync('./index.html', 'utf8');
const R = require('./reps.js');
const V = /APP_VERSION = '([\d.]+)'/.exec(app)[1];
assert(+V >= 8.51 && html.includes('app.js?v=' + V) && html.includes('style.css?v=' + V) && html.includes('reps.js?v=' + V));

assert.strictEqual(R.CUT_SAVE_CFG.mode, 'on');
assert.strictEqual(R.CUT_SAVE_CFG.afterMs, 9000);
assert.strictEqual(R.CUT_SAVE_CFG.skipOverlap, true);
assert.strictEqual(R.CUT_SAVE_CFG.requireLock, true);
assert.equal(typeof R.readySets, 'function');
assert(app.includes("localStorage.getItem('repcam.splitSets')"));
assert(app.includes("function saveSet(which)"));
assert(app.includes('Reps.readySets(counters, lastFrameT, ex)'));
assert(app.includes("splitMode === 'on' && !sigDrop") && app.includes('saveSet(id)'));
assert(app.includes('trimSkip: true') && app.includes('fb.rec.trimIdle(30e3)'));
assert(app.includes('splitLog') && app.includes('const splitLog = fb.splitLog || null'));
assert(fs.readFileSync('./eval/real/run.js', 'utf8').includes("arg('--splitSets'"));
assert(fs.readFileSync('./plate.js', 'utf8').includes('heldLock'));

// readySets: only a quiet, plausible, previously locked background set, not an overlapping or never-locked one
function mk(reps, t0, last, held) {
  const times = []; for (let i = 0; i < reps; i++) times.push(t0 + i * 1.2);
  return { reps, repTimes: times, lastRepT: last, heldLock: !!held, plateEnded: false };
}
const cs = {
  benkpress: mk(6, 10, 16, true),
  pullups: mk(3, 12, 15, true), // overlaps benk, fewer reps — dropped
  roing: mk(8, 40, 50, true),   // later, quiet at t=60
  curl: mk(5, 40, 50, false),   // never locked — dropped when requireLock
  knebøy: mk(11, 1, 20, false)
};
assert.deepStrictEqual(R.readySets(cs, 60, null), ['benkpress', 'roing']);
assert.deepStrictEqual(R.readySets(cs, 60, 'benkpress'), ['roing']); // except current; overlapping pullups still out
assert.deepStrictEqual(R.readySets(cs, 18, null), []); // not yet quiet (afterMs 9s; earliest lastRepT=15)
cs.knebøy.lastRepT = 10; cs.knebøy.heldLock = true;
assert.deepStrictEqual(R.readySets({ knebøy: cs.knebøy }, 20, null), ['knebøy']);

// replay: official biggest set on the Sunday multi-set clip is still vsitup×20 (splitSets on or off)
const run = require('./eval/real/run.js');
const d = run.load('mwrqaujj739e9a75');
function official(mode) {
  const prev = R.CUT_SAVE_CFG.mode; R.CUT_SAVE_CFG.mode = mode;
  const kept = []; const r = run.replay(d, 0, { onKeep: x => kept.push(x.ex + '×' + x.reps) });
  R.CUT_SAVE_CFG.mode = prev; return { ex: r.ex, reps: r.reps, kept };
}
const off = official('off'), on = official('on'), sh = official('shadow');
assert.strictEqual(off.ex, 'vsitup'); assert.strictEqual(off.reps, 20);
assert.strictEqual(on.ex, 'vsitup'); assert.strictEqual(on.reps, 20);
assert.strictEqual(sh.ex, 'vsitup'); assert.strictEqual(sh.reps, 20);
assert(on.kept.includes('vsitup×20') && on.kept.includes('bulgarsk×9'), 'hidden Sunday sets still in onKeep: ' + on.kept.join(','));

console.log('test-v851 OK');
