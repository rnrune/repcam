// v8.30: per-clip poseRate (mean step of the logged frames) + upload context (manual/auto, network) stamped into meta at send time
const assert = require('assert'), F = require('./feedback.js'), run = require('./eval/real/run.js');
const d = run.load('mvw6fsc9ea28c668'), r = F.clipRate(d.frames);
assert.strictEqual(r.n, 1610); assert(Math.abs(r.hz - 39.9) < 0.2, 'hz ' + r.hz); assert(r.meanMs > r.medMs, 'mean step > median');
assert.strictEqual(F.clipRate([]), null); assert.strictEqual(F.clipRate([[1], [1]]), null);
(async () => {
  const m = new Map(), kv = { all: async () => [...m.values()], get: async id => m.get(id), put: async x => { m.set(x.id, x); }, del: async id => m.delete(id) }, sent = [];
  const q = F.createQueue({ kv, send: async (k, id, body) => { sent.push([k, body]); } });
  await q.add({ id: 'a', setTs: 1, blob: { size: 1 }, mime: 'video/mp4', meta: { id: 'a' }, label: {} });
  await q.process({ force: true, upload: { mode: 'manual', net: 'unknown', trusted: false } });
  const meta = JSON.parse(sent.find(x => x[0] === 'meta')[1]); assert.deepStrictEqual(meta.upload, { mode: 'manual', net: 'unknown', trusted: false }); assert.strictEqual(meta.id, 'a');
  assert.strictEqual(m.get('a').meta.upload, undefined, 'stored meta untouched');
  console.log(`test-v830 ok (clip ${r.hz} Hz, mean ${r.meanMs} ms, med ${r.medMs} ms)`);
})().catch(e => { console.error(e); process.exit(1); });
