// v8.16 Bar/plate tracker (UMD: browser + node). SHADOW mode only: logs barShadow per saved set, never changes a count,
// exercise guess or save. Classical CV: downscaled gray frame → Sobel edges in an ROI around the wrists → gradient-direction
// Hough vote for a circle (the weight plate seen from the side) → track the plate centre's y → reps + 'bar static'.
(function (root) {
  'use strict';
  const BAR_CFG = {
    enabled: true,            // KILL SWITCH: false = no frame grabs, no barShadow
    mode: 'shadow',           // v8.16: log only
    exercises: ['knebøy', 'halvmark', 'benkpress', 'skråbenk', 'roing'],
    hz: 5,                    // detector rate (frames/s)
    frameW: 160,              // gray frame width the detector works on (height follows aspect)
    roiX: 0.5, roiUp: 0.2, roiDown: 0.2, // ROI around the wrist midpoint, fractions of frame width (x) / height (y)
    rMin: 0.08, rMax: 0.2,    // plate radius range, fraction of frame width
    edgeThr: 40,              // Sobel magnitude threshold (0..~1000)
    minScore: 0.35,           // votes / (2πr) needed to accept a circle
    jumpR: 2.5,               // max centre jump between detections (× radius) once tracking
    repAmpR: 0.8,             // a rep needs a down+up swing of ≥ this × median radius (hysteresis)
    staticSec: 2, staticR: 0.15, // bar 'static' (rest): centre y range < staticR × radius for staticSec
    minDetFrac: 0.5,
    // v8.16 coupling (rigging must not count): a plate only counts as 'the bar' when its centre is level with the wrists
    // (|plate y − wrist-mid y| ≤ coupleY × r), both wrists are level (|Δy| ≤ wristLevel × r: horizontal bar axis), and the
    // plate is outside the hands on the bar axis (|plate x − wrist-mid x| between barXMin and barXMax × frame width)
    coupleY: 1.2, wristLevel: 1.0, barXMin: 0.08, barXMax: 0.5, coupleDy: 0.6, // coupleDy: plate y step vs wrist y step, × r
    rhythmCV: 0.5,            // rep intervals' coefficient of variation must be ≤ this (rhythmic), else the run is not reps
    minRun: 2,                // reps must come from a coupled run with ≥ this many reps          // below this detected fraction the bar count is reported as 'unreliable'
  };
  function makeGray(n) { return new Uint8ClampedArray(n); }
  // rgba (ImageData.data) → gray
  function toGray(rgba, w, h, out) { out = out || makeGray(w * h); for (let i = 0, j = 0; i < w * h; i++, j += 4) out[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8; return out; }
  // gray: Uint8 w×h; roi {x0,y0,x1,y1} in px; returns {cx,cy,r,score} in px or null
  function detect(gray, w, h, roi, c, prev) {
    const x0 = Math.max(1, roi.x0 | 0), y0 = Math.max(1, roi.y0 | 0), x1 = Math.min(w - 2, roi.x1 | 0), y1 = Math.min(h - 2, roi.y1 | 0);
    if (x1 - x0 < 8 || y1 - y0 < 8) return null;
    const rMin = Math.max(3, Math.round(c.rMin * w)), rMax = Math.round(c.rMax * w);
    // accumulator covers the ROI expanded by rMax (the centre may lie off the edge band)
    const ax0 = x0 - rMax, ay0 = y0 - rMax, aw = x1 - x0 + 2 * rMax + 1, ah = y1 - y0 + 2 * rMax + 1, nr = rMax - rMin + 1;
    const acc = new Float32Array(aw * ah * nr); const ex = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1];
      const gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1];
      const m = Math.hypot(gx, gy); if (m < c.edgeThr) continue;
      const ux = gx / m, uy = gy / m; ex.push(x, y);
      for (let r = rMin; r <= rMax; r++) for (const s of [-1, 1]) {
        const cx = Math.round(x + s * ux * r) - ax0, cy = Math.round(y + s * uy * r) - ay0;
        if (cx >= 0 && cy >= 0 && cx < aw && cy < ah) acc[((r - rMin) * ah + cy) * aw + cx] += 1;
      }
    }
    let best = null;
    for (let k = 0; k < nr; k++) { const r = k + rMin, norm = 2 * Math.PI * r;
      for (let cy = 1; cy < ah - 1; cy++) for (let cx = 1; cx < aw - 1; cx++) {
        const b = (k * ah + cy) * aw + cx;
        // 3×3 box sum tolerates rounding of the vote position
        const v = acc[b] + acc[b - 1] + acc[b + 1] + acc[b - aw] + acc[b + aw] + 0.5 * (acc[b - aw - 1] + acc[b - aw + 1] + acc[b + aw - 1] + acc[b + aw + 1]);
        let s = v / norm;
        if (prev) { const d = Math.hypot(cx + ax0 - prev.cx, cy + ay0 - prev.cy); if (d > c.jumpR * prev.r) s *= 0.5; if (Math.abs(r - prev.r) > 0.3 * prev.r) s *= 0.7; }
        if (!best || s > best.score) best = { cx: cx + ax0, cy: cy + ay0, r, score: s };
      } }
    if (!best || best.score < c.minScore) return null;
    best.score = +best.score.toFixed(3); best.edges = ex.length / 2; return best;
  }
  // ROI from MediaPipe landmarks (normalized); falls back to the frame centre band
  function roiFrom(lm, w, h, c) {
    let mx = 0.5, my = 0.45;
    if (lm && lm[15] && lm[16]) { mx = (lm[15].x + lm[16].x) / 2; my = (lm[15].y + lm[16].y) / 2; }
    return { x0: (mx - c.roiX) * w, x1: (mx + c.roiX) * w, y0: (my - c.roiUp) * h, y1: (my + c.roiDown) * h };
  }
  function coupled(d, lm, w, h, c) {
    if (!lm || !lm[15] || !lm[16]) return false;
    // side view: the far wrist is often occluded/noisy → level check only when both are clearly visible, else use the better one
    const V = p => (p.visibility == null ? 1 : p.visibility), a = lm[15], b = lm[16], both = V(a) >= 0.7 && V(b) >= 0.7;
    if (both && Math.abs(a.y - b.y) * h > c.wristLevel * d.r) return false;
    const q = V(a) >= V(b) ? a : b, wy = (both ? (a.y + b.y) / 2 : q.y) * h, wx = (both ? (a.x + b.x) / 2 : q.x) * w;
    if (Math.abs(d.cy - wy) > c.coupleY * d.r) return false;
    const dx = Math.abs(d.cx - wx) / w; return dx >= c.barXMin && dx <= c.barXMax;
  }
  function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; }
  function createBarTracker(cfg) {
    const c = Object.assign({}, BAR_CFG, cfg || {});
    let samples = [], prev = null, lastT = -Infinity;
    return {
      cfg: c,
      due(t) { return c.enabled && t - lastT >= 1 / c.hz - 1e-3; }, // t in seconds
      // feed one gray frame (or a detection); t in seconds; w = frame width in px
      push(t, det, w) { lastT = t; samples.push({ t, d: det ? { cy: det.cy / w, cx: det.cx / w, r: det.r / w } : null }); prev = det || (prev && samples.length > 1 && samples[samples.length - 2].d ? prev : null); if (samples.length > 3000) samples.shift(); },
      frame(t, gray, w, h, lm) { if (!this.due(t)) return null; const d = detect(gray, w, h, roiFrom(lm, w, h, c), c, prev); this.push(t, d, w);
        const s = samples[samples.length - 1]; s.cpl = !!(d && coupled(d, lm, w, h, c)); if (s.d && lm) s.wy = (lm[15].y + lm[16].y) / 2 * h / w; return d; },
      reset() { samples = []; prev = null; },
      samples: () => samples,
      // summary for the window [t0, t1] (s); poseReps for the agree flag
      summary(t0, t1, poseReps) { const S = samples.filter(s => s.t >= t0 && s.t <= t1); return summarize(S, c, poseReps); },
    };
  }
  function summarize(S, c, poseReps) {
    const D = S.filter(s => s.d), frac = S.length ? D.length / S.length : 0;
    const R = median(D.filter(s => s.cpl).map(s => s.d.r)) || 0; // radius of the plate coupled to the hands
    // smooth y with a 3-sample median, ignore outliers (radius off by >35 %)
    const P = D.filter(s => s.cpl && Math.abs(s.d.r - R) <= 0.35 * R).map(s => [s.t, s.d.cy, s.wy]);
    // moving with the hands: drop samples whose plate y step disagrees with the wrist y step
    for (let i = P.length - 1; i > 0; i--) if (P[i][2] != null && P[i - 1][2] != null && Math.abs((P[i][1] - P[i - 1][1]) - (P[i][2] - P[i - 1][2])) > c.coupleDy * R) P.splice(i, 1);
    const y = P.map((p, i) => median(P.slice(Math.max(0, i - 1), i + 2).map(q => q[1])));
    // hysteresis rep counter on y (image y grows downward): a rep = go down by ≥ amp from a high, then back up by ≥ amp
    const amp = c.repAmpR * R, repTimes = []; let hi = null, lo = null, phase = 'top';
    for (let i = 0; i < y.length; i++) { const v = y[i], t = P[i][0];
      if (phase === 'top') { if (hi == null || v < hi) hi = v; if (v - hi >= amp) { phase = 'bottom'; lo = v; } }
      else { if (v > lo) lo = v; if (lo - v >= amp) { phase = 'top'; hi = v; repTimes.push(+t.toFixed(2)); } } }
    // bar static: longest stretch with y range < staticR × R
    let staticS = 0; for (let i = 0, j = 0; j < P.length; j++) { while (i < j && (Math.max(...y.slice(i, j + 1)) - Math.min(...y.slice(i, j + 1)) > c.staticR * R)) i++; staticS = Math.max(staticS, P[j][0] - P[i][0]); }
    // rhythm: split rep times into runs (gap > 3× median interval) and keep only regular runs of ≥ minRun reps
    const rawReps = repTimes.length, iv = repTimes.slice(1).map((t, i) => t - repTimes[i]), mi = median(iv) || 0, runs = [[]];
    repTimes.forEach((t, i) => { if (i && t - repTimes[i - 1] > 3 * mi) runs.push([]); runs[runs.length - 1].push(t); });
    const good = runs.filter(r => { if (r.length < c.minRun) return false; const d = r.slice(1).map((t, i) => t - r[i]), m = d.reduce((a, b) => a + b, 0) / d.length;
      return Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / d.length) / m <= c.rhythmCV; });
    repTimes.length = 0; for (const r of good) repTimes.push(...r);
    const cplFrac = S.length ? S.filter(s => s.cpl).length / S.length : 0;
    const reps = repTimes.length, reliable = frac >= c.minDetFrac && R > 0;
    return { v: 1, mode: c.mode, detFrac: +frac.toFixed(2), cplFrac: +cplFrac.toFixed(2), rawReps, n: S.length, rMed: +R.toFixed(3), reps, repTimes, staticMaxS: +staticS.toFixed(1),
      staticSeen: staticS >= c.staticSec, reliable, agree: poseReps == null ? null : reliable && reps === poseReps };
  }
  const api = { BAR_CFG, createBarTracker, detect, roiFrom, toGray, summarize };
  if (typeof module !== 'undefined') module.exports = api; else root.Bar = api;
})(this);
