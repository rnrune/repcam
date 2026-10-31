// v8.27: pulled clip meta (rv*/…meta.json from the Worker) → eval/real/<id>.lm.json. Keeps full-rate clips packed (i16b64).
// Usage: node tools/meta-to-lm.js <meta.json> [id]
const fs = require('fs'), path = require('path');
const m = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), id = process.argv[3] || m.id, v = m.video || {};
const out = { w: v.w || 720, h: v.h || 1280, poseRate: m.poseRate || null };
if (m.landmarks && m.landmarks.enc) out.landmarks = m.landmarks; else out.frames = (m.landmarks && m.landmarks.frames) || [];
const f = path.join(__dirname, '..', 'eval/real', id + '.lm.json'); fs.writeFileSync(f, JSON.stringify(out));
console.log('wrote', f, out.landmarks ? `full-rate ${out.landmarks.n} frames` : `${out.frames.length} frames (throttled)`);
// v8.33: camera angle chosen in the app (session position, derived per exercise, or overridden per set) = angle ground truth for the manifest
{ let lab = null; try { lab = JSON.parse(fs.readFileSync(process.argv[2].replace(/\.meta\.json$/, '.label.json'), 'utf8')); } catch {}
  const cam = (lab && lab.camera) || m.camera; if (cam && cam.angle) console.log('manifest:', JSON.stringify({ angle: cam.angle, angleVerified: `Rune in-app ${cam.overridden ? 'set override' : 'session position'} ${String(m.created || '').slice(0, 10)}`, cameraPos: cam.sessionPos || null }));
  else console.log('manifest: angle unknown (no camera position in the app) — ask Rune'); }
