// RepCam v5 e2e: wake lock (+ video fallback), background/foreground resume, iOS camera kill, persistence across reload,
// away-time idle rule, and Strava sync against a mocked API. Fake camera = Rune bench video.
const { chromium, devices } = require('playwright-core');
const SH = '/workspace/repcam-shots/v5/', URL = process.env.URL || 'http://localhost:8765/';
require('fs').mkdirSync(SH, { recursive: true });
const errors = [], fails = [];
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails.push(msg); };
const base = { 'repcam.onboarded': '1', 'repcam.lang': 'nb', 'repcam.autosaveMs': '4000', 'repcam.profile': JSON.stringify({ name: 'Rune' }) };
async function mk(b, tag, data, { wakeLock = true, strava = false } = {}) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], permissions: ['camera'] });
  await ctx.addInitScript(([d, wl]) => {
    if (!sessionStorage.seeded) { sessionStorage.seeded = 1; for (const k in d) localStorage.setItem(k, d[k]); }
    window.__wl = []; let vis = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => vis, configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => vis !== 'visible', configurable: true });
    window.__setVis = x => { vis = x; document.dispatchEvent(new Event('visibilitychange')); };
    if (wl) {
      const sents = [];
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async t => { const ls = []; const s = { type: t, released: false, addEventListener: (e, f) => ls.push(f), release: async () => { s.released = true; ls.forEach(f => f()); } }; sents.push(s); window.__wl.push(t); return s; } } });
      document.addEventListener('visibilitychange', () => { if (vis === 'hidden') sents.forEach(s => { if (!s.released) s.release(); }); }); // like a real browser
    } else delete Navigator.prototype.wakeLock;
    const o = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); window.__gum = 0; window.__gumFail = 0;
    navigator.mediaDevices.getUserMedia = c => { window.__gum++; if (window.__gumFail > 0) { window.__gumFail--; return Promise.reject(Object.assign(new Error('gesture'), { name: 'NotAllowedError' })); } return o(c); };
  }, [data, wakeLock]);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errors.push(tag + ': ' + m.text()); });
  p.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
  return p;
}
const reps = p => p.evaluate(() => +document.getElementById('reps').textContent);
const active = p => p.evaluate(() => JSON.parse(localStorage.getItem('repcam.active')));
const nsets = p => p.evaluate(() => (JSON.parse(localStorage.getItem('repcam.sets')) || []).length);
async function start(p) { await p.goto(URL); await p.waitForSelector('#view-home.on'); await p.click('#startOkt'); await p.waitForSelector('#start', { state: 'hidden', timeout: 120000 }); }
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=/workspace/repcam-test/rune-bench.y4m', '--enable-unsafe-swiftshader'] });

  // ---- 1. wake lock + hide/show resume + pending set saved on hide + iOS camera kill
  let p = await mk(b, 'wake', base);
  await start(p);
  ok((await p.evaluate(() => window.__wl.length)) >= 1 && await p.evaluate(() => window.__repcam.wake.mode()) === 'wakelock', 'wake lock requested when workout starts');
  await p.waitForFunction(() => +document.getElementById('reps').textContent >= 2, null, { timeout: 120000 });
  const id0 = (await active(p)).id, n0 = await nsets(p);
  await p.evaluate(() => window.__setVis('hidden'));
  ok(await nsets(p) === n0 + 1, 'half-counted set saved immediately when app is backgrounded');
  // iOS kills the camera while away
  await p.evaluate(() => document.getElementById('v').srcObject.getTracks().forEach(t => t.stop()));
  const g0 = await p.evaluate(() => window.__gum), wl0 = await p.evaluate(() => window.__wl.length);
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__setVis('visible'));
  await p.waitForFunction(g => window.__gum > g, g0, { timeout: 10000 }).catch(() => {});
  await p.waitForFunction(() => document.getElementById('v').srcObject?.getVideoTracks()[0]?.readyState === 'live', null, { timeout: 30000 }).catch(() => {});
  ok(await p.evaluate(() => window.__gum) > g0 && await p.isHidden('#start'), 'camera restarted automatically on return, no tap');
  ok(await p.evaluate(() => window.__wl.length) > wl0, 'wake lock re-acquired on visibilitychange');
  ok((await active(p))?.id === id0, 'same session continues after backgrounding');
  await p.screenshot({ path: SH + '1-resumed.png' });

  // ---- 2. persistence across reload (iOS discarded the tab); gesture required → big «Fortsett»
  const nBefore = await nsets(p);
  await p.evaluate(() => { window.__setVis('hidden'); });
  await p.evaluate(() => sessionStorage.gumFail = '1');
  await p.addInitScript(() => { if (sessionStorage.gumFail) { window.__gumFail = +sessionStorage.gumFail; sessionStorage.removeItem('gumFail'); } });
  await p.evaluate(() => history.replaceState(null, '', '#/')); await p.reload(); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => location.hash) === '#/okt' && (await active(p))?.id === id0, 'reload: active session restored and workout view reopened');
  ok(await nsets(p) === nBefore, 'reload: no sets lost');
  ok(await p.isVisible('#go') && (await p.textContent('#go')) === 'Fortsett', 'reload without permission: one big «Fortsett» button');
  await p.screenshot({ path: SH + '2-fortsett.png' });
  await p.click('#go'); await p.waitForSelector('#start', { state: 'hidden', timeout: 60000 }).then(() => ok(true, 'Fortsett tap restarts camera')).catch(() => ok(false, 'Fortsett tap restarts camera'));
  // time away does not end the session (default 30 min rule)
  await p.evaluate(() => window.__setVis('hidden')); await p.waitForTimeout(2500); await p.evaluate(() => window.__setVis('visible')); await p.waitForTimeout(500);
  ok((await active(p))?.id === id0, 'short time away keeps the session');
  await p.context().close();

  // ---- 3. away rule: no reps + away longer than awayEndMs → session ends at the moment the app left
  p = await mk(b, 'away', { ...base, 'repcam.awayEndMs': '3000' });
  await start(p);
  await p.waitForFunction(() => +document.getElementById('reps').textContent >= 2, null, { timeout: 120000 });
  await p.evaluate(() => window.__setVis('hidden'));
  const hidAt = Date.now(); await p.waitForTimeout(4500);
  await p.evaluate(() => window.__setVis('visible')); await p.waitForTimeout(800);
  const meta = await p.evaluate(() => (JSON.parse(localStorage.getItem('repcam.sessions')) || []).pop() || {});
  ok(!(await active(p)) && await p.evaluate(() => location.hash) !== '#/okt', 'away > limit with no reps → session ended');
  ok(Math.abs(Date.parse(meta.end) - hidAt) < 2500, 'ended at the time the app was left, not at return');
  await p.context().close();

  // ---- 4. no Wake Lock API (older iOS) → hidden looping video fallback
  p = await mk(b, 'nowl', base, { wakeLock: false });
  await start(p);
  const vid = await p.evaluate(() => { const v = document.querySelector('video[src*="nosleep"]'); return v && { loop: v.loop, muted: v.muted, inline: v.hasAttribute('playsinline'), playing: !v.paused }; });
  ok(vid && vid.loop && vid.muted && vid.inline && vid.playing, 'no wakeLock → NoSleep video fallback playing');
  ok(await p.evaluate(() => window.__repcam.wake.mode()) === 'video', 'wake mode = video');
  await p.click('#finish'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.querySelector('video[src*="nosleep"]').paused), 'fallback stops when workout ends');
  await p.context().close();

  // ---- 5. Strava: mocked worker + API; sets land on the overlapping WeightTraining activity, not on the run
  const calls = [];
  p = await mk(b, 'strava', { ...base, 'repcam.strava.tok': JSON.stringify({ access_token: 'T', refresh_token: 'R', expires_at: 2e9, athlete: 'Rune' }) });
  await p.route('**/strava-config.js*', r => r.fulfill({ contentType: 'text/javascript', body: "window.REPCAM_STRAVA={clientId:'1',workerUrl:'https://worker.test'}" }));
  await p.route('https://www.strava.com/api/v3/**', async r => {
    const u = r.request().url(), m = r.request().method(); calls.push({ u, m, body: r.request().postData() });
    const now = Date.now(), iso = t => new Date(t).toISOString().replace(/\.\d+Z$/, 'Z');
    const acts = [{ id: 11, name: 'Morgenløp', sport_type: 'Run', type: 'Run', start_date: iso(now - 5 * 3600e3), elapsed_time: 1800 },
      { id: 22, name: 'Styrke', sport_type: 'WeightTraining', type: 'WeightTraining', start_date: iso(now - 10 * 60e3), start_date_local: iso(now - 10 * 60e3 + 2 * 3600e3), elapsed_time: 3600 }];
    const j = x => r.fulfill({ contentType: 'application/json', body: JSON.stringify(x), headers: { 'Access-Control-Allow-Origin': '*' } });
    if (u.includes('/athlete/activities')) return j(acts);
    if (/\/activities\/22$/.test(u) && m === 'GET') return j({ ...acts[1], description: 'Bra økt' });
    if (/\/activities\/22$/.test(u) && m === 'PUT') return j({ id: 22 });
    return r.fulfill({ status: 400, body: '{}' });
  });
  await start(p);
  await p.waitForSelector('#toast.on', { timeout: 120000 });
  await p.click('#finish'); await p.waitForTimeout(2500);
  const put = calls.find(c => c.m === 'PUT');
  ok(put && /\/activities\/22$/.test(put.u) && JSON.parse(put.body).description.startsWith('Bra økt\n\n— Newrun Lift —\n'), 'Strava: description written to overlapping WeightTraining activity, user text kept');
  ok(!calls.some(c => c.m === 'PUT' && /\/11$/.test(c.u)), 'Strava: never wrote to the non-overlapping run');
  await p.click('#sumOk').catch(() => {}); await p.click('#tabs a[data-v=profil]'); await p.waitForTimeout(300);
  ok((await p.textContent('#stravaCard')).includes('Styrke'), 'Strava status shown in Profil');
  await p.screenshot({ path: SH + '5-strava-profile.png', fullPage: true });
  await p.context().close();
  await b.close();
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fails.length ? fails.length + ' FAILED' : 'ALL PASSED'); process.exit(fails.length ? 1 : 0);
})();
