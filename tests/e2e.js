// Newrun Lift (formerly RepCam) e2e (v4 features): iPhone 13 emulation, fake camera from real exercise videos, i18n, auto-save + undo/edit, history editing, no console errors.
const { chromium, devices } = require('playwright-core');
const SH = '/workspace/repcam-shots/v4/', URL = process.env.URL || 'http://localhost:8765/';
const errors = [], fails = [];
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails.push(msg); };
function seed(extra = {}) {
  const now = new Date(), d = (days, h, m = 0) => { const x = new Date(now); x.setDate(x.getDate() - days); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const sets = [], sess = [];
  const add = (days, h, list, id) => { list.forEach((s, i) => sets.push({ exercise: s[2] || 'knebøy', reps: s[0], kg: s[1], timestamp: d(days, h, i * 4), sessionId: id })); sess.push({ id, start: d(days, h), end: d(days, h, list.length * 4 + 2) }); };
  add(7, 18, [[8, 62.5], [8, 65], [6, 67.5]], 's-a');
  add(4, 7, [[8, 0, 'pullups'], [6, 10, 'pullups'], [10, 0, 'dips']], 's-b');
  add(2, 18, [[5, 72.5], [5, 72.5], [8, 60, 'roing']], 's-c');
  add(0, Math.max(0, now.getHours() - 1), [[8, 70], [8, 72.5], [8, 40, 'skråbenk']], 's-d');
  return { 'repcam.sets': JSON.stringify(sets), 'repcam.sessions': JSON.stringify(sess), 'repcam.onboarded': '1', 'repcam.profile': JSON.stringify({ name: 'Rune' }), ...extra };
}
async function browser(video) {
  return chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + video, '--enable-unsafe-swiftshader'] });
}
async function mk(b, tag, data, opts = {}) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], colorScheme: 'light', permissions: ['camera'], ...opts });
  if (data) await ctx.addInitScript(d => { if (!sessionStorage.seeded) { sessionStorage.seeded = 1; for (const k in d) localStorage.setItem(k, d[k]); } }, data);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errors.push(tag + ': ' + m.text()); });
  p.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
  return p;
}
async function workout(p, tag, expectEx, minReps) {
  await p.evaluate(() => { const o = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); window.__gum = []; navigator.mediaDevices.getUserMedia = c => { window.__gum.push({ hash: location.hash, inTap: !!window.__inTap }); return o(c); }; document.addEventListener('click', () => { window.__inTap = true; setTimeout(() => window.__inTap = false, 0); }, true); });
  await p.click('#startOkt');
  const g = await p.evaluate(() => window.__gum[0]);
  ok(g && g.inTap && g.hash !== '#/okt', tag + ': getUserMedia called synchronously in the tap, before navigation');
  await p.waitForSelector('#start', { state: 'hidden', timeout: 120000 });
  await p.waitForFunction(n => +document.getElementById('reps').textContent >= n, minReps, { timeout: 120000 }).then(() => ok(true, tag + ': reps counted')).catch(() => ok(false, tag + ': reps counted'));
  const chip = await p.textContent('#exName');
  ok(chip.includes(expectEx), tag + ': exercise auto-recognized (' + chip + ')');
  await p.screenshot({ path: SH + tag + '-1-workout.png' });
  await p.waitForSelector('#toast.on', { timeout: 60000 }).then(() => ok(true, tag + ': set auto-saved after pause')).catch(() => ok(false, tag + ': set auto-saved after pause'));
  await p.screenshot({ path: SH + tag + '-2-autosaved-toast.png' });
  const saved = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('repcam.sets')); return s[s.length - 1]; });
  ok(saved.reps >= minReps, tag + ': saved set has ' + saved.reps + ' reps, exercise ' + saved.exercise);
  return saved;
}
(async () => {
  // ---------- EN, squat video
  let b = await browser('/workspace/repcam-test/squat.y4m');
  let p = await mk(b, 'en', seed({ 'repcam.lang': 'en', 'repcam.autosaveMs': '4000' }));
  await p.goto(URL); await p.waitForSelector('#view-home.on'); await p.waitForTimeout(400);
  ok(/^Good (morning|afternoon|evening|night), Rune$/.test(await p.textContent('#greet')), 'en: greeting translated');
  ok((await p.textContent('#todayList')).includes('Incline bench press'), 'en: exercise names translated');
  await p.screenshot({ path: SH + 'en-01-home.png' });
  await p.click('#tabs a[data-v=ovelser]'); await p.waitForTimeout(300);
  ok(await p.locator('#exList .card').count() === 8 && (await p.textContent('#exList')).includes('Camera placement') && (await p.textContent('#exList')).includes('Bench press'), 'en: 8 active exercises (incl. bench press) with camera tips');
  await p.screenshot({ path: SH + 'en-02-exercises.png', fullPage: true });
  await p.click('#tabs a[data-v=historikk]'); await p.waitForTimeout(300);
  await p.screenshot({ path: SH + 'en-03-history.png' });
  // edit a logged set: reps +1 (tap), kg +2.5, change exercise
  const ts = await p.locator('.setrow').first().getAttribute('data-ts');
  const before = await p.evaluate(t => JSON.parse(localStorage.getItem('repcam.sets')).find(s => s.timestamp === t), ts);
  await p.locator('.setrow').first().click(); await p.waitForSelector('#sheet.on');
  await p.locator('.stepper').nth(0).locator('button[data-d="1"]').click();
  await p.locator('.stepper').nth(1).locator('button[data-d="1"]').click();
  await p.click('.exgrid button[data-ex="dips"]');
  await p.screenshot({ path: SH + 'en-04-edit-set.png' });
  await p.click('#eSave'); await p.waitForTimeout(300);
  const after = await p.evaluate(t => JSON.parse(localStorage.getItem('repcam.sets')).find(s => s.timestamp === t), ts);
  ok(after.reps === before.reps + 1 && Math.abs(after.kg - before.kg - 2.5) < 1e-9 && after.exercise === 'dips', 'en: history edit (reps+1, kg+2.5, exercise→dips)');
  // tap-to-type
  await p.locator('.setrow').first().click(); await p.waitForSelector('#sheet.on');
  await p.fill('#eKg', '101,5'); await p.click('#eSave'); await p.waitForTimeout(300);
  ok((await p.evaluate(t => JSON.parse(localStorage.getItem('repcam.sets')).find(s => s.timestamp === t), ts)).kg === 101.5, 'en: typed weight with comma decimal');
  await p.click('#tabs a[data-v=profil]'); await p.waitForTimeout(300);
  await p.screenshot({ path: SH + 'en-05-profile.png', fullPage: true });
  await p.click('#tabs a[data-v=home]'); await p.waitForTimeout(300);
  const saved = await workout(p, 'en-squat', 'Squat', 4);
  ok(saved.exercise === 'knebøy', 'en-squat: saved as squat');
  ok(saved.kg === 72.5, 'en-squat: weight defaulted to last squat weight (72.5)');
  // Edit from toast
  await p.waitForSelector('#toast.on');
  await p.click('#tEdit'); await p.waitForSelector('#sheet.on');
  await p.locator('.stepper').nth(0).locator('button[data-d="-1"]').click();
  await p.screenshot({ path: SH + 'en-squat-3-edit-from-toast.png' });
  await p.click('#eSave'); await p.waitForTimeout(300);
  const ed = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('repcam.sets')); return s[s.length - 1]; });
  ok(ed.reps === saved.reps - 1, 'en-squat: edit from toast (reps −1)');
  await p.click('#finish'); await p.waitForSelector('#sheet.on'); await p.waitForTimeout(500);
  ok((await p.textContent('#sheet')).includes('Great job'), 'en: summary sheet');
  await p.screenshot({ path: SH + 'en-squat-4-summary.png' });
  await p.context().close(); await b.close();

  // ---------- DE, pull-up video; manual override + undo
  b = await browser('/workspace/repcam-test/pullups.y4m');
  p = await mk(b, 'de', seed({ 'repcam.lang': 'de', 'repcam.autosaveMs': '4000' }));
  await p.goto(URL); await p.waitForSelector('#view-home.on'); await p.waitForTimeout(400);
  ok((await p.textContent('#tabs')).includes('Verlauf') && (await p.textContent('#startOkt')).includes('Training starten'), 'de: UI translated');
  await p.screenshot({ path: SH + 'de-01-home.png' });
  await p.click('#tabs a[data-v=ovelser]'); await p.waitForTimeout(300); await p.screenshot({ path: SH + 'de-02-exercises.png', fullPage: true });
  await p.click('#tabs a[data-v=historikk]'); await p.waitForTimeout(300); await p.screenshot({ path: SH + 'de-03-history.png' });
  await p.click('#tabs a[data-v=home]'); await p.waitForTimeout(300);
  const s2 = await workout(p, 'de-pullups', 'Klimmzüge', 4);
  ok(s2.exercise === 'pullups' && s2.kg === 10, 'de-pullups: saved as pull-ups with last weight 10 kg');
  const nSets = await p.evaluate(() => JSON.parse(localStorage.getItem('repcam.sets')).length);
  await p.click('#tUndo'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('repcam.sets')).length) === nSets - 1, 'de: undo removes auto-saved set');
  // manual override
  await p.click('#exChip'); await p.waitForSelector('#sheet.on'); await p.screenshot({ path: SH + 'de-pullups-3-pick-exercise.png' });
  await p.click('.exgrid button[data-ex="dips"]'); await p.waitForTimeout(300);
  ok((await p.textContent('#exName')) === 'Dips', 'de: manual exercise override');
  await p.click('#plus'); ok((await p.textContent('#kg')).includes('2,5 kg'), 'de: +2.5 kg for dips (from bodyweight)');
  await p.click('#finish'); await p.waitForTimeout(400);
  await p.context().close();

  // ---------- onboarding: fresh install, German phone → auto German, then language switch in Profile
  p = await mk(b, 'onb', null, { locale: 'de-DE' });
  await p.goto(URL); await p.waitForSelector('#sheet.on');
  ok((await p.textContent('#sheet')).includes('Willkommen'), 'onboarding shown once, language auto-detected (de)');
  await p.screenshot({ path: SH + 'onb-01-de.png' });
  await p.fill('#oName', 'Rune'); await p.click('#oGo'); await p.waitForTimeout(300);
  await p.reload(); await p.waitForTimeout(500);
  ok(!(await p.locator('#sheet.on').count()), 'onboarding not shown again');
  ok((await p.locator('.empty').count()) > 0, 'empty state without data');
  await p.click('#tabs a[data-v=profil]'); await p.selectOption('#langSel', 'es'); await p.waitForTimeout(300);
  ok((await p.textContent('#tabs')).includes('Inicio'), 'language switch in profile (es)');
  for (const l of ['fr', 'sv', 'da', 'nb']) { await p.selectOption('#langSel', l); await p.waitForTimeout(150); await p.screenshot({ path: SH + 'lang-' + l + '-profile.png' }); }
  ok((await p.textContent('#tabs')).includes('Historikk'), 'nb selectable');
  await p.context().close(); await b.close();

  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fails.length ? fails.length + ' FAILED' : 'ALL PASSED');
  process.exit(fails.length ? 1 : 0);
})();
