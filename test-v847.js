// v8.47 (eval failures after 15 Nov): every rule on = fixed, off = baseline, shadow = baseline (TRUE shadow, logs only).
// (1) pull-up rep whose hips stay still = not a rep (HIP_FOLLOW_CFG, repcam.hipFollow; mwi89q18 rigging 'pull-ups×4')
// (2) leg set with large hip travel = walking, not saved (LEG_TRAVEL_CFG, repcam.legTravel; mw3un16x 'bulgarsk×4', mw14lzxg 'halvmark×4')
// (3) autosave of a ≤2-rep lock yields to a counter still counting (RELOCK_TIE_CFG, repcam.relockTie; mw3ufjnh dips×2 → knebøy×4)
// (4) after a saved set the other counters forget instead of restarting (SAVE_KEEP_CFG, repcam.saveKeep; mw3ub9yv knebøy 7 → 8)
// (5) V-sit-up ampIdle 20 s (repcam.vsitIdle; mw3vd962 17 → 20)
const assert = require('assert'), fs = require('fs'), R = require('./reps.js'), run = require('./eval/real/run.js');
const res = id => { const k = []; const r = run.replay(run.load(id), 0, { onKeep: x => k.push(x.ex + '×' + x.reps) }); return { final: (r.ex || 'none') + '×' + r.reps, kept: k.join(',') }; };
const tri = (cfg, id, onWant) => { const out = {}; for (const m of ['on', 'off', 'shadow']) { cfg.mode = m; if (cfg.shadowLog) cfg.shadowLog.length = 0; out[m] = res(id); out[m].log = cfg.shadowLog ? cfg.shadowLog.length : 0; } cfg.mode = 'on';
  assert.strictEqual(out.on.final, onWant, id + ' on'); assert.notStrictEqual(out.off.final, onWant, id + ' off = baseline differs'); assert.deepStrictEqual({ ...out.shadow, log: 0 }, { ...out.off, log: 0 }, id + ' shadow = baseline');
  if (cfg.shadowLog) assert(out.shadow.log > 0, id + ' shadow logs'); return out; };
tri(R.HIP_FOLLOW_CFG, 'mwi89q1826bedc8f', 'roing×0');
tri(R.LEG_TRAVEL_CFG, 'mw3un16xaa5995ba', 'none×0');
tri(R.LEG_TRAVEL_CFG, 'mw14lzxg33d67550', 'none×0');
tri(R.RELOCK_TIE_CFG, 'mw3ufjnh35acfba9', 'knebøy×4');
tri(R.SAVE_KEEP_CFG, 'mw3ub9yv18d6cc2c', 'knebøy×8');
{ const v = R.EX.vsitup.ampIdle; assert.strictEqual(v, 20); assert.strictEqual(res('mw3vd96288d8f687').final, 'vsitup×20'); R.EX.vsitup.ampIdle = null; assert.strictEqual(res('mw3vd96288d8f687').final, 'vsitup×17'); R.EX.vsitup.ampIdle = v; }
// app wiring
const app = fs.readFileSync('./app.js', 'utf8'), html = fs.readFileSync('./index.html', 'utf8'), V = /APP_VERSION = '([\d.]+)'/.exec(app)[1];
assert(+V >= 8.47 && html.includes('app.js?v=' + V));
for (const k of ['repcam.hipFollow', 'repcam.legTravel', 'repcam.relockTie', 'repcam.saveKeep', 'repcam.vsitIdle', 'resetCounters(ex)', 'forget(true)']) assert(app.includes(k), 'missing ' + k);
console.log('test-v847 OK');
