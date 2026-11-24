// v8.52d: camera reminder asks again after dismiss/timeout (camAsked no longer a one-shot),
// and previous-session kg is a suggestion that needs confirmation — not silent reuse.
// Kill switches: localStorage repcam.camAsk / repcam.kgSuggest = off | shadow | on (default on).
const assert = require('assert'), fs = require('fs');
const app = fs.readFileSync('./app.js', 'utf8'), html = fs.readFileSync('./index.html', 'utf8');
const V = /APP_VERSION = '([\d.]+)'/.exec(app)[1];
assert(+V >= 8.52 && html.includes('app.js?v=' + V));
assert(html.includes('id="kgAsk"'));
assert(app.includes("localStorage.getItem('repcam.kgSuggest')"));
assert(app.includes('CAM_ASK_CFG') && app.includes('function camAskReady') && app.includes("hideCamAsk('timeout')") && app.includes("hideCamAsk('dismiss')"));
assert(app.includes('function kgDecision') && app.includes('function maybeAskKg'));
assert(app.includes("camAsked: true")); // still set when the user actually picks a position
const i18n = fs.readFileSync('./i18n.js', 'utf8');
assert.strictEqual((i18n.match(/'kg\.ask'/g) || []).length, 7);

eval(app.match(/function camAskReady\(a, now, cfg\) \{[\s\S]*?\n\}/)[0]);
const cfg = { mode: 'on', timeoutMs: 25000, retryMs: 45000, maxAsks: 3 };
assert.strictEqual(camAskReady({ camera: { dir: 'front' } }, 1000, cfg), false);
assert.strictEqual(camAskReady(null, 1000, cfg), false);
assert.strictEqual(camAskReady({}, 1000, { ...cfg, mode: 'off' }), false);
assert.strictEqual(camAskReady({ camAsked: true }, 1000, { ...cfg, mode: 'shadow' }), false, 'shadow still one-shot');
assert.strictEqual(camAskReady({}, 1000, { ...cfg, mode: 'shadow' }), true);
assert.strictEqual(camAskReady({ camAsked: true }, 1000, cfg), true, 'on mode retries even if camAsked was set');
assert.strictEqual(camAskReady({ camAskCount: 3 }, 1000, cfg), false);
assert.strictEqual(camAskReady({ camAskCount: 1, camAskHiddenAt: 1000 }, 20000, cfg), false, 'wait for retryMs');
assert.strictEqual(camAskReady({ camAskCount: 1, camAskHiddenAt: 1000 }, 1000 + 45000, cfg), true);
assert.strictEqual(camAskReady({ camera: { dir: 'rear' }, camAskCount: 1, camAskHiddenAt: 1000 }, 1000 + 45000, cfg), false);

eval(app.match(/function kgDecision\(st\) \{[\s\S]*?\n\}/)[0]);
assert.deepStrictEqual(kgDecision({ mode: 'off', sessionKg: null, lsKg: 90, prevKg: 80, defaultKg: 20 }), { kg: 90, suggest: null });
assert.deepStrictEqual(kgDecision({ mode: 'shadow', sessionKg: null, lsKg: null, prevKg: 80, defaultKg: 20 }), { kg: 80, suggest: null });
assert.deepStrictEqual(kgDecision({ mode: 'on', sessionKg: null, lsKg: 90, prevKg: 80, defaultKg: 20 }), { kg: 20, suggest: 90 });
assert.deepStrictEqual(kgDecision({ mode: 'on', sessionKg: 50, lsKg: 90, prevKg: 80, defaultKg: 20 }), { kg: 50, suggest: null });
assert.deepStrictEqual(kgDecision({ mode: 'on', sessionKg: null, lsKg: null, prevKg: null, defaultKg: 20 }), { kg: 20, suggest: null });
assert.deepStrictEqual(kgDecision({ mode: 'on', sessionKg: null, lsKg: 20, prevKg: 20, defaultKg: 20 }), { kg: 20, suggest: null });

const S = require('./store.js');
function mem() { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
const u = S.createStore(mem());
u.addSet({ exercise: 'curl', reps: 10, kg: 40 }, new Date('2026-11-20T18:00:00Z'));
u.startSession(new Date('2026-11-24T20:00:00Z'));
assert.strictEqual(u.lastKg('curl'), 40);
assert.strictEqual(u.lastKg('curl', '2026-11-24T20:00:00Z'), 40);
u.addSet({ exercise: 'curl', reps: 10, kg: 42.5 }, new Date('2026-11-24T20:10:00Z'));
assert.strictEqual(u.lastKg('curl'), 42.5);
assert.strictEqual(u.lastKg('curl', '2026-11-24T20:00:00Z'), 40);

console.log('test-v852d OK');
