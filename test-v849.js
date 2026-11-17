// v8.49: (1) landscape layout (style.css html.landUI, kill switch repcam.landUI=off); (2) storage check at workout start / after each
// clip (STORE_CFG.warnFreeMB, repcam.storeWarn = off|shadow|on) + «Lite lagringsplass – klipp lagres ikke» on a failed save;
// (3) meta.power.dupMode no longer overwrites the duplicate count. Browser proof: scratch store-browser.js / land.js (see results-v8.49.md).
const assert = require('assert'), fs = require('fs');
const app = fs.readFileSync('./app.js', 'utf8'), css = fs.readFileSync('./style.css', 'utf8'), html = fs.readFileSync('./index.html', 'utf8'), i18n = fs.readFileSync('./i18n.js', 'utf8');
const V = /APP_VERSION = '([\d.]+)'/.exec(app)[1]; assert(+V >= 8.49 && html.includes('app.js?v=' + V) && html.includes('style.css?v=' + V));
for (const k of ["LS.getItem('repcam.landUI') !== 'off'", "kv('repcam.storeWarn', 'on')", 'warnFreeMB: 500', "storeCheck('start')", "storeCheck('clip')", "storeCheck('addFailed')", "'storage' : 'addFailed'", "L.t('w.storeFull')", "L.t('w.storeLow'", 'storage: fb.storage || null', 'dupMode: POWER_CFG.dup.mode']) assert(app.includes(k), 'missing ' + k);
assert(!/idle: POWER_CFG\.idle\.mode, dup: POWER_CFG/.test(app), 'dup count overwritten');
assert(/@media \(orientation: landscape\) and \(max-height: 500px\)/.test(css) && css.includes('html.landUI .wcard') && css.includes('html.landUI #ringwrap'));
assert.strictEqual((i18n.match(/'w\.storeFull'/g) || []).length, 7); assert.strictEqual((i18n.match(/'w\.storeLow'/g) || []).length, 7);
assert(i18n.includes("'w.storeFull': '⚠ Lite lagringsplass – klipp lagres ikke'"));
// (4) full camera frame (html.fullFrame: object-fit contain on video + pose canvas, same box → overlay aligned), kill switch repcam.fullFrame=off
assert(app.includes("LS.getItem('repcam.fullFrame') !== 'off'") && /html\.fullFrame #stage video,html\.fullFrame #stage canvas\{object-fit:contain\}/.test(css));
// (5) «Husk dette nettverket» shown whenever wifi-only is on + unknown untrusted network (repcam.netRemember=off), and the net line
// no longer says «sender ikke automatisk» when «alle nett» is on (repcam.netLine=off)
assert(app.includes("LS.getItem('repcam.netRemember') !== 'off' && fbWifiOnly() && ty === 'unknown' && !ns.trusted") && app.includes('fbOfferRemember || remNow'));
assert(app.includes("!fbWifiOnly() && LS.getItem('repcam.netLine') !== 'off' ? L.t('fb.netAnyOn')")); assert.strictEqual((i18n.match(/"fb\.netAnyOn"/g) || []).length, 7);
const L = require('./i18n.js'); assert(L);
console.log('test-v849 OK');
