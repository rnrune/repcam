// E2E «Hjelp til å forbedre»: fake camera (squat video) → set recorded → user corrects reps → second set undone → missed-set flag
// → background upload to the worker (Dropbox) → eval/feedback/pull.sh downloads clips + labels → manifest entries carry the ground truth.
// Env: URL (app, default http://localhost:8766/), FB_URL (worker, default local `wrangler dev` at :8797), VIDEO.
const { chromium, devices } = require('playwright-core');
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const URL = process.env.URL || 'http://localhost:8766/', FB_URL = process.env.FB_URL || 'http://localhost:8797';
const SH = process.env.SHOTS || '/workspace/repcam-shots/feedback/'; fs.mkdirSync(SH, { recursive: true });
const errors = [], fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + (process.env.VIDEO || '/workspace/repcam-test/squat.y4m'), '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ ...devices['iPhone 13'], permissions: ['camera'] });
  // Live worker only accepts the real origin: serve the local checkout under https://rnrune.github.io/repcam/ (SERVE_DIR).
  if (process.env.SERVE_DIR) await ctx.route('https://rnrune.github.io/repcam/**', r => { let f = new globalThis.URL(r.request().url()).pathname.replace(/^\/repcam\//, '') || 'index.html'; f = path.join(process.env.SERVE_DIR, f); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); const ext = path.extname(f).slice(1); r.fulfill({ body: fs.readFileSync(f), contentType: { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', webmanifest: 'application/manifest+json', mp4: 'video/mp4', ico: 'image/x-icon', wasm: 'application/wasm', json: 'application/json' }[ext] || 'application/octet-stream' }); });
  await ctx.route('**/strava-config.js*', r => r.fulfill({ contentType: 'text/javascript', body: `window.REPCAM_STRAVA={clientId:'1',workerUrl:${JSON.stringify(FB_URL)}}` }));
  await ctx.addInitScript(() => { if (!sessionStorage.s) { sessionStorage.s = 1; Object.entries({ 'repcam.onboarded': '1', 'repcam.lang': 'nb', 'repcam.autosaveMs': '3500', 'repcam.profile': '{"name":"Rune"}' }).forEach(([k, v]) => localStorage.setItem(k, v)); } });
  const p = await ctx.newPage();
  p.on('response', r => { if (r.url().includes('/fb/') && !r.ok()) console.log('FBRESP', r.status(), r.url()); }); p.on('requestfailed', r => { if (r.url().includes('/fb/')) console.log('FBREQFAIL', r.failure()?.errorText, r.url()); });
  p.on('console', m => { if (m.type() === 'warning') console.log('WARN', m.text()); if (m.text().startsWith('FBDBG')) console.log(m.text()); if (m.type() === 'error' && !/strava|favicon/i.test(m.text())) errors.push(m.text()); }); p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL + '#/profil'); await p.waitForSelector('#fbOn');
  ok(!(await p.isChecked('#fbOn')), 'toggle off by default');
  ok((await p.textContent('#fbCard')).includes('Hjelp til å forbedre'), 'nb label');
  await p.click('#fbOn'); ok(await p.evaluate(() => localStorage.getItem('repcam.fb.on') === '1' && /^[0-9a-f]{24}$/.test(localStorage.getItem('repcam.fb.install'))), 'on: install id + token generated');
  await p.screenshot({ path: SH + '1-profile-on.png' });
  await p.goto(URL + '#/'); await p.click('#startOkt');
  await p.waitForSelector('#start', { state: 'hidden', timeout: 120000 });
  ok(await p.evaluate(() => !!__repcam.fb.rec), 'recorder running in workout');
  ok(await p.isVisible('#fbMiss'), 'missed-set button visible');
  // set 1: autosave → edit reps -1
  await p.waitForSelector('#toast.on #tEdit', { timeout: 120000 });
  const s1 = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('repcam.sets')); return s[s.length - 1]; });
  ok(s1.reps >= 2, 'set 1 saved: ' + s1.exercise + ' × ' + s1.reps);
  await p.click('#tEdit'); await p.waitForSelector('#sheet.on'); await p.click('#sheet .stepper [data-d="-1"] >> nth=0'); await p.screenshot({ path: SH + '2a-correct-reps.png' }); await p.click('#eSave');
  // set 2: undo → not a set
  await p.waitForFunction(ts => { const t = document.getElementById('toast'); return t.classList.contains('on') && getComputedStyle(document.getElementById('tUndo')).display !== 'none' && JSON.parse(localStorage.getItem('repcam.sets')).slice(-1)[0].timestamp !== ts; }, s1.timestamp, { timeout: 120000 });
  const s2 = await p.evaluate(() => JSON.parse(localStorage.getItem('repcam.sets')).slice(-1)[0]);
  await p.screenshot({ path: SH + '2b-undo-toast.png' }); await p.click('#tUndo'); await p.waitForTimeout(1500);
  const dbg = await p.evaluate(async ts => ({ gone: !JSON.parse(localStorage.getItem('repcam.sets')).some(s => s.timestamp === ts), early: Object.keys(__repcam.fb.early), recs: (await __repcam.fbQueue().stats()), labs: (await Feedback.idbKV().all()).map(r => [r.setTs, r.label.kind, r.labelDirty]) }), s2.timestamp);
  ok(dbg.gone, 'set 2 saved then undone (' + s2.reps + ' reps) ' + JSON.stringify(dbg));
  await p.waitForTimeout(3000); await p.click('#fbMiss'); ok(true, 'missed set flagged');
  await p.screenshot({ path: SH + '2-workout.png' });
  await p.click('#finish'); await p.waitForTimeout(500);
  await p.goto(URL + '#/profil');
  const st = await p.waitForFunction(async () => { await __repcam.fbUpload(); const s = await __repcam.fbQueue().stats(); return s.uploaded >= 3 && s.pending === 0 && s; }, null, { timeout: 180000, polling: 2000 }).then(h => h.jsonValue()).catch(() => null);
  if (!st) console.log('QUEUE', JSON.stringify(await p.evaluate(async () => (await Feedback.idbKV().all()).map(r => ({ id: r.id, c: r.clipDone, m: r.metaDone, d: r.labelDirty, t: r.tries, n: r.next - Date.now(), sz: r.blob && r.blob.size })))));
  ok(st, 'all clips + labels uploaded ' + JSON.stringify(st));
  await p.waitForTimeout(500); ok(/0 venter · [3-9]\d* sendt/.test(await p.textContent('#fbStats')), 'profile counter: ' + await p.textContent('#fbStats'));
  await p.screenshot({ path: SH + '3-profile-uploaded.png' });
  const inst = await p.evaluate(() => localStorage.getItem('repcam.fb.install'));
  await b.close();
  // pull
  const out = execFileSync(path.join(__dirname, '../eval/feedback/pull.sh'), { env: { ...process.env, FB_URL } }).toString(); console.log(out.trim());
  const man = JSON.parse(fs.readFileSync(path.join(__dirname, '../eval/feedback/manifest.json'))).filter(e => e.install === inst);
  const e1 = man.find(e => e.pred.reps === s1.reps && e.label === 'corrected'), e2 = man.find(e => e.negative), e3 = man.find(e => e.needsCount);
  ok(man.length >= 3, 'manifest has ' + man.length + ' clips for this install');
  ok(e1 && e1.gt === s1.reps - 1 && e1.exercise === s1.exercise && fs.statSync(e1.file).size > 10000, 'corrected label: gt ' + (e1 && e1.gt) + ' (app said ' + s1.reps + '), video ' + (e1 && fs.statSync(e1.file).size) + ' B');
  ok(e2 && e2.gt === 0, 'undo → negative clip gt 0 ' + s2.timestamp + JSON.stringify(dbg));
  ok(e3 && e3.gt === null, 'missed set → needsCount');
  const meta = JSON.parse(fs.readFileSync(e1.file.replace(/\.(mp4|webm)$/, '.meta.json')));
  ok(meta.repTimes.length === s1.reps && meta.landmarks.frames.length > 20 && meta.app && meta.device.ua && meta.video.w > 0, `meta: ${meta.repTimes.length} rep times, ${meta.landmarks.frames.length} pose frames, ${meta.video.mime} ${meta.video.w}x${meta.video.h}, view ${meta.viewHint}`);
  ok(!errors.length, 'no console errors ' + errors.join(' | '));
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
