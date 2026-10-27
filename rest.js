// v8.15 Rest gate (UMD: browser + node). Bug it targets: between sets the app keeps the last exercise guess and every
// counter running, so two rigging motions (loading plates, walking to the phone) lock and autosave as a false set.
// After a save (and at session start) we are in REST: a short refractory period, then a set may only start once the person
// holds a READY posture: key joints visible, at a plausible distance, and still for readyHoldMs.
// Shipped in SHADOW mode (v8.15): the gate only reports would-allow / would-suppress per set; the old logic still decides.
(function (root) {
  'use strict';
  const REST_CFG = {
    mode: 'shadow',          // v8.15: log only. Offline (eval/real/rest-shadow.js) active mode was NOT clearly better yet → no toggle
    refractMs: 2000,         // after a save no new set can start for this long (racking the bar, standing up)
    readyHoldMs: 700,        // READY posture must be held this long
    minVis: 0.5,             // mean visibility of shoulders + hips, and of knees or wrists
    torsoMin: 0.08,          // shoulder-mid → hip-mid length as a fraction of frame height: farther = not plausible
    torsoMax: 0.6,           // closer = sitting/standing next to the phone
    stillTorso: 0.25,        // hip-mid + shoulder-mid may move at most this × torso length within readyHoldMs
  };
  const V = (p) => (p && p.visibility != null ? p.visibility : 1);
  function readyFrame(lm, asp, c) {
    if (!lm) return null;
    const vis = (ids) => ids.reduce((s, i) => s + V(lm[i]), 0) / ids.length;
    if (vis([11, 12, 23, 24]) < c.minVis) return null;
    if (Math.max(vis([25, 26]), vis([15, 16])) < c.minVis) return null;
    const sx = (lm[11].x + lm[12].x) / 2 * asp, sy = (lm[11].y + lm[12].y) / 2, hx = (lm[23].x + lm[24].x) / 2 * asp, hy = (lm[23].y + lm[24].y) / 2;
    const torso = Math.hypot(sx - hx, sy - hy);
    if (torso < c.torsoMin || torso > c.torsoMax) return null;
    return { sx, sy, hx, hy, torso };
  }
  function createRestGate(cfg) {
    const c = Object.assign({}, REST_CFG, cfg || {});
    let state = 'rest', restAt = -Infinity, win = [], readyAt = null;
    return {
      cfg: c,
      get state() { return state; }, get readyAt() { return readyAt; },
      // call on every frame; returns true when a set may count
      update(lm, ms, asp) {
        if (state === 'armed') return true;
        const f = readyFrame(lm, asp || 1, c);
        if (!f || ms - restAt < c.refractMs) { win = []; return false; }
        win.push([ms, f]); while (win.length && ms - win[0][0] > c.readyHoldMs) win.shift();
        if (win.length < 3 || ms - win[0][0] < c.readyHoldMs * 0.8) return false;
        const T = f.torso; let still = true;
        for (const [, g] of win) if (Math.hypot(g.hx - f.hx, g.hy - f.hy) > c.stillTorso * T || Math.hypot(g.sx - f.sx, g.sy - f.sy) > c.stillTorso * T) { still = false; break; }
        if (still) { state = 'armed'; readyAt = ms; }
        return still;
      },
      // a set was saved (or the session started): back to REST
      rest(ms) { state = 'rest'; restAt = ms; win = []; readyAt = null; },
      // verdict for a set whose first rep was at firstRepMs: was the gate armed before it?
      verdict(firstRepMs) { return readyAt != null && readyAt <= firstRepMs ? 'would-allow' : 'would-suppress'; },
    };
  }
  const api = { REST_CFG, createRestGate, readyFrame };
  if (typeof module !== 'undefined') module.exports = api; else root.Rest = api;
})(this);
