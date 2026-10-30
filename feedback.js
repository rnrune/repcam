// Newrun Lift "Help improve" feedback: per-set clip recording, ground-truth labels from the user's corrections,
// background upload with a retry queue. UMD: the pure parts (queue, labels, mime pick) are unit-tested in node.
(function (root) {
  const KEYS = { on: 'repcam.fb.on', inst: 'repcam.fb.install', tok: 'repcam.fb.token', stats: 'repcam.fb.stats' };
  const MIMES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const MAX_BYTES = 48 * 1024 * 1024;
  // v8.18 upload safety net (reviewable config). Every clip + meta + label lives in IndexedDB until the Worker confirmed it
  // (HTTP 2xx); only then the local video blob is dropped. Retries: on load, 'online', foreground/pageshow and every periodMs
  // while visible, with backoff capped at maxBackoffMs. Kill switch for automatic retries: localStorage repcam.fb.retryOff=1
  // (manual «Send nå» still works). New clips are not recorded once unsent local video exceeds maxLocalBytes.
  const QUEUE_CFG = { retry: true, maxBackoffMs: 5 * 60e3, periodMs: 30e3, maxLocalBytes: 400 * 1024 * 1024,
    timeoutMs: 45e3, minBps: 50e3, stuckMs: 10 * 60e3 }; // per request: 45 s + size at 50 kB/s; a run older than stuckMs is abandoned
  function pickMime(isSupported) { for (const m of MIMES) { try { if (isSupported(m)) return m; } catch {} } return ''; }
  function rid(n, rnd) { const b = new Uint8Array(n); rnd(b); return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); }
  // Ground truth from what the user did with the set. Undo/delete = not a set; edit = corrected values; untouched = confirmed implicitly.
  function labelFrom(pred, action, val) {
    if (action === 'missed') return { kind: 'missed', exercise: null, reps: null, kg: null, notASet: false, missed: true };
    if (action === 'delete') return { kind: 'notASet', exercise: pred.exercise, reps: 0, kg: pred.kg, notASet: true, missed: false };
    const v = { ...pred, ...(val || {}) };
    const changed = ['exercise', 'reps', 'kg'].filter(k => String(v[k]) !== String(pred[k]));
    return { kind: action === 'edit' ? (changed.length ? 'corrected' : 'confirmed') : 'implicit', exercise: v.exercise, reps: +v.reps, kg: +v.kg, notASet: false, missed: false, changed };
  }
  // Queue over an async kv store {all(), get(id), put(rec), del(id)} (IndexedDB in the browser, Map in tests).
  // rec: { id, setTs, blob, mime, meta, label, clipDone, metaDone, labelDirty, tries, next }
  // v8.18: requests in flight, so a forced «Send nå» can abort a stalled one and retry at once instead of waiting on it
  const INFLIGHT = new Set();
  function abortInflight() { for (const a of INFLIGHT) { try { a.abort(); } catch {} } INFLIGHT.clear(); }
  function createQueue({ kv, send, now = () => Date.now(), maxBackoffMs = 30 * 60e3 }) {
    let running = null, runAt = 0, again = false, forceNext = false, lastErr = null;
    const backoff = t => Math.min(maxBackoffMs, 15e3 * 2 ** Math.min(t, 7));
    // Every read-modify-write runs under one lock: IndexedDB ops are separate transactions, so an upload's bookkeeping
    // must never interleave with a label change (that would resurrect the old label).
    let chain = Promise.resolve();
    const mut = fn => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
    const patch = (id, f) => mut(async () => { const c = await kv.get(id); if (c) { f(c); await kv.put(c); } return c; });
    async function step(r) {
      if (!r.clipDone && r.blob) { await send('clip', r.id, r.blob, r.mime); r.clipDone = true; await patch(r.id, c => { c.clipDone = true; c.blob = null; }); }
      if (!r.metaDone) { await send('meta', r.id, JSON.stringify(r.meta), 'application/json'); r.metaDone = true; await patch(r.id, c => { c.metaDone = true; }); }
      const cur = await kv.get(r.id);
      if (cur && cur.labelDirty) {
        const l = JSON.stringify(cur.label || null);
        await send('label', r.id, JSON.stringify({ ...(cur.label || {}), setTs: cur.setTs, at: new Date(now()).toISOString() }), 'application/json');
        await patch(r.id, c => { if (JSON.stringify(c.label || null) === l) c.labelDirty = false; c.tries = 0; });
      }
    }
    return {
      add(rec) { return mut(() => kv.put({ tries: 0, next: 0, clipDone: false, metaDone: false, labelDirty: true, ...rec })); },
      label(setTs, label) { return mut(async () => { for (const r of await kv.all()) if (r.setTs === setTs) { r.label = typeof label === 'function' ? label((r.meta && r.meta.pred) || {}) : label; r.labelDirty = true; await kv.put(r); return true; } return false; }); },
      labelLatest(label) { return mut(async () => { const a = (await kv.all()).sort((x, y) => (y.created || 0) - (x.created || 0)); if (!a[0]) return false; a[0].label = { ...a[0].label, ...label }; a[0].labelDirty = true; await kv.put(a[0]); return true; }); },
      async stats() { const a = await kv.all(); return { pending: a.filter(r => !r.clipDone || !r.metaDone || r.labelDirty).length, uploaded: a.filter(r => r.clipDone && r.metaDone && !r.labelDirty).length, bytes: a.reduce((s, r) => s + (r.blob ? r.blob.size || 0 : 0), 0) }; },
      clearPending() { return mut(async () => { let n = 0; for (const r of await kv.all()) if (!r.clipDone) { await kv.del(r.id); n++; } return n; }); },
      // One upload loop at a time. A call that arrives while the loop runs (a clip enqueued mid-upload, a label edit,
      // the app coming back to the foreground) is never dropped: it marks the loop dirty, the loop re-reads the store
      // and makes another pass, and the caller gets the result of that complete run.
      process({ force } = {}) {
        again = true; if (force) forceNext = true;
        if (running && force) abortInflight(); // the aborted item fails, the loop makes another (forced) pass and retries it right away
        if (running && !(force && now() - runAt > QUEUE_CFG.stuckMs)) return running; // a run that is stuck anyway is abandoned
        runAt = now(); const mine = (async () => {
          let ok = 0, fail = 0, auth = false;
          try {
            while (again && !auth) {
              again = false; const f = forceNext; forceNext = false; const seen = new Set();
              for (const r of await kv.all()) {
                if (r.clipDone && r.metaDone && !r.labelDirty) continue;
                if (!f && (r.next || 0) > now()) continue;
                seen.add(r.id);
                try { await step(r); ok++; } catch (e) { fail++; lastErr = (e && e.message) || 'error'; await patch(r.id, c => { c.tries = (c.tries || 0) + 1; c.next = now() + backoff(c.tries); }); if (e && e.status === 401) { auth = true; break; } }
              }
            }
          } finally { if (running === mine) running = null; }
          return { ok, fail, error: lastErr };
        })();
        running = mine; return mine;
      },
      // Earliest time a pending record becomes due again (for scheduling a retry timer), or null if nothing is pending.
      async nextDue() { let t = null; for (const r of await kv.all()) if (!(r.clipDone && r.metaDone && !r.labelDirty)) t = t == null ? (r.next || 0) : Math.min(t, r.next || 0); return t; }
    };
  }
  // IndexedDB kv (browser only)
  function idbKV(name = 'newrun-feedback') {
    const db = new Promise((res, rej) => { const o = indexedDB.open(name, 1); o.onupgradeneeded = () => o.result.createObjectStore('clips', { keyPath: 'id' }); o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); });
    const tx = (mode, f) => db.then(d => new Promise((res, rej) => { const t = d.transaction('clips', mode), s = t.objectStore('clips'), q = f(s); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
    return { all: () => tx('readonly', s => s.getAll()), get: id => tx('readonly', s => s.get(id)), put: r => tx('readwrite', s => s.put(r)), del: id => tx('readwrite', s => s.delete(id)) };
  }
  function httpSender({ base, inst, tok, fetch }) {
    return async (kind, id, body, type) => {
      // v8.18: a request that never settles (iOS suspended the app mid-upload, Wi-Fi stalls) used to hang the whole queue forever.
      // Every request now aborts after timeoutMs + size / minBps; the item gets a normal backoff and the loop moves on.
      const size = (body && (body.size || body.length)) || 0, ms_ = QUEUE_CFG.timeoutMs + size / QUEUE_CFG.minBps * 1000;
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ac && setTimeout(() => ac.abort(), ms_); if (ac) INFLIGHT.add(ac);
      let r; try { r = await fetch(base + '/fb/' + kind + '/' + id, { method: 'PUT', body, headers: { 'Content-Type': type, 'X-Install': inst, 'X-Token': tok }, ...(ac ? { signal: ac.signal } : {}) }); }
      catch (e) { throw Object.assign(new Error(ac && ac.signal.aborted ? 'timeout' : 'network'), { status: 0 }); } finally { if (tm) clearTimeout(tm); if (ac) INFLIGHT.delete(ac); }
      if (!r.ok) throw Object.assign(new Error('upload ' + r.status), { status: r.status });
    };
  }
  // Segment recorder: one MediaRecorder runs continuously; cut() ends the current segment (returns its blob + start time)
  // and immediately starts the next, so each set's clip includes the lead-in since the previous cut (pre-roll) and the
  // autosave pause after the last rep (post-roll). trimIdle() restarts an idle segment so the pre-roll stays short.
  function createRecorder(stream, { mime, bps = 1e6, now = () => performance.now() } = {}) {
    let rec = null, chunks = [], t0 = 0, stopped = false;
    function start() {
      if (stopped || !stream || !stream.getVideoTracks().some(t => t.readyState === 'live')) { rec = null; return; }
      chunks = []; t0 = now();
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: bps } : { videoBitsPerSecond: bps });
      const my = chunks; rec.ondataavailable = e => { if (e.data && e.data.size) my.push(e.data); };
      rec.start(1000);
    }
    function end() {
      const r = rec, my = chunks, start0 = t0; rec = null;
      if (!r || r.state === 'inactive') return Promise.resolve(null);
      return new Promise(res => { r.onstop = () => res({ blob: new Blob(my, { type: (r.mimeType || mime || 'video/webm') }), t0: start0, t1: now() }); try { r.stop(); } catch { res(null); } });
    }
    start();
    return {
      t0: () => t0, active: () => !!rec,
      async cut() { const p = end(); start(); return p; },
      async trimIdle(maxMs) { if (rec && now() - t0 > maxMs) { const p = end(); start(); await p; } },
      async stop() { stopped = true; return end(); }
    };
  }
  const api = { KEYS, MIMES, MAX_BYTES, QUEUE_CFG, abortInflight, pickMime, rid, labelFrom, createQueue, idbKV, httpSender, createRecorder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Feedback = api;
})(typeof self !== 'undefined' ? self : this);
