#!/usr/bin/env node
// v8.16: offline run of the bar/plate tracker (bar.js, SHADOW) on the box feedback VIDEOS (videos never go in git).
// Decodes each clip with ffmpeg to gray at BAR_CFG.frameW × hz, uses the clip's own logged landmarks for the wrist ROI,
// and reports per set: detected fraction, bar reps vs truth vs the current pose replay.
// Usage: node eval/real/bar-shadow.js [--dir <clips>] [--cfg '{"edgeThr":60}'] [--debug outdir]
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const Bar = require('../../bar.js'), R = require('./run.js');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DIR = arg('--dir', '/workspace/repcam-feedback-clips/b89d9b01e2c6002b7dca5922'), cfg = JSON.parse(arg('--cfg', '{}')), DBG = arg('--debug', null);
// Rune's truth for the 27 Oct session (barbell sets only)
const CASES = [['mvr3cnad21805e00', 'knebøy', 12], ['mvr3ehf7d7e3da93', 'knebøy', 8], ['mvr3gojt95bd64ea', 'knebøy', 8], ['mvr3k128fb810868', 'knebøy', 8],
  ['mvr3naxy72228481', 'knebøy', 8], ['mvr3o841cd8387e6', 'halvmark', 9], ['mvr3phm88e08d970', 'halvmark', 9], ['mvr3vtnn4fb621e5', 'halvmark', 9]];
const c = Object.assign({}, Bar.BAR_CFG, cfg), rows = [];
for (const [id, ex, truth] of CASES) {
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, id + '.meta.json'))), vw = meta.video.w, vh = meta.video.h;
  const W = c.frameW, H = Math.round(W * vh / vw / 2) * 2;
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path.join(DIR, id + '.mp4'), '-vf', `fps=${c.hz},scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  const n = Math.floor(raw.length / (W * H)), F = meta.landmarks.frames, tr = Bar.createBarTracker(cfg); let fi = 0;
  const t0 = performance.now();
  for (let k = 0; k < n; k++) { const t = k / c.hz; while (fi + 1 < F.length && F[fi + 1][0] <= t) fi++;
    const a = F[fi], lm = Math.abs(a[0] - t) < 0.5 ? Array.from({ length: 33 }, (_, i) => ({ x: a[1 + 3 * i], y: a[2 + 3 * i], visibility: a[3 + 3 * i] })) : null;
    const g = raw.subarray(k * W * H, (k + 1) * W * H), d = tr.frame(t, g, W, H, lm);
    if (DBG && k % 10 === 0) { fs.mkdirSync(DBG, { recursive: true }); const roi = Bar.roiFrom(lm, W, H, c);
      fs.writeFileSync(path.join(DBG, `${id}-${String(k).padStart(4, '0')}.json`), JSON.stringify({ t, W, H, roi, d })); } }
  const ms = (performance.now() - t0) / n;
  const pose = R.replay(R.load(id), 10), s = tr.summary(0, 1e9, pose.reps);
  rows.push({ id, ex, truth, pose: pose.reps, poseEx: pose.ex, ...s, msPerFrame: +ms.toFixed(2) });
  console.log(`${id} ${ex.padEnd(8)} truth ${String(truth).padStart(2)} | pose ${pose.ex || '-'} ${pose.reps} | bar ${s.reps} (det ${(s.detFrac * 100).toFixed(0)}%, r ${s.rMed}, static ${s.staticMaxS}s${s.reliable ? '' : ', UNRELIABLE'}) times ${s.repTimes.join(' ')} | ${ms.toFixed(1)} ms/frame`);
}
const ok = rows.filter(r => r.reps === r.truth).length, okP = rows.filter(r => r.pose === r.truth).length;
console.log(`\nbar exact ${ok}/${rows.length} · pose exact ${okP}/${rows.length} · mean det ${(rows.reduce((s, r) => s + r.detFrac, 0) / rows.length * 100).toFixed(0)}%`);
if (arg('--json', null)) fs.writeFileSync(arg('--json'), JSON.stringify(rows, null, 1));
