// Newrun Lift (formerly RepCam) v6/v7 regression: profile/onboarding and Strava connection must survive reloads and the OAuth redirect.
const { chromium, devices } = require('playwright-core');
const URL0 = process.env.URL || 'http://localhost:8765/';
const fails = [], errors = [];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
async function ctxPage(b, live) {
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  if (!live) await p.route('**/strava-config.js*', r => r.fulfill({ contentType: 'text/javascript', body: "window.REPCAM_STRAVA={clientId:'1',workerUrl:'https://worker.test'}" }));
  await p.route('https://worker.test/**', r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_at: 2e9, athlete: { firstname: 'Rune' } }) }));
  await p.route('https://www.strava.com/api/v3/**', r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }));
  await p.route('https://www.strava.com/oauth/**', r => { const u = new URL(r.request().url());
    r.fulfill({ status: 302, headers: { location: u.searchParams.get('redirect_uri') + '?state=' + encodeURIComponent(u.searchParams.get('state')) + '&code=CODE&scope=read,activity:write,activity:read_all' } }); });
  return p;
}
const onb = p => p.evaluate(() => !!document.querySelector('#sheet.on #oName'));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  const live = !!process.env.LIVE;
  let p = await ctxPage(b, live);
  await p.goto(URL0); await p.waitForSelector('#sheet.on #oName');
  ok(await p.evaluate(() => [...document.scripts].some(s => /\?v=8\.3/.test(s.src))), 'page loads v8.3 scripts');
  ok(await p.title() === 'Newrun Lift', 'title is Newrun Lift');
  ok((await p.textContent('#sheet')).includes('Newrun Lift') && !(await p.textContent('body')).includes('RepCam'), 'onboarding shows Newrun Lift, no RepCam text');
  { const m = await p.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()));
    ok(m.name === 'Newrun Lift' && m.short_name === 'Lift', 'manifest name/short_name'); }
  ok(await p.evaluate(() => ['nb', 'en', 'es', 'de', 'fr', 'sv', 'da'].every(l => { const L = I18n.create(l); return L.exName('benkpress') !== 'n.benkpress' && L.t('tip.benkpress') !== 'tip.benkpress' && L.t('onb.title').includes('Newrun Lift'); })), 'bench press + brand translated in all 7 languages');
  ok(await p.evaluate(() => Promise.all(['icon-512.png', 'icon-192.png', 'icon-180.png', 'favicon-32.png'].map(f => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth === +(f.match(/\d+/)[0])); i.onerror = () => r(false); i.src = f; }))).then(a => a.every(Boolean))), 'icons 512/192/180/32 load with right sizes');
  await p.fill('#oName', 'Rune'); await p.fill('#oBw', '82.5'); await p.click('#oGo');
  for (let i = 0; i < 2; i++) {
    await p.reload(); await p.waitForTimeout(1200);
    ok(!(await onb(p)), `reload ${i + 1}: onboarding not shown`);
    const pr = await p.evaluate(() => JSON.parse(localStorage.getItem('repcam.profile')));
    ok(pr.name === 'Rune' && pr.bw === 82.5, `reload ${i + 1}: name/weight kept`);
  }
  await p.goto(URL0 + '#/profil'); await p.waitForTimeout(500);
  ok(await p.inputValue('#pName') === 'Rune' && await p.inputValue('#pBw') === '82.5', 'profile page shows name and weight');
  // typed but app killed before "Get started" (new context) → values not lost
  if (!live) {
    await p.click('#stConnect');
    await p.waitForFunction(() => /✓/.test(document.getElementById('stravaCard')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
    ok(!/code=/.test(p.url()), 'OAuth query stripped from URL');
    ok(await p.evaluate(() => window.__repcam.strava.connected()), 'Strava connected after OAuth redirect');
    ok(!(await onb(p)), 'no onboarding after OAuth return');
    for (let i = 0; i < 2; i++) {
      await p.reload(); await p.waitForTimeout(1200);
      ok(await p.evaluate(() => window.__repcam.strava.connected()), `reload ${i + 1}: Strava still connected`);
      ok(!(await onb(p)) && (await p.evaluate(() => JSON.parse(localStorage.getItem('repcam.profile')).name)) === 'Rune', `reload ${i + 1}: still onboarded with name`);
    }
    // iOS: OAuth started in the home-screen app returns in Safari (separate, empty storage)
    const st = 'abc123.' + Buffer.from(JSON.stringify({ n: 'Rune', b: 82.5, l: 'nb' })).toString('base64url');
    const q = await ctxPage(b, false);
    await q.goto(URL0 + '?state=' + st + '&code=CODE&scope=read,activity:write,activity:read_all');
    await q.waitForTimeout(1500);
    ok(!(await onb(q)), 'other context: no onboarding (profile carried in state)');
    ok(await q.evaluate(() => window.__repcam.strava.connected()), 'other context: Strava connected');
    ok((await q.textContent('#stravaNote')).includes('hjemskjermen'), 'other context: explains connect again in home-screen app');
    await q.reload(); await q.waitForTimeout(1000);
    ok(!(await onb(q)) && await q.evaluate(() => window.__repcam.strava.connected()), 'other context: persists after reload');
    // half-typed onboarding survives a reload
    const r = await ctxPage(b, false); await r.goto(URL0); await r.waitForSelector('#oName');
    await r.fill('#oName', 'Kari'); await r.type('#oBw', '60'); await r.reload(); await r.waitForTimeout(1000);
    ok(!(await onb(r)) && (await r.evaluate(() => JSON.parse(localStorage.getItem('repcam.profile')).bw)) === 60, 'typed name/weight kept even without tapping Get started');
  }
  ok(!errors.length, 'no page errors ' + errors.join('; '));
  await b.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASSED'); process.exit(fails.length ? 1 : 0);
})();
