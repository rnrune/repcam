// v8.37: 100 kg bench labels from Rune's chat, review queue (landmarks only), camera question, video re-create on resume
const assert = require('assert'), fs = require('fs');
const m = require('./eval/real/manifest.json'), g = id => m.find(e => e.id === id);
assert.strictEqual(g('mw13tq5t8d0c3da8').gt, 7); assert.strictEqual(g('mw13wreb9393d836').gt, 6); // Rune review 3 Nov 22:14 assert.strictEqual(g('mw13zsy66f202548').gt, 6); assert.strictEqual(g('mw142hvr1fc313d7').gt, 6);
assert.ok(!m.some(e => /^mw1/.test(e.id) && e.tier === 'excluded' && !['mw142hvr1fc313d7','mw1485t26916920b'].includes(e.id)));
const rv = JSON.parse(fs.readFileSync('review-own.json', 'utf8')); assert.ok(Array.isArray(rv)); // queue emptied 4 Nov (Rune answered all)
rv.forEach(x => { assert.ok(x.frames.length > 100 && !x.url, x.id); }); // stick figure from landmarks, no video URL
const app = fs.readFileSync('app.js', 'utf8'); assert.ok(/function maybeAskCam/.test(app) && /camAsked: true/.test(app) && /repcam\.camAsk/.test(app));
assert.ok(/function newVideo/.test(app) && /repcam\.vidRecreate/.test(app) && /fitDiag: fb\.fitDiag/.test(app));
const i = fs.readFileSync('i18n.js', 'utf8'); assert.strictEqual((i.match(/'cam\.ask'/g) || []).length, 7);
console.log('test-v837 ok');
