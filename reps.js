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
    knebøy: { minAmp: 0.22, minRep: 0.6, maxRep: 8, need: 'legs', posture: g => g.torsoTilt < 65,
      signal: (g, ref) => (Math.min(g.kn[0].y, g.kn[1].y, Math.max(g.kn[0].y, g.kn[1].y)) - g.hipM.y) / ref },
    bulgarsk: { minAmp: 0.18, minRep: 0.6, maxRep: 8, need: 'legs', posture: g => g.torsoTilt < 65,
      // front leg = knee closest to hip height
      signal: (g, ref) => (Math.min(g.kn[0].y, g.kn[1].y) - g.hipM.y) / ref },
    pullups: { bodyMove: 0.25, minAmp: 0.25, minRep: 0.6, maxRep: 8, need: 'arms', posture: (g, ref) => g.wrM.y < g.shM.y + 0.3 * ref && g.torsoTilt < 50,
      signal: (g, ref) => (g.shM.y - g.wrM.y) / ref,
      valid: raw => raw > -0.5, // wrists well below shoulders = not hanging from the bar
      // knee height relative to hip; hanging leg raises bring the knees up to/above the hips
      aux: (g, ref) => g.legsVis > 0.4 ? (Math.max(g.kn[0].y, g.kn[1].y) - g.hipM.y) / ref : null,
      auxOk: (lo) => lo == null || lo > 0.0 },
    dips: { bodyMove: 0.25, poseMin: 0.3, minAmp: 0.15, minRep: 0.5, maxRep: 8, need: 'arms',
      posture: (g, ref) => g.wrM.y > g.shM.y - 0.4 * ref && g.wrM.y < g.hipM.y + 0.35 * ref && g.torsoTilt < 65, // upright, supported on the hands (at hip height, not hanging by the sides)
      signal: (g, ref) => (g.wrM.y - g.shM.y) / ref },
    // flat bench: wrist-to-shoulder distance; body size = max(torso, 1.25 x shoulder width) because the torso is
    // strongly foreshortened when filmed from the feet or head end of the bench
    benkpress: { lying: true, poseMin: 0.4, minAmp: 0.2,
      // lying on the bench: torso horizontal (side views) or foreshortened (feet/head-end views), or the bar held above the
      // shoulders (elevated feet-end views make the torso look upright) — not standing with the hands down (loading plates);
      // an upside-down torso (head-end view) must show the shoulder width, a narrow one is a misdetected close-up
      posture: (g, ref) => g.torsoTilt >= 135 ? g.shW > 0.5 * g.torso : (g.torsoTilt > 50 || Math.abs(g.shM.y - g.hipM.y) < 1.0 * g.shW || g.wrM.y < g.shM.y - 0.1 * ref), minRep: 0.5, maxRep: 8, need: 'arms', bodyRef: true, riseCap: 0.4, trimLead: 0.7, // riseCap: a start-up spike must not inflate the required return
      // shoulders must stay put on the bench during a rep (rejects lying down onto the bench / sitting up after re-racking)
      aux: g => g.shM.y, aux2: g => g.torsoTilt,
      auxOk: (lo, hi, ref, lo2, hi2) => lo == null || hi - lo < 0.4 * ref || !(hi2 - lo2 > 30),
     
      signal: (g, ref) => dist(g.wr[g.arm], g.sh[g.arm]) / ref },
    skråbenk: { lying: true, minAmp: 0.2,
      // reclined on the bench: torso tilted back, or (frontal view) seated with bent knees / legs hidden by the bench
      posture: g => g.torsoTilt > 18 || g.legsVis < 0.4 || Math.min(g.knee[0] ?? 180, g.knee[1] ?? 180) < 150, minRep: 0.5, maxRep: 8, need: 'arms', trimLead: 0.7,
      signal: (g, ref) => dist(g.wr[g.arm], g.sh[g.arm]) / ref },
    // v8.8: standing hinge — legs visible (head-on push-ups hide them) and the hands not planted far below the hips
    halvmark: { minAmp: 0.22, minRep: 0.7, maxRep: 10, need: 'torso', posture: (g, ref) => g.legsVis > 0.4 && g.wrM.y - g.hipM.y < 0.8 * ref,
      signal: (g, ref) => (g.hipM.y - g.shM.y) / ref },
     roing: { minAmp: 0.15, minRep: 0.4, maxRep: 8, need: 'arms', refWin: 2, // torso angle ~constant while rowing -> use recent torso length (robust to camera zoom/drift)
      signal: (g, ref) => dist(g.wr[g.arm], g.sh[g.arm]) / ref },
    // push-up: wrists planted below the shoulders (rest = arms extended, body high). Same scalar family as dips, but the
    // recognizer tells them apart by torso orientation (push-up body horizontal, dips upright). bodyRef handles strong
    // torso foreshortening when filmed from the head or feet end.
    armhevinger: { bodyMove: 0.25, minAmp: 0.13, minRep: 0.45, maxRep: 8, need: 'arms', bodyRef: true,
      // prone: hands planted well below the shoulders and the torso either horizontal (side/oblique) or foreshortened (head-on)
      posture: (g, ref) => g.wrM.y - g.shM.y > -0.1 * ref && (g.torsoTilt > 40 || Math.abs(g.shM.y - g.hipM.y) < 1.3 * g.shW),
      topHold: 0.5, // v8.8: the plank (top) must be held ≥0.5 s before the first rep (kneeling/lowering to the floor is setup)
      signal: (g, ref) => (g.wrM.y - g.shM.y) / ref },
    // sit-up: rest = lying flat (shoulders level with hips, signal ~0); sitting up lifts the shoulders above the hips so
    // the signal dips negative. Rest-high convention holds, each sit-up is one valley.
    // v8.9: EZ-bar / biceps curl, standing upright: the wrists swing up toward the shoulders while the shoulders, hips and
    // knees stay put (squat = hips drop, RDL = torso hinges, dips/pull-ups = the shoulders travel with the hands planted)
    curl: { minAmp: 0.4, minRep: 0.8, maxRep: 8, need: 'arms', stillBody: 0.75,
      posture: g => g.torsoTilt < 30 && (g.legsVis < 0.4 || Math.min(g.knee[0] ?? 180, g.knee[1] ?? 180) > 120),
      signal: (g, ref) => (g.wr[g.arm].y - g.sh[g.arm].y) / ref },
    situps: { lying: true, minAmp: 0.18, minRep: 0.55, maxRep: 12, need: 'torso',
      signal: (g, ref) => (g.shM.y - g.hipM.y) / ref }
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
    let rejected = 0, qa = null, tents = [], camT = 0, topPose = [];
    function reset() { tents = []; rejected = 0; qa = null; s = null; lastT = null; ref = 0; refBuf = []; state = 'top'; top = []; hist = []; lo = null; tDown = 0; reps = 0; amps = []; lastRepT = null; lastGood = null; repTimes = []; repAmps = []; raw3 = []; pend = null; s0T = null; topPose = []; }
    reset();
    const typAmp = () => { if (!amps.length) return null; const a = [...amps].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    const hiNow = () => top.length ? Math.max(...top.map(p => p[1])) : s;
    // STRICT mode (default): a candidate rep must (a) come from a clean window — key landmarks visible and inside the frame,
    // the body not travelling across the frame, the exercise posture held — and (b) the FIRST rep of a set is only
    // tentative until a second rep with similar amplitude and tempo follows within a few seconds. Random one-off movements
    // (reaching for the phone, stretching, walking past) therefore never reach the counter.
    const strict = def.strict ?? true, pairAmp = def.pairAmp ?? 2.5, pairDur = def.pairDur ?? 4.5, pairGap = def.pairGap ?? 12;
    const count = p => { reps++; if (!p.inAmps) { amps.push(p.amp); if (amps.length > 8) amps.shift(); } lastRepT = p.t; repTimes.push(p.t); repAmps.push(p.amp); onRep && onRep(reps, p.t); };
    function cleanRep(p) {
      const q = p.q; if (!q || !q.n) return 'noq';
      if (q.bad / q.n > 0.5) return 'vis'; // low visibility / out of frame / dropouts during the rep
      // the person moved sideways through the frame (torso lengths). v8.7: a slow handheld pan/follow drifts the whole body a
      // little per second, so the allowance grows with the rep duration (0.3 torso/s); walking (~2 torso/s) is still caught.
      const drift = 0.3 * (p.dur || 0);
      if (!def.lying && (Math.abs(q.x1 - q.x0) > 0.8 + drift || q.xMax - q.xMin > 1.5 + drift)) return 'travel';
      if (def.posture && q.pose / q.n < (def.poseMin ?? 0.5)) return 'pose';
      // body-weight moves (pull-ups, dips, push-ups): the SHOULDERS travel while the hands stay planted; waving the arms
      // around while standing moves only the wrists
      if (def.bodyMove && !(q.syMax - q.syMin >= def.bodyMove * p.amp)) return 'still'; // not in the exercise posture
      if (def.stillBody && q.syMax - q.syMin > def.stillBody * p.amp) return 'body'; // v8.9 curl: the shoulders must stay put
      return null;
    }
    function confirm(ok, t) {
      const p = pend; pend = null;
      if (!ok) return;
      // every rep-shaped movement feeds the adaptive thresholds exactly as in the non-strict engine; the strict gates
      // below only decide whether it is COUNTED
      amps.push(p.amp); if (amps.length > 8) amps.shift(); p.inAmps = true;
      if (!strict) return count(p);
      const why = cleanRep(p); if (why) { rejected++; opts.onReject && opts.onReject(why, p); return; }
      if (reps > 0) return count(p);
      if (p.q && p.q.topOk === false) { rejected++; opts.onReject && opts.onReject('setup', p); return; } // v8.8: no established top yet
      // pair with an earlier unconfirmed rep of similar amplitude and tempo (a half rep in between is skipped)
      const drop = x => { opts.onReject && opts.onReject('unpaired', x); };
      tents = tents.filter(x => p.t - x.t <= pairGap || (drop(x), false));
      const mates = tents.filter(x => Math.max(p.amp / x.amp, x.amp / p.amp) <= pairAmp && Math.max(p.dur / x.dur, x.dur / p.dur) <= pairDur);
      if (mates.length) { tents.filter(x => !mates.includes(x)).forEach(drop); tents = []; mates.forEach(count); return count(p); }
      // wait for a matching rep
      tents.push(p); if (tents.length > 3) drop(tents.shift());
    }
    // v8.7: the phone itself moved a lot (pick-up, bump, reframing — see createCameraGate). Frames from that segment are
    // ignored: a rep in progress and an unpaired first rep are dropped (never counted), tracking restarts
    // afterwards from a fresh top (the body-size reference is kept: zooming in raises it at once, a pause can also be the
    // athlete getting into position). Confirmed reps are kept.
    function camPause(t) {
      // a rep that had already finished well before the phone started moving is real: confirm it; a later one is dropped
      if (pend) { if (t - pend.t >= 0.3 && !camT) checkPend(t, true); else { opts.onReject && opts.onReject('camera', pend); rejected++; pend = null; } }
      if (!camT) camT = t; 
      // unpaired first reps from before the move stay as candidates (they still need a matching rep within 12 s)
      tents = tents.filter(x => x.t < camT - 0.3 || (opts.onReject && opts.onReject('camera', x), false));
      s = null; s0T = null; state = 'top'; top = []; hist = []; raw3 = []; qa = null; refBuf = []; lastT = t; lastGood = null;
      return out(false);
    }
    function update(lm, tMs, aspect = 1, camMoving = false) {
      const t = tMs / 1000;
      if (camMoving) return camPause(t);
      camT = 0;
      const g = lm && geom(lm, aspect);
      const ok = g && (def.need === 'legs' ? g.legsVis > 0.4 : def.need === 'arms' ? g.armsVis > 0.4 : true);
      if (!ok) { if (qa) { qa.n++; qa.bad++; } checkPend(t, true); return out(false); }
      const body = def.bodyRef ? Math.max(g.torso, 1.25 * g.shW) : g.torso;
      ref = Math.max(ref * Math.exp(-(lastT == null ? 0 : Math.max(0, t - lastT)) / 60), body); // slowly decaying max torso length
      if (def.refWin) { refBuf.push([t, body]); while (refBuf[0][0] < t - def.refWin) refBuf.shift(); }
      let raw = def.signal(g, def.refWin ? Math.max(...refBuf.map(p => p[1])) : ref);
      if (raw == null || !isFinite(raw) || (def.valid && !def.valid(raw, g, ref))) { if (qa) { qa.n++; qa.bad++; } checkPend(t, true); return out(false); }
      if (qa) { // frame quality while a rep is in progress
        // the chain the signal needs must be visible, and the shoulders (the body) inside the frame; wrists on the floor may
        // drop just below the frame edge in head-on push-ups, so they only need to be detected
        const chain = def.need === 'legs' ? [g.hip[g.leg], g.kn[g.leg]] : def.need === 'arms' ? [g.sh[g.arm], g.el[g.arm]] : [g.shM, g.hipM];
        const inside = chain.every(k => k && k.visibility > 0.35) && [g.sh[0], g.sh[1]].every(k => k.y > -0.05 && k.y < 1.05 && k.x > -0.05 * aspect && k.x < 1.05 * aspect);
        qa.n++; if (!inside) qa.bad++; const sy = g.shM.y / ref; qa.syMin = Math.min(qa.syMin ?? sy, sy); qa.syMax = Math.max(qa.syMax ?? sy, sy); const hx = g.hipM.x / ref; if (qa.x0 == null) qa.x0 = hx; qa.x1 = hx; qa.xMin = Math.min(qa.xMin, hx); qa.xMax = Math.max(qa.xMax, hx);
        if (!def.posture || def.posture(g, ref)) qa.pose++;
      }
      if (lastGood != null && t - lastGood > 1.5) { checkPend(t, true); s = null; s0T = null; state = 'top'; top = []; hist = []; raw3 = []; qa = null; } // long dropout: restart tracking (keep reps)
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
      if (def.topHold) { topPose.push([t, !def.posture || def.posture(g, ref)]); while (topPose[0][0] < t - 3) topPose.shift(); }
      if (state === 'top') {
        top.push([t, s]); while (top.length && top[0][0] < t - topWin) top.shift();
        const hi = hiNow();
        if (hi - s > thrDown) { if (pend) checkPend(t, true); state = 'down'; lo = s; tDown = t; qa = { n: 0, bad: 0, pose: 0, xMin: Infinity, xMax: -Infinity, topOk: topHeld(t) }; top0 = hi; auxLo = aux; auxHi = aux; aux2Lo = aux2; aux2Hi = aux2; }
      } else {
        if (s < lo) lo = s;
        if (aux != null) { auxLo = auxLo == null ? aux : Math.min(auxLo, aux); auxHi = auxHi == null ? aux : Math.max(auxHi, aux); }
        if (aux2 != null) { aux2Lo = aux2Lo == null ? aux2 : Math.min(aux2Lo, aux2); aux2Hi = aux2Hi == null ? aux2 : Math.max(aux2Hi, aux2); }
        const amp = top0 - lo;
        if (t - tDown > def.maxRep) {
          // stuck in 'down' (e.g. the descent started from a spike): re-anchor on the highest point of the last few seconds
          let bi = -1; for (let i = 0; i < hist.length; i++) if (hist[i][0] >= t - 4 && (bi < 0 || hist[i][1] > hist[bi][1])) bi = i;
          top0 = hist[bi][1]; tDown = hist[bi][0]; lo = Math.min(...hist.slice(bi).map(p => p[1]));
          if (top0 - s < thrDown) { state = 'top'; top = hist.slice(bi).filter(p => p[0] >= t - topWin); qa = null; }
          else qa = { n: 0, bad: 0, pose: 0, xMin: Infinity, xMax: -Infinity };
        }
        else if (s - lo > Math.max(def.minAmp * 0.6, Math.min(0.6 * amp, ta ? 0.6 * ta : Infinity, ta ? Infinity : def.riseCap ?? Infinity))) {
          const auxOk = !def.auxOk || def.auxOk(auxLo, auxHi, ref, aux2Lo, aux2Hi);
          if (amp >= def.minAmp && t - tDown >= def.minRep * 0.5 && (ta == null || amp > cntRatio * ta) && auxOk) {
            pend = { t, amp, start: top0, lo, pk: s, tPk: t, dur: Math.max(0.2, t - tDown), q: qa };
          }
          qa = null;
          state = 'top'; top = [[t, s]];
        }
      }
      return out(true);
    }
    let top0 = 0;
    // v8.8: was the exercise posture held (≥80 % of frames) during the top right before this descent? A set that starts
    // tracking at the top (no history yet) passes; only a top seen OUT of posture (kneeling, lowering to the floor) fails.
    function topHeld(t) { if (!def.topHold) return true; const w = topPose.filter(p => p[0] >= t - def.topHold - 0.3 && p[0] < t);
      return w.filter(p => p[1]).length >= 0.8 * w.length; }
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
      if (tents.length && reps === 0) count(tents[0]); tents = [];
      if (def.trimLead && reps >= 3) {
        let k = 0;
        while (k < reps - 2) {
          const rest = repAmps.slice(k + 1).sort((x, y) => x - y), m = rest[Math.floor(rest.length / 2)];
          if (repAmps[k] < def.trimLead * m) k++; else break;
        }
        if (k) { reps -= k; repTimes.splice(0, k); repAmps.splice(0, k); }
      }
      // v8.9: tempo outliers at either end of the set — a "rep" far slower to follow (lead) or to arrive (tail) than the
      // set's own rhythm is setup/re-racking motion (lying down onto the bench, sitting up, reaching for the bar), not a rep
      if (def.edgeTrim ?? true) {
        // split the set where a gap is far longer than its typical rep-to-rep time (40th percentile, so slow junk at the
        // edges does not inflate it) (L); an edge group is dropped while ≥4
        // reps remain if it is tiny (≤2 reps), or at most half the size of the rest AND cut off by a long pause (≥2 L, ≥6 s).
        // A mid-set pause between two big halves (rest-pause) keeps both.
        const g = []; for (let i = 1; i < repTimes.length; i++) g.push(repTimes[i] - repTimes[i - 1]);
        if (g.length >= 3) {
          const m = [...g].sort((x, y) => x - y)[Math.floor(0.4 * (g.length - 1))], L = Math.max(def.edgeGap ?? 3, (def.edgeRatio ?? 2.6) * m);
          // the last reps of a hard set slow down (grinding): a trailing split needs a gap of at least 4 s
          const Lt = Math.max(def.edgeGapTail ?? 4, L);
          const cl = [[0]], gapBefore = [0]; for (let i = 1; i < repTimes.length; i++) { if (g[i - 1] > (i >= repTimes.length - 2 ? Lt : L)) { cl.push([]); gapBefore.push(g[i - 1]); } cl[cl.length - 1].push(i); }
          let n = reps;
          const drop = (c, gap) => n - c.length >= 4 && (c.length <= 2 || (2 * c.length <= n - c.length && gap >= Math.max(6, 2 * L)));
          while (cl.length > 1 && drop(cl[0], gapBefore[1])) { n -= cl.shift().length; gapBefore.shift(); }
          while (cl.length > 1 && drop(cl[cl.length - 1], gapBefore[cl.length - 1])) { n -= cl.pop().length; gapBefore.pop(); }
          const keep = cl.flat(); if (keep.length < reps) { const k0 = keep[0], k1 = keep[keep.length - 1] + 1;
            repTimes = repTimes.slice(k0, k1); repAmps = repAmps.slice(k0, k1); reps = repTimes.length; }
        }
      }
      return reps;
    }
    function out(tracking) { return { reps, state, signal: s, tracking, progress: progress(), pending: !!pend }; }
    function progress() { if (s == null) return 0; const hi = state === 'top' ? hiNow() : top0; const ta = typAmp() || def.minAmp * 1.6; return Math.max(0, Math.min(1, (hi - s) / ta)); }
    // v8.9: drop the counted reps (stale background count) but keep tracking the signal, so a rep in progress survives
    function forget() { reps = 0; repTimes = []; repAmps = []; lastRepT = null; }
    return { update, progress, flush, reset, forget,
      get reps() { return reps; }, get tentative() { return tents.length; }, get rejected() { return rejected; }, get lastRepT() { return lastRepT; }, get repTimes() { return repTimes; }, get repAmps() { return repAmps; }, def };
  }

  // Best-effort exercise recognition from a sliding window of pose features.
  function createRecognizer(opts = {}) {
    const win = opts.window ?? 6; // seconds
    const buf = [];
    function update(lm, tMs, aspect = 1, camMoving = false) {
      const t = tMs / 1000, g = !camMoving && lm && geom(lm, aspect);
      if (camMoving) buf.length = 0; // features (travel, foot movement) mix camera and body motion: start over afterwards
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
        shMove: rng(n(g => g.shM.y)), hipMove: rng(n(g => g.hipM.y)), hipTravel: rng(n(g => g.hipM.x)), footMove: rng(n(g => (g.an[0].y + g.an[1].y) / 2)), wrMove: rng(n(g => g.wrM.y)),
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
        legsVis: q(buf.map(b => b.g.legsVis), 0.5), armsVis: q(buf.map(b => b.g.armsVis), 0.5),
        // head-on views: wrists relative to the hips (push-up hands on the floor sit far BELOW the hips in the image, dips
        // hands grip the bars at hip height) and shoulder width relative to the visible torso (prone torso foreshortens)
        // v8.9: both hands on one bar (EZ curl) keep the wrists level; gesturing/dancing/stretching arms move independently
        wrDy: q(buf.map(b => Math.min(vis(b.g.wr[0]), vis(b.g.wr[1])) > 0.4 ? Math.abs(b.g.wr[0].y - b.g.wr[1].y) / ref : 1), 0.8),
        wrHip: q(n(g => g.wrM.y - g.hipM.y), 0.5), shWt: q(buf.map(b => b.g.shW / b.g.torso), 0.5)
      };
      return f;
    }
    function classify() {
      const f = features(); if (!f) return { best: null, conf: 0, scores: {} };
      const S = {}, sig = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
      const moving = Math.max(f.shMove, f.hipMove, f.wrMove, f.wrDist);
      // body moves, hands fixed
      const bodyMoves = sig(f.shMove, 0.08, 0.3), handsFixed = 1 - sig(f.wrRel / Math.max(0.05, f.shMove + 0.05), 0.6, 1.2);
      // v8.9: weighted/kipping-free pull-ups filmed from below: the median wrist is only slightly above the shoulders, but it
      // sits far above the hips and the shoulders travel a lot relative to the hands (a squat's hands ride with the shoulders)
      const hang = sig(f.wrUp, -0.05, 0.15) * sig(f.wrRel, 0.4, 0.6) * sig(-f.wrHip, 0.8, 1.0);
      S.pullups = Math.max(sig(Math.max(f.wrHead ?? -1, f.wrUp - 0.25), 0, 0.3), hang) * bodyMoves * (1 - sig(f.tilt, 30, 50)) * (0.5 + 0.5 * sig(f.wrRel, 0.2, 0.5))
        * (1 - sig(f.wrMove / Math.max(0.05, f.shMove), 1.5, 2.5)); // hands hang on a fixed bar (a press from the feet end has moving hands, still shoulders)
      // head-on push-up (camera on the floor in front of the head): torso foreshortened (short vertical torso vs shoulder
      // width), hands planted below the shoulders AND below the hips, legs hidden behind the body. Dips are upright: long
      // vertical torso, hands at hip height, legs hanging below.
      const headOn = (1 - sig(f.tilt, 40, 60)) * (1 - sig(f.dyShW, 1.0, 1.3)) * sig(-f.wrUp, 0.45, 0.75) * sig(f.wrHip, 0.0, 0.2);
      S.dips = (1 - headOn) * Math.max(sig(f.dyShW, 1.0, 1.3), sig(f.tilt, 15, 25)) * (1 - sig(f.wrHip, 0.1, 0.3)) * (1 - sig(f.wrUp, -0.2, 0.1)) * sig(f.wrUp, -1.4, -0.5) * bodyMoves * (1 - sig(f.tilt, 35, 60)) * (1 - sig(f.hipKnee, 0.35, 0.6)) * (1 - 0.6 * sig(f.wrMove / Math.max(0.05, f.shMove), 0.6, 1)) * sig(f.wrRel, 0.1, 0.3) * (1 - sig(f.wrMove, 0.5, 0.65));
      const press = sig(f.wrDist, 0.15, 0.4) * (1 - sig(f.shMove / Math.max(0.05, f.wrMove), 0.5, 0.9)) * sig(f.wrUp, -0.05, 0.12) * (1 - sig(f.wrHead ?? 0, 0.5, 0.9) * 0.5);
      // flat vs incline: side/oblique view -> torso tilt (incline ~25-65 deg from vertical, flat ~70-110, >95 = head-end view);
      // in the tilt band the torso must also rise clearly (dyShW); frontal views (tilt < 25) are flat unless the torso is long
      const incline = Math.max(sig(f.tilt, 20, 30) * (1 - sig(f.tilt, 64, 72)) * sig(f.dyShW, 0.9, 1.05),
        (1 - sig(f.tilt, 20, 30)) * sig(f.dyShW, 1.8, 2.2));
      const proneHoriz = Math.max(sig(f.tilt, 45, 66) * (1 - sig(f.tiltRange, 38, 60)), sig(-f.wrUp, 0.8, 1.2) * (1 - sig(f.dyShW, 1.1, 1.6)), headOn);
      S.skråbenk = press * incline;
      S.benkpress = press * (1 - incline);
      // v8.9: shallow "standing" rows (torso ~20-30° from vertical, knees soft) count too; a torso past ~80° is lying, not rowing
      S.roing = sig(f.wrDist, 0.1, 0.3) * sig(f.wrMove / Math.max(0.05, f.shMove), 0.6, 1.1) * sig(f.tilt, 14, 24) * (1 - sig(f.tilt, 72, 85)) * (1 - sig(f.tiltRange, 25, 45)) * (1 - sig(f.wrUp, -0.4, 0)) * (1 - sig(f.hinge, 0.35, 0.6));
      // v8.8: a standing hinge shows the legs; a prone body (push-up, esp. head-on with hidden legs) is never an RDL
      S.halvmark = sig(f.legsVis, 0.3, 0.5) * (1 - proneHoriz) * (1 - sig(-f.wrUp, 0.8, 1.1) * (1 - sig(f.dyShW, 0.95, 1.2))) * sig(f.hinge, 0.2, 0.45) * sig(f.tiltRange, 20, 40) * sig(f.knee, 130, 155) * (1 - sig(f.wrUp, -0.3, 0)) * sig(f.kneeMin, 40, 65);
      const squatish = (1 - headOn) * sig(f.legsVis, 0.3, 0.5) * sig(f.hipKnee, 0.15, 0.4) * (1 - sig(f.wrUp, 0.2, 0.6) * 0.3) * (1 - sig(f.tilt, 45, 70))
        * sig(f.kneeMin, 20, 32) * (1 - sig(f.tiltRange, 55, 80));
      const split = Math.max(sig(f.kneeDy, 0.3, 0.42), sig(f.ankDx, 1.12, 1.3));
      // a row pulls the hands far relative to steady shoulders; in a squat the shoulders travel and the hands ride along
      const rowish = (1 - sig(f.tilt, 72, 85)) * sig(f.tilt, 14, 24) * sig(f.wrDist, 0.25, 0.4) * (1 - sig(f.shMove, 0.3, 0.45));
      S.knebøy = squatish * (1 - split) * (1 - hang) * (1 - rowish);
      S.bulgarsk = squatish * split;
      // push-up: body stays horizontal (high tilt, small tilt range), wrists planted below the shoulders, shoulders travel
      // vertically while the hands stay put, legs ~straight. Separated from dips (upright = low tilt) and bench (wrists up).
      // body reads horizontal (side/oblique) OR, in head/feet-end views where the torso foreshortens, the wrists sit far
      // below the shoulders (hands planted on the floor by the head) with the body prone
      const legsHidden = 1 - sig(f.legsVis, 0.35, 0.6); // head-on: knee angles are noise, do not require straight legs
      S.armhevinger = proneHoriz * (1 - sig(f.wrUp, -0.1, 0.12))
        * bodyMoves * (1 - sig(f.wrMove / Math.max(0.05, f.shMove), 0.8, 1.5)) * Math.max(sig(f.knee, 115, 150), legsHidden, headOn);
      // sit-up: starts lying and rotates upright -> large tilt range and big torso-hinge swing; shoulders move far while the
      // hips stay; knees bent; hands not pressing. Separated from RDL (knees straight, stays standing).
      S.situps = sig(f.shMove, 0.16, 0.4) * (1 - sig(f.hipMove / Math.max(0.04, f.shMove), 0.45, 0.85))
        * sig(f.hinge, 0.25, 0.55) * (1 - sig(f.kneeMin, 110, 145)) * (0.35 + 0.65 * sig(f.tiltRange, 25, 55)) * (0.3 + 0.7 * sig(f.tilt, 38, 55)) * (1 - sig(f.hipMove, 0.3, 0.5));
      // v8.9 EZ curl: upright and steady torso, the wrists swing far relative to the shoulders while the shoulders barely move
      // (dips/pull-ups: hands fixed, shoulders travel), no hip drop (squat) or hinge (RDL), wrists stay below the shoulders
      // (presses/pull-ups/stretching overhead: the median wrist sits well below the shoulders), whole body in view, legs straight
      const curlish = (1 - sig(f.tilt, 15, 28)) * (1 - sig(f.tiltRange, 25, 45)) * sig(f.wrRel, 0.4, 0.55) * sig(f.wrMove / Math.max(0.05, f.shMove), 1.5, 2.5)
        * (1 - sig(f.shMove, 0.25, 0.4)) * (1 - sig(f.wrUp, -0.6, -0.45));
      S.curl = curlish * (1 - sig(f.hinge, 0.25, 0.4)) * (1 - sig(f.hipKnee, 0.3, 0.45)) * sig(f.legsVis, 0.3, 0.5) * sig(f.knee, 145, 160);
      // a squat keeps the hands still on the bar/bell: a curling arm swing is not a squat even if the hip-knee signal wobbles
      S.knebøy *= (1 - 0.8 * curlish * (1 - sig(f.hipKnee, 0.3, 0.45))) * (1 - sig(f.wrMove / Math.max(0.05, f.shMove), 2.2, 3.2) * (1 - sig(f.hipKnee, 0.3, 0.45)));
      // Walking/carrying: the hips travel sideways across the frame. Stationary exercises never do (eval max 0.98 torso).
      const still = 1 - sig(f.hipTravel ?? 0, 1.15, 1.45);
      for (const k in S) if (k !== 'benkpress' && k !== 'skråbenk') S[k] *= still;
      // Feet planted: squats, RDL, rows, floor work never move the feet much; walking toward/away from the camera does.
      const planted = 1 - sig(f.footMove ?? 0, 0.95, 1.1);
      for (const k of ['knebøy', 'bulgarsk', 'halvmark', 'roing', 'situps', 'curl']) if (S[k]) S[k] *= planted;
      if (S.armhevinger) S.armhevinger *= Math.max(planted, legsHidden * headOn); // hidden legs give a noisy foot signal
      let best = null, bs = 0; for (const k in S) if (S[k] > bs) { bs = S[k]; best = k; }
      const sorted = Object.values(S).sort((a, b) => b - a);
      return { best: bs > 0.12 ? best : null, conf: bs ? (sorted[0] - (sorted[1] || 0)) / sorted[0] : 0, scores: S, features: f, moving };
    }
    return { update, classify, features, reset() { buf.length = 0; } };
  }
  // Auto exercise pick shared by the app and the eval: a recognizer guess becomes the active exercise only after it has held
  // for holdMs with a clear score and margin over the runner-up. Weak/ambiguous guesses (random movement) never switch.
  function createPicker(opts = {}) {
    const holdMs = opts.holdMs ?? 1500, minScore = opts.minScore ?? 0.3, minConf = opts.minConf ?? 0.25;
    let cand = null, since = 0, cur = null;
    return {
      update(rc, ts) {
        const ok = rc && rc.best && rc.scores[rc.best] >= minScore && rc.conf >= minConf;
        const b = ok ? rc.best : null;
        if (b !== cand) { cand = b; since = ts; }
        else if (b && b !== cur && ts - since > holdMs) cur = b;
        return cur;
      },
      get current() { return cur; }, reset() { cand = null; since = 0; cur = null; }
    };
  }
  // v8.9: the set is locked to an exercise at 2 reps; if those were setup motion of another exercise (e.g. 2 "squats" while
  // lying down on the bench), the real set used to be cut off by the autosave 9 s later. Re-lock when the picker now shows
  // another exercise whose counter has 3+ reps of its own after the locked exercise's last rep, with the locked one idle ≥5 s
  // (before the 9 s autosave).
  // atSave: called right before the autosave would store the locked set — then a counter with 2+ reps after it and clearly
  // more reps in total (2 more, or any more over a bare 2-rep lock) wins without a recognizer vote (the reps are the evidence).
  function relock(cs, lock, pick, tSec, scores, atSave = false) {
    if (!lock || !cs[lock]) return lock;
    const lt = cs[lock].lastRepT ?? -Infinity;
    if (tSec - lt < 5 || cs[lock].reps > 3) return lock; // a real set (4+ reps) is never re-assigned
    const after = id => cs[id] ? cs[id].repTimes.filter(t => t > lt).length : 0;
    if (pick && pick !== lock && after(pick) >= 3) return pick;
    // the picker can lag (it needs a 1.5 s clear lead): accept a counter that is clearly counting (4+ reps) while the
    // recognizer currently rates its exercise ≥0.3
    let best = lock, bn = 3;
    if (atSave) { // 2+ reps after the locked set's last one and more reps in total than the locked set
      const lr = cs[lock].reps; let bt = lr;
      for (const id in cs) if (id !== lock && after(id) >= 2 && cs[id].reps > bt && (cs[id].reps >= lr + 2 || lr <= 2)) { best = id; bt = cs[id].reps; }
      return best;
    }
    for (const id in cs) if (id !== lock && scores && (scores[id] || 0) >= 0.3 && after(id) > bn) { best = id; bn = after(id); }
    return best;
  }
  // v8.7 camera-motion gate. Handheld filming (tremor, slow pan/follow, gentle drift/zoom) is tolerated: the rep signals are
  // body-relative (differences between keypoints divided by the torso length), so a moderate global shift/zoom cancels out.
  // Only LARGE or ABRUPT phone motion (picking it up, bumping it, re-propping, big rotation/reframing) pauses counting:
  //  * sensor: DeviceMotion rotation rate (deg/s) / acceleration without gravity (m/s²), when available;
  //  * vision fallback: every body part — including the ones an exercise keeps still (feet, hands on the bar/floor, hips on
  //    the bench) — translates/scales/rotates together by a lot within 0.4 s. Real exercises always keep some part anchored.
  // While moving and for `settleMs` afterwards, update() returns { ok:false } and the app/eval feed counters camMoving=true.
  function createCameraGate(opts = {}) {
    const win = opts.window ?? 0.4, minDisp = opts.minDisp ?? 0.5, minScale = opts.minScale ?? 0.3, minRot = opts.minRot ?? 10, holdMs = opts.holdMs ?? 400;
    const gyroMax = opts.gyroMax ?? 90, accMax = opts.accMax ?? 4.5, gyroLow = opts.gyroLow ?? 30, accLow = opts.accLow ?? 1.5, settleMs = opts.settleMs ?? 600;
    const buf = []; let until = -Infinity, why = null, sensorHits = 0, visT = null, lastD = 0;
    const parts = g => {
      const P = [], add = (p, k) => { if (p && p.visibility > 0.5) P.push([k, p]); };
      add(g.nose, 'nose'); add(g.shM, 'sh'); add(g.hipM, 'hip');
      add(vis(g.wr[0]) > 0.5 && vis(g.wr[1]) > 0.5 ? g.wrM : (vis(g.wr[0]) >= vis(g.wr[1]) ? g.wr[0] : g.wr[1]), 'wr');
      const an = vis(g.an[0]) > 0.5 && vis(g.an[1]) > 0.5 ? mid(g.an[0], g.an[1]) : (vis(g.an[0]) >= vis(g.an[1]) ? g.an[0] : g.an[1]);
      add(an, 'an'); return P;
    };
    function vision(lm, t, aspect) {
      const g = lm && geom(lm, aspect); lastD = 0; if (!g) return null;
      buf.push({ t, g, P: Object.fromEntries(parts(g)) });
      while (buf.length > 2 && buf[1].t <= t - win) buf.shift();
      const a = buf[0]; if (t - a.t < win * 0.5) return null;
      const T = Math.max(a.g.torso, g.torso), keys = Object.keys(a.P).filter(k => buf[buf.length - 1].P[k]);
      if (keys.length < 3) return null;
      const b = buf[buf.length - 1].P;
      const d = keys.map(k => dist(a.P[k], b[k]) / T), dMin = Math.min(...d); lastD = dMin;
      // zoom: every body length (torso, shoulder width, thighs, shins, upper arms) scales the same way — a hinge, sit-up or
      // squat changes some lengths (foreshortening) but not all of them in the same direction
      const lens = gg => [gg.torso, gg.shW, dist(gg.hip[0], gg.kn[0]), dist(gg.hip[1], gg.kn[1]), dist(gg.kn[0], gg.an[0]), dist(gg.kn[1], gg.an[1]), dist(gg.sh[0], gg.el[0]), dist(gg.sh[1], gg.el[1])];
      const okLen = gg => [1, gg.shW > 0.3 * gg.torso, vis(gg.kn[0]) > 0.5, vis(gg.kn[1]) > 0.5, vis(gg.an[0]) > 0.5 && vis(gg.kn[0]) > 0.5, vis(gg.an[1]) > 0.5 && vis(gg.kn[1]) > 0.5, vis(gg.el[0]) > 0.5, vis(gg.el[1]) > 0.5];
      const l0 = lens(a.g), l1 = lens(g), o0 = okLen(a.g), o1 = okLen(g), zr = [];
      for (let i = 0; i < l0.length; i++) if (o0[i] && o1[i] && l0[i] > 0.02 && l1[i] > 0.02) zr.push(Math.log(l1[i] / l0[i]));
      const zoomed = zr.length >= 3 && (zr.every(x => x > 0.5 * minScale) || zr.every(x => x < -0.5 * minScale)) && Math.abs(zr.sort((x, y) => x - y)[zr.length >> 1]) > minScale;
      if (dMin > minDisp) return 'shift';
      // roll: shoulder line, hip line, torso and hip→ankle axis all turn by the same angle (a body turns them differently)
      const ang = (p, q) => Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI, dA = (x, y) => ((x - y) % 360 + 540) % 360 - 180;
      const L = gg => [gg.shW > 0.3 * gg.torso ? [gg.sh[0], gg.sh[1]] : null, dist(gg.hip[0], gg.hip[1]) > 0.2 * gg.torso ? [gg.hip[0], gg.hip[1]] : null,
        [gg.shM, gg.hipM], b.an ? [gg.hipM, b.an] : null];
      const L0 = L(a.g), L1 = L(g), r = [];
      for (let i = 0; i < 4; i++) if (L0[i] && L1[i] && (i < 3 || a.P.an)) r.push(dA(ang(...L1[i]), ang(i === 3 ? a.g.hipM : L0[i][0], i === 3 ? a.P.an : L0[i][1])));
      if (r.length >= 3 && (r.every(x => x > minRot) || r.every(x => x < -minRot)) && Math.min(...r.map(Math.abs)) > 0.6 * Math.max(...r.map(Math.abs))) return 'rotate';
      if (zoomed) return 'zoom';
      return null;
    }
    function update(lm, tMs, aspect = 1, sensor = null) {
      const t = tMs / 1000;
      let w = null;
      if (sensor && ((sensor.gyro ?? 0) > gyroMax || (sensor.acc ?? 0) > accMax)) { if (++sensorHits >= 2) w = 'sensor'; } else sensorHits = 0;
      // vision: the global shift has to persist for holdMs (single-frame landmark glitches are not camera motion)
      const v0 = vision(lm, t, aspect); if (!v0) visT = null; else if (visT == null) visT = t; const vw = v0 && t - visT >= holdMs / 1000 ? v0 : null; w = w || vw;
      // hysteresis: once moving, the gate stays closed until the phone is really still again (sensor below gyroLow/accLow,
      // body parts no longer drifting together), then for settleMs — the tail of a pick-up is slow but still moves the image
      if (!w && t < until && ((sensor && ((sensor.gyro ?? 0) > gyroLow || (sensor.acc ?? 0) > accLow)) || lastD > 0.5 * minDisp)) w = why;
      if (w) { until = t + settleMs / 1000; why = w; }
      const moving = t < until;
      if (moving && w) buf.splice(0, Math.max(0, buf.length - 1)); // measure the next motion from where the camera is now
      return { ok: !moving, moving: !!w, settling: moving && !w, why: moving ? why : null };
    }
    return { update, reset() { buf.length = 0; until = -Infinity; why = null; sensorHits = 0; visT = null; lastD = 0; } };
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
  const api = { angle, geom, EX, IDS, relock, createCounter, createCameraGate, createRecognizer, createPicker, createAngleCounter };
  if (typeof module !== 'undefined') module.exports = api; else root.Reps = api;
})(this);
