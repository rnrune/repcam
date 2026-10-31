// v8.27: pulled clip meta (rv*/…meta.json from the Worker) → eval/real/<id>.lm.json. Keeps full-rate clips packed (i16b64).
// Usage: node tools/meta-to-lm.js <meta.json> [id]
const fs = require('fs'), path = require('path');
const m = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), id = process.argv[3] || m.id, v = m.video || {};
const out = { w: v.w || 720, h: v.h || 1280, poseRate: m.poseRate || null };
if (m.landmarks && m.landmarks.enc) out.landmarks = m.landmarks; else out.frames = (m.landmarks && m.landmarks.frames) || [];
const f = path.join(__dirname, '..', 'eval/real', id + '.lm.json'); fs.writeFileSync(f, JSON.stringify(out));
console.log('wrote', f, out.landmarks ? `full-rate ${out.landmarks.n} frames` : `${out.frames.length} frames (throttled)`);
