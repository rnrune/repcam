// v8.52: calm recording screen (style.css html.calmUI, kill switch repcam.calmUI=off; skeleton toggle repcam.skel=on).
const fs = require('fs'), assert = require('assert'), path = require('path');
const app = fs.readFileSync('app.js', 'utf8'), css = fs.readFileSync('style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8'), i18n = fs.readFileSync('i18n.js', 'utf8');
const reps = fs.readFileSync('reps.js', 'utf8'), plate = fs.readFileSync('plate.js', 'utf8');
for (const k of [
  "LS.getItem('repcam.calmUI') !== 'off'",
  "LS.getItem('repcam.skel') === 'on'",
  'function applyCalm()',
  "classList.toggle('calmUI'",
  "classList.toggle('skelOn'",
  "classList.add('afterSet')",
  "classList.remove('confirming')",
  "classList.remove('afterSet')",
  "classList.toggle('panelOpen')",
  "APP_VERSION = '8.52'"
]) assert(app.includes(k), 'missing ' + k);
assert(/html\.calmUI #reps/.test(css) && css.includes('html.calmUI:not(.skelOn) #stage canvas') && css.includes('html.calmUI body.afterSet #log') && css.includes('html.calmUI #panelBtn') && css.includes('Kill switch: localStorage repcam.calmUI=off'));
assert(html.includes('id="skelBtn"') && html.includes('id="panelBtn"') && html.includes('id="calmSeg"') && html.includes('class="exTime"') && html.includes('?v=8.52') && !html.includes('?v=8.51'));
for (const k of ['prof.calmUI', 'prof.calmNote', 'prof.calmOn', 'prof.calmOff', 'w.setsPanel', 'w.skel']) {
  assert.strictEqual((i18n.match(new RegExp("'" + k.replace('.', '\\.') + "'", 'g')) || []).length, 7, k + ' should exist in 7 languages');
}
// counting logic untouched in this branch
assert(!reps.includes('calmUI') && !plate.includes('calmUI'), 'calmUI must not appear in counting files');
assert(!app.includes('CUT_SAVE_CFG.mode = ') || app.includes("localStorage.getItem('repcam.splitSets')"), 'app.js still only gates splitSets via kill switch, not a layout change');
console.log('ok  v8.52 calm UI');
