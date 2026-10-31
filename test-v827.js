// v8.27: full-rate landmark log — compact encoding round-trip, size, eval loader for old + new clips
const assert = require('assert'), fs = require('fs'), path = require('path'), F = require('./feedback.js'), run = require('./eval/real/run.js');
const d = run.load('mvmtfqlo8d46051c'), p = F.packLm(d.frames, { full: true }), u = F.unpackLm(p);
assert.strictEqual(u.length, d.frames.length);
for (let i = 0; i < u.length; i++) for (let j = 0; j < 100; j++) assert(Math.abs(u[i][j] - d.frames[i][j]) <= 0.00051, `err ${i},${j}`);
const bpf = JSON.stringify(p).length / p.n; assert(bpf < 240, 'bytes/frame ' + bpf);
assert.deepStrictEqual(F.unpackLm({ frames: d.frames }), d.frames); // old throttled
const nl = run.normLm({ w: d.w, h: d.h, landmarks: p }); assert(nl.full && nl.frames.length === d.frames.length);
const r0 = run.replay(d, 0), r1 = run.replay(nl, 0); assert.strictEqual(r1.reps, r0.reps); assert.strictEqual(r1.ex, r0.ex);
assert.strictEqual(F.LM_CFG.full, true); assert(F.LM_CFG.maxJson < 2 * 1024 * 1024, 'below Worker MAX_JSON');
console.log(`test-v827 ok (${bpf.toFixed(0)} B/frame → ${(bpf * 25 * 60 / 1024).toFixed(0)} KB/min @25 Hz)`);
