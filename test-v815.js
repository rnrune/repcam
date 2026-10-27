// v8.15: rest gate (shadow) unit tests
const assert = require('assert'), Rest = require('./rest.js'), R = require('./eval/real/run.js');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const body = (dx = 0) => { const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  lm[11] = { x: 0.45 + dx, y: 0.3, visibility: 0.9 }; lm[12] = { x: 0.55 + dx, y: 0.3, visibility: 0.9 }; lm[23] = { x: 0.46 + dx, y: 0.55, visibility: 0.9 }; lm[24] = { x: 0.54 + dx, y: 0.55, visibility: 0.9 }; return lm; };
let g = Rest.createRestGate(); g.rest(0);
for (let t = 0; t < 1900; t += 100) g.update(body(), t, 1); ok(g.state === 'rest', 'refractory period: no READY before refractMs');
for (let t = 2000; t < 3000; t += 100) g.update(body(), t, 1); ok(g.state === 'armed', 'still, visible, plausible distance → armed');
ok(g.verdict(3500) === 'would-allow' && g.verdict(1500) === 'would-suppress', 'verdict depends on READY before the first rep');
g = Rest.createRestGate(); g.rest(-1e9); for (let t = 0; t < 3000; t += 100) g.update(body((t / 100) % 2 ? 0.1 : 0), t, 1); ok(g.state === 'rest', 'moving body never arms');
g = Rest.createRestGate(); g.rest(-1e9); const near = body(); near[23].y = near[24].y = 0.98; near[11].y = near[12].y = 0.1; for (let t = 0; t < 3000; t += 100) g.update(near, t, 1); ok(g.state === 'rest', 'too close to the phone never arms');
g = Rest.createRestGate(); g.rest(-1e9); const hid = body(); for (const i of [25, 26, 15, 16]) hid[i].visibility = 0.1; for (let t = 0; t < 3000; t += 100) g.update(hid, t, 1); ok(g.state === 'rest', 'knees and wrists hidden never arms');
const e = R.man().find(x => x.id === 'mvr3gojt95bd64ea'), d = R.load(e.id), a = R.replay(d, 10), b = R.replay(d, 10, { rest: {} });
ok(a.reps === b.reps && a.ex === b.ex && b.restVerdicts.length === 1, 'shadow replay does not change the count');
console.log(n + ' v8.15 tests passed');
