// usage: node extract.js id1 id2 ...  (videos/<id>.mp4 -> lm/<id>.json) ; same MediaPipe JS runtime + lite model as the app
const { chromium } = require('playwright-core'); const fs = require('fs'); const http = require('http'); const path = require('path');
const root = __dirname;
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  const st = fs.statSync(f), m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || ''); const type = f.endsWith('.mp4') ? 'video/mp4' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream';
  if (m) { const s = +m[1], e = m[2] ? +m[2] : st.size - 1; r.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 }); fs.createReadStream(f, { start: s, end: e }).pipe(r); }
  else { r.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' }); fs.createReadStream(f).pipe(r); } }).listen((+process.env.PORT||8811));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8811/extract.html'); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  for (const id of process.argv.slice(2)) {
    const out = path.join(root, 'lm', id + '.json'); if (fs.existsSync(out)) { console.log('skip', id); continue; }
    const t = Date.now(); const d = await p.evaluate(([s]) => window.extract(s, 15), ['videos/' + id + '.mp4']);
    fs.writeFileSync(out, JSON.stringify(d)); console.log(id, d.frames.length, d.frames.filter(Boolean).length, ((Date.now() - t) / 1000).toFixed(0) + 's');
  }
  await b.close(); srv.close();
})();
