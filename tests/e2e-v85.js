// v8.5 e2e: deleting a set / a whole session sticks (re-render, tab switches, reload), no flip-flop, reachable buttons on iPhone, rapid taps, active/just-ended sessions, legacy + duplicated records.
const { chromium, devices } = require('playwright-core');
const URL0 = process.env.URL || 'http://localhost:8765/', SH = '/workspace/repcam-shots/v8.5/';
const fails = [], errors = [], ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
function seed() {
  const now = Date.now(), iso = x => new Date(x).toISOString(), sets = [], meta = [];
  const add = (id, hAgo, list) => { const s0 = now - hAgo * 3600e3; list.forEach((r, i) => sets.push({ exercise: r[2] || 'knebøy', reps: r[0], kg: r[1], timestamp: iso(s0 + i * 3e5), sessionId: id })); meta.push({ id, start: iso(s0), end: iso(s0 + list.length * 3e5) }); };
  add('s-old', 50, [[8, 60], [8, 62.5], [6, 70], [10, 0, 'pullups']]); add('s-new', 1, [[5, 80], [5, 85], [5, 90], [5, 95]]);
  sets.push({ exercise: 'knebøy', reps: 5, kg: 50, timestamp: iso(now - 200 * 3600e3) }, { exercise: 'knebøy', reps: 5, kg: 55, timestamp: iso(now - 200 * 3600e3 + 3e5) }); // legacy, no sessionId
  const dup = { exercise: 'benkpress', reps: 6, kg: 70, timestamp: iso(now - 80 * 3600e3), sessionId: 's-dup' }; sets.push(dup, { ...dup }, { ...dup, kg: 72.5 }); meta.push({ id: 's-dup', start: dup.timestamp, end: dup.timestamp });
  return { 'repcam.sets': JSON.stringify(sets), 'repcam.sessions': JSON.stringify(meta), 'repcam.onboarded': '1', 'repcam.profile': '{"name":"Rune"}', 'repcam.lang': 'nb' };
}
(async () => {
  require('fs').mkdirSync(SH, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  async function page(dev = 'iPhone 13') {
    const ctx = await b.newContext({ ...devices[dev], permissions: ['camera'] });
    await ctx.addInitScript(d => { if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.clear(); for (const k in d) localStorage.setItem(k, d[k]); } }, seed());
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|model|mediapipe|wasm/i.test(m.text())) errors.push(m.text()); });
    await p.goto(URL0 + '#/historikk'); await p.waitForSelector('#view-historikk.on'); await p.waitForTimeout(300); return p;
  }
  const rows = p => p.$$eval('.setrow', r => r.map(x => x.dataset.ts + '|' + x.innerText.replace(/\s+/g, ' ')));
  const stored = p => p.evaluate(() => JSON.parse(localStorage['repcam.sets']));
  const reachable = (p, sel) => p.evaluate(s => { const e = document.querySelector(s), r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= innerHeight && (h === e || e.contains(h)); }, sel);
  let p = await page();
  ok(await p.evaluate(() => window.__repcam.APP_VERSION === '8.9' && [...document.scripts].filter(s => /repcam|localhost|github\.io/.test(s.src) || /\.js\?/.test(s.src)).every(s => /\?v=8\.9/.test(s.src))), 'APP_VERSION 8.7 + ?v=8.7');
  // 1) delete one set (85 kg) of s-new with taps, buttons reachable without scrolling on every iPhone size
  for (const dev of ['iPhone SE', 'iPhone 13', 'iPhone 15 Pro Max']) { const q = dev === 'iPhone 13' ? p : await page(dev);
    await q.tap('.setrow >> nth=1'); await q.waitForSelector('#sheet.on #eDel'); await q.waitForTimeout(350);
    ok(await reachable(q, '#eDel') && await reachable(q, '#eSave') && await reachable(q, '#eNo'), dev + ': Lagre/Slett/Avbryt visible + tappable without scrolling');
    if (dev !== 'iPhone 13') await q.context().close(); else await q.screenshot({ path: SH + '01-endre-sett.png' }); }
  const ts85 = (await stored(p)).find(s => s.kg === 85).timestamp;
  const exBefore = (await stored(p)).find(s => s.kg === 85).exercise;
  await p.tap('#eDel'); await p.waitForSelector('#sheet.on #dYes'); await p.waitForTimeout(350);
  await p.tap('#dYes'); await p.tap('#dYes', { force: true }).catch(() => {}); await p.waitForTimeout(500); // rapid double tap
  let r = await rows(p), st = await stored(p);
  ok(!st.some(s => s.timestamp === ts85) && !r.some(x => x.startsWith(ts85)), 'set deleted (storage + list)');
  ok(st.filter(s => s.sessionId === 's-new').map(s => s.kg).join() === '80,90,95', 'double tap deleted exactly one set, others intact: ' + st.filter(s => s.sessionId === 's-new').map(s => s.kg));
  ok(!st.some(s => s.exercise !== exBefore && s.sessionId === 's-new'), 'no exercise flip on remaining sets');
  for (const h of ['#/', '#/profil', '#/historikk']) { await p.evaluate(x => location.hash = x, h); await p.waitForTimeout(200); }
  ok(!(await rows(p)).some(x => x.startsWith(ts85)), 'still gone after re-render via tabs');
  await p.reload(); await p.waitForSelector('#view-historikk.on'); await p.waitForTimeout(300);
  ok(!(await rows(p)).some(x => x.startsWith(ts85)) && (await stored(p)).length === st.length, 'still gone after reload');
  // 2) duplicated records with one timestamp: one delete removes them all (no "comes back")
  const dupTs = st.find(s => s.sessionId === 's-dup').timestamp;
  await p.tap(`.setrow[data-ts="${dupTs}"] >> nth=0`); await p.waitForSelector('#eDel'); await p.waitForTimeout(350); await p.tap('#eDel'); await p.waitForSelector('#dYes'); await p.waitForTimeout(350); await p.tap('#dYes'); await p.waitForTimeout(400);
  ok(!(await stored(p)).some(s => s.timestamp === dupTs) && !(await rows(p)).some(x => x.startsWith(dupTs)), 'duplicated set records deleted in one go');
  // 3) delete whole session with rapid taps on 🗑 and Slett
  await p.evaluate(() => { const b = document.querySelector('[data-sdel="s-old"]'); b.click(); b.click(); }); await p.waitForSelector('#sheet.on #dYes'); await p.waitForTimeout(350);
  ok(await reachable(p, '#dYes'), 'session dialog Slett reachable'); await p.evaluate(() => { const y = document.getElementById('dYes'); y.click(); y.click(); }); await p.waitForTimeout(500);
  ok(!(await stored(p)).some(s => s.sessionId === 's-old') && !(await p.$('[data-sdel="s-old"]')) && !(await p.evaluate(() => document.getElementById('sheet').classList.contains('on'))), 'session deleted, no second dialog');
  await p.reload(); await p.waitForTimeout(300); ok(!(await p.$('[data-sdel="s-old"]')), 'session still gone after reload');
  // 4) legacy session (no sessionId, computed id)
  const leg = await p.$eval('[data-sdel^="legacy-"]', e => e.dataset.sdel); await p.tap(`[data-sdel="${leg}"]`); await p.waitForSelector('#dYes'); await p.waitForTimeout(350); await p.tap('#dYes'); await p.waitForTimeout(400);
  await p.reload(); await p.waitForTimeout(300); ok(!(await p.$('[data-sdel^="legacy-"]')) && !(await stored(p)).some(s => !s.sessionId), 'legacy session deleted + persists');
  // 5) during an active session: sets saved, user goes to Historikk (ends session), deletes it, back to a new workout and home: nothing re-persisted
  await p.evaluate(() => location.hash = '#/okt'); await p.waitForTimeout(500);
  await p.evaluate(() => { const s = window.__repcam.store; s.addSet({ exercise: 'knebøy', reps: 5, kg: 100 }); s.addSet({ exercise: 'knebøy', reps: 5, kg: 100 }); s.addSet({ exercise: 'knebøy', reps: 3, kg: 110 }); });
  const aid = await p.evaluate(() => window.__repcam.store.active().id);
  await p.evaluate(() => location.hash = '#/historikk'); await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById('sheet').classList.contains('on') && document.getElementById('sumOk')?.click()); await p.waitForTimeout(400);
  ok(await p.evaluate(() => !window.__repcam.store.active()), 'leaving the workout ended the session');
  await p.tap(`[data-sdel="${aid}"]`); await p.waitForSelector('#dYes'); await p.waitForTimeout(350); await p.tap('#dYes'); await p.waitForTimeout(400);
  await p.evaluate(() => location.hash = '#/okt'); await p.waitForTimeout(800); await p.evaluate(() => location.hash = '#/'); await p.waitForTimeout(500);
  await p.reload(); await p.waitForTimeout(500); await p.evaluate(() => location.hash = '#/historikk'); await p.waitForTimeout(300);
  ok(!(await stored(p)).some(s => s.sessionId === aid) && !(await p.$(`[data-sdel="${aid}"]`)) && !(await p.evaluate(a => JSON.parse(localStorage['repcam.sessions'] || '[]').some(m => m.id === a), aid)), 'just-ended session deleted, not re-saved by a later workout/reload');
  // 6) undo toast in the workout deletes exactly that set (and a set saved in the same ms gets its own id)
  await p.evaluate(() => location.hash = '#/okt'); await p.waitForTimeout(500);
  const same = await p.evaluate(() => { const s = window.__repcam.store, d = new Date(); const a = s.addSet({ reps: 5, kg: 60 }, d), b = s.addSet({ reps: 5, kg: 65 }, d); return a.timestamp !== b.timestamp; });
  ok(same, 'two sets saved in the same millisecond get distinct ids');
  await p.evaluate(() => location.hash = '#/historikk'); await p.waitForTimeout(400); await p.evaluate(() => document.getElementById('sumOk')?.click()); await p.waitForTimeout(300);
  const n0 = (await stored(p)).length, t60 = (await stored(p)).find(s => s.kg === 60).timestamp;
  await p.tap(`.setrow[data-ts="${t60}"]`); await p.waitForSelector('#eDel'); await p.waitForTimeout(350); await p.tap('#eDel'); await p.waitForSelector('#dYes'); await p.waitForTimeout(350); await p.tap('#dYes'); await p.waitForTimeout(400);
  await p.reload(); await p.waitForTimeout(400);
  ok((await stored(p)).length === n0 - 1 && (await stored(p)).some(s => s.kg === 65), 'same-ms neighbour survives deleting its twin');
  await p.screenshot({ path: SH + '02-etter-sletting.png' });
  ok(!errors.length, 'no console errors ' + errors.join(' | '));
  await b.close(); console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})();
