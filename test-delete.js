// v8.3 unit tests: deleted sets never reach Strava; empty sessions never sync/auto-create; deleting a session cancels its queue item.
const S = require('./strava.js'), St = require('./store.js'), assert = require('assert');
function mem() { const m = {}; return { getItem: k => k in m ? m[k] : null, setItem: (k, v) => m[k] = String(v), removeItem: k => delete m[k], m }; }
const calls = [];
const f = async (url, o = {}) => { calls.push({ url, method: o.method || 'GET', body: o.body });
  const j = x => ({ ok: true, status: 200, json: async () => x });
  if (url.includes('/athlete/activities')) return j(acts);
  if (/\/activities\/\d+$/.test(url)) return j({ id: 51, description: '' });
  if (url.endsWith('/uploads')) return { ok: true, status: 201, json: async () => ({ id: 7, id_str: '7', activity_id: 1001 }) };
  return j({}); };
let acts = [], t = Date.parse('2026-10-24T18:00:00Z');
const cfg = { clientId: '1', workerUrl: 'https://w/' }, ups = () => calls.filter(x => x.url.endsWith('/uploads')), puts = () => calls.filter(x => x.method === 'PUT');
(async () => {
  const ls = mem(); ls.setItem(S.KEYS.tok, JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_at: 2e9 }));
  const store = St.createStore(ls), live = id => store.sets().filter(s => s.sessionId === id);
  const c = S.createClient({ ls, fetch: f, config: cfg, liveSets: live, now: () => t, sleep: async () => {} });
  const mk = (h) => { const d = new Date(`2026-10-24T${h}:00:00Z`); store.addSet({ reps: 8, kg: 80 }, d); store.addSet({ reps: 6, kg: 90 }, new Date(+d + 3e5)); return store.endSession(new Date(+d + 6e5)); };
  // 1) Rune's bug: session queued at end, then all sets deleted in Historikk → 1 h fallback must NOT create an activity
  let s1 = mk('15'); c.enqueue({ ...s1, sets: live(s1.id) }); assert.equal(c.queue().length, 1);
  for (const x of live(s1.id)) store.deleteSet(x.timestamp);   // app without the resync hook (old path): process() must still re-check
  let r = await c.process(); assert.equal(ups().length, 0, 'no auto-create for a session with zero sets'); assert.equal(c.queue().length, 0, 'cancelled');
  // 2) one of two sets deleted → only the remaining set is sent (matched watch activity)
  let s2 = mk('16'); c.enqueue({ ...s2, sets: live(s2.id) }); store.deleteSet(live(s2.id)[0].timestamp); c.update(s2.id, live(s2.id));
  assert.equal(c.queue()[0].sets.length, 1);
  acts = [{ id: 51, start_date: '2026-10-24T16:00:00Z', elapsed_time: 900, sport_type: 'WeightTraining' }];
  r = await c.process({ name: x => x }); assert.equal(r[0].status, 'synced');
  const d = JSON.parse(puts()[0].body).description; assert(d.includes('6 × 90') && !d.includes('8 × 80'), 'deleted set not in description');
  // 3) auto-create uses current sets only
  acts = []; let s3 = mk('12'); c.enqueue({ ...s3, sets: live(s3.id) }); store.deleteSet(live(s3.id)[1].timestamp);
  r = await c.process({}); assert.equal(r.find(x => x.id === s3.id).status, 'created');
  const file = JSON.parse(await ups()[0].body.get('file').text()); assert.equal(file.sets.length, 1); assert.equal(file.sets[0].repetitions, 8);
  // 4) delete whole session while queued → cancelled, no request; already on Strava → reported, queue kept, Strava untouched
  let s4 = mk('10'); c.enqueue({ ...s4, sets: live(s4.id) }); const n0 = calls.length;
  assert.equal(store.deleteSession(s4.id), 2); assert.equal(c.cancel(s4.id), 'cancelled'); assert(!c.queue().some(x => x.id === s4.id));
  assert.equal(calls.length, n0); assert(!store.sessions().some(x => x.id === s4.id) && !store.meta().some(x => x.id === s4.id));
  assert.equal(c.cancel(s2.id), 'onStrava'); assert(!calls.some(x => x.method === 'DELETE'));
  // 5) enqueue of an empty session and createManual on an emptied session never create
  c.enqueue({ id: 'e', start: 'x', end: 'y', sets: [] }); assert(!c.queue().some(x => x.id === 'e'));
  let s5 = mk('09'); c.enqueue({ ...s5, sets: live(s5.id) }); for (const x of live(s5.id)) store.deleteSet(x.timestamp);
  assert.equal((await c.createManual(s5.id, {})).status, 'cancelled'); assert.equal(ups().length, 1);
  // 6) update() with zero sets cancels; client without liveSets still refuses empty items
  let s6 = mk('08'); c.enqueue({ ...s6, sets: live(s6.id) }); assert.equal(c.update(s6.id, []), 'cancelled');
  // 7) legacy sessions (no sessionId) can be deleted whole
  const ls2 = mem(); ls2.setItem('repcam.sets', JSON.stringify([{ reps: 5, kg: 60, timestamp: '2026-10-01T10:00:00Z' }, { reps: 5, kg: 60, timestamp: '2026-10-01T10:05:00Z' }, { reps: 5, kg: 60, timestamp: '2026-10-05T10:00:00Z' }]));
  const st2 = St.createStore(ls2), leg = st2.sessions().find(x => x.start.startsWith('2026-10-01'));
  assert.equal(st2.deleteSession(leg.id), 2); assert.equal(st2.sets().length, 1);
  console.log('test-delete: all passed');
})().catch(e => { console.error(e); process.exit(1); });
