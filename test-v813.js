// v8.13 tests: edit a finished session (add set to a past session, Strava description rewrite for already-synced activities),
// V-situp exercise, short-set plausibility (rigging 'reps'), tiered real-clip benchmark (core must pass).
const S = require('./strava.js'), Store = require('./store.js'), R = require('./reps.js'), assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const sess = { start: '2026-10-24T16:00:00Z', end: '2026-10-24T16:50:00Z' };
const act = (id, start, min, type = 'WeightTraining', extra = {}) => ({ id, start_date: start, elapsed_time: min * 60, sport_type: type, type, ...extra });
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
  // ---- store.addSetTo: a set added to a finished session lands in that session, after its last set, with a unique id
  { const ls = mem(), st = Store.createStore(ls);
    st.addSet({ exercise: 'knebøy', reps: 8, kg: 100 }, new Date('2026-10-27T19:00:00Z')); st.addSet({ exercise: 'halvmark', reps: 9, kg: 100 }, new Date('2026-10-27T19:20:00Z'));
    const done = st.endSession(new Date('2026-10-27T20:00:00Z'));
    st.addSet({ exercise: 'curl', reps: 10, kg: 20 }, new Date('2026-10-28T19:00:00Z')); // another (active) session
    const rec = st.addSetTo(done.id, { exercise: 'vsitup', reps: 20, kg: 15 });
    ok(rec && rec.sessionId === done.id && Date.parse(rec.timestamp) > Date.parse('2026-10-27T19:20:00Z'), 'added to the finished session');
    const ses = st.sessions().find(x => x.id === done.id); ok(ses.sets.length === 3 && ses.sets[2].exercise === 'vsitup', 'session shows 3 sets');
    ok(st.addSetTo('nope', { reps: 1 }) === null, 'unknown session');
    ok(st.updateSet(rec.timestamp, { reps: 12 }).reps === 12 && st.deleteSet(rec.timestamp), 'added set editable + deletable');
    ok(Store.EX.some(e => e.id === 'vsitup' && e.name === 'V-situp'), 'V-situp in the exercise list'); }
  // ---- Strava: editing a session whose activity already exists rewrites the description block (deleted sets gone)
  { let list = [act(51, '2026-10-24T15:59:00Z', 53)]; const ls = mem(), M = mock(() => list); let t = Date.parse('2026-10-24T19:51:00Z');
    let live = [{ exercise: 'knebøy', reps: 8, kg: 80, timestamp: 'a' }, { exercise: 'situps', reps: 20, kg: 0, timestamp: 'b' }];
    const c = S.createClient({ ls, fetch: M.f, config: { clientId: '123', workerUrl: 'https://w.example/' }, now: () => t, liveSets: () => live });
    c.authUrl('x'); await c.handleRedirect(`?state=${ls.getItem(S.KEYS.state)}&code=x&scope=read,activity:write,activity:read_all`);
    c.enqueue({ id: 's-1', ...sess, sets: live }); let r = await c.process(); ok(r[0].status === 'synced', 'synced');
    live = [{ exercise: 'knebøy', reps: 8, kg: 80, timestamp: 'a' }, { exercise: 'vsitup', reps: 20, kg: 15, timestamp: 'c' }]; // situps deleted, V-situp added
    ok(c.update('s-1', live) === 'descUpdate', 'synced session marked for description update');
    const before = M.calls.filter(x => x.method === 'PUT').length; r = await c.process({ name: x => x === 'vsitup' ? 'V-situp' : x });
    const puts = M.calls.filter(x => x.method === 'PUT'); ok(puts.length === before + 1 && r.some(x => x.status === 'descUpdated'), 'one PUT');
    const d = JSON.parse(puts[puts.length - 1].body).description; ok(d.includes('V-situp') && !d.includes('situps: 20') && d.startsWith('Old note'), 'description rewritten, deleted set gone: ' + d);
    r = await c.process(); ok(!r.some(x => x.status === 'descUpdated'), 'not rewritten twice');
    ok(c.update('s-1', []) === 'onStrava', 'deleting every set of a synced session never deletes on Strava'); }
  // ---- engine: plausible short sets, V-situp recognized+counted in the synthetic tests (test.js), rigging reps dropped
  ok(R.plausibleSet([1, 3.5, 6, 9]) && !R.plausibleSet([7.2, 16.7, 18.6]) && !R.plausibleSet([87, 97.8, 99.3]) && R.plausibleSet([0, 1, 2, 3, 4, 5, 30]), 'plausibleSet');
  ok(R.IDS.includes('vsitup'), 'vsitup id');
  // ---- tiered real-clip benchmark: core must pass
  const run = require('child_process').spawnSync(process.execPath, [__dirname + '/eval/real/run.js', '--tier', 'core'], { encoding: 'utf8' });
  ok(run.status === 0, 'eval/real core tier passes:\n' + run.stdout.slice(-400));
  console.log(n + ' v8.13 tests passed');
})().catch(e => { console.error(e); process.exit(1); });
