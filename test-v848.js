// v8.48 battery: savings must not change counting. (1) eval: --idleSim (worst case of POWER_CFG.idle) gives the same result on
// every clip with a person-less gap ≥ 3 s; (2) app wiring: defaults + kill switches (repcam.idleThrottle / lowDraw / dupSkip /
// domDiff = off|shadow|on, repcam.barShadow=on restores the v8.16 bar shadow tracker, repcam.camRes=low opt-in).
const assert = require('assert'), fs = require('fs'), cp = require('child_process');
const ids = 'mvr3ztyba5399299,mvveg0gceee8b71a,mvvf26hgc6ccdffd,mw3vd96288d8f687';
const rows = extra => cp.execFileSync('node', ['eval/real/run.js', '--all', '--ids', ids, ...extra], { encoding: 'utf8' }).split('\n').filter(l => /^\| [✓✗]/.test(l)).map(l => l.split('|').slice(1, 7).join('|'));
const a = rows([]), b = rows(['--idleSim']); assert.strictEqual(a.length, 4); assert.deepStrictEqual(b, a, 'idle throttle changes a result');
const app = fs.readFileSync('./app.js', 'utf8'), html = fs.readFileSync('./index.html', 'utf8'), V = /APP_VERSION = '([\d.]+)'/.exec(app)[1];
assert(+V >= 8.48 && html.includes('app.js?v=' + V));
for (const k of ["kv('repcam.barShadow', 'off')", "kv('repcam.lowDraw', 'on')", "kv('repcam.domDiff', 'on')", "kv('repcam.idleThrottle', 'on')", "kv('repcam.dupSkip', 'shadow')",
  'noPersonMs: 3000, hz: 5', "POWER_CFG.bar === 'on' ? Bar.createBarTracker()", '!plateOn() /* side sessions', "repcam.camRes') === 'low'", 'power: { ...POWER_CFG.log']) assert(app.includes(k), 'missing ' + k);
// the throttle constants in the eval simulation must match the app's
const run = fs.readFileSync('./eval/real/run.js', 'utf8'); assert(run.includes('{ noPersonS: 3, hz: 5 }'));
console.log('test-v848 OK');
