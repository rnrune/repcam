// v8.46: (1) fresh exercise guess after a saved set (Reps.AUTO_RESET_CFG, repcam.autoReset); (2) recorder health (feedback.js);
// (3) camera/recorder watchdog + live warning wiring (app.js CAM_HEAL, repcam.camHeal / repcam.recWarn).
const assert = require('assert'), fs = require('fs'), R = require('./reps.js'), run = require('./eval/real/run.js'), F = require('./feedback.js');
// 1) 15 Nov: pull-up set mwi8acvd, 91 s later pull-up set mwi8db6r (live: roing×7). Back to back the stale guess from the end
//    of the first clip locked the second set to another exercise; with the reset both are pull-ups×6.
const join = ids => { let frames = [], w, h; for (const [id, off] of ids) { const d = run.load(id); w = d.w; h = d.h; for (const a of d.frames) { const b = a.slice(); b[0] += off; frames.push(b); } } return { w, h, frames }; };
const d = join([['mwi8acvdfc4928c0', 0], ['mwi8db6r827fe8a0', 120.5]]);
const sets = m => { R.AUTO_RESET_CFG.mode = m; const k = []; run.replay(d, 0, { onKeep: x => k.push(x.ex + '×' + x.reps) }); return k; };
assert.deepStrictEqual(sets('on'), ['pullups×6', 'pullups×6']);
assert.notDeepStrictEqual(sets('off'), ['pullups×6', 'pullups×6'], 'baseline loses the second set');
assert.deepStrictEqual(sets('shadow'), sets('off'), 'shadow = baseline'); R.AUTO_RESET_CFG.mode = 'on';
// 2) recorder: active() only while recording; a recorder error is reported and noticed
{ let inst; global.MediaRecorder = class { constructor() { this.state = 'inactive'; inst = this; } start() { this.state = 'recording'; } stop() { this.state = 'inactive'; this.onstop && this.onstop(); } };
  global.Blob = class { constructor(a) { this.size = a.length; } };
  const ev = [], stream = { getVideoTracks: () => [{ readyState: 'live' }] }, r = F.createRecorder(stream, { onEvent: (k) => ev.push(k), now: () => 0 });
  assert.strictEqual(r.active(), true); inst.onerror({ error: { name: 'UnknownError' } }); assert.strictEqual(r.active(), false); assert.deepStrictEqual(ev, ['recError']); assert.strictEqual(r.errors(), 1); }
// 3) app wiring
const app = fs.readFileSync('./app.js', 'utf8'), html = fs.readFileSync('./index.html', 'utf8'), V = /APP_VERSION = '([\d.]+)'/.exec(app)[1];
assert(+V >= 8.46 && html.includes('app.js?v=' + V) && html.includes('id="recWarn"'));
for (const k of ['repcam.camHeal', 'repcam.recWarn', 'repcam.autoReset', 'setInterval(camWatch', "fbSkip('noRecorder'", "fbSkip('queueFull'", "fbSkip(!seg ? 'recorderStopped'", 'gumT(getCam(facing))', 'trackMuted()', 'camLog:']) assert(app.includes(k), 'missing ' + k);
const i18n = fs.readFileSync('./i18n.js', 'utf8'); for (const k of ['w.camStall', 'w.camFrozen', 'w.recOff', 'w.clipSkip']) assert(i18n.includes(`'${k}'`), k);
console.log('test-v846 OK');
