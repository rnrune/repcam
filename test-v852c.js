// v8.52c: at save time, relabel squat/Bulgarian/RDL/row → curl, and dips → row, when the
// set motion is clearly arms-swinging upright (curl) or hands-moving / shoulders-still (row).
// Kill switch: localStorage repcam.exFix = off | shadow | on (default on).
// Thresholds in Reps.EX_FIX_CFG.
const assert = require('assert'), fs = require('fs');
const app = fs.readFileSync('./app.js', 'utf8'), html = fs.readFileSync('./index.html', 'utf8');
const R = require('./reps.js');
const V = /APP_VERSION = '([\d.]+)'/.exec(app)[1];
assert(+V >= 8.52 && html.includes('app.js?v=' + V));

assert.strictEqual(R.EX_FIX_CFG.mode, 'on');
assert.strictEqual(R.EX_FIX_CFG.qLo, 0.2);
assert.strictEqual(R.EX_FIX_CFG.curl.minWrRel, 0.4);
assert.equal(typeof R.fixExercise, 'function');
assert(app.includes("localStorage.getItem('repcam.exFix')"));
assert(app.includes('[exFix]') && app.includes('exFixLog'));
assert(fs.readFileSync('./eval/real/run.js', 'utf8').includes("arg('--exFix'"));

// unit: curl-like stats relabel squat/bulgarian, not a real squat
const curlSt = { wrRatio: 4.0, tilt: 8, knee: 175, wrRel: 0.65, hinge: 0.13, shMove: 0.16 };
assert.strictEqual(R.fixExercise('knebøy', curlSt), 'curl');
assert.strictEqual(R.fixExercise('bulgarsk', curlSt), 'curl');
assert.strictEqual(R.fixExercise('roing', curlSt), 'curl');
assert.strictEqual(R.fixExercise('benkpress', curlSt), 'benkpress');
const squatSt = { wrRatio: 0.9, tilt: 18, knee: 154, wrRel: 0.17, hinge: 0.21, shMove: 0.89 };
assert.strictEqual(R.fixExercise('knebøy', squatSt), 'knebøy');
const bulgSt = { wrRatio: 1.3, tilt: 4, knee: 174, wrRel: 0.30, hinge: 0.12, shMove: 0.25 };
assert.strictEqual(R.fixExercise('bulgarsk', bulgSt), 'bulgarsk');
const rowSt = { wrRatio: 2.2, tilt: 21, knee: 169, wrRel: 0.29, hinge: 0.11, shMove: 0.17 };
assert.strictEqual(R.fixExercise('dips', rowSt), 'roing');
const dipsSt = { wrRatio: 0.28, tilt: 18, knee: 138, wrRel: 0.71, hinge: 0.21, shMove: 0.61 };
assert.strictEqual(R.fixExercise('dips', dipsSt), 'dips');
assert.strictEqual(R.fixExercise('curl', curlSt), 'curl');

const run = require('./eval/real/run.js');
function official(id, mode, extra) {
  const prev = R.EX_FIX_CFG.mode; R.EX_FIX_CFG.mode = mode;
  if (extra) extra(true);
  const kept = []; const r = run.replay(run.load(id), 0, { onKeep: x => kept.push(x.ex + '×' + x.reps) });
  if (extra) extra(false);
  R.EX_FIX_CFG.mode = prev; return { ex: r.ex, reps: r.reps, kept };
}

// 24.11 first EZ-curl, live knebøy / replay often roing — on should be curl
const c1off = official('mwv418oe5bf748aa', 'off'), c1on = official('mwv418oe5bf748aa', 'on'), c1sh = official('mwv418oe5bf748aa', 'shadow');
assert.strictEqual(c1sh.ex, c1off.ex, 'shadow follows off on curl1');
assert.strictEqual(c1on.ex, 'curl', 'curl1 on: ' + c1on.ex + '×' + c1on.reps + ' kept ' + c1on.kept.join(','));

// 24.11 second EZ-curl, live bulgarsk
const c2on = official('mwv43qcy305f4fad', 'on');
assert.strictEqual(c2on.ex, 'curl', 'curl2 on: ' + c2on.ex + '×' + c2on.reps);

// 24.11 first row, live dips
const r1off = official('mwv3rvwkbd7ab1de', 'off'), r1on = official('mwv3rvwkbd7ab1de', 'on');
assert.strictEqual(r1on.ex, 'roing', 'row1 on: ' + r1on.ex + '×' + r1on.reps + ' (off was ' + r1off.ex + '×' + r1off.reps + ')');

// real squat and real dips stay
const sq = official('mvr3gojt95bd64ea', 'on');
assert.strictEqual(sq.ex, 'knebøy'); assert.strictEqual(sq.reps, 8);
const dip = official('mwv3znw6415fb0a5', 'on');
assert.strictEqual(dip.ex, 'dips');

// core curl still curl
const real = official('mvnohgsi2c916059', 'on');
assert.strictEqual(real.ex, 'curl');

console.log('test-v852c OK');
