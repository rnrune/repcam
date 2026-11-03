// v8.36: 3 Nov clips in the eval (angle field, tiers), declutter strings in every language, sticky re-bind on resume
const assert = require('assert'), fs = require('fs');
const m = require('./eval/real/manifest.json'), nov3 = m.filter(e => /^mw1/.test(e.id));
assert.strictEqual(nov3.length, 28); nov3.forEach(e => { assert.ok(e.angle && e.tier && e.tier !== 'new', e.id); assert.ok(fs.existsSync(`eval/real/${e.id}.lm.json`), e.id); });
const src = fs.readFileSync('i18n.js', 'utf8'); assert.strictEqual((src.match(/'w\.yesKeep'/g) || []).length, 7); assert.strictEqual((src.match(/'w\.noDel'/g) || []).length, 7);
const app = fs.readFileSync('app.js', 'utf8'); assert.ok(/fitRebind = true/.test(app) && /did = !!\(rebind && camLive\(\)/.test(app), 'sticky rebind');
assert.ok(/classList\.toggle\('confirming', focus\)/.test(app) && /classList\.remove\('confirming'\)/.test(app), 'declutter on/off');
console.log('test-v836 ok');
