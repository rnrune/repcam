const R = require('/workspace/repcam/reps.js'), fs = require('fs');
const map = { squat: 'knebøy', bss: 'bulgarsk', pullup: 'pullups', dips: 'dips', incline: 'skråbenk', rdl: 'halvmark', row: 'roing' };
const out = {};
for (const l of fs.readFileSync('sel.txt', 'utf8').trim().split('\n')) {
  const [cat, ...ids] = l.split(/\s+/);
  for (const id of ids) {
    const f = 'lm/' + id + '.json'; if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f)), asp = d.w / d.h, ex = R.EX[map[cat]];
    let ref = 0; const gs = d.frames.map(fr => fr && R.geom(fr, asp)); gs.forEach(g => { if (g) ref = Math.max(ref, g.torso); });
    out[id] = { cat, fps: d.fps, sig: gs.map(g => g ? +ex.signal(g, ref).toFixed(3) : null) };
  }
}
fs.writeFileSync('/tmp/sig.json', JSON.stringify(out));
