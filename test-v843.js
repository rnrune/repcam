// v8.43: (1) mature-lock steal refused only when the stealing counter has > matureSlack extra reps — restores the three
// archive corrections lost in v8.40 and keeps mw3uun14 halvmark; (2) squat walk-out (> AMP_DUR_CFG.maxDur s) no longer sets
// the adaptive amplitude — mw3u9xk 8→11 (GT 12). Kill switches: repcam.halvmarkDips, repcam.sqAmpDur (off|shadow = baseline).
const assert = require('assert');
const R = require('./reps.js');
const run = require('./eval/real/run.js');
const man = run.man(), rp = id => { const e = man.find(x => x.id === id), d = run.load(e.lm || e.id); return run.replay(e.win ? { ...d, frames: d.frames.filter(a => a[0] >= e.win[0] && a[0] <= e.win[1]) } : d, 0); };
for (const [id, ex, n] of [['mvr3vtnn4fb621e5', 'halvmark', 9], ['mvvf7yz657e4bbcc', 'skråbenk', 10], ['mw15189o998758fd', 'curl', 10], ['mw3uun1418e0dd87', 'halvmark', 9]]) {
  const r = rp(id); assert.strictEqual(r.ex, ex, id); assert.strictEqual(r.reps, n, id + ' reps'); }
let r = rp('mw3u9xk58aee31ee'); assert.strictEqual(r.ex, 'knebøy'); assert.strictEqual(r.reps, 11, 'ampDur on: 11');
R.AMP_DUR_CFG.mode = 'shadow'; R.AMP_DUR_CFG.shadowLog.length = 0; r = rp('mw3u9xk58aee31ee');
assert.strictEqual(r.reps, 8, 'ampDur shadow = baseline 8'); assert.ok(R.AMP_DUR_CFG.shadowLog.some(x => x.dur > 7), 'shadow logged');
R.AMP_DUR_CFG.mode = 'off'; r = rp('mw3u9xk58aee31ee'); assert.strictEqual(r.reps, 8, 'ampDur off = baseline 8');
R.AMP_DUR_CFG.mode = 'on';
console.log('test-v843 ok');
