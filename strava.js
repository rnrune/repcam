// Newrun Lift (formerly RepCam) ⇄ Strava (UMD: browser + node). Pure matching logic + a small client with token refresh and a retry queue.
// Strava's OAuth has no PKCE, so the client_secret lives in a tiny Cloudflare Worker (worker/strava-worker.js) that only does
// code→token exchange and token refresh. Everything else (reading activities, writing the description) goes browser → Strava directly.
(function (root) {
  const API = 'https://www.strava.com/api/v3';
  const TOL = 15 * 60e3;                  // allowed gap between RepCam session and activity
  const RETRY_FOR = 24 * 3600e3;          // keep looking for a late-synced watch activity this long
  const PREFERRED = ['WeightTraining', 'Workout', 'Crossfit', 'HighIntensityIntervalTraining'];
  const K = { tok: 'repcam.strava.tok', q: 'repcam.strava.queue', state: 'repcam.strava.state' };
  const ms = d => new Date(d).getTime();
  const MARK = '— Newrun Lift —', OLD_MARKS = ['— RepCam —'];

  // Activity window from start_date (UTC, ends in Z) + elapsed_time. Never start_date_local: it is local wall time mislabelled as Z.
  function window_(a) { const s = ms(a.start_date); return [s, s + (+a.elapsed_time || +a.moving_time || 0) * 1000]; }
  // Score every activity against the session [start,end]; returns the best match or null. Never returns a non-overlapping activity
  // (a gap of up to `tol` counts as touching, e.g. watch started a few minutes after the phone).
  function pickActivity(acts, session, tol = TOL) {
    const s0 = ms(session.start), s1 = ms(session.end);
    let best = null;
    for (const a of acts || []) {
      if (!a || !a.start_date) continue;
      const [a0, a1] = window_(a);
      if (!isFinite(a0)) continue;
      const overlap = Math.min(s1, a1) - Math.max(s0, a0);   // >0 real overlap, <0 = gap
      if (overlap < -tol) continue;
      const type = a.sport_type || a.type, pref = PREFERRED.includes(type);
      const frac = Math.max(0, overlap) / Math.max(1, s1 - s0);
      const score = (pref ? 2 : 0) + frac + (overlap < 0 ? overlap / tol * 0.5 : 0); // type first, then share of session covered
      if (!best || score > best.score) best = { activity: a, score, overlap, preferred: pref };
    }
    return best;
  }
  // Query window for GET /athlete/activities (after/before are epoch seconds on start_date).
  function queryWindow(session, tol = TOL) {
    return { after: Math.floor((ms(session.start) - 12 * 3600e3) / 1000), before: Math.ceil((ms(session.end) + tol) / 1000) };
  }
  // Description block; replaces an earlier Newrun Lift / RepCam block so re-syncs don't duplicate.
  function describe(sets, nameOf = x => x, kgf = k => (+k > 0 ? k + ' kg' : 'BW')) {
    const lines = sets.map(s => `${nameOf(s.exercise || 'knebøy')}: ${s.reps} × ${kgf(s.kg)}`);
    const vol = sets.reduce((a, s) => a + (+s.reps || 0) * (+s.kg || 0), 0);
    return `${MARK}\n${lines.join('\n')}\nΣ ${Math.round(vol)} kg`;
  }
  function mergeDescription(old, block) {
    old = old || ''; const hits = [MARK, ...OLD_MARKS].map(m => old.indexOf(m)).filter(x => x >= 0); const i = hits.length ? Math.min(...hits) : -1;
    const base = (i >= 0 ? old.slice(0, i) : old).replace(/\s+$/, '');
    return base ? base + '\n\n' + block : block;
  }

  const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  function parseState(search) { try { const st = new URLSearchParams(search).get('state') || '', i = st.indexOf('.'); return i < 0 ? null : JSON.parse(b64d(st.slice(i + 1))); } catch { return null; } }
  function createClient({ ls, fetch: f, config = {}, now = () => Date.now() }) {
    const read = (k, d) => { try { const v = JSON.parse(ls.getItem(k)); return v == null ? d : v; } catch { return d; } };
    const save = (k, v) => ls.setItem(k, JSON.stringify(v));
    const configured = () => !!(config.clientId && config.workerUrl);
    const connected = () => !!read(K.tok, null);
    // opts.web: use the plain web authorize page (stays inside an iOS home-screen app; the /mobile/ one can hand off to the
    // Strava app, which then returns to Safari = a different storage). opts.carry: small object (profile) packed into `state`
    // so it survives a return into a different browser context.
    function authUrl(redirect, opts = {}) {
      const st = Math.random().toString(36).slice(2) + (opts.carry ? '.' + b64e(JSON.stringify(opts.carry)) : ''); ls.setItem(K.state, st);
      return 'https://www.strava.com/oauth/' + (opts.web ? '' : 'mobile/') + 'authorize?' + new URLSearchParams({ client_id: config.clientId, redirect_uri: redirect, response_type: 'code', approval_prompt: 'auto', scope: 'activity:read_all,activity:write', state: st });
    }
    async function worker(path, body) {
      const r = await f(config.workerUrl.replace(/\/$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('token ' + r.status); return r.json();
    }
    // Handle ?code=&state= on the redirect back from Strava. Returns true if connected.
    async function handleRedirect(search) {
      const p = new URLSearchParams(search); if (!p.get('code') && !p.get('error')) return false;
      const mine = ls.getItem(K.state);
      if (p.get('error')) return false;
      // Same context: state must match. No state stored here = the redirect landed in another storage context (iOS: home-screen
      // app vs Safari); still exchange the code so the user isn't silently left unconnected.
      if (mine ? p.get('state') !== mine : !/^[a-z0-9]{4,}(\.[A-Za-z0-9_-]+)?$/.test(p.get('state') || '')) return false;
      const scope = p.get('scope') || '';
      if (!/activity:write/.test(scope) || !/activity:read_all/.test(scope)) throw new Error('scope');
      const t = await worker('/token', { code: p.get('code') });
      save(K.tok, { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at, athlete: t.athlete && t.athlete.firstname });
      ls.removeItem(K.state); return true;
    }
    async function token() {
      const t = read(K.tok, null); if (!t) throw new Error('not connected');
      if (t.expires_at * 1000 > now() + 120e3) return t.access_token;
      const n = await worker('/refresh', { refresh_token: t.refresh_token });
      save(K.tok, { ...t, access_token: n.access_token, refresh_token: n.refresh_token || t.refresh_token, expires_at: n.expires_at });
      return n.access_token;
    }
    async function api(path, opt = {}) {
      const r = await f(API + path, { ...opt, headers: { Authorization: 'Bearer ' + await token(), ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
      if (r.status === 401) { const t = read(K.tok, null); if (t) save(K.tok, { ...t, expires_at: 0 }); }
      if (!r.ok) throw new Error('strava ' + r.status); return r.json();
    }
    const queue = () => read(K.q, []);
    function enqueue(sess) {
      if (!connected() || !sess || !sess.sets || !sess.sets.length) return;
      const q = queue().filter(x => x.id !== sess.id);
      q.push({ id: sess.id, start: sess.start, end: sess.end, sets: sess.sets.map(s => ({ exercise: s.exercise, reps: s.reps, kg: s.kg })), added: now(), status: 'waiting' });
      save(K.q, q.slice(-20));
    }
    const setItem = (id, patch) => save(K.q, queue().map(x => x.id === id ? { ...x, ...patch } : x));
    // Try every waiting session. Matched → description written. After 24 h without match → 'nomatch' (UI offers manual create).
    async function process(fmt = {}) {
      if (!configured() || !connected()) return [];
      const out = [];
      for (const it of queue().filter(x => x.status === 'waiting')) {
        try {
          const w = queryWindow(it);
          const acts = await api(`/athlete/activities?after=${w.after}&before=${w.before}&per_page=50`);
          const m = pickActivity(acts, it);
          if (m) {
            const full = await api('/activities/' + m.activity.id);
            const description = mergeDescription(full.description, describe(it.sets, fmt.name, fmt.kgf));
            await api('/activities/' + m.activity.id, { method: 'PUT', body: JSON.stringify({ description }) });
            setItem(it.id, { status: 'synced', activityId: m.activity.id, activityName: m.activity.name, at: now() });
            out.push({ id: it.id, status: 'synced', activityId: m.activity.id });
          } else if (now() - it.added > RETRY_FOR) { setItem(it.id, { status: 'nomatch' }); out.push({ id: it.id, status: 'nomatch' }); }
          else { setItem(it.id, { tries: (it.tries || 0) + 1 }); out.push({ id: it.id, status: 'waiting' }); }
        } catch (e) { out.push({ id: it.id, status: 'error', error: e.message }); }
      }
      return out;
    }
    // Last resort: create a manual WeightTraining activity for a session nothing matched.
    async function createManual(id, fmt = {}) {
      const it = queue().find(x => x.id === id); if (!it) return null;
      const d = new Date(it.start), pad = n => String(n).padStart(2, '0');
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const a = await api('/activities', { method: 'POST', body: JSON.stringify({ name: fmt.title || 'Styrke (Newrun Lift)', sport_type: 'WeightTraining', start_date_local: local,
        elapsed_time: Math.max(60, Math.round((ms(it.end) - ms(it.start)) / 1000)), description: describe(it.sets, fmt.name, fmt.kgf) }) });
      setItem(id, { status: 'created', activityId: a.id, at: now() }); return a;
    }
    function disconnect() { ls.removeItem(K.tok); ls.removeItem(K.q); }
    return { configured, connected, authUrl, handleRedirect, token, enqueue, process, createManual, queue, disconnect, athlete: () => (read(K.tok, {}) || {}).athlete };
  }
  const lib = { parseState, pickActivity, queryWindow, describe, mergeDescription, createClient, TOL, RETRY_FOR, KEYS: K };
  if (typeof module !== 'undefined') module.exports = lib; else root.Strava = lib;
})(this);
