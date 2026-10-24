// RepCam rep engine (UMD: browser + node). Same code runs in the app and in the offline eval harness.
// Landmarks: MediaPipe Pose (33 points, normalized x/y, y grows downward, optional visibility).
(function (root) {
  'use strict';
  const NOSE = 0, LSH = 11, RSH = 12, LEL = 13, REL = 14, LWR = 15, RWR = 16, LHIP = 23, RHIP = 24, LKN = 25, RKN = 26, LAN = 27, RAN = 28;
  const vis = p => p ? (p.visibility ?? p[3] ?? 1) : 0;
  const P = (lm, i) => { const p = lm[i]; if (!p) return null; return Array.isArray(p) ? { x: p[0], y: p[1], visibility: p[3] } : p; };
  function angle(a, b, c) {
    if (!a || !b || !c) return null;
    const v1 = [a.x - b.x, a.y - b.y], v2 = [c.x - b.x, c.y - b.y];
    const d = Math.hypot(...v1) * Math.hypot(...v2);
    if (!d) return null;
    const cos = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / d));
    return Math.acos(cos) * 180 / Math.PI;
  }
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(vis(a), vis(b)) });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // Per-frame geometry, normalized to the frame aspect ratio (x scaled by aspect so distances are isotropic).
  function geom(lmRaw, aspect = 1) {
    if (!lmRaw || lmRaw.length < 29) return null;
    const g = i => { const p = P(lmRaw, i); return p && { x: p.x * aspect, y: p.y, visibility: vis(p) }; };
    const sh = [g(LSH), g(RSH)], el = [g(LEL), g(REL)], wr = [g(LWR), g(RWR)], hip = [g(LHIP), g(RHIP)], kn = [g(LKN), g(RKN)], an = [g(LAN), g(RAN)];
    const shM = mid(sh[0], sh[1]), hipM = mid(hip[0], hip[1]);
    if (vis(shM) < 0.3 || vis(hipM) < 0.3) return null;
    const torso = dist(shM, hipM);
    if (!(torso > 0.02)) return null;
    // best visible side for limb chains
    const sideScore = s => Math.min(vis(sh[s]), vis(el[s]), vis(wr[s]));
    const legScore = s => Math.min(vis(hip[s]), vis(kn[s]), vis(an[s]));
    const arm = sideScore(0) >= sideScore(1) ? 0 : 1, leg = legScore(0) >= legScore(1) ? 0 : 1;
    const armsVis = Math.max(sideScore(0), sideScore(1)), legsVis = Math.max(legScore(0), legScore(1));
    const wrM = mid(wr[0], wr[1]);
    return { sh, el, wr, hip, kn, an, shM, hipM, wrM, torso, shW: dist(sh[0], sh[1]), arm, leg, armsVis, legsVis, nose: g(NOSE),
      torsoTilt: Math.atan2(Math.abs(shM.x - hipM.x), hipM.y - shM.y) * 180 / Math.PI, // 0 = upright, 90 = horizontal, >90 head below hips
      elbow: [angle(sh[0], el[0], wr[0]), angle(sh[1], el[1], wr[1])],
      knee: [angle(hip[0], kn[0], an[0]), angle(hip[1], kn[1], an[1])] };
  }
  // Exercise definitions: each defines a scalar signal where the REST (start) position is HIGH,
  // normalized by a body length so it is camera-distance independent.
  // ref = running reference torso length (max seen in set) so foreshortening during hinge shows up.
  const EX = {
    knebøy: { minAmp: 0.22, minRep: 0.6, maxRep: 8, need: 'legs',
      signal: (g, ref) => (Math.min(g.kn[0].y, g.kn[1].y, Math.max(g.kn[0].y, g.kn[1].y)) - g.hipM.y) / ref },
    bulgarsk: { minAmp: 0.18, minRep: 0.6, maxRep: 8, need: 'legs',
      // front leg = knee closest to hip height
      signal: (g, ref) => (Math.min(g.kn[0].y, g.kn[1].y) - g.hipM.y) / ref },
    pullups: { minAmp: 0.25, minRep: 0.6, maxRep: 8, need: 'arms',
      signal: (g, ref) => (g.shM.y - g.wrM.y) / ref,
      valid: raw => raw > -0.5, // wrists well below shoulders = not hanging from the bar
      // knee height relative to hip; hanging leg raises bring the knees up to/above the hips
      aux: (g, ref) => g.legsVis > 0.4 ? (Math.max(g.kn[0].y, g.kn[1].y) - g.hipM.y) / ref : null,
      auxOk: (lo) => lo == null || lo > 0.0 },
    dips: { minAmp: 0.15, minRep: 0.5, maxRep: 8, need: 'arms',
      signal: (g, ref) => (g.wrM.y - g.shM.y) / ref },
    // flat bench: wrist-to-shoulder distance; body size = max(torso, 1.25 x shoulder width) because the torso is
    // strongly foreshortened when filmed from the feet or head end of the bench
    benkpress: { minAmp: 0.2, minRep: 0.5, maxRep: 8, need: 'arms', bodyRef: true, riseCap: 0.4, trimLead: 0.7, // riseCap: a start-up spike must not inflate the required return
      // shoulders must stay put on the bench during a rep (rejects lying down onto the bench / sitting up after re-racking)
      aux: g => g.shM.y, aux2: g => g.torsoTilt,
      auxOk: (lo, hi, ref, lo2, hi2) => lo == null || hi - lo < 0.4 * ref || !(hi2 - lo2 > 30),
     
      signal: (g, ref) => dist(g.wr[g.arm], g.sh[g.arm]) / ref },
    skråbenk: { minAmp: 0.2, minRep: 0.5, maxRep: 8, need: 'arms', trimLead: 0.7,
      signal: (g, ref) => dist(g.wr[g.arm], g.sh[g.arm]) / ref },
    halvmark: { minAmp: 0.22, minRep: 0.7, maxRep: 10, need: 'torso',
      signal: (g, ref) => (g.hipM.y - g.shM.y) / ref },
    roing: { minAmp: 0.15, minRep: 0.4, maxRep: 8, need: 'arms', refWin: 2, // torso angle ~constant while rowing -> use recent torso length (robust to camera zoom/drift)
      signal: (g, ref) => dist(g.wr[g.arm], g.sh[g.arm]) / ref }
  };
  const IDS = Object.keys(EX);

  // Generic adaptive hysteresis counter on a rest-high signal.
  // Pipeline per frame: geometry -> exercise signal -> validity gate -> median-of-3 spike filter -> EMA (tau)
  // -> top/down state machine with adaptive thresholds (median amplitude of the set's reps)
  // -> pending rep, confirmed once the top settles (rejects "reps" whose start was not a real top,
  //    e.g. clip/set starting in the bottom position or unracking).
  function createCounter(exId = 'knebøy', opts = {}) {
    const def = { ...EX[exId] || EX.knebøy, ...opts };
    const tau = def.tau ?? 0.12, topWin = def.topWin ?? 2, cntRatio = def.cntRatio ?? 0.5, overshoot = def.overshoot ?? 0.6;
    let s0T = null, repAmps = [], s, lastT, ref, refBuf, state, top, hist, lo, tDown, reps, amps, lastRepT, lastGood, repTimes, raw3, pend, auxLo, auxHi, aux2Lo, aux2Hi, onRep = opts.onRep;
    function reset() { s = null; lastT = null; ref = 0; refBuf = []; state = 'top'; top = []; hist = []; lo = null; tDown = 0; reps = 0; amps = []; lastRepT = null; lastGood = null; repTimes = []; repAmps = []; raw3 = []; pend = null; s0T = null; }
    reset();
    const typAmp = () => { if (!amps.length) return null; const a = [...amps].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    const hiNow = () => top.length ? Math.max(...top.map(p => p[1])) : s;
    function confirm(ok, t) {
      const p = pend; pend = null;
      if (!ok) return;
      reps++; amps.push(p.amp); if (amps.length > 8) amps.shift(); lastRepT = p.t; repTimes.push(p.t); repAmps.push(p.amp); onRep && onRep(reps, p.t);
    }
    function update(lm, tMs, aspect = 1) {
      const t = tMs / 1000;
      const g = lm && geom(lm, aspect);
      const ok = g && (def.need === 'legs' ? g.legsVis > 0.4 : def.need === 'arms' ? g.armsVis > 0.4 : true);
      if (!ok) { checkPend(t, true); return out(false); }
      const body = def.bodyRef ? Math.max(g.torso, 1.25 * g.shW) : g.torso;
      ref = Math.max(ref * Math.exp(-(lastT == null ? 0 : Math.max(0, t - lastT)) / 60), body); // slowly decaying max torso length
      if (def.refWin) { refBuf.push([t, body]); while (refBuf[0][0] < t - def.refWin) refBuf.shift(); }
      let raw = def.signal(g, def.refWin ? Math.max(...refBuf.map(p => p[1])) : ref);
      if (raw == null || !isFinite(raw) || (def.valid && !def.valid(raw, g, ref))) { checkPend(t, true); return out(false); }
      if (lastGood != null && t - lastGood > 1.5) { checkPend(t, true); s = null; s0T = null; state = 'top'; top = []; hist = []; raw3 = []; } // long dropout: restart tracking (keep reps)
      raw3.push(raw); if (raw3.length > 3) raw3.shift();
      if (raw3.length === 3) raw = [...raw3].sort((x, y) => x - y)[1];
      const dt = lastT == null ? 0 : Math.max(0, t - lastT); lastT = t; lastGood = t;
      const a = s == null ? 1 : 1 - Math.exp(-dt / tau);
      s = s == null ? raw : s + a * (raw - s);
      if (s0T == null) s0T = t;
      const settled = t - s0T >= 1, aux = def.aux && settled ? def.aux(g, ref) : null, aux2 = def.aux2 && settled ? def.aux2(g, ref) : null; // landmarks settle during the first second of tracking
      hist.push([t, s]); while (hist[0][0] < t - 12) hist.shift();
      const ta = typAmp();
      const thrDown = Math.max(def.minAmp * 0.5, ta ? 0.35 * ta : 0);
      if (pend) { if (s > pend.pk) { pend.pk = s; pend.tPk = t; } checkPend(t, false); }
      if (state === 'top') {
        top.push([t, s]); while (top.length && top[0][0] < t - topWin) top.shift();
        const hi = hiNow();
        if (hi - s > thrDown) { if (pend) checkPend(t, true); state = 'down'; lo = s; tDown = t; top0 = hi; auxLo = aux; auxHi = aux; aux2Lo = aux2; aux2Hi = aux2; }
      } else {
        if (s < lo) lo = s;
        if (aux != null) { auxLo = auxLo == null ? aux : Math.min(auxLo, aux); auxHi = auxHi == null ? aux : Math.max(auxHi, aux); }
        if (aux2 != null) { aux2Lo = aux2Lo == null ? aux2 : Math.min(aux2Lo, aux2); aux2Hi = aux2Hi == null ? aux2 : Math.max(aux2Hi, aux2); }
        const amp = top0 - lo;
        if (t - tDown > def.maxRep) {
          // stuck in 'down' (e.g. the descent started from a spike): re-anchor on the highest point of the last few seconds
          let bi = -1; for (let i = 0; i < hist.length; i++) if (hist[i][0] >= t - 4 && (bi < 0 || hist[i][1] > hist[bi][1])) bi = i;
          top0 = hist[bi][1]; tDown = hist[bi][0]; lo = Math.min(...hist.slice(bi).map(p => p[1]));
          if (top0 - s < thrDown) { state = 'top'; top = hist.slice(bi).filter(p => p[0] >= t - topWin); }
        }
        else if (s - lo > Math.max(def.minAmp * 0.6, Math.min(0.6 * amp, ta ? 0.6 * ta : Infinity, ta ? Infinity : def.riseCap ?? Infinity))) {
          const auxOk = !def.auxOk || def.auxOk(auxLo, auxHi, ref, aux2Lo, aux2Hi);
          if (amp >= def.minAmp && t - tDown >= def.minRep * 0.5 && (ta == null || amp > cntRatio * ta) && auxOk) {
            pend = { t, amp, start: top0, lo, pk: s, tPk: t };
          }
          state = 'top'; top = [[t, s]];
        }
      }
      return out(true);
    }
    let top0 = 0;
    // A pending rep is confirmed when the signal has settled at the top (no new max for 0.35 s), on the next descent, or on dropout/flush.
    // It is rejected if the signal kept rising far above where the descent started (the "top" was not a real top).
    function checkPend(t, force) {
      if (!pend) return;
      const settled = t - pend.tPk > 0.35;
      if (!force && !settled) return;
      confirm(pend.pk - pend.start <= overshoot * pend.amp, t);
    }
    // At the end of a set, optionally drop LEADING "reps" that are much smaller than the rest of the set
    // (setup wiggles with the hands on the racked bar, kicking dumbbells up). Only used for the presses.
    function flush() {
      checkPend(Infinity, true);
      if (def.trimLead && reps >= 3) {
        let k = 0;
        while (k < reps - 2) {
          const rest = repAmps.slice(k + 1).sort((x, y) => x - y), m = rest[Math.floor(rest.length / 2)];
          if (repAmps[k] < def.trimLead * m) k++; else break;
        }
        if (k) { reps -= k; repTimes.splice(0, k); repAmps.splice(0, k); }
      }
      return reps;
    }
    function out(tracking) { return { reps, state, signal: s, tracking, progress: progress(), pending: !!pend }; }
    function progress() { if (s == null) return 0; const hi = state === 'top' ? hiNow() : top0; const ta = typAmp() || def.minAmp * 1.6; return Math.max(0, Math.min(1, (hi - s) / ta)); }
    return { update, progress, flush, reset,
      get reps() { return reps; }, get lastRepT() { return lastRepT; }, get repTimes() { return repTimes; }, def };
  }

  // Best-effort exercise recognition from a sliding window of pose features.
  function createRecognizer(opts = {}) {
    const win = opts.window ?? 6; // seconds
    const buf = [];
    function update(lm, tMs, aspect = 1) {
      const t = tMs / 1000, g = lm && geom(lm, aspect);
      if (g) buf.push({ t, g });
      while (buf.length && buf[0].t < t - win) buf.shift();
      return classify();
    }
    function q(arr, p) { const a = arr.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))]; }
    const rng = arr => { const a = q(arr, 0.9), b = q(arr, 0.1); return a == null ? 0 : a - b; };
    function features() {
      if (buf.length < 8) return null;
      const ref = Math.max(...buf.map(b => b.g.torso));
      const n = k => buf.map(b => k(b.g) / ref);
      const f = {
        tilt: q(buf.map(b => b.g.torsoTilt), 0.5), tiltRange: rng(buf.map(b => b.g.torsoTilt)),
        wrUp: q(n(g => g.shM.y - g.wrM.y), 0.5), // wrists above shoulders (+)
        wrHead: q(buf.map(b => b.g.nose ? (b.g.nose.y - b.g.wrM.y) / ref : null), 0.5),
        shMove: rng(n(g => g.shM.y)), hipMove: rng(n(g => g.hipM.y)), wrMove: rng(n(g => g.wrM.y)),
        wrRel: rng(n(g => g.wrM.y - g.shM.y)), wrDist: rng(n(g => dist(g.wr[g.arm], g.sh[g.arm]))),
        hipKnee: rng(n(g => Math.min(g.kn[0].y, g.kn[1].y) - g.hipM.y)), hinge: rng(n(g => g.hipM.y - g.shM.y)),
        knee: q(buf.map(b => Math.max(b.g.knee[0] ?? 0, b.g.knee[1] ?? 0)), 0.5),
        kneeMin: q(buf.map(b => Math.min(b.g.knee[0] ?? 180, b.g.knee[1] ?? 180)), 0.1),
        // split stance: one knee much lower than the other at some point (any view), or feet far apart front-to-back (side view)
        kneeDy: q(buf.map(b => Math.abs(b.g.kn[0].y - b.g.kn[1].y) / ref), 0.9),
        ankDx: q(buf.map(b => Math.abs(b.g.an[0].x - b.g.an[1].x) / ref), 0.5),
        // vertical torso extent relative to shoulder width: small when lying flat (side view: shoulders level with hips;
        // end views: torso foreshortened), large on an incline bench where the shoulders are well above the hips
        dyShW: q(buf.map(b => Math.abs(b.g.shM.y - b.g.hipM.y) / Math.max(b.g.shW, 1e-3)), 0.5),
        legsVis: q(buf.map(b => b.g.legsVis), 0.5), armsVis: q(buf.map(b => b.g.armsVis), 0.5)
      };
      return f;
    }
    function classify() {
      const f = features(); if (!f) return { best: null, conf: 0, scores: {} };
      const S = {}, sig = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
      const moving = Math.max(f.shMove, f.hipMove, f.wrMove, f.wrDist);
      // body moves, hands fixed
      const bodyMoves = sig(f.shMove, 0.08, 0.3), handsFixed = 1 - sig(f.wrRel / Math.max(0.05, f.shMove + 0.05), 0.6, 1.2);
      S.pullups = sig(Math.max(f.wrHead ?? -1, f.wrUp - 0.25), 0, 0.3) * bodyMoves * (1 - sig(f.tilt, 30, 50)) * (0.5 + 0.5 * sig(f.wrRel, 0.2, 0.5))
        * (1 - sig(f.wrMove / Math.max(0.05, f.shMove), 1.5, 2.5)); // hands hang on a fixed bar (a press from the feet end has moving hands, still shoulders)
      S.dips = (1 - sig(f.wrUp, -0.2, 0.1)) * sig(f.wrUp, -1.4, -0.5) * bodyMoves * (1 - sig(f.tilt, 35, 60)) * (1 - sig(f.hipKnee, 0.35, 0.6)) * (1 - 0.6 * sig(f.wrMove / Math.max(0.05, f.shMove), 0.6, 1)) * sig(f.wrRel, 0.1, 0.3);
      const press = sig(f.wrDist, 0.15, 0.4) * (1 - sig(f.shMove / Math.max(0.05, f.wrMove), 0.5, 0.9)) * sig(f.wrUp, -0.3, 0.2) * (1 - sig(f.wrHead ?? 0, 0.5, 0.9) * 0.5);
      // flat vs incline: side/oblique view -> torso tilt (incline ~25-65 deg from vertical, flat ~70-110, >95 = head-end view);
      // in the tilt band the torso must also rise clearly (dyShW); frontal views (tilt < 25) are flat unless the torso is long
      const incline = Math.max(sig(f.tilt, 20, 30) * (1 - sig(f.tilt, 64, 72)) * sig(f.dyShW, 0.9, 1.05),
        (1 - sig(f.tilt, 20, 30)) * sig(f.dyShW, 1.8, 2.2));
      S.skråbenk = press * incline;
      S.benkpress = press * (1 - incline);
      S.roing = sig(f.wrDist, 0.1, 0.3) * sig(f.tilt, 25, 45) * (1 - sig(f.tiltRange, 25, 45)) * (1 - sig(f.wrUp, -0.4, 0)) * (1 - sig(f.hinge, 0.35, 0.6));
      S.halvmark = sig(f.hinge, 0.2, 0.45) * sig(f.tiltRange, 20, 40) * sig(f.knee, 130, 155) * (1 - sig(f.wrUp, -0.3, 0));
      const squatish = sig(f.hipKnee, 0.15, 0.4) * (1 - sig(f.wrUp, 0.2, 0.6) * 0.3) * (1 - sig(f.tilt, 45, 70));
      const split = Math.max(sig(f.kneeDy, 0.3, 0.42), sig(f.ankDx, 1.12, 1.3));
      S.knebøy = squatish * (1 - split);
      S.bulgarsk = squatish * split;
      let best = null, bs = 0; for (const k in S) if (S[k] > bs) { bs = S[k]; best = k; }
      const sorted = Object.values(S).sort((a, b) => b - a);
      return { best: bs > 0.12 ? best : null, conf: bs ? (sorted[0] - (sorted[1] || 0)) / sorted[0] : 0, scores: S, features: f, moving };
    }
    return { update, classify, features, reset() { buf.length = 0; } };
  }
  // Legacy knee-angle counter API kept for backward compat (v1 tests)
  function createAngleCounter(opts = {}) {
    const down = opts.down ?? 100, up = opts.up ?? 160, alpha = opts.alpha ?? 0.4, minFrames = opts.minFrames ?? 3;
    let s = null, state = 'up', reps = 0, cnt = 0;
    return {
      update(a) {
        if (a == null || isNaN(a)) return { reps, state, angle: s };
        s = s == null ? a : alpha * a + (1 - alpha) * s;
        if (state === 'up' && s < down) { if (++cnt >= minFrames) { state = 'down'; cnt = 0; } }
        else if (state === 'down' && s > up) { if (++cnt >= minFrames) { state = 'up'; reps++; cnt = 0; } }
        else cnt = 0;
        return { reps, state, angle: s };
      },
      reset() { reps = 0; state = 'up'; cnt = 0; }, get reps() { return reps; }
    };
  }
  const api = { angle, geom, EX, IDS, createCounter, createRecognizer, createAngleCounter };
  if (typeof module !== 'undefined') module.exports = api; else root.Reps = api;
})(this);
