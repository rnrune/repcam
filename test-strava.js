// Unit tests: Strava activity matching (overlap, timezone, late sync, multiple candidates) + client against a mocked API.
const S = require('./strava.js'), assert = require('assert');
const sess = { start: '2026-10-24T16:00:00Z', end: '2026-10-24T16:50:00Z' };
const act = (id, start, min, type = 'WeightTraining', extra = {}) => ({ id, start_date: start, elapsed_time: min * 60, sport_type: type, type, ...extra });
// overlap
assert.equal(S.pickActivity([act(1, '2026-10-24T15:58:00Z', 55)], sess).activity.id, 1);
// no overlap & beyond tolerance → never chosen
assert.equal(S.pickActivity([act(2, '2026-10-24T14:00:00Z', 60)], sess), null);
assert.equal(S.pickActivity([act(3, '2026-10-24T17:10:00Z', 30)], sess), null);
// small gap within 15 min tolerance (watch started just after phone stopped)
assert.equal(S.pickActivity([act(4, '2026-10-24T16:58:00Z', 20)], sess).activity.id, 4);
// timezone: Oslo (UTC+2) watch activity; start_date_local wrongly labelled Z must be ignored
const tz = act(5, '2026-10-24T16:01:00Z', 50, 'WeightTraining', { start_date_local: '2026-10-24T18:01:00Z', timezone: '(GMT+01:00) Europe/Oslo' });
const decoy = act(6, '2026-10-24T18:00:00Z', 50, 'WeightTraining', { start_date_local: '2026-10-24T20:00:00Z' });
assert.equal(S.pickActivity([decoy, tz], sess).activity.id, 5);
// session times given with offset are equivalent
assert.equal(S.pickActivity([tz], { start: '2026-10-24T18:00:00+02:00', end: '2026-10-24T18:50:00+02:00' }).activity.id, 5);
// multiple candidates: prefer WeightTraining over a run with more overlap; among same type, more overlap wins
const walk = act(7, '2026-10-24T15:30:00Z', 120, 'Walk'), wt = act(8, '2026-10-24T16:20:00Z', 20), wt2 = act(9, '2026-10-24T16:02:00Z', 45);
assert.equal(S.pickActivity([walk, wt], sess).activity.id, 8);
assert.equal(S.pickActivity([walk, wt, wt2], sess).activity.id, 9);
assert.equal(S.pickActivity([walk], sess).activity.id, 7); // only overlapping one, still allowed
assert.equal(S.pickActivity([], sess), null);
// query window covers activities that started up to 12 h before, until end+15 min
const w = S.queryWindow(sess); assert(w.after * 1000 <= Date.parse(sess.start) - 12 * 3600e3 + 1000 && w.before * 1000 >= Date.parse(sess.end) + 15 * 60e3);
// description merge is idempotent and keeps user text
const blk = S.describe([{ exercise: 'knebøy', reps: 8, kg: 80 }, { exercise: 'pullups', reps: 6, kg: 0 }], x => x === 'knebøy' ? 'Knebøy' : 'Pull-ups');
assert(blk.includes('Knebøy: 8 × 80 kg') && blk.includes('Pull-ups: 6 × BW') && blk.includes('640 kg'));
const once = S.mergeDescription('Fin økt', blk); assert.equal(S.mergeDescription(once, blk), once); assert(once.startsWith('Fin økt\n\n'));

