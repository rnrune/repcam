// v8.7 e2e: camera-motion robustness in the real app page (iPhone 13 emulation).
//  * iOS: DeviceMotionEvent.requestPermission is asked inside the Start tap (with user activation, after getUserMedia), once;
//    granted → devicemotion feeds the gate; denied / throwing / Android without the API → no extra tap, no error, vision fallback.
//  * Synthetic squat poses through the app's own frame pipeline (__repcam.processFrame): handheld wobble keeps counting,
//    a phone pick-up (real devicemotion events, 150°/s) pauses counting with the «Mobilen beveger seg» hint, the rep made while
//    the phone moved is not counted, counting resumes afterwards; a phone swaying with nobody exercising never makes a set.
const { chromium, devices } = require('playwright-core'), fs = require('fs'), path = require('path');
const URL0 = process.env.URL || 'http://localhost:8765/', SH = '/workspace/repcam-shots/v8.7/';
const fails = [], errors = [], ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
// the unit tests' synthetic skeleton (test.js), evaluated here in node; frames are sent to the page as plain arrays
const T = fs.readFileSync(path.join(__dirname, '..', 'test.js'), 'utf8');
const pose = new Function(T.slice(T.indexOf('// ---- synthetic skeleton'), T.indexOf('// profile: list of')) + '; return pose;')();
const ease = (a, b, i, N) => a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * i / N));
const cam = (P, { dx = 0, dy = 0, rot = 0 } = {}) => { const r = rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return P.map(([x, y, z, v]) => { const X = x - 0.5, Y = y - 0.5; return [0.5 + c * X - s * Y + dx, 0.5 + s * X + c * Y + dy, z, v]; }); };
// frames: [lm, sensor-kind] at 15 fps; sensor kind 'still' | 'hand' | 'pickup' becomes real devicemotion events in the page
function squats(k, camAt = () => ({}), kind = 'hand') { const out = []; const seg = [[0.6, 0, 0]]; for (let i = 0; i < k; i++) seg.push([1, 0, 1], [1, 1, 0], [0.3, 0, 0]); seg.push([1.5, 0, 0]);
  for (const [d, a, b] of seg) for (let i = 0; i < d * 15; i++) out.push([cam(pose('knebøy', ease(a, b, i, d * 15), 0.003), camAt(out.length / 15)), kind]); return out; }
