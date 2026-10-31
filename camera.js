// v8.33 camera position per session (Rune 31 Oct): one position for the whole workout; the angle per exercise is derived from it.
// Lying presses face the other way relative to the camera (head toward it) -> front/rear flip; V-situp is filmed side-on. UMD (browser + node).
(function (root) {
  const CAM_CFG = {
    flip: { benkpress: true, skråbenk: true }, // lifter faces the opposite way to standing exercises from the same spot
    fixed: { vsitup: 'side' },                 // always this angle, whatever the session position
    angles: ['front', 'front45', 'side', 'rear45', 'rear']
  };
  // pos: { dir: 'front'|'rear'|'side', deg: 0|45|90, side: 'left'|'right'|null }
  function base(pos) { if (!pos || !pos.dir) return null; if (pos.dir === 'side' || +pos.deg === 90) return 'side'; return pos.dir + (+pos.deg === 45 ? '45' : ''); }
  function derive(pos, ex) {
    if (!pos || !pos.dir) return null;
    if (CAM_CFG.fixed[ex]) return CAM_CFG.fixed[ex];
    const b = base(pos); if (!CAM_CFG.flip[ex] || b === 'side') return b;
    return b.startsWith('front') ? b.replace('front', 'rear') : b.replace('rear', 'front');
  }
  function forSet(pos, ex) { const a = derive(pos, ex); return a ? { sessionPos: { ...pos }, derivedAngle: a, angle: a, overridden: false } : null; }
  function override(cam, angle, pos) { const c = cam || (pos ? forSet(pos, null) : null) || { sessionPos: null, derivedAngle: null }; return { ...c, angle, overridden: angle !== c.derivedAngle }; }
  const api = { CAM_CFG, base, derive, forSet, override };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Camera = api;
})(typeof self !== 'undefined' ? self : this);
