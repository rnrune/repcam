// v8.37: 100 kg bench labels from Rune's chat, review queue (landmarks only), camera question, video re-create on resume
const assert = require('assert'), fs = require('fs');
const m = require('./eval/real/manifest.json'), g = id => m.find(e => e.id === id);
assert.strictEqual(g('mw13tq5t8d0c3da8').gt, 7); assert.strictEqual(g('mw13wreb9393d836').gt, 6); // Rune review 3 Nov 22:14 assert.strictEqual(g('mw13zsy66f202548').gt, 6); assert.strictEqual(g('mw142hvr1fc313d7').gt, 6);
assert.ok(!m.some(e => /^mw1/.test(e.id) && e.tier === 'excluded' && e.id !== 'mw142hvr1fc313d7'));
const rv = JSON.parse(fs.readFileSync('review-own.json', 'utf8')); assert.deepStrictEqual(rv.map(x => x.id).sort(), ['mw13wreb9393d836', 'mw14lzxg33d67550', 'mw14ui9f1618f5a7', 'mw14xc8z0fbee6b9']);
rv.forEach(x => { assert.ok(x.frames.length > 100 && !x.url, x.id); }); // stick figure from landmarks, no video URL
const app = fs.readFileSync('app.js', 'utf8'); assert.ok(/function maybeAskCam/.test(app) && /camAsked: true/.test(app) && /repcam\.camAsk/.test(app));
assert.ok(/function newVideo/.test(app) && /repcam\.vidRecreate/.test(app) && /fitDiag: fb\.fitDiag/.test(app));
const i = fs.readFileSync('i18n.js', 'utf8'); assert.strictEqual((i.match(/'cam\.ask'/g) || []).length, 7);
console.log('test-v837 ok');
