// v8.3 e2e: "Slett hele økten" in Historikk (one confirmation, 7 languages), deleted session never reaches Strava, deleting all sets cancels the queue item.
const { chromium, devices } = require('playwright-core');
const SH = '/workspace/repcam-shots/v8.3/', URL0 = process.env.URL || 'http://localhost:8765/';
const fails = [], errors = [], ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
function seed(lang) {
  const now = Date.now(), iso = x => new Date(x).toISOString(), sets = [], meta = [];
  const add = (id, hAgo, list) => { const s0 = now - hAgo * 3600e3; list.forEach((r, i) => sets.push({ exercise: 'knebøy', reps: r[0], kg: r[1], timestamp: iso(s0 + i * 3e5), sessionId: id })); meta.push({ id, start: iso(s0), end: iso(s0 + list.length * 3e5) }); };
  add('s-old', 30, [[8, 60], [8, 62.5]]); add('s-del', 0.7, [[5, 80], [5, 85], [5, 90]]); add('s-sets', 0.5, [[10, 40]]);
  const q = [{ id: 's-del', start: meta[1].start, end: meta[1].end, sets: [], added: now, status: 'waiting' }, { id: 's-sets', start: meta[2].start, end: meta[2].end, sets: [], added: now, status: 'waiting' },
    { id: 's-old', start: meta[0].start, end: meta[0].end, sets: [], added: now, status: 'synced', activityId: 9 }];
  return { 'repcam.sets': JSON.stringify(sets), 'repcam.sessions': JSON.stringify(meta), 'repcam.onboarded': '1', 'repcam.profile': JSON.stringify({ name: 'Rune' }), 'repcam.lang': lang,
    'repcam.strava.tok': JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_at: 2e9, athlete: 'Rune' }), 'repcam.strava.queue': JSON.stringify(q) };
}
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  const strava = [];
  async function page(lang, dark) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], colorScheme: dark ? 'dark' : 'light' });
    await ctx.addInitScript(d => { if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.clear(); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(lang));
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(lang + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(lang + ': ' + m.text()); });
    await p.route('**/strava-config.js*', r => r.fulfill({ contentType: 'text/javascript', body: "window.REPCAM_STRAVA={clientId:'1',workerUrl:'https://worker.test'}" }));
    await p.route('https://www.strava.com/api/v3/**', r => { strava.push(r.request().method() + ' ' + r.request().url());
      r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: r.request().url().includes('/uploads') ? '{"id":1,"id_str":"1","activity_id":5}' : '[]' }); });
    await p.goto(URL0 + '#/historikk'); await p.waitForSelector('#view-historikk.on'); await p.waitForTimeout(300); return p;
  }
  let p = await page('nb');
  ok(await p.evaluate(() => window.__repcam.APP_VERSION === '8.5' && [...document.scripts].some(s => /\?v=8\.5/.test(s.src))), 'APP_VERSION 8.5 + ?v=8.5');
  ok(await p.locator('[data-sdel]').count() === 3, 'every session has a delete button');
  await p.screenshot({ path: SH + '01-historikk-nb.png' });
  await p.click('[data-sdel="s-del"]'); await p.waitForSelector('#sheet.on #dYes');
  const txt = await p.textContent('#sheet');
  ok(txt.includes('Slette hele økten?') && txt.includes('3 sett') && txt.includes('må aktiviteten slettes i Strava'), 'nb dialog text: ' + txt.replace(/\s+/g, ' ').slice(0, 160));
  await p.screenshot({ path: SH + '02-slett-okt-dialog-nb.png' });
  await p.click('#dYes'); await p.waitForTimeout(300);
  const st = await p.evaluate(() => ({ sets: JSON.parse(localStorage['repcam.sets']).filter(s => s.sessionId === 's-del').length, meta: JSON.parse(localStorage['repcam.sessions']).some(m => m.id === 's-del'), q: window.__repcam.strava.queue().map(x => x.id) }));
  ok(st.sets === 0 && !st.meta && !st.q.includes('s-del') && st.q.includes('s-old'), 'session removed locally + from Strava queue (synced item kept): ' + JSON.stringify(st));
  ok(await p.locator('[data-sdel]').count() === 2, 'list re-rendered without the session');
  await p.screenshot({ path: SH + '03-etter-sletting-nb.png' });
  // cancel keeps everything
  await p.click('[data-sdel="s-old"]'); await p.waitForSelector('#sheet.on #dNo');
  ok((await p.textContent('#sheet')).includes('allerede sendt til Strava'), 'already-synced session: dialog says delete it in Strava');
  await p.screenshot({ path: SH + '04-slett-synket-okt-dialog-nb.png' });
  await p.click('#dNo'); await p.waitForTimeout(300); ok(await p.locator('[data-sdel]').count() === 2, 'Avbryt keeps the session');
  // delete the only set of s-sets via the set editor → queue item cancelled
  await p.click('.setrow >> nth=0'); await p.waitForSelector('#eDel'); await p.click('#eDel'); await p.waitForSelector('#dYes'); await p.click('#dYes'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !window.__repcam.strava.queue().some(x => x.id === 's-sets')), 'deleting last set cancels the pending sync');
  // force a sync pass 3 h later (past the 1 h auto-create fallback): nothing may be uploaded
  await p.evaluate(() => { const S = window.Strava, c = S.createClient({ ls: localStorage, fetch: (...x) => fetch(...x), config: window.REPCAM_STRAVA, liveSets: id => window.__repcam.store.sets().filter(s => s.sessionId === id), now: () => Date.now() + 3 * 3600e3 }); return c.process({}); }); await p.waitForTimeout(300);
  ok(!strava.some(x => /POST|PUT|DELETE/.test(x)), 'no Strava writes/deletes at all: ' + JSON.stringify(strava));
  // translations
  const want = { en: 'Delete the entire session?', es: '¿Eliminar toda la sesión?', de: 'Ganze Einheit löschen?', fr: 'Supprimer toute la séance ?', sv: 'Radera hela passet?', da: 'Slet hele træningen?' };
  for (const [l, w] of Object.entries(want)) { const q = await page(l, l === 'de'); await q.click('[data-sdel="s-del"]'); await q.waitForSelector('#sheet.on #dYes');
    const t = await q.textContent('#sheet'); ok(t.includes(w) && /Strava/.test(t), l + ': dialog translated'); if (l === 'en' || l === 'de') await q.screenshot({ path: SH + `05-dialog-${l}${l === 'de' ? '-dark' : ''}.png` }); await q.context().close(); }
  ok(!errors.length, 'no console errors ' + errors.join(' | '));
  await b.close(); console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})();
