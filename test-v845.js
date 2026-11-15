// v8.45 plate-based bench counter (plate.js) at the side angle: stored plate tracks (eval/real/*.plate.json, numbers only).
const assert = require('assert'), fs = require('fs'), P = require('./plate.js'), run = require('./eval/real/run.js');
const track = (id, w) => JSON.parse(fs.readFileSync(`./eval/real/${id}.plate.json`, 'utf8')).track.filter(r => !w || (r[0] >= w[0] && r[0] <= w[1]));
// 1) the counter alone: unrack (dwell) and rack (edge gap) are not reps
for (const [id, w, gt] of [['mwi7wmjdbbc24c42', null, 12], ['mwi802robc14f02e', null, 5], ['mwi887bt2feb95b4', [40, 80], 8], ['mwi887bt2feb95b4', [195, 240], 8], ['mwi81af67f58693c', null, 8], ['mwi887bt2feb95b4', [240, 272], 0]]) {
  const c = P.createPlateCounter(); for (const r of track(id, w)) c.push(r[0], r[1]); assert.strictEqual(c.reps, gt, `${id} ${w} plate ${c.reps} != ${gt}`); }
// 2) replay: off and shadow are the pose baseline (true shadow), on = fasit; rack-and-still ends the set
const man = run.man(), E = id => man.find(e => e.id === id);
const load = e => { const d = run.load(e.lm || e.id); return e.win ? { ...d, frames: d.frames.filter(a => a[0] >= e.win[0] && a[0] <= e.win[1]) } : d; };
const ids = ['mwi7wmjdbbc24c42', 'mwi802robc14f02e', 'mwi887bt-a', 'mwi887bt-b', 'mwi81af67f58693c', 'mwi887bt-c', 'mwi7v8cd126803b6'];
const rr = (m, e) => { P.PLATE_MODE.mode = m; return run.replay(load(e), 0, { plate: m === 'none' ? null : track(e.lm || e.id, e.win) }); };
for (const id of ids) { const e = E(id), none = rr('none', e), off = rr('off', e), sh = rr('shadow', e), on = rr('on', e);
  assert.deepStrictEqual([off.ex, off.reps], [none.ex, none.reps], id + ' off != no plate');
  assert.deepStrictEqual([sh.ex, sh.reps], [none.ex, none.reps], id + ' shadow != baseline');
  assert.strictEqual(on.reps, e.gt, `${id} on ${on.ex}×${on.reps} != ${e.gt}`); if (e.exercise) assert.strictEqual(on.ex, e.exercise); }
P.PLATE_MODE.mode = 'on';
// 3) app wiring: kill switch, feed, meta, cache-bust
const app = fs.readFileSync('./app.js', 'utf8'), html = fs.readFileSync('./index.html', 'utf8'), V = /APP_VERSION = '([\d.]+)'/.exec(app)[1];
assert(+V >= 8.45 && html.includes('plate.js?v=' + V), 'index.html loads plate.js?v=' + V);
assert(/repcam\.plateBench/.test(app) && /Plate\.wrapCounter/.test(app) && /plateTrack/.test(app) && /plateEnded/.test(app));
assert(fs.readFileSync('./eval/feedback/pull.sh', 'utf8').includes('worker-label.json'), 'pull.sh keeps local labels');
console.log('test-v845 OK');
