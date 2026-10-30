#!/usr/bin/env node
// Newrun Lift verification CLI. See tools/README.md.
//   node tools/verify.js doctor
//   node tools/verify.js replay <caseId...> | --tier core|worst|pass|excluded
//   node tools/verify.js app <caseId|clip.y4m> [--url URL] [--secs N] [--dry-run]
//   node tools/verify.js ui [--url URL]   (screenshots of Hjem + Historikk with seeded sessions)
const fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http');
const ROOT = path.join(__dirname, '..'), TEST = '/workspace/repcam-test', OUT = '/workspace/repcam-shots/verify/';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const argv = process.argv.slice(2), cmd = argv[0], flag = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : (argv[i + 1] ?? true); };
const has = n => argv.includes(n), pos = argv.slice(1).filter((a, i, A) => !a.startsWith('--') && !(A[i - 1] || '').startsWith('--'));
const pw = () => { try { return require('playwright-core'); } catch { return require(path.join(TEST, 'node_modules/playwright-core')); } };

function doctor() {
  const chk = [], c = (ok, m) => { chk.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + m); };
  c(+process.versions.node.split('.')[0] >= 18, 'node ' + process.version);
  let p = null; try { p = pw(); } catch {} c(!!p, 'playwright-core');
  c(fs.existsSync(CHROME), 'chrome ' + CHROME);
  for (const y of ['squat.y4m', 'pullups.y4m', 'bench-color.y4m']) c(fs.existsSync(path.join(TEST, y)), 'fake camera ' + y);
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval/real/manifest.json')));
  const miss = man.filter(e => !fs.existsSync(path.join(ROOT, 'eval/real', (e.lm || e.id) + '.lm.json')));
  c(!miss.length, `eval/real: ${man.length} cases, landmarks ${miss.length ? 'missing ' + miss.map(e => e.id) : 'all present'}`);
  const v = (fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').match(/APP_VERSION = '([\d.]+)'/) || [])[1];
  const iv = [...new Set(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/\?v=[\d.]+/g))];
  c(iv.length === 1 && iv[0] === '?v=' + v, `APP_VERSION ${v}, index.html cache-bust ${iv}`);
  c(fs.existsSync('/workspace/repcam-eval/lm'), 'stock eval landmarks /workspace/repcam-eval/lm (only for node eval/eval.js)');
  try { fs.mkdirSync(OUT, { recursive: true }); fs.accessSync(OUT, fs.constants.W_OK); c(true, 'output ' + OUT); } catch { c(false, 'output ' + OUT); }
  const st = cp.spawnSync('git', ['-C', ROOT, 'status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
  console.log('info git: ' + (st ? st.split('\n').length + ' uncommitted change(s)' : 'clean'));
  process.exit(chk.every(Boolean) ? 0 : 1);
}

function replay() {
  const R = require(path.join(ROOT, 'eval/real/run.js')), tier = flag('--tier', null);
  const man = R.man().filter(e => tier ? e.tier === tier : pos.includes(e.id) || pos.some(p => e.id.startsWith(p)));
  if (!man.length) { console.error('no cases match ' + (tier || pos.join(' '))); process.exit(2); }
  let ok = 0;
  for (const e of man) {
    const d = R.load(e.lm || e.id), data = e.win ? { ...d, frames: d.frames.filter(a => a[0] >= e.win[0] && a[0] <= e.win[1]) } : d;
    const r = R.replay(data, 10), good = e.exercise ? r.ex === e.exercise && r.reps === e.gt && r.kg === e.kg : r.reps < 2; if (good) ok++; // same rule as eval/real/run.js
    console.log(`${good ? 'PASS' : 'FAIL'} ${e.id} [${e.tier}] truth ${e.exercise || 'none'} ${e.gt} | pred ${r.ex || 'none'} ${r.reps} @${r.kg} kg | reps at ${r.times.join(', ')}`);
  }
  console.log(`${ok}/${man.length} exact`); process.exit(ok === man.length ? 0 : 1);
}

function serve() { // tiny static server for the repo (no deps)
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.task': 'application/octet-stream' };
  const s = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
  return new Promise(res => s.listen(0, '127.0.0.1', () => res(s)));
}

async function app() {
  const target = pos[0]; if (!target) { console.error('usage: app <caseId|clip.y4m>'); process.exit(2); }
  const isY4m = /\.y4m$/.test(target), y4m = isY4m ? (fs.existsSync(target) ? target : path.join(TEST, target)) : path.join(TEST, 'squat.y4m');
  let e = null; if (!isY4m) { const R = require(path.join(ROOT, 'eval/real/run.js')); e = R.man().find(x => x.id === target || x.id.startsWith(target)); if (!e) { console.error('unknown case ' + target); process.exit(2); } }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19), tag = (e ? e.id : path.basename(y4m, '.y4m')) + '-' + stamp;
  if (has('--dry-run')) { console.log(`dry-run: would serve ${flag('--url', 'local repo')} with fake camera ${y4m}${e ? ', feed landmarks of ' + e.id : ''}, write ${OUT}${tag}.png/.json. Uses a throwaway browser profile; nothing is uploaded (feedback upload disabled).`); return; }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = flag('--url', null) ? null : await serve(), URL0 = flag('--url', null) || `http://127.0.0.1:${srv.address().port}/`;
  const { chromium, devices } = pw(), errs = [];
  const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + y4m, '--enable-unsafe-swiftshader'] });
  try {
    const ctx = await b.newContext({ ...devices['iPhone 13'], permissions: ['camera'] });
    // throwaway profile: onboarded, Norwegian, short autosave for camera clips, feedback off; virtual clock so landmark replay can run faster than real time
    await ctx.addInitScript(([as]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.clear(); Object.entries({ 'repcam.onboarded': '1', 'repcam.profile': '{"name":"Verify"}', 'repcam.lang': 'nb', 'repcam.feedback': '0', 'repcam.autosaveMs': as }).forEach(([k, v]) => localStorage.setItem(k, v)); }
      const rn = Date.now; window.__vt = 0; Date.now = () => rn() + window.__vt; }, [isY4m ? '4000' : '9000']);
    await ctx.route(u => /dropbox|strava\.com/i.test(u.hostname), r => r.abort()); // never upload feedback / touch Strava
    const shadow = []; const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); else if (/^\[(bar|rest)Shadow\]/.test(m.text())) shadow.push(m.text()); });
    await p.goto(URL0); await p.waitForSelector('#view-home.on', { timeout: 20000 }).catch(async x => { await p.screenshot({ path: OUT + 'fail.png' }); throw new Error('home not shown: ' + errs.join(' | ') + ' hash=' + await p.evaluate(() => location.hash)); }); await p.click('#startOkt');
    await p.waitForSelector('#start', { state: 'hidden', timeout: 120000 });
    if (e) { // feed the case's landmarks straight into the app pipeline (same frames the eval replays), virtual time
      await p.evaluate(() => window.__repcam.stopLoop());
      const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval/real', (e.lm || e.id) + '.lm.json'))), fr = e.win ? d.frames.filter(a => a[0] >= e.win[0] && a[0] <= e.win[1]) : d.frames;
      await p.evaluate(({ fr, asp }) => { const t0 = fr[0][0], w0 = performance.now(), d0 = Date.now(); const S = window.__repcam;
        for (const a of fr) { const t = a[0] - t0; window.__vt += Math.max(0, d0 + t * 1000 - Date.now());
          const lm = a.length > 3 ? Array.from({ length: 33 }, (_, i) => ({ x: a[1 + 3 * i], y: a[2 + 3 * i], z: 0, visibility: a[3 + 3 * i] })) : undefined;
          S.processFrame(lm, w0 + t * 1000, asp, null); }
        for (let k = 0; k < 120; k++) { window.__vt += 100; S.processFrame(undefined, w0 + (fr.at(-1)[0] - t0) * 1000 + 100 * (k + 1), asp, null); } // 12 s of nothing → autosave
      }, { fr, asp: d.w / d.h });
    } else await p.waitForSelector('#toast.on', { timeout: +flag('--secs', 60) * 1000 }).catch(() => {});
    await p.waitForTimeout(500);
    const st = await p.evaluate(() => ({ version: window.__repcam.APP_VERSION, chip: document.getElementById('exName')?.textContent, repsShown: document.getElementById('reps')?.textContent, toast: document.getElementById('toast').classList.contains('on') ? document.getElementById('toastTx').textContent : null, sets: JSON.parse(localStorage.getItem('repcam.sets') || '[]') }));
    const proof = { tool: 'tools/verify.js app', at: new Date().toISOString(), url: URL0, input: e ? { case: e.id, tier: e.tier, truth: { exercise: e.exercise, reps: e.gt } } : { y4m }, ...st, shadowLogs: shadow, pageErrors: errs };
    await p.screenshot({ path: OUT + tag + '.png' }); fs.writeFileSync(OUT + tag + '.json', JSON.stringify(proof, null, 1));
    console.log(`app ${st.version} · sets logged: ${st.sets.map(s => `${s.exercise} ${s.reps}×${s.kg}`).join(', ') || 'none'} · toast: ${st.toast || '-'}${e ? ` · truth ${e.exercise || 'none'} ${e.gt}` : ''} · errors ${errs.length}`);
    for (const l of shadow) console.log('log ' + l.slice(0, 300));
    console.log('proof ' + OUT + tag + '.png / .json');
  } finally { await b.close(); srv?.close(); }
}

