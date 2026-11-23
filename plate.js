/* v8.45 plate tracker (side-angle bench). The pose collapses when the plate hides the upper body from the side, so the bar is
   followed as a dark blob instead: per-pixel causal background (fast toward brighter, slow toward darker) on a tiny gray frame,
   dark mask = bg − frame > dark, centroid y + mass. The counter (Reps.createCounter wrapper, reps.js) turns the y track into reps.
   Cheap: PLATE_CFG.frameW (72) px wide gray frame at PLATE_CFG.hz. UMD: browser (window.Plate) and node (eval). */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.Plate = f(); })(this, function () {
  const PLATE_CFG = {
    hz: 15,            // tracker frames per second
    frameW: 72,        // gray frame width (height follows aspect)
    dark: 40,          // a pixel is "plate" when background − gray > dark (0–255)
    edge: 0.05,        // ignore this fraction of columns at the left edge (frame border artefacts)
    bgUp: 0.25,        // background follows a brighter pixel fast (plate left this pixel)
    bgDown: 0.004,     // …and a darker one slowly (a plate that stays put fades into the background over ~15 s)
    minMass: 0.0009,   // fraction of frame pixels needed for a valid sample
    // counter (createPlateCounter): zigzag on the smoothed centroid y, reps grouped into runs
    smooth: 3,         // moving average over this many valid samples
    prom: 0.03,        // a bottom/top needs this much reversal (fraction of frame height)
    maxGap: 4,         // s between reps of one run (longer = a new run)
    minGap: 0.6,       // s, faster "reps" are noise
    ampRatio: 2.5,     // a rep whose amplitude is off the run median by more than this factor starts a new run
    minRun: 3,         // reps for a run to count as a set
    dwellAmp: 0.015,   // unrack: the first bottom of a run where the plate sat within dwellAmp for more than maxDwell s is the bar
    maxDwell: 0.8,     //   resting in the hooks / hands before the set (real rep bottoms turn around in ≤ 0.35 s)
    edgeGap: 2,        // first/last rep of a run whose gap to its neighbour is > edgeGap × the run's median gap = unrack / rack, not a rep
    stillS: 2.5,       // rack-and-still set end: after a valid run the plate stays within stillAmp for stillS…
    stillAmp: 0.02,
    minValid: 0.6,     // on-mode: plate is authoritative only when ≥ this share of recent samples saw the plate
  };
  function toGray(rgba, w, h, out) { out = out || new Uint8ClampedArray(w * h); for (let i = 0, j = 0; i < w * h; i++, j += 4) out[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8; return out; }
  function createPlateTracker(cfg) {
    const c = Object.assign({}, PLATE_CFG, cfg || {}); let bg = null, W = 0, H = 0, lastT = -1e9;
    return {
      cfg: c,
      due(t) { return t - lastT >= 1 / c.hz - 1e-3; },
      reset() { bg = null; },
      // gray: Uint8 array w*h. Returns [t, y (0..1, null if no plate), mass]
      frame(t, gray, w, h) {
        lastT = t; if (!bg || W !== w || H !== h) { W = w; H = h; bg = Float32Array.from(gray); return [t, null, 0]; }
        const x0 = Math.ceil(c.edge * w); let n = 0, sy = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, g = gray[i], b = bg[i];
          if (x >= x0 && b - g > c.dark) { n++; sy += y; }
          bg[i] = g > b ? b + (g - b) * c.bgUp : b - (b - g) * c.bgDown; }
        const m = n / (w * h); return [t, m >= c.minMass ? (sy / n + 0.5) / h : null, m];
      },
    };
  }
  // Plate rep counter: feed [t, y|null, mass] samples in time order. A rep = bottom (plate low, y max) followed by a rise of ≥ prom.
  function createPlateCounter(cfg) {
    const c = Object.assign({}, PLATE_CFG, cfg || {}); let buf = [], leg = [], dir = 0, ext = null, extT = 0, lastTop = null, runs = [], cur = null, nValid = 0, n = 0, lastT = null, ended = false, win = [];
    function push(t, y) {
      n++; if (y == null) { if (lastT != null && t - lastT > 0.5) buf = []; return; }
      nValid++; lastT = t; buf.push(y); if (buf.length > c.smooth) buf.shift(); const v = buf.reduce((a, b) => a + b, 0) / buf.length;
      win.push([t, v]); while (win.length && win[0][0] < t - c.stillS) win.shift();
      if (ext == null) { ext = v; extT = t; dir = 0; lastTop = v; return; }
      leg.push([t, v]); if (leg.length > 200) leg.shift();
      if (dir >= 0) { // going down (y grows) toward a bottom
        if (v > ext) { ext = v; extT = t; } else if (ext - v >= c.prom) { if (dir > 0 || ext - lastTop >= c.prom) rep(t, ext - (lastTop ?? ext), extT, dwell(ext, extT)); dir = -1; ext = v; extT = t; leg = []; }
      } else { // going up toward a top
        if (v < ext) { ext = v; extT = t; } else if (v - ext >= c.prom) { lastTop = ext; dir = 1; ext = v; extT = t; leg = []; }
      }
      if (cur && cur.reps.length >= c.minRun && !cur.ended && win.length > 2 && win[0][0] <= t - c.stillS + 0.2) {
        let lo = 1, hi = 0; for (const w of win) { lo = Math.min(lo, w[1]); hi = Math.max(hi, w[1]); }
        if (hi - lo < c.stillAmp && t - cur.reps[cur.reps.length - 1] >= c.stillS) { cur.ended = t; ended = true; }
      }
    }
    // how long the plate sat near this bottom before it (s): a racked/hand-held bar sits, a rep turns around
    function dwell(e, te) { let t0 = te; for (let i = leg.length - 1; i >= 0; i--) { const [tt, vv] = leg[i]; if (tt > te) continue; if (vv < e - c.dwellAmp) break; t0 = tt; } return te - t0; }
    function rep(t, amp, tb, dw) {
      const md = cur && cur.amps.length ? [...cur.amps].sort((a, b) => a - b)[cur.amps.length >> 1] : null, g = cur ? t - cur.reps[cur.reps.length - 1] : null;
      if (cur && !cur.ended && g <= c.maxGap && g >= c.minGap && amp <= md * c.ampRatio && amp >= md / c.ampRatio) { cur.reps.push(t); cur.amps.push(amp); cur.bot.push(tb); cur.dw.push(dw); return; }
      if (cur && g != null && g < c.minGap) return; // too fast: noise inside the current run
      cur = { reps: [t], amps: [amp], bot: [tb], dw: [dw], ended: false }; runs.push(cur);
    }
    // bottoms of a run minus the unrack / rack motions at its edges (gap check on bottom times)
    function trim(r) { let i0 = 0, i1 = r.bot.length; if (i1 < 3) return r;
      const g = []; for (let i = 1; i < i1; i++) g.push(r.bot[i] - r.bot[i - 1]); const md = [...g].sort((a, b) => a - b)[(g.length - 1) >> 1];
      if (g[0] > c.edgeGap * md || r.dw[0] > c.maxDwell) i0 = 1; if (i1 - i0 >= 3 && g[g.length - 1] > c.edgeGap * md) i1--;
      return { ...r, reps: r.reps.slice(i0, i1), amps: r.amps.slice(i0, i1), bot: r.bot.slice(i0, i1), dw: r.dw.slice(i0, i1), trimmed: r.reps.length - (i1 - i0) }; }
    function best() { let b = null; for (const r0 of runs) { const r = trim(r0); if (r.reps.length >= c.minRun && (!b || r.reps.length >= b.reps.length)) b = r; } return b; }
    return { cfg: c, push, best, get runs() { return runs; }, get ended() { return ended; }, get validShare() { return n ? nValid / n : 0; },
      get reps() { const b = best(); return b ? b.reps.length : 0; }, get repTimes() { const b = best(); return b ? b.reps : []; } };
  }
  // v8.45 plate-based bench counter. Kill switch localStorage repcam.plateBench = off | shadow | on (default PLATE_MODE.mode).
  // shadow: counting is exactly the pose counter (baseline); the plate count is only logged. on: while the plate is seen
  // (validShare ≥ minValid) the set's reps/repTimes come from the plate, and rack-and-still (plate still for stillS after a valid run)
  // ends the set at once (counter.plateEnded → the app/eval autosave).
  const PLATE_MODE = { mode: 'on' /* v8.45 shipped on: gate 5 better, 0 worse; repcam.plateBench=shadow|off to revert */, exercises: ['benkpress', 'skråbenk'], angles: ['side'], minSamples: 30, log: [] };
  // v8.51b: plate must not be authoritative when nobody is pressing (empty rack / bar at rest). Live 20.11
  // false benches (mwp4lpaf, mwp4m8eo, tail of mwp4ijue) all had pose:0 and plate:5–6. Real side benches in
  // the eval still had ≥1 pose rep even when the plate hid most of the set. Kill switch: localStorage
  // repcam.platePerson = off | shadow | on. Shadow: log only, plate stays authoritative (old path).
  const PLATE_PERSON_CFG = { mode: 'on', poseRepsMin: 1, log: [] };
  // shared sample feed: the app pushes live tracker samples, the eval preloads a stored track; `now` = time of the current pose frame
  function createFeed(track) { const f = { s: track ? track.slice() : [], base: 0, now: -Infinity,
    push(t, y, m) { this.s.push([t, y, m]); if (this.s.length > 20000) { this.s.splice(0, 10000); this.base += 10000; } } }; return f; }
  function wrapCounter(pose, feed, id, cfg) {
    let pc, at, start, seen; const mode = () => PLATE_MODE.mode;
    const fresh = () => { pc = createPlateCounter(cfg); at = null; start = feed.now; seen = 0; }; fresh();
    const personOk = () => {
      const min = PLATE_PERSON_CFG.poseRepsMin || 1, has = (pose.reps || 0) >= min;
      if (PLATE_PERSON_CFG.mode !== 'off' && seen >= PLATE_MODE.minSamples && pc.validShare >= pc.cfg.minValid && !has) {
        const e = { ex: id, mode: PLATE_PERSON_CFG.mode, pose: pose.reps, plate: pc.reps, ok: has, min };
        if (PLATE_PERSON_CFG.log.length < 20) PLATE_PERSON_CFG.log.push(e);
      }
      if (PLATE_PERSON_CFG.mode === 'off' || PLATE_PERSON_CFG.mode === 'shadow') return true;
      return has;
    };
    const auth = () => mode() === 'on' && seen >= PLATE_MODE.minSamples && pc.validShare >= pc.cfg.minValid && personOk();
    function consume(t) { if (at == null) { let i = 0; while (i < feed.s.length && feed.s[i][0] < start) i++; at = feed.base + i; }
      while (at - feed.base < feed.s.length) { const r = feed.s[Math.max(0, at - feed.base)]; if (r[0] > t) break; if (r[0] >= start) { pc.push(r[0], r[1]); seen++; } at++; } }
    const W = Object.create(null);
    W.update = (lm, ms, asp, cam) => { consume(ms / 1000); const o = pose.update(lm, ms, asp, cam); if (auth()) return { ...o, reps: pc.reps }; return o; };
    W.flush = () => { const p = pose.flush(), pr = pc.reps, e = { ex: id, mode: mode(), pose: p, plate: pr, valid: +pc.validShare.toFixed(2), runs: pc.runs.filter(r => r.reps.length >= 2).map(r => [r.reps.length, +r.bot[0].toFixed(1), +r.bot[r.bot.length - 1].toFixed(1)]), ended: pc.ended };
      if (mode() !== 'off') { PLATE_MODE.log.push(e); if (PLATE_MODE.log.length > 50) PLATE_MODE.log.shift(); }
      return auth() ? pr : p; };
    W.forget = a => { pose.forget(a); fresh(); };
    W.reset = () => { pose.reset(); fresh(); };
    W.progress = () => pose.progress();
    Object.defineProperties(W, {
      reps: { get: () => auth() ? pc.reps : pose.reps }, repTimes: { get: () => auth() ? pc.repTimes : pose.repTimes },
      lastRepT: { get: () => auth() ? (pc.repTimes.length ? pc.repTimes[pc.repTimes.length - 1] : null) : pose.lastRepT },
      tentative: { get: () => pose.tentative }, rejected: { get: () => pose.rejected }, repAmps: { get: () => pose.repAmps }, def: { get: () => pose.def },
      heldLock: { get: () => !!pose.heldLock, set: v => { pose.heldLock = !!v; } },
      plateEnded: { get: () => auth() && pc.ended && pc.reps >= pc.cfg.minRun }, plate: { get: () => pc },
    });
    return W;
  }
  return { PLATE_CFG, PLATE_MODE, PLATE_PERSON_CFG, createPlateTracker, createPlateCounter, createFeed, wrapCounter, toGray };
});