const wobble = t => ({ dx: 0.004 * Math.sin(27 * t) + 0.04 * Math.sin(t / 2.5), dy: 0.003 * Math.sin(31 * t), rot: 1.5 * Math.sin(t / 1.6) });
async function feed(p, frames, t0) {
  return p.evaluate(async ([frames, t0]) => {
    const R = window.__repcam; let t = t0;
    for (const [lm, kind] of frames) {
      const g = kind === 'pickup' ? 150 : kind === 'hand' ? 10 : 2, a = kind === 'pickup' ? 6 : 0.2;
      for (let k = 0; k < 4; k++) window.dispatchEvent(new DeviceMotionEvent('devicemotion', { rotationRate: { alpha: g * 0.6, beta: g * 0.8, gamma: 0 }, acceleration: { x: a, y: 0, z: 0 }, interval: 16 }));
      R.processFrame(lm.map(q => ({ x: q[0], y: q[1], z: q[2], visibility: q[3] })), t, 1, R.motion.read()); t += 1000 / 15;
      if (kind === 'pickup' && !window.__sawPause) window.__sawPause = R.camPaused() && getComputedStyle(document.getElementById('hint')).display !== 'none' && document.getElementById('hint').textContent;
    }
    return t;
  }, [frames, t0]);
}
(async () => {
  fs.mkdirSync(SH, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  async function page(mode) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], permissions: ['camera'] });
    await ctx.addInitScript(mode => {
      if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.clear(); Object.entries({ 'repcam.onboarded': '1', 'repcam.lang': 'nb', 'repcam.profile': '{"name":"Rune"}', 'repcam.autosaveMs': '600000' }).forEach(([k, v]) => localStorage.setItem(k, v)); }
      window.__log = []; const o = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = c => { window.__log.push('gum'); return o(c); };
      if (mode === 'android') { delete DeviceMotionEvent.requestPermission; return; } // Android Chrome: DeviceMotionEvent without requestPermission
      DeviceMotionEvent.requestPermission = () => { window.__log.push('perm:' + (navigator.userActivation ? navigator.userActivation.isActive : 'na'));
        if (mode === 'throw') throw new Error('NotAllowedError'); return Promise.resolve(mode === 'denied' ? 'denied' : 'granted'); };
    }, mode);
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(mode + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|model|mediapipe|wasm|GPU|WebGL/i.test(m.text())) errors.push(mode + ': ' + m.text()); });
    await p.goto(URL0); await p.waitForSelector('#view-home.on');
    return p;
  }
  async function startWorkout(p) { await p.tap('#startOkt'); await p.waitForFunction(() => window.__log.includes('gum') && document.querySelector('#view-okt.on')); await p.waitForTimeout(400); await p.evaluate(() => window.__repcam.stopLoop()); }
  // ---- iOS, permission granted
  let p = await page('granted');
  ok(await p.evaluate(() => window.__repcam.APP_VERSION === '8.9' && [...document.scripts].filter(s => /\.js\?/.test(s.src)).every(s => /\?v=8\.9/.test(s.src))), 'APP_VERSION 8.7 + ?v=8.7');
  ok(await p.evaluate(() => !window.__log.length), 'no motion prompt before the user taps Start');
  await startWorkout(p);
  const log = await p.evaluate(() => window.__log);
  ok(log[0] === 'gum' && log.filter(x => x.startsWith('perm')).length === 1 && log.includes('perm:true'), 'iOS: one motion permission request inside the Start tap, after getUserMedia: ' + log.join(','));
  ok(await p.evaluate(() => window.__repcam.motion.state) === 'on' && await p.evaluate(() => localStorage.getItem('repcam.motion')) === 'granted', 'granted → devicemotion listener on, remembered');
  let t = 10000;
  t = await feed(p, squats(3, wobble, 'hand'), t);
  ok(await p.evaluate(() => window.__repcam.currentReps()) === 3, 'handheld (wobble + gyro ~10°/s): 3/3 squats counted, no pause: ' + await p.evaluate(() => window.__repcam.currentReps()));
  // phone picked up: a full squat happens while the phone moves (150°/s, image shifted/rotated)
  const pick = squats(1, f => { const k = Math.sin(Math.PI * Math.min(1, f / 2)); return { dx: 0.2 * k, rot: 20 * k }; }, 'pickup').slice(9);
  t = await feed(p, pick, t);
  const hint = await p.evaluate(() => window.__sawPause);
  ok(typeof hint === 'string' && /beveger seg/.test(hint), 'pick-up: counting paused with hint «' + hint + '»');
  await p.screenshot({ path: SH + '01-mobilen-beveger-seg.png' });
  ok(await p.evaluate(() => window.__repcam.currentReps()) === 3, 'rep made while the phone moved is not counted (still 3)');
  t = await feed(p, squats(0, () => ({}), 'still').concat(squats(2, () => ({}), 'still')), t);
  ok(await p.evaluate(() => !window.__repcam.camPaused()), 'gate open again once the phone is still');
  ok(await p.evaluate(() => window.__repcam.currentReps()) === 5, 'counting resumes cleanly: 3 + 2 = ' + await p.evaluate(() => window.__repcam.currentReps()));
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('hint')).display === 'none' || !/beveger/.test(document.getElementById('hint').textContent)), 'moving hint gone after the phone settles');
  await p.screenshot({ path: SH + '02-teller-igjen.png' });
  await p.context().close();
  // ---- nobody exercising, phone swaying in the hand for 6 s (no sensor: vision only, then with sensor): no set, no reps
  for (const mode of ['denied', 'granted']) {
    p = await page(mode); await startWorkout(p);
    if (mode === 'denied') ok(await p.evaluate(() => window.__repcam.motion.state) === 'denied', 'iOS denied: no crash, workout running, vision fallback (state denied)');
    const sway = []; for (let i = 0; i < 16 * 15; i++) { const tt = i / 15, on = tt > 3 && tt < 9; sway.push([cam(pose('none', 0, 0.003), on ? { rot: 25 * Math.sin(4.4 * tt), dx: 0.1 * Math.sin(4.4 * tt + 1), dy: 0.05 * Math.sin(8.8 * tt) } : {}), on ? 'pickup' : 'still']); }
    await feed(p, sway, 10000);
    ok(await p.evaluate(() => window.__repcam.currentReps()) === 0 && await p.evaluate(() => (JSON.parse(localStorage.getItem('repcam.sets')) || []).length) === 0, mode + ': phone swaying, nobody exercising → 0 reps, no set');
    await p.context().close();
  }
  // ---- requestPermission throws (e.g. no user activation) → still no error, camera started
  p = await page('throw'); await startWorkout(p);
  ok(await p.evaluate(() => window.__repcam.motion.state) === 'error' && await p.evaluate(() => !!document.querySelector('#view-okt.on')), 'requestPermission throwing is handled (retried on the next tap)');
  await p.context().close();
  // ---- Android/Chrome: no requestPermission → listener without any prompt
  p = await page('android'); await startWorkout(p);
  ok(await p.evaluate(() => window.__repcam.motion.state) === 'on' && !(await p.evaluate(() => window.__log.some(x => x.startsWith('perm')))), 'Android: devicemotion used without a prompt');
  await p.context().close();
  ok(!errors.length, 'no console errors ' + errors.join(' | '));
  await b.close(); console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})();