async function ui() { // screenshots of Hjem + Historikk with a seeded history (collapsed and one card opened)
  if (has('--dry-run')) { console.log('dry-run: would screenshot Hjem/Historikk to ' + OUT); return; }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = flag('--url', null) ? null : await serve(), URL0 = flag('--url', null) || `http://127.0.0.1:${srv.address().port}/`;
  const { chromium, devices } = pw(), b = await chromium.launch({ executablePath: CHROME, headless: true }), errs = [];
  try {
    const now = Date.now(), iso = x => new Date(x).toISOString(), sets = [], sess = [];
    const add = (id, h, list) => { const t0 = now - h * 3600e3; list.forEach((r, i) => sets.push({ exercise: r[2], reps: r[0], kg: r[1], timestamp: iso(t0 + i * 240e3), sessionId: id })); sess.push({ id, start: iso(t0 - 300e3), end: iso(t0 + list.length * 240e3) }); };
    add('s-today', 1.5, [[8, 100, 'knebøy'], [8, 100, 'knebøy'], [8, 100, 'knebøy'], [9, 100, 'halvmark'], [9, 100, 'halvmark'], [20, 15, 'vsitup']]);
    add('s-2', 50, [[12, 100, 'benkpress'], [10, 100, 'benkpress'], [6, 0, 'pullups'], [10, 30, 'roing']]);
    add('s-3', 98, [[16, 70, 'bulgarsk'], [16, 70, 'bulgarsk'], [12, 0, 'dips']]);
    const seed = { 'repcam.sets': JSON.stringify(sets), 'repcam.sessions': JSON.stringify(sess), 'repcam.onboarded': '1', 'repcam.profile': '{"name":"Rune"}', 'repcam.lang': 'nb' };
    const ctx = await b.newContext({ ...devices['iPhone 13'] });
    await ctx.addInitScript(d => { if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.clear(); for (const k in d) localStorage.setItem(k, d[k]); } }, seed);
    const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    const shot = async n => { const f = OUT + 'ui-' + n + '.png'; await p.screenshot({ path: f, fullPage: true }); console.log('shot ' + f); };
    await p.goto(URL0); await p.waitForSelector('#view-home.on'); await p.waitForTimeout(400); await shot('hjem');
    await p.click('#todayList details.sess > summary'); await p.waitForTimeout(300); await shot('hjem-open');
    await p.goto(URL0 + '#/historikk'); await p.waitForSelector('#view-historikk.on'); await p.waitForTimeout(400); await shot('historikk');
    await p.click('#histList details.sess[data-sid="s-2"] > summary'); await p.waitForTimeout(300); await shot('historikk-open');
    console.log('page errors: ' + (errs.join(' | ') || 'none'));
  } finally { await b.close(); srv?.close(); }
}

