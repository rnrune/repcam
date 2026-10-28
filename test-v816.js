// v8.16: bar tracker (shadow) unit tests — synthetic plate on a gray frame
const assert = require('assert'), Bar = require('./bar.js'), R = require('./eval/real/run.js');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const W = 160, H = 284, lmAt = (x, y) => Array.from({ length: 33 }, (_, i) => (i === 15 || i === 16 ? { x, y, visibility: 0.9 } : { x: 0.5, y: 0.5, visibility: 0.9 }));
function frame(cx, cy, r) { const g = new Uint8ClampedArray(W * H).fill(200); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y * W + x] = 30; return g; }
const d = Bar.detect(frame(50, 120, 18), W, H, { x0: 10, y0: 70, x1: 150, y1: 170 }, Bar.BAR_CFG);
ok(d && Math.abs(d.cx - 50) <= 2 && Math.abs(d.cy - 120) <= 2 && Math.abs(d.r - 18) <= 2, 'finds a dark plate circle');
// rhythmic squat: plate on the bar level with the hands, 6 reps
let tr = Bar.createBarTracker(); for (let k = 0; k < 6 * 15 + 10; k++) { const t = k / 5, y = 100 + 40 * (1 - Math.cos(2 * Math.PI * Math.max(0, t - 1) / 3)) / 2; tr.frame(t, frame(50, y, 18), W, H, lmAt(80 / W, y / H)); }
let s = tr.summary(0, 1e9, 6); ok(s.reps === 6 && s.agree && s.detFrac > 0.9, 'coupled rhythmic plate → 6 bar reps, ' + JSON.stringify(s));
// rigging: plate moves up and down but far below the hands (on the floor / carried at the side) → 0 reps
tr = Bar.createBarTracker(); for (let k = 0; k < 100; k++) { const t = k / 5, y = 200 + 40 * Math.sin(t * 2); tr.frame(t, frame(50, y, 18), W, H, lmAt(80 / W, 90 / H)); }
s = tr.summary(0, 1e9, 2); ok(s.reps === 0, 'uncoupled plate (not at the hands) never counts');
// bar static in the rack → staticSeen
tr = Bar.createBarTracker(); for (let k = 0; k < 30; k++) tr.frame(k / 5, frame(50, 100, 18), W, H, lmAt(80 / W, 100 / H)); ok(tr.summary(0, 1e9).staticSeen, 'still bar → staticSeen');
ok(Bar.createBarTracker({ enabled: false }).due(1) === false, 'kill switch: no frames processed');
const e = R.man().find(x => x.id === 'mvr3gojt95bd64ea'); ok(R.replay(R.load(e.id), 10).reps === 8, 'pose replay unchanged');
console.log(n + ' v8.16 tests passed');
