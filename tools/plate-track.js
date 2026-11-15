#!/usr/bin/env node
// v8.45: precompute the plate track of a clip for the eval (derived numbers only — never video in the repo).
// node tools/plate-track.js <clip.mp4> <out.plate.json>   Decodes with ffmpeg (gray, PLATE_CFG.hz, PLATE_CFG.frameW wide) and runs
// the same plate.js tracker as the app. Output {v, hz, w, h, track: [[t, y|null, mass], …]} (t = seconds from clip start).
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const P = require(path.join(__dirname, '..', 'plate.js'));
const [src, out] = process.argv.slice(2); if (!src || !out) { console.error('usage: plate-track.js clip.mp4 out.plate.json'); process.exit(2); }
const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation', '-of', 'json', src]).toString();
const s = JSON.parse(probe).streams[0]; let vw = s.width, vh = s.height; const rot = Math.abs(((s.side_data_list || [])[0] || {}).rotation || 0); if (rot === 90 || rot === 270) [vw, vh] = [vh, vw];
const c = P.PLATE_CFG, w = c.frameW, h = Math.round(w * vh / vw / 2) * 2;
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', src, '-vf', `fps=${c.hz},scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
const tr = P.createPlateTracker(), n = Math.floor(raw.length / (w * h)), track = [];
for (let k = 0; k < n; k++) { const t = k / c.hz, r = tr.frame(t, raw.subarray(k * w * h, (k + 1) * w * h), w, h); track.push([+t.toFixed(3), r[1] == null ? null : +r[1].toFixed(4), +r[2].toFixed(4)]); }
fs.writeFileSync(out, JSON.stringify({ v: '8.45', hz: c.hz, w, h, track }));
console.log('wrote', out, n, 'samples', w + 'x' + h);