// v8.17: app switch / resume proof. Starts a workout on a fake camera, then simulates what iOS does on an app switch:
// visibility hidden + pagehide, the camera track killed, the viewport rotated/resized while hidden, then visible + pageshow.
// Checks that #stage, <video> and <canvas> fill the viewport again (and the video content covers it) and screenshots before/after.
async function resume() {
  if (has('--dry-run')) { console.log('dry-run: would screenshot before/after a simulated app switch to ' + OUT); return; }
  fs.mkdirSync(OUT, { recursive: true });
  const y4m = path.join(TEST, pos[0] || 'squat.y4m'), stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const srv = flag('--url', null) ? null : await serve(), URL0 = flag('--url', null) || `http://127.0.0.1:${srv.address().port}/`;
  const { chromium, devices } = pw(), errs = [];
  const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + y4m, '--enable-unsafe-swiftshader'] });
  try {
    const dev = devices['iPhone 13'], ctx = await b.newContext({ ...dev, permissions: ['camera'] });
    await ctx.addInitScript(() => { if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.clear(); Object.entries({ 'repcam.onboarded': '1', 'repcam.profile': '{"name":"Verify"}', 'repcam.lang': 'nb', 'repcam.feedback': '0' }).forEach(([k, v]) => localStorage.setItem(k, v)); }
      let vis = 'visible'; Object.defineProperty(document, 'visibilityState', { get: () => vis, configurable: true }); Object.defineProperty(document, 'hidden', { get: () => vis !== 'visible', configurable: true });
      window.__setVis = x => { vis = x; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event(x === 'visible' ? 'pageshow' : 'pagehide')); }; });
    await ctx.route(u => /dropbox|strava\.com/i.test(u.hostname), r => r.abort());
    const p = await ctx.newPage(); p.on('pageerror', x => errs.push(x.message));
    await p.goto(URL0); await p.waitForSelector('#view-home.on', { timeout: 20000 }); await p.click('#startOkt');
    await p.waitForSelector('#start', { state: 'hidden', timeout: 120000 }); await p.waitForTimeout(1500);
    const measure = () => p.evaluate(() => { const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
      const v = document.getElementById('v'), W = innerWidth, H = innerHeight, vb = v.getBoundingClientRect(), fit = getComputedStyle(v).objectFit;
      const k = (fit === 'cover' ? Math.max : Math.min)(vb.width / (v.videoWidth || 1), vb.height / (v.videoHeight || 1)); // rendered video content size
      const cw = v.videoWidth * k, ch = v.videoHeight * k;
      return { viewport: [W, H], stage: r('stage'), video: r('v'), canvas: r('c'), objectFit: fit, stream: [v.videoWidth, v.videoHeight], canvasPx: [document.getElementById('c').width, document.getElementById('c').height],
        contentCovers: cw >= vb.width - 1 && ch >= vb.height - 1, fills: ['stage', 'v', 'c'].every(id => { const b = document.getElementById(id).getBoundingClientRect(); return Math.abs(b.width - W) < 2 && Math.abs(b.height - H) < 2 && Math.abs(b.left) < 2 && Math.abs(b.top) < 2; }) }; });
    const before = await measure(); await p.screenshot({ path: OUT + `resume-before-${stamp}.png` });
    // app switch: hidden, iOS kills the camera, the phone is rotated / the viewport changes while away
    await p.evaluate(() => { window.__setVis('hidden'); window.__repcam && document.getElementById('v').srcObject?.getVideoTracks().forEach(t => t.stop()); });
    await p.setViewportSize({ width: dev.viewport.height, height: dev.viewport.width }); await p.waitForTimeout(300);
    await p.setViewportSize(dev.viewport); await p.waitForTimeout(200);
    await p.evaluate(() => window.__setVis('visible')); await p.waitForTimeout(2500);
    const after = await measure(); await p.screenshot({ path: OUT + `resume-after-${stamp}.png` });
    const ok = before.fills && after.fills && after.contentCovers && after.stream[0] > 0 && !errs.length;
    const proof = { tool: 'tools/verify.js resume', at: new Date().toISOString(), version: await p.evaluate(() => window.__repcam.APP_VERSION), before, after, ok, pageErrors: errs };
    fs.writeFileSync(OUT + `resume-${stamp}.json`, JSON.stringify(proof, null, 1));
    console.log(JSON.stringify({ before, after }, null, 0)); console.log(`${ok ? 'PASS' : 'FAIL'} resume · proof ${OUT}resume-{before,after}-${stamp}.png / resume-${stamp}.json`);
    process.exitCode = ok ? 0 : 1;
  } finally { await b.close(); srv?.close(); }
}

({ doctor, replay, app, ui, resume }[cmd] || (() => { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 5).join('\n').replace(/^\/\/ ?/gm, '')); process.exit(cmd ? 2 : 0); }))();
