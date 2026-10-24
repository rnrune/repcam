// Unit tests for feedback.js: mime pick, labels from corrections, upload queue (retry/backoff, label-after-upload, races, clear).
const F = require('./feedback.js'), assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
ok(F.pickMime(m => m === 'video/mp4') === 'video/mp4', 'iOS: plain mp4');
ok(F.pickMime(m => m.startsWith('video/webm')) === 'video/webm;codecs=vp9', 'chrome: webm');
ok(F.pickMime(() => false) === '', 'none');
ok(F.rid(16, b => b.fill(171)).length === 32);
const pred = { exercise: 'knebøy', reps: 8, kg: 60 };
ok(F.labelFrom(pred, 'implicit').kind === 'implicit');
ok(F.labelFrom(pred, 'edit', { reps: 8, kg: 60, exercise: 'knebøy' }).kind === 'confirmed');
const c = F.labelFrom(pred, 'edit', { reps: 7, kg: 60, exercise: 'bulgarsk' });
ok(c.kind === 'corrected' && c.reps === 7 && c.exercise === 'bulgarsk' && c.changed.join() === 'exercise,reps');
ok(F.labelFrom(pred, 'delete').notASet && F.labelFrom(pred, 'delete').reps === 0);
ok(F.labelFrom(pred, 'missed').missed);
function memKV() { const m = new Map(), cl = x => x && JSON.parse(JSON.stringify({ ...x, blob: undefined })) && { ...JSON.parse(JSON.stringify({ ...x, blob: null })), blob: x.blob };
  return { m, all: async () => [...m.values()].map(cl), get: async id => cl(m.get(id)), put: async r => { m.set(r.id, cl(r)); }, del: async id => { m.delete(id); } }; }
(async () => {
  const kv = memKV(), sent = []; let fail = 0, t = 1000;
  const q = F.createQueue({ kv, now: () => t, send: async (k, id, body) => { if (fail) { fail--; throw Object.assign(new Error('x'), { status: 503 }); } sent.push([k, id, typeof body === 'string' ? JSON.parse(body) : body]); } });
  await q.add({ id: 'aaaaaa1', setTs: 'T1', blob: { size: 10 }, mime: 'video/mp4', meta: { pred }, label: F.labelFrom(pred, 'implicit'), created: 1 });
  ok((await q.stats()).pending === 1);
  fail = 1; let r = await q.process(); ok(r.fail === 1 && sent.length === 0, 'fails once');
  r = await q.process(); ok(r.ok === 0, 'backoff respected');
  t += 60e3; r = await q.process(); ok(r.ok === 1 && sent.map(s => s[0]).join() === 'clip,meta,label', 'uploads clip, meta, label');
  ok((await q.stats()).uploaded === 1 && (await q.stats()).pending === 0 && kv.m.get('aaaaaa1').blob === null, 'blob dropped after upload');
  await q.label('T1', F.labelFrom(pred, 'edit', { reps: 6 })); ok((await q.stats()).pending === 1, 'label edit after upload → pending');
  await q.process(); const last = sent[sent.length - 1]; ok(last[0] === 'label' && last[2].reps === 6 && last[2].setTs === 'T1', 'corrected label PUT');
  // race: label changes while clip is uploading → new label must survive
  const kv2 = memKV(); let q2; const s2 = [];
  q2 = F.createQueue({ kv: kv2, send: async (k, id, b) => { if (k === 'clip') await q2.label('T2', F.labelFrom(pred, 'delete')); s2.push([k, b]); } });
  await q2.add({ id: 'bbbbbb2', setTs: 'T2', blob: { size: 5 }, mime: 'video/mp4', meta: {}, label: F.labelFrom(pred, 'implicit') });
  await q2.process(); ok(JSON.parse(s2[2][1]).notASet === true, 'race: undo during upload kept');
  ok(!(await kv2.get('bbbbbb2')).labelDirty);
  await q2.add({ id: 'cccccc3', setTs: 'T3', blob: { size: 5 }, mime: 'video/mp4', meta: {}, label: {} });
  ok(await q2.clearPending() === 1 && (await q2.stats()).uploaded === 1, 'clear pending keeps uploaded');
  ok(await q2.labelLatest({ missed: true }) && (await kv2.get('bbbbbb2')).label.missed);
  // v8.6 regression: clips enqueued while an upload loop runs must be uploaded by that loop, not skipped
  const kv3 = memKV(), s3 = []; let q3, gate;
  q3 = F.createQueue({ kv: kv3, send: async (k, id) => { if (k === 'clip' && id === 'd1') { await q3.add({ id: 'd2', setTs: 'D2', blob: { size: 1 }, mime: 'video/mp4', meta: {}, label: {} }); await new Promise(r => gate = r); } s3.push(k + ':' + id); } });
  await q3.add({ id: 'd1', setTs: 'D1', blob: { size: 1 }, mime: 'video/mp4', meta: {}, label: {} });
  const p1 = q3.process(); await new Promise(r => setTimeout(r, 5));
  const p2 = q3.process(); ok(p2 === p1, 'concurrent process joins running loop');
  await q3.add({ id: 'd3', setTs: 'D3', blob: { size: 1 }, mime: 'video/mp4', meta: {}, label: {} }); q3.process();
  gate(); const r3 = await p1;
  ok(r3.ok === 3 && (await q3.stats()).pending === 0, 'all clips enqueued mid-upload are uploaded: ' + JSON.stringify(r3) + ' ' + s3);
  ok(['d1', 'd2', 'd3'].every(id => s3.includes('clip:' + id) && s3.includes('label:' + id)), 'clip+label for each');
  // reload: a fresh queue over the same store drains what a killed/backgrounded page left behind (incl. backoff with force)
  const kv4 = memKV(); let t4 = 0; const s4 = [];
  const qa = F.createQueue({ kv: kv4, now: () => t4, send: async () => { throw Object.assign(new Error('x'), { status: 0 }); } });
  await qa.add({ id: 'e1', setTs: 'E1', blob: { size: 1 }, mime: 'video/mp4', meta: {}, label: {} }); await qa.add({ id: 'e2', setTs: 'E2', blob: { size: 1 }, mime: 'video/mp4', meta: {}, label: {} });
  ok((await qa.process()).fail === 2 && (await qa.nextDue()) > 0, 'nextDue reports backoff');
  const qb = F.createQueue({ kv: kv4, now: () => t4, send: async (k, id) => { s4.push(k + id); } });
  ok((await qb.process()).ok === 0, 'backoff respected after reload');
  ok((await qb.process({ force: true })).ok === 2 && (await qb.stats()).pending === 0 && (await qb.nextDue()) === null, 'forced drain after reload uploads all');
  console.log('feedback tests OK', n);
})().catch(e => { console.error(e); process.exit(1); });