// ---- client with mocked Strava + worker
function mem() { const m = {}; return { getItem: k => k in m ? m[k] : null, setItem: (k, v) => m[k] = String(v), removeItem: k => delete m[k], m }; }
function mock(acts, up = {}) {
  const calls = [];
  const f = async (url, o = {}) => {
    calls.push({ url, method: o.method || 'GET', body: o.body, auth: o.headers && o.headers.Authorization, ctype: o.headers && o.headers['Content-Type'] });
    if (url.endsWith('/uploads') && o.method === 'POST') {
      if (up.reject) return { ok: false, status: 400, json: async () => ({ error: 'data_type json not supported' }) };
      if (up.netFail) throw new Error('network down');
      const file = JSON.parse(await o.body.get('file').text()); calls[calls.length - 1].file = file; calls[calls.length - 1].form = Object.fromEntries([...o.body.entries()].filter(([k]) => k !== 'file'));
      return { ok: true, status: 201, json: async () => ({ id: 77, id_str: '77', error: null, status: 'Your activity is still being processed.', activity_id: null }) };
    }
    if (/\/uploads\/77$/.test(url)) { up.polls = (up.polls || 0) + 1; return { ok: true, status: 200, json: async () => up.dup ? { id: 77, error: 'x.json duplicate of activity 4242', status: 'There was an error processing your activity.', activity_id: null }
      : up.polls < 2 ? { id: 77, error: null, status: 'Your activity is still being processed.', activity_id: null } : { id: 77, error: null, status: 'Your activity is ready.', activity_id: 1001 } }; }
    const j = x => ({ ok: true, status: 200, json: async () => x });
    if (url.endsWith('/token')) return j({ access_token: 'A1', refresh_token: 'R1', expires_at: 2e9, athlete: { firstname: 'Rune' } });
    if (url.endsWith('/refresh')) return j({ access_token: 'A2', refresh_token: 'R2', expires_at: 2e9 });
    if (url.includes('/athlete/activities')) { const u = new URL(url), a = +u.searchParams.get('after'), b = +u.searchParams.get('before'); return j(acts().filter(x => Date.parse(x.start_date) / 1000 > a && Date.parse(x.start_date) / 1000 < b)); }
    const m = url.match(/\/activities\/(\d+)$/);
    if (m && (o.method || 'GET') === 'GET') return j({ ...acts().find(x => x.id == m[1]), description: 'Old note' });
    if (m && o.method === 'PUT') return j({ id: +m[1] });
    if (url.endsWith('/activities') && o.method === 'POST') return j({ id: 999 });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { f, calls };
}
(async () => {
  let list = [];
  const ls = mem(), M = mock(() => list); let t = Date.parse('2026-10-24T16:51:00Z');
  const c = S.createClient({ ls, fetch: M.f, config: { clientId: '123', workerUrl: 'https://w.example/' }, now: () => t });
  assert(c.configured() && !c.connected());
  const u = new URL(c.authUrl('https://rnrune.github.io/repcam/'));
  assert.equal(u.searchParams.get('scope'), 'activity:read_all,activity:write'); assert.equal(u.searchParams.get('redirect_uri'), 'https://rnrune.github.io/repcam/');
  assert.equal(await c.handleRedirect('?state=bad&code=x&scope=read,activity:write,activity:read_all'), false);
  await assert.rejects(c.handleRedirect(`?state=${u.searchParams.get('state')}&code=x&scope=read`)); // user unticked write
  c.authUrl('x'); const st = ls.getItem(S.KEYS.state);
  assert.equal(await c.handleRedirect(`?state=${st}&code=x&scope=read,activity:write,activity:read_all`), true);
  assert(c.connected()); assert.equal(c.athlete(), 'Rune');
  const s = { id: 's-1', ...sess, sets: [{ exercise: 'knebøy', reps: 8, kg: 80 }] };
  c.enqueue(s);
  // late sync: nothing on Strava yet → stays waiting, no writes
  let r = await c.process(); assert.equal(r[0].status, 'waiting'); assert(!M.calls.some(x => x.method === 'PUT'));
  // watch syncs 3 h later with an unrelated run before and the real workout
  t += 3 * 3600e3;
  list = [act(50, '2026-10-24T13:00:00Z', 40, 'Run'), act(51, '2026-10-24T15:59:00Z', 53)];
  r = await c.process({ name: x => 'Knebøy' }); assert.equal(r[0].status, 'synced'); assert.equal(r[0].activityId, 51);
  const put = M.calls.find(x => x.method === 'PUT');
  assert(put.url.endsWith('/activities/51') && JSON.parse(put.body).description.startsWith('Old note\n\n— Newrun Lift —') && put.auth === 'Bearer A1');
  assert(!M.calls.some(x => x.method === 'PUT' && x.url.endsWith('/50')));
  assert.equal((await c.process()).length, 0); // nothing waiting
  // token refresh when expired
  ls.setItem(S.KEYS.tok, JSON.stringify({ access_token: 'old', refresh_token: 'R1', expires_at: 1 }));
  assert.equal(await c.token(), 'A2');
  // ---- v8.1 auto-create: nothing matches → wait; 1 h after the session ended → create via structured JSON upload
  const nop = async () => {};
  const uploads = () => M.calls.filter(x => x.method === 'POST' && x.url.endsWith('/uploads'));
  assert(!uploads().length, 'a matched session never creates an activity');
  list = [act(60, '2026-10-20T10:00:00Z', 30, 'Run')];
  const c5 = S.createClient({ ls, fetch: M.f, config: { clientId: '123', workerUrl: 'https://w.example/' }, now: () => t, sleep: nop });
  c5.enqueue({ id: 's-2', start: '2026-10-25T08:00:00Z', end: '2026-10-25T08:40:00Z', sets: [
    { exercise: 'knebøy', reps: 5, kg: 80, timestamp: '2026-10-25T08:05:00Z' }, { exercise: 'knebøy', reps: 5, kg: 85, timestamp: '2026-10-25T08:10:00Z' },
    { exercise: 'armhevinger', reps: 20, kg: 0 }, { exercise: 'situps', reps: 15, kg: 0 }, { exercise: 'dips', reps: 8, kg: 10 }] });
  t = Date.parse('2026-10-25T09:00:00Z'); assert.equal((await c5.process())[0].status, 'waiting'); // 20 min after end
  t = Date.parse('2026-10-25T09:39:00Z'); assert.equal((await c5.process())[0].status, 'waiting'); // 59 min
  assert(!uploads().length, 'no create before 1 h');
  t = Date.parse('2026-10-25T09:41:00Z'); r = await c5.process({ title: 'Styrke', name: x => x });
  assert.equal(r[0].status, 'created'); assert.equal(r[0].activityId, '1001'); assert.equal(uploads().length, 1);
  const U = uploads()[0];
  assert.equal(U.ctype, undefined, 'multipart: no JSON content-type on uploads');
  assert.equal(U.form.data_type, 'json'); assert.equal(U.form.sport_type, 'WeightTraining'); assert.equal(U.form.name, 'Styrke'); assert(U.form.description.startsWith('— Newrun Lift —'));
  assert.equal(U.form.external_id, 'newrunlift-s-2.json');
  assert.equal(U.file.version, '1.0'); assert.equal(U.file.start_time, '2026-10-25T08:00:00Z'); assert.equal(U.file.elapsed_time, 2400); assert(Number.isInteger(U.file.utc_offset));
  assert.deepEqual(U.file.sets, [
    { exercise_type: 'BARBELL_BACK_SQUAT', repetitions: 5, weight: 80, start_time: '2026-10-25T08:05:00Z' },
    { exercise_type: 'BARBELL_BACK_SQUAT', repetitions: 5, weight: 85, start_time: '2026-10-25T08:10:00Z' },
    { exercise_type: 'PUSH_UP_GENERIC', repetitions: 20 }, { exercise_type: 'SIT_UP_GENERIC', repetitions: 15 },
    { exercise_type: 'WEIGHTED_CHEST_DIP', repetitions: 8, weight: 10 }]);
  const it2 = c5.queue().find(x => x.id === 's-2'); assert.equal(it2.status, 'created'); assert.equal(it2.structured, true);
  // never a duplicate: further runs, the manual button, and re-enqueueing the same session are all no-ops
  t += 3600e3; assert.equal((await c5.process()).length, 0);
  const again = await c5.createManual('s-2'); assert(again.existing && again.status === 'created');
  c5.enqueue({ id: 's-2', start: '2026-10-25T08:00:00Z', end: '2026-10-25T08:40:00Z', sets: [{ exercise: 'dips', reps: 1, kg: 0 }] });
  assert.equal(c5.queue().find(x => x.id === 's-2').status, 'created'); assert.equal(uploads().length, 1);
  // a watch activity that appears within the hour wins: description written, nothing created
  c5.enqueue({ id: 's-3', start: '2026-10-26T08:00:00Z', end: '2026-10-26T08:40:00Z', sets: [{ exercise: 'roing', reps: 8, kg: 50 }] });
  t = Date.parse('2026-10-26T08:50:00Z'); assert.equal((await c5.process())[0].status, 'waiting');
  list = [act(70, '2026-10-26T07:58:00Z', 45)];
  t = Date.parse('2026-10-26T09:30:00Z'); assert.equal((await c5.process())[0].status, 'synced'); assert.equal(uploads().length, 1);
  // still processing after polling → 'creating'; next run finishes it from the stored upload id (no second upload)
  { const M2 = mock(() => [], { polls: -20 }), ls2 = mem(); ls2.setItem(S.KEYS.tok, JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_at: 2e9 }));
    let t2 = Date.parse('2026-10-25T10:00:00Z'); const cc = S.createClient({ ls: ls2, fetch: M2.f, config: { clientId: '1', workerUrl: 'https://w' }, now: () => t2, sleep: nop });
    cc.enqueue({ id: 'p', start: '2026-10-25T08:00:00Z', end: '2026-10-25T08:40:00Z', sets: [{ exercise: 'situps', reps: 20, kg: 0 }] });
    assert.equal((await cc.process())[0].status, 'creating');
    assert.equal((await cc.createManual('p')).existing, true, 'button is a no-op while a create is in flight');
    let k = 0; while (cc.queue()[0].status === 'creating' && k++ < 30) await cc.process();
    assert.equal(cc.queue()[0].status, 'created'); assert.equal(cc.queue()[0].activityId, '1001');
    assert.equal(M2.calls.filter(x => x.url.endsWith('/uploads') && x.method === 'POST').length, 1); }
  // Strava says duplicate (e.g. retried after an app crash) → adopt that activity, don't create again
  { const M3 = mock(() => [], { dup: true }), ls3 = mem(); ls3.setItem(S.KEYS.tok, JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_at: 2e9 }));
    const cc = S.createClient({ ls: ls3, fetch: M3.f, config: { clientId: '1', workerUrl: 'https://w' }, now: () => Date.parse('2026-10-25T10:00:00Z'), sleep: nop });
    cc.enqueue({ id: 'd', start: '2026-10-25T08:00:00Z', end: '2026-10-25T08:40:00Z', sets: [{ exercise: 'dips', reps: 8, kg: 0 }] });
    assert.equal((await cc.process())[0].activityId, '4242'); assert.equal(cc.queue()[0].status, 'created'); }
  // app killed after marking 'creating' (no upload id): the next run finds the activity it made (overlaps session) instead of re-creating
  { let acts3 = []; const M4 = mock(() => acts3), ls4 = mem(); ls4.setItem(S.KEYS.tok, JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_at: 2e9 }));
    let t4 = Date.parse('2026-10-25T10:00:00Z'); const cc = S.createClient({ ls: ls4, fetch: M4.f, config: { clientId: '1', workerUrl: 'https://w' }, now: () => t4, sleep: nop });
    cc.enqueue({ id: 'k', start: '2026-10-25T08:00:00Z', end: '2026-10-25T08:40:00Z', sets: [{ exercise: 'dips', reps: 8, kg: 0 }] });
    ls4.setItem(S.KEYS.q, JSON.stringify(cc.queue().map(x => ({ ...x, status: 'creating', creatingAt: t4 }))));
    acts3 = [act(555, '2026-10-25T08:00:00Z', 40)]; t4 += 15 * 60e3;
    assert.equal((await cc.process())[0].activityId, 555); assert.equal(M4.calls.filter(x => x.url.endsWith('/uploads')).length, 0); }
  // Strava rejects the JSON format → plain manual activity with the description block (old behaviour)
  { const M5 = mock(() => [], { reject: true }), ls5 = mem(); ls5.setItem(S.KEYS.tok, JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_at: 2e9 }));
    const cc = S.createClient({ ls: ls5, fetch: M5.f, config: { clientId: '1', workerUrl: 'https://w' }, now: () => Date.parse('2026-10-25T10:00:00Z'), sleep: nop });
    cc.enqueue({ id: 'f', start: '2026-10-25T08:00:00Z', end: '2026-10-25T08:40:00Z', sets: [{ exercise: 'dips', reps: 10, kg: 0 }] });
    const rr = await cc.process(); assert.equal(rr[0].status, 'created'); assert.equal(rr[0].activityId, '999'); assert.equal(rr[0].structured, false);
    const post = JSON.parse(M5.calls.find(x => x.method === 'POST' && x.url.endsWith('/activities')).body);
    assert.equal(post.sport_type, 'WeightTraining'); assert.equal(post.elapsed_time, 2400); assert(post.description.includes('dips: 10 × BW')); }
  // network down: retried (stays waiting) for 24 h, then 'nomatch' → the manual 'Opprett aktivitet' button
  { const up = { netFail: true }, M6 = mock(() => [], up), ls6 = mem(); ls6.setItem(S.KEYS.tok, JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_at: 2e9 }));
    let t6 = Date.parse('2026-10-25T09:00:00Z'); const cc = S.createClient({ ls: ls6, fetch: M6.f, config: { clientId: '1', workerUrl: 'https://w' }, now: () => t6, sleep: nop });
    cc.enqueue({ id: 'n', start: '2026-10-25T07:00:00Z', end: '2026-10-25T07:40:00Z', sets: [{ exercise: 'dips', reps: 10, kg: 0 }] });
    assert.equal((await cc.process())[0].status, 'error'); assert.equal(cc.queue()[0].status, 'waiting');
    t6 += 25 * 3600e3; assert.equal((await cc.process())[0].status, 'nomatch');
    up.netFail = false; const a = await cc.createManual('n'); assert.equal(a.id, '1001'); assert.equal(cc.queue()[0].status, 'created'); }
  // not connected → enqueue ignored
  const c2 = S.createClient({ ls: mem(), fetch: M.f, config: {} }); c2.enqueue(s); assert.equal(c2.queue().length, 0);
  // v6: web endpoint for home-screen apps, profile carried in state, redirect landing in another storage context still connects
  const c3 = S.createClient({ ls: mem(), fetch: M.f, config: { clientId: '1', workerUrl: 'https://w.example' } });
  const u3 = new URL(c3.authUrl('https://x/', { web: true, carry: { n: 'Rune Ø', b: 82.5 } }));
  assert.equal(u3.pathname, '/oauth/authorize'); assert(new URL(c3.authUrl('https://x/')).pathname.endsWith('/mobile/authorize'));
  assert.deepEqual(S.parseState('?state=' + u3.searchParams.get('state')), { n: 'Rune Ø', b: 82.5 });
  const c4 = S.createClient({ ls: mem(), fetch: M.f, config: { clientId: '1', workerUrl: 'https://w.example' } });
  assert.equal(await c4.handleRedirect(`?state=${u3.searchParams.get('state')}&code=x&scope=activity:write,activity:read_all`), true);
  assert(c4.connected());
  assert.equal(await c3.handleRedirect('?state=abcdef&code=x&scope=activity:write,activity:read_all'), false); // own state mismatch
  console.log('strava tests passed');
})().catch(e => { console.error(e); process.exit(1); });
{ const S = require('./strava.js'); const m = S.mergeDescription || (S._t && S._t.mergeDescription);
  if (m) { const assert = require('assert'); const r = m('Note\n\n— RepCam —\nKnebøy: 5 × 60 kg\nΣ 300 kg', '— Newrun Lift —\nX'); assert.strictEqual(r, 'Note\n\n— Newrun Lift —\nX'); console.log('legacy RepCam block replaced ok'); } else console.log('mergeDescription not exported; skipped legacy test'); }
