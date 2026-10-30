// Newrun Lift (formerly RepCam) ⇄ Strava (UMD: browser + node). Pure matching logic + a small client with token refresh and a retry queue.
// Strava's OAuth has no PKCE, so the client_secret lives in a tiny Cloudflare Worker (worker/strava-worker.js) that only does
// code→token exchange and token refresh. Everything else (reading activities, writing the description) goes browser → Strava directly.
(function (root) {
  // Strava moves the V3 base URL to https://api-v3.strava.com (available 4 Jan 2027, old host retired 1 Jun 2027). Keep the old host
  // until the new one is live; tokens already go in the Authorization header as required. v8.18: switch to the new host after 4 Jan 2027.
  const API = 'https://www.strava.com/api/v3';
  const TOL = 15 * 60e3;                  // allowed gap between RepCam session and activity
  const RETRY_FOR = 24 * 3600e3;          // keep retrying a failing auto-create this long, then fall back to the manual button
  const AUTO_CREATE_AFTER = 3600e3;       // no matching watch activity 1 h after the session ended → create one ourselves
  const STALE_CREATE = 10 * 60e3;         // a 'creating' item older than this (app killed mid-upload) is re-checked / retried
  // Newrun Lift exercise → Strava strength exercise_type (JSON upload, https://developers.strava.com/docs/uploads/).
  const EXERCISE_TYPE = { knebøy: 'BARBELL_BACK_SQUAT', bulgarsk: 'DUMBBELL_BULGARIAN_SPLIT_SQUATS', pullups: 'PULL_UP_GENERIC', dips: 'CHEST_DIP',
    benkpress: 'BARBELL_BENCH_PRESS', skråbenk: 'INCLINE_BARBELL_BENCH_PRESS', halvmark: 'BARBELL_ROMANIAN_DEADLIFT', roing: 'BENT_OVER_BARBELL_ROW',
    armhevinger: 'PUSH_UP_GENERIC', pushups: 'PUSH_UP_GENERIC', situps: 'SIT_UP_GENERIC', vsitup: 'SIT_UP_GENERIC', curl: 'EZ_BAR_CURL', markløft: 'BARBELL_DEADLIFT', skulderpress: 'OVERHEAD_BARBELL_PRESS', utfall: 'LUNGE_GENERIC' };
  const exerciseType = (ex, kg) => ex === 'dips' && +kg > 0 ? 'WEIGHTED_CHEST_DIP' : (EXERCISE_TYPE[ex] || 'TOTAL_BODY_GENERIC');
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

  // Strava JSON strength-training file: one entry per set (exercise_type, repetitions, weight in kg; bodyweight = no weight).
  function strengthFile(it, creator = 'Newrun Lift') {
    const s = new Date(it.start), e = new Date(it.end);
    return { version: '1.0', start_time: s.toISOString().replace(/\.\d{3}Z$/, 'Z'), utc_offset: -s.getTimezoneOffset() * 60,
      elapsed_time: Math.max(60, Math.round((e - s) / 1000)), creator: { name: creator },
      sets: it.sets.map(x => ({ exercise_type: exerciseType(x.exercise || 'knebøy', x.kg), repetitions: +x.reps || 0, ...(+x.kg > 0 ? { weight: +x.kg } : {}),
        ...(x.t ? { start_time: new Date(x.t).toISOString().replace(/\.\d{3}Z$/, 'Z') } : {}) })) };
  }
  const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  function parseState(search) { try { const st = new URLSearchParams(search).get('state') || '', i = st.indexOf('.'); return i < 0 ? null : JSON.parse(b64d(st.slice(i + 1))); } catch { return null; } }
  function createClient({ ls, fetch: f, config = {}, liveSets = null, now = () => Date.now(), sleep = ms_ => new Promise(r => setTimeout(r, ms_)) }) {
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
      const json = typeof opt.body === 'string'; // FormData (uploads) sets its own multipart Content-Type
      const r = await f(API + path, { ...opt, headers: { Authorization: 'Bearer ' + await token(), ...(json ? { 'Content-Type': 'application/json' } : {}) } });
      if (r.status === 401) { const t = read(K.tok, null); if (t) save(K.tok, { ...t, expires_at: 0 }); }
      if (!r.ok) { let b = null; try { b = await r.json(); } catch {} const e = new Error('strava ' + r.status + (b && b.error ? ': ' + b.error : '')); e.status = r.status; e.body = b; throw e; }
      return r.json();
    }
    const queue = () => read(K.q, []);
    function enqueue(sess) {
      if (!connected() || !sess || !sess.sets || !sess.sets.length) return;
      const q = queue().filter(x => x.id !== sess.id);
      const old = queue().find(x => x.id === sess.id);
      if (old && ['synced', 'created', 'creating'].includes(old.status)) return; // never re-open a session that already has an activity
      q.push({ id: sess.id, start: sess.start, end: sess.end, sets: slim(sess.sets), added: now(), status: 'waiting' });
      save(K.q, q.slice(-20));
    }
    const slim = sets => sets.map(s => ({ exercise: s.exercise, reps: s.reps, kg: s.kg, t: s.timestamp || s.t }));
    const ON_STRAVA = ['synced', 'created'];
    // Drop a session from the queue (all its sets deleted, or the whole session deleted). Never touches Strava.
    // Returns 'cancelled' | 'onStrava' (already has an activity; must be deleted in Strava) | 'uploading' (upload in flight) | null (not queued).
    function cancel(id) {
      const it = queue().find(x => x.id === id); if (!it) return null;
      if (ON_STRAVA.includes(it.status)) return 'onStrava';
      if (it.status === 'creating' && it.uploadId) return 'uploading';
      save(K.q, queue().filter(x => x.id !== id)); return 'cancelled';
    }
    // Sets of a queued session changed (edit/delete). Pending items get the new sets; zero sets left = cancelled.
    function update(id, sets) {
      const it = queue().find(x => x.id === id); if (!it) return null;
      if (!sets || !sets.length) return cancel(id);
      if (it.status === 'waiting' || it.status === 'nomatch') { setItem(id, { sets: slim(sets) }); return 'updated'; }
      // v8.13: a session edited after its activity exists — the Newrun Lift block in the activity description is rewritten on the
      // next process() (deleted sets are gone from it). Structured sets of an activity we uploaded cannot be changed via the API.
      if (ON_STRAVA.includes(it.status) && it.activityId) { setItem(id, { sets: slim(sets), descDirty: true }); return 'descUpdate'; }
      return it.status;
    }
    // Before any request: re-read the session's current sets from the app (deleted sets are gone). Returns the item or null if cancelled.
    function fresh(it) {
      if (!liveSets) return it.sets && it.sets.length ? it : (cancel(it.id), null);
      const live = liveSets(it.id) || [];
      if (!live.length) { cancel(it.id); return null; }
      const n = { ...it, sets: slim(live) }; setItem(it.id, { sets: n.sets }); return n;
    }
    const setItem = (id, patch) => save(K.q, queue().map(x => x.id === id ? { ...x, ...patch } : x));
    async function matchFor(it) { const w = queryWindow(it); return pickActivity(await api(`/athlete/activities?after=${w.after}&before=${w.before}&per_page=50`), it); }
    const dupId = e => { const m = /duplicate of activity (\d+)/i.exec((e && (e.error || (e.body && e.body.error) || e.message)) || ''); return m ? m[1] : null; };
    // Poll an upload until Strava has turned it into an activity (≥1 s apart, as the docs ask). Returns activity id, null = still processing.
    async function pollUpload(uploadId, tries = 8) {
      for (let i = 0; i < tries; i++) {
        await sleep(1000);
        const u = await api('/uploads/' + uploadId);
        if (u.activity_id) return String(u.activity_id);
        const d = dupId(u); if (d) return d;
        if (u.error) { const e = new Error('upload: ' + u.error); e.upload = true; throw e; }
      }
      return null;
    }
    // Create the activity for a session nothing matched. Preferred: structured JSON upload (exercises, sets, reps, kg show natively
    // in Strava, plus the same description block). If Strava rejects the format, fall back to a plain manual activity with the
    // description block. The item is marked 'creating' BEFORE any request so a second tab/run can never create a duplicate.
    async function create(it, fmt = {}) {
      if (!it.sets || !it.sets.length) { cancel(it.id); return { id: it.id, status: 'cancelled' }; } // never create an empty activity
      const name = fmt.title || 'Styrke (Newrun Lift)', description = describe(it.sets, fmt.name, fmt.kgf);
      setItem(it.id, { status: 'creating', creatingAt: now() });
      let activityId = null, structured = false;
      try {
        const fd = new FormData(), file = strengthFile(it);
        fd.append('data_type', 'json'); fd.append('sport_type', 'WeightTraining'); fd.append('name', name); fd.append('description', description);
        fd.append('external_id', 'newrunlift-' + it.id + '.json');
        fd.append('file', new Blob([JSON.stringify(file)], { type: 'application/json' }), 'newrunlift-' + it.id + '.json');
        const up = await api('/uploads', { method: 'POST', body: fd });
        setItem(it.id, { uploadId: String(up.id_str || up.id) });
        activityId = dupId(up) || (up.activity_id ? String(up.activity_id) : await pollUpload(up.id_str || up.id));
        structured = true;
        if (!activityId) return { id: it.id, status: 'creating' }; // still processing: next process() picks it up
      } catch (e) {
        const d = dupId(e); if (d) activityId = d;
        else if (e.upload || (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429)) { // format/feature rejected → plain manual activity
          const d0 = new Date(it.start), pad = n => String(n).padStart(2, '0');
          const local = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}T${pad(d0.getHours())}:${pad(d0.getMinutes())}:${pad(d0.getSeconds())}`;
          const a = await api('/activities', { method: 'POST', body: JSON.stringify({ name, sport_type: 'WeightTraining', start_date_local: local,
            elapsed_time: Math.max(60, Math.round((ms(it.end) - ms(it.start)) / 1000)), description }) });
          activityId = String(a.id);
        } else { setItem(it.id, { status: 'waiting', createErr: e.message }); throw e; } // network/auth/rate limit: retry later
      }
      setItem(it.id, { status: 'created', activityId, structured, at: now() });
      return { id: it.id, status: 'created', activityId, structured };
    }
    // Every waiting session: a matching (watch) activity gets the description block. If none exists 1 h after the session ended,
    // the activity is created automatically. If auto-create keeps failing for 24 h → 'nomatch' and the UI offers the manual button.
    async function process(fmt = {}) {
      if (!configured() || !connected()) return [];
      const out = [];
      for (let it of queue().filter(x => x.status === 'waiting' || x.status === 'creating')) {
        try {
          if (!(it.status === 'creating' && it.uploadId)) { it = fresh(it); if (!it) continue; } // deleted sets never reach Strava
          if (it.status === 'creating') { // interrupted or still-processing create: finish it, never start a second one
            if (it.uploadId) { const id = await pollUpload(it.uploadId, 1).catch(e => { if (dupId(e)) return dupId(e); throw e; });
              if (id) { setItem(it.id, { status: 'created', activityId: id, structured: true, at: now() }); out.push({ id: it.id, status: 'created', activityId: id }); }
              else out.push({ id: it.id, status: 'creating' }); continue; }
            const m = await matchFor(it); // POST may have gone through before the app died: the new activity overlaps the session
            if (m) { setItem(it.id, { status: 'created', activityId: m.activity.id, at: now() }); out.push({ id: it.id, status: 'created', activityId: m.activity.id }); continue; }
            if (now() - (it.creatingAt || 0) < STALE_CREATE) { out.push({ id: it.id, status: 'creating' }); continue; }
            out.push(await create(it, fmt)); continue;
          }
          const m = await matchFor(it);
          if (m) {
            const full = await api('/activities/' + m.activity.id);
            const description = mergeDescription(full.description, describe(it.sets, fmt.name, fmt.kgf));
            await api('/activities/' + m.activity.id, { method: 'PUT', body: JSON.stringify({ description }) });
            setItem(it.id, { status: 'synced', activityId: m.activity.id, activityName: m.activity.name, at: now() });
            out.push({ id: it.id, status: 'synced', activityId: m.activity.id });
          } else if (now() - ms(it.end) >= AUTO_CREATE_AFTER) {
            try { out.push(await create(it, fmt)); }
            catch (e) { if (now() - it.added > RETRY_FOR) { setItem(it.id, { status: 'nomatch' }); out.push({ id: it.id, status: 'nomatch' }); } else throw e; }
          } else { setItem(it.id, { tries: (it.tries || 0) + 1 }); out.push({ id: it.id, status: 'waiting' }); }
        } catch (e) { out.push({ id: it.id, status: 'error', error: e.message }); }
      }
      // v8.13: rewrite the description block of activities whose session was edited afterwards
      for (let it of queue().filter(x => x.descDirty && ON_STRAVA.includes(x.status) && x.activityId)) {
        try {
          const live = liveSets ? liveSets(it.id) || [] : it.sets; if (!live.length) { setItem(it.id, { descDirty: false }); continue; }
          const full = await api('/activities/' + it.activityId);
          const description = mergeDescription(full.description, describe(slim(live), fmt.name, fmt.kgf));
          await api('/activities/' + it.activityId, { method: 'PUT', body: JSON.stringify({ description }) });
          setItem(it.id, { sets: slim(live), descDirty: false, at: now() }); out.push({ id: it.id, status: 'descUpdated', activityId: it.activityId });
        } catch (e) { out.push({ id: it.id, status: 'error', error: e.message }); }
      }
      return out;
    }
    // Manual override (button): create now. No-op if the session already has an activity or a create is in flight.
    async function createManual(id, fmt = {}) {
      let it = queue().find(x => x.id === id); if (!it) return null;
      if (['created', 'synced', 'creating'].includes(it.status)) return { id: it.activityId || null, status: it.status, existing: true };
      it = fresh(it); if (!it) return { id: null, status: 'cancelled' };
      const r = await create(it, fmt); return { ...r, id: r.activityId };
    }
    // v8.18 «Oppdater i Strava»: find the activity this session belongs to — the stored activityId (auto-created / matched
    // earlier) or else the best start-time overlap (pickActivity) — without changing anything. Returns null if none exists.
    async function locate(sess) {
      const it = queue().find(x => x.id === sess.id), id = it && it.activityId;
      if (id) { try { const a = await api('/activities/' + id); return { activityId: String(a.id), name: a.name, ours: it.status === 'created', stored: true }; } catch (e) { if (e.status !== 404) throw e; } }
      const m = await matchFor(sess); return m ? { activityId: String(m.activity.id), name: m.activity.name, ours: false, stored: false } : null;
    }
    // Overwrite the Newrun Lift block of that activity's description with the session's current sets (text before the block, e.g. a
    // watch's notes, is kept). The name is only changed on activities the app created itself. PUT /activities/{id} can change
    // name, description, sport_type, gear, trainer/commute, hide_from_home — NOT start time, duration, distance or the structured
    // sets of an uploaded strength file. Call only after the user confirmed.
    async function refresh(sess, loc, fmt = {}) {
      const sets = slim(sess.sets || []), full = await api('/activities/' + loc.activityId);
      const body = { description: mergeDescription(full.description, describe(sets, fmt.name, fmt.kgf)) };
      if (loc.ours && fmt.title) body.name = fmt.title;
      await api('/activities/' + loc.activityId, { method: 'PUT', body: JSON.stringify(body) });
      const q = queue(), it = q.find(x => x.id === sess.id), rec = { id: sess.id, start: sess.start, end: sess.end, sets, status: loc.ours ? 'created' : 'synced', activityId: loc.activityId, activityName: full.name, descDirty: false, at: now() };
      save(K.q, it ? q.map(x => x.id === sess.id ? { ...x, ...rec } : x) : [...q, rec].slice(-20));
      return { status: 'updated', activityId: loc.activityId, name: body.name || full.name };
    }
    // No activity found: queue the session (if needed) and create one.
    async function createFor(sess, fmt = {}) { if (!queue().find(x => x.id === sess.id)) enqueue(sess); setItem(sess.id, { status: 'nomatch' }); return createManual(sess.id, fmt); }
    function disconnect() { ls.removeItem(K.tok); ls.removeItem(K.q); }
    return { configured, connected, authUrl, handleRedirect, token, enqueue, process, createManual, locate, refresh, createFor, queue, cancel, update, disconnect, athlete: () => (read(K.tok, {}) || {}).athlete };
  }
  const lib = { parseState, pickActivity, queryWindow, describe, mergeDescription, strengthFile, exerciseType, createClient, TOL, RETRY_FOR, AUTO_CREATE_AFTER, KEYS: K };
  if (typeof module !== 'undefined') module.exports = lib; else root.Strava = lib;
})(this);
