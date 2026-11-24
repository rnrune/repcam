// v8.52b: do not auto-save a 2-rep knebøy/halvmark set (walk/setup).
// Does not raise the global min (bench, dips, pull-ups can still be 2).
// Kill switch: localStorage repcam.shortJunk = off | shadow | on (default shadow).
// Thresholds in Reps.SHORT_JUNK_CFG.
const assert = require('assert'), fs = require('fs');
const app = fs.readFileSync('./app.js', 'utf8'), html = fs.readFileSync('./index.html', 'utf8');
const R = require('./reps.js');
const V = /APP_VERSION = '([\d.]+)'/.exec(app)[1];
assert(+V >= 8.52 && html.includes('app.js?v=' + V));

assert.strictEqual(R.SHORT_JUNK_CFG.mode, 'shadow');
assert.strictEqual(R.SHORT_JUNK_CFG.maxReps, 2);
assert.deepStrictEqual(R.SHORT_JUNK_CFG.exercises, ['knebøy', 'halvmark']);
assert.equal(typeof R.isShortJunk, 'function');
assert(R.isShortJunk('knebøy', 2) && R.isShortJunk('halvmark', 2));
assert(!R.isShortJunk('knebøy', 3) && !R.isShortJunk('bulgarsk', 2) && !R.isShortJunk('benkpress', 2) && !R.isShortJunk('dips', 2));
assert(app.includes("localStorage.getItem('repcam.shortJunk')"));
assert(app.includes('[shortJunk]') && app.includes('shortLog'));
assert(fs.readFileSync('./eval/real/run.js', 'utf8').includes("arg('--shortJunk'"));

const run = require('./eval/real/run.js');
function official(id, mode) {
  const prev = R.SHORT_JUNK_CFG.mode; R.SHORT_JUNK_CFG.mode = mode;
  const kept = []; const r = run.replay(run.load(id), 0, { onKeep: x => kept.push(x.ex + '×' + x.reps) });
  R.SHORT_JUNK_CFG.mode = prev; return { ex: r.ex, reps: r.reps, kept };
}

// 24.11 mid-session walk: live knebøy×2 notASet. off/shadow keep it, on drops it.
const off = official('mwv30s1d28090eeb', 'off'), on = official('mwv30s1d28090eeb', 'on'), sh = official('mwv30s1d28090eeb', 'shadow');
assert.strictEqual(off.ex, 'knebøy'); assert.strictEqual(off.reps, 2);
assert.deepStrictEqual({ ex: sh.ex, reps: sh.reps }, { ex: off.ex, reps: off.reps }, 'shadow follows off');
assert(on.reps < 2, 'on should drop knebøy×2, got ' + on.ex + '×' + on.reps);

// a real 2-rep bench must still be saved (exercise not in the list)
assert(!R.isShortJunk('benkpress', 2));


// pause-end (on) must not bypass shortJunk: mwv30s1d would otherwise be saved at the 8 s pause
{ const p = R.PAUSE_END_CFG.mode, j = R.SHORT_JUNK_CFG.mode;
  R.PAUSE_END_CFG.mode = 'on'; R.SHORT_JUNK_CFG.mode = 'on';
  const r = run.replay(run.load('mwv30s1d28090eeb'), 0);
  R.PAUSE_END_CFG.mode = p; R.SHORT_JUNK_CFG.mode = j;
  assert(r.reps < 2, 'pauseEnd on + shortJunk on still drops knebøy×2, got ' + r.ex + '×' + r.reps);
}

console.log('test-v852b OK');
