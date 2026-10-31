// Newrun Lift (formerly RepCam) data layer (UMD: browser + node). Backward compatible with legacy repcam.sets entries {exercise,reps,kg,timestamp}.
(function (root) {
  const SETS = 'repcam.sets', SESS = 'repcam.sessions', ACTIVE = 'repcam.active';
  const GAP = 2 * 3600e3; // legacy sets more than 2h apart => new session
  // Active exercises (camera-counted) first; legacy ids kept so old data still renders.
  const EX = [
    { id: 'knebøy', name: 'Knebøy', icon: '🏋️', active: true },
    { id: 'bulgarsk', name: 'Bulgarsk utfall', icon: '🦵', active: true },
    { id: 'pullups', name: 'Pull-ups', icon: '🧗', active: true },
    { id: 'dips', name: 'Dips', icon: '🤸', active: true },
    { id: 'benkpress', name: 'Benkpress', icon: '🏋️‍♂️', active: true },
    { id: 'skråbenk', name: 'Skråbenk', icon: '💪', active: true },
    { id: 'halvmark', name: 'Rumensk markløft', icon: '🔥', active: true },
    { id: 'roing', name: 'Stående roing', icon: '🚣', active: true },
    { id: 'armhevinger', name: 'Armhevinger', icon: '💥', active: true },
    { id: 'situps', name: 'Sit-ups', icon: '🙇', active: true },
    { id: 'vsitup', name: 'V-situp', icon: '🔺', active: true },
    { id: 'curl', name: 'EZ-curl', icon: '💪', active: true }
  ];
  const LEGACY = [
    { id: 'markløft', name: 'Markløft', icon: '🔥' },
    { id: 'skulderpress', name: 'Skulderpress', icon: '🙌' }, { id: 'utfall', name: 'Utfall', icon: '🦵' }, { id: 'pushups', name: 'Push-ups', icon: '⚡' }
  ];
  const exInfo = id => EX.find(e => e.id === id) || LEGACY.find(e => e.id === id) || { id, name: id ? id[0].toUpperCase() + id.slice(1) : 'Øvelse', icon: '🏋️' };
  const read = (ls, k, d) => { try { const v = JSON.parse(ls.getItem(k)); return v == null ? d : v; } catch { return d; } };
  const t = s => new Date(s.timestamp).getTime();
  const vol = arr => arr.reduce((a, s) => a + (+s.reps || 0) * (+s.kg || 0), 0);
  // Assign sessionIds to legacy sets (no mutation of storage needed)
  function normalize(sets) {
    const out = sets.filter(s => s && s.timestamp).map(s => ({ ...s })).sort((a, b) => t(a) - t(b));
    let cur = null, last = -Infinity;
    for (const s of out) {
      if (s.sessionId) { last = t(s); cur = null; continue; }
      if (!cur || t(s) - last > GAP) cur = 'legacy-' + t(s);
      s.sessionId = cur; last = t(s);
    }
    return out;
  }
  function sessions(sets, meta = []) {
    const m = new Map();
    for (const s of normalize(sets)) {
      if (!m.has(s.sessionId)) m.set(s.sessionId, { id: s.sessionId, sets: [] });
      m.get(s.sessionId).sets.push(s);
    }
    return [...m.values()].map(x => {
      const md = meta.find(y => y.id === x.id) || {};
      const start = md.start || x.sets[0].timestamp, end = md.end || x.sets[x.sets.length - 1].timestamp;
      return { ...x, start, end, volume: vol(x.sets), reps: x.sets.reduce((a, s) => a + (+s.reps || 0), 0) };
    }).sort((a, b) => new Date(b.start) - new Date(a.start));
  }
  const dayKey = d => { d = new Date(d); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function groupByExercise(sets) {
    const m = new Map();
    for (const s of sets) { const k = s.exercise || 'knebøy'; if (!m.has(k)) m.set(k, []); m.get(k).push(s); }
    return [...m.entries()].map(([id, arr]) => {
      const reps = arr.map(s => +s.reps || 0), same = reps.every(r => r === reps[0]);
      return { id, ...exInfo(id), sets: arr, count: arr.length, topKg: Math.max(...arr.map(s => +s.kg || 0)), volume: vol(arr),
        label: arr.length + ' sett ' + (same ? '× ' + reps[0] + ' reps' : '· ' + Math.min(...reps) + '–' + Math.max(...reps) + ' reps') };
    });
  }
  // Top kg per day for an exercise, oldest→newest, last n days with data
  function kgHistory(sets, ex, n = 8) {
    const m = new Map();
    for (const s of normalize(sets)) if ((s.exercise || 'knebøy') === ex) { const k = dayKey(s.timestamp); m.set(k, Math.max(m.get(k) || 0, +s.kg || 0)); }
    return [...m.values()].slice(-n);
  }
  function weekStart(d) { d = new Date(d); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  function weekly(sets, now = new Date()) {
    const ws = weekStart(now), prev = new Date(ws); prev.setDate(prev.getDate() - 7);
    const days = Array(7).fill(0); let last = 0;
    for (const s of sets) {
      const ts = t(s), v = (+s.reps || 0) * (+s.kg || 0);
      if (ts >= ws.getTime() && ts < ws.getTime() + 7 * 864e5) days[Math.floor((ts - ws.getTime()) / 864e5)] += v;
      else if (ts >= prev.getTime() && ts < ws.getTime()) last += v;
    }
    const total = days.reduce((a, b) => a + b, 0);
    return { days, total, last, pct: last ? Math.round((total - last) / last * 100) : null, today: (now.getDay() + 6) % 7 };
  }
  function todaySets(sets, now = new Date()) { const k = dayKey(now); return normalize(sets).filter(s => dayKey(s.timestamp) === k); }
  function summary(sess) {
    return { sets: sess.sets.length, reps: sess.sets.reduce((a, s) => a + (+s.reps || 0), 0), volume: vol(sess.sets),
      durationMin: Math.max(0, Math.round((new Date(sess.end) - new Date(sess.start)) / 60000)) };
  }
  function createStore(ls) {
    const api = {
      sets: () => read(ls, SETS, []),
      meta: () => read(ls, SESS, []),
      active: () => read(ls, ACTIVE, null),
      save: (k, v) => ls.setItem(k, JSON.stringify(v)),
      startSession(now = new Date()) {
        let a = api.active(); if (a) return a;
        a = { id: 's-' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 6), start: now.toISOString() };
        api.save(ACTIVE, a); return a;
      },
      addSet(set, now = new Date()) {
        const a = api.startSession(now), s = api.sets();
        // The timestamp is the set's id (edit/delete/undo/Strava/clip labels): never reuse one, even for two saves in the same ms.
        let ms = now.getTime(); while (s.some(x => x && x.timestamp === new Date(ms).toISOString())) ms++;
        const rec = { exercise: 'knebøy', ...set, timestamp: new Date(ms).toISOString(), sessionId: a.id };
        s.push(rec); api.save(SETS, s); return rec;
      },
      // Merge fields into the active session (heartbeat 'seen', manual exercise…) so it survives backgrounding and reloads.
      touchActive(patch) { const a = api.active(); if (!a) return null; const n = { ...a, ...patch }; api.save(ACTIVE, n); return n; },
      endSession(now = new Date()) {
        const a = api.active(); if (!a) return null;
        ls.removeItem(ACTIVE);
        const sets = api.sets().filter(s => s.sessionId === a.id);
        const sess = { id: a.id, start: a.start, end: now.toISOString(), sets };
        if (sets.length) { const m = api.meta(); m.push({ id: a.id, start: a.start, end: sess.end }); api.save(SESS, m); }
        return { ...sess, ...summary(sess) };
      },
      // Removes EVERY record with this timestamp: duplicated records (same id) would otherwise "come back" one by one.
      deleteSet(timestamp) {
        const all = api.sets(), s = all.filter(x => !x || x.timestamp !== timestamp);
        if (s.length === all.length) return false; api.save(SETS, s);
        const ids = new Set(s.map(x => x.sessionId)); api.save(SESS, api.meta().filter(m => ids.has(m.id))); return true;
      },
      // Delete a whole session (every set + its meta). Legacy sessions (computed ids) work too. Returns number of sets removed.
      deleteSession(id) {
        const gone = new Set(normalize(api.sets()).filter(x => x.sessionId === id).map(x => x.timestamp));
        const s = api.sets().filter(x => !(x && gone.has(x.timestamp) && (!x.sessionId || x.sessionId === id)));
        const n = api.sets().length - s.length; api.save(SETS, s);
        api.save(SESS, api.meta().filter(m => m.id !== id)); return n;
      },
      // v8.13: add a set to a FINISHED session (edited afterwards from Historikk). It gets a fresh, unique timestamp right
      // after the session's last set (so it sorts last and the session's time window barely moves). Returns the record or null.
      addSetTo(sessionId, set) {
        const mine = normalize(api.sets()).filter(x => x.sessionId === sessionId); if (!mine.length) return null;
        const s = api.sets(); let ms = Math.max(...mine.map(t)) + 1000;
        while (s.some(x => x && x.timestamp === new Date(ms).toISOString())) ms++;
        const rec = { exercise: 'knebøy', reps: 0, kg: 0, ...set, timestamp: new Date(ms).toISOString(), sessionId, added: true };
        s.push(rec); api.save(SETS, s); return rec;
      },
      sessionOf(timestamp) { const x = normalize(api.sets()).find(y => y.timestamp === timestamp); return x ? x.sessionId : null; },
      // Patch a logged set (reps, kg, exercise). Returns the updated record or null.
      updateSet(timestamp, patch) {
        const s = api.sets(), i = s.findIndex(x => x.timestamp === timestamp);
        if (i < 0) return null;
        const p = {};
        if (patch.reps != null) p.reps = Math.max(0, Math.round(+patch.reps || 0));
        if (patch.kg != null) p.kg = Math.max(0, Math.round((+patch.kg || 0) * 100) / 100);
        if (patch.exercise) p.exercise = patch.exercise;
        // v8.25 'usikker' marker (tempo rule, no answer): set explicitly, cleared by any edit of the set
        if (patch.unsure != null) p.unsure = !!patch.unsure; else if (Object.keys(p).length) p.unsure = false;
        s[i] = { ...s[i], ...p }; api.save(SETS, s); return s[i];
      },
      // Last weight used for an exercise (default for the next set); null if never logged.
      lastKg(ex) { const s = api.sets(); for (let i = s.length - 1; i >= 0; i--) if ((s[i].exercise || 'knebøy') === ex) return +s[i].kg || 0; return null; },
      sessions: () => sessions(api.sets(), api.meta()),
      exportJSON: () => JSON.stringify({ app: 'Newrun Lift', exported: new Date().toISOString(), sets: api.sets(), sessions: api.meta() }, null, 2)
    };
    return api;
  }
  const lib = { EX, LEGACY, exInfo, normalize, sessions, groupByExercise, kgHistory, weekly, weekStart, todaySets, summary, createStore, volume: vol };
  if (typeof module !== 'undefined') module.exports = lib; else root.Store = lib;
})(this);
