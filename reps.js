// Rep state machine (UMD-ish: works in browser and node)
(function (root) {
  function angle(a, b, c) {
    const v1 = [a.x - b.x, a.y - b.y], v2 = [c.x - b.x, c.y - b.y];
    const d = Math.hypot(...v1) * Math.hypot(...v2);
    if (!d) return null;
    const cos = Math.max(-1, Math.min(1, (v1[0]*v2[0] + v1[1]*v2[1]) / d));
    return Math.acos(cos) * 180 / Math.PI;
  }
  function createCounter(opts = {}) {
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
      progress() { if (s == null) return 0; const p = (up - s) / (up - down); return Math.max(0, Math.min(1, state === 'down' ? 1 : p)); },
      reset() { reps = 0; state = 'up'; cnt = 0; },
      get reps() { return reps; }
    };
  }
  const api = { angle, createCounter };
  if (typeof module !== 'undefined') module.exports = api; else root.Reps = api;
})(this);
