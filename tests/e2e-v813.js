// v8.13 e2e: edit a finished session from Historikk — add a set (＋ Legg til sett), edit it, delete it; survives reload.
// Usage: URL=http://localhost:8899/ node tests/e2e-v813.js   (serve the repo root first)
const { chromium, devices } = require('playwright-core');
const URL0 = process.env.URL || 'http://localhost:8899/';
const fails = [], ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const now = Date.now(), iso = x => new Date(x).toISOString();
const sets = [[8, 100, 'knebøy'], [9, 100, 'halvmark'], [20, 15, 'situps']].map((r, i) => ({ exercise: r[2], reps: r[0], kg: r[1], timestamp: iso(now - 3 * 3600e3 + i * 3e5), sessionId: 's-27' }));
const seed = { 'repcam.sets': JSON.stringify(sets), 'repcam.sessions': JSON.stringify([{ id: 's-27', start: sets[0].timestamp, end: iso(now - 2 * 3600e3) }]), 'repcam.onboarded': '1', 'repcam.profile': '{"name":"Rune"}', 'repcam.lang': 'nb' };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  const ctx = await b.newContext({ ...devices['iPhone 13'] }); const errs = [];
  await ctx.addInitScript(d => { if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.clear(); for (const k in d) localStorage.setItem(k, d[k]); } }, seed);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL0 + '#/historikk'); await p.waitForSelector('#view-historikk.on'); await p.waitForTimeout(400);
  await p.click('details.sess[data-sid="s-27"] > summary'); // v8.15: session card is collapsed
  ok(await p.locator('[data-sadd="s-27"]').count() === 1, 'add-set button on the finished session');
  await p.click('[data-sadd="s-27"]'); await p.waitForSelector('#eSave');
  await p.click('#sheet .exgrid button[data-ex="vsitup"]'); await p.fill('#eReps', '12'); await p.fill('#eKg', '15'); await p.click('#eSave'); await p.waitForTimeout(400);
  const rows = await p.locator('.setrow').allTextContents(); ok(rows.length === 4 && /V-situp/.test(rows[3]) && /12/.test(rows[3]), 'new V-situp set is the 4th row: ' + rows[3]);
  await p.reload(); await p.waitForSelector('#view-historikk.on'); await p.waitForTimeout(400);
  ok((await p.locator('.setrow').count()) === 4, 'added set survives reload');
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('repcam.sets')).filter(s => s.sessionId === 's-27').length); ok(st === 4, 'stored in the same session');
  await p.locator('.setrow').nth(0).click(); await p.waitForSelector('#eSave'); await p.fill('#eReps', '9'); await p.click('#eSave'); await p.waitForTimeout(300);
  ok(/9 reps/.test(await p.locator('.setrow').nth(0).textContent()), 'edit reps of the first set');
  await p.locator('.setrow').nth(3).click(); await p.waitForSelector('#eDel'); p.once('dialog', d => d.accept()); await p.click('#eDel'); await p.waitForTimeout(300);
  await p.waitForSelector('#dYes'); const cd = p.locator('#dYes'); if (await cd.count()) { await cd.first().click(); await p.waitForTimeout(300); }
  ok((await p.locator('.setrow').count()) === 3, 'delete the added set');
  ok(!errs.length, 'no page errors ' + errs.join('|'));
  await b.close(); if (fails.length) { console.log('FAILED', fails); process.exit(1); } console.log('e2e-v813 ok');
})();
