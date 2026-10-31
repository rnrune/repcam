// v8.12 hidden review mode (v8.13: + own uncertain clips as stick-figure playback from review-own.json) (?review=1 -> review.html): runs the app's pose + recognizer + counters on a web clip,
// Rune corrects exercise/reps, the result goes to the feedback worker as meta + label (kind 'review'), clip marked done.
const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const $ = id => document.getElementById(id), v = $('v'), c = $('c'), ctx = c.getContext('2d'), LS = localStorage, R = Reps, F = Feedback;
const DONE = 'repcam.review.done.v2', /* v8.24: new key — answers only; skipped clips used to be stored as done and vanished */ AUTOSAVE_S = 9;
const NAMES = { knebøy: 'Knebøy', bulgarsk: 'Bulgarsk utfall', pullups: 'Pull-ups', dips: 'Dips', benkpress: 'Benkpress', skråbenk: 'Skråbenk', halvmark: 'Markløft', roing: 'Roing', armhevinger: 'Armhevinger', curl: 'Curl', situps: 'Situps', vsitup: 'V-situp' };
$('ex').innerHTML = '<option value="">– ingen –</option>' + R.IDS.map(i => `<option value="${i}">${NAMES[i] || i}</option>`).join('');
let skipped = [];
const done = () => { try { return JSON.parse(LS.getItem(DONE) || '[]'); } catch { return []; } };
let clips = [], cur = null, lm = [], det = { ex: null, reps: 0, times: [] }, landmarker, lastT = -1, lastLog = -1;
// same replay as eval/real/run.js (app.js processFrame in auto mode incl. 9 s autosave); frames [t,(x,y,vis)*33]
function replay(Fr, asp) {
  if (!Fr.length) return { ex: null, reps: 0, times: [] };
  const rec = R.createRecognizer(), pick = R.createPicker(), gate = R.createCameraGate();
  let cs, auto = null, lock = null, shown = 0, shownT = 0, saved = null; const keep = r => { if (!saved || r.reps > saved.reps) saved = r; };
  const reset = () => { cs = {}; for (const id of R.IDS) cs[id] = R.createCounter(id); lock = null; shown = 0; };
  const res = ex => { const reps = cs[ex].flush(); return { ex, reps, times: cs[ex].repTimes.map(t => +t.toFixed(1)) }; };
  reset();
  for (const a of Fr) { const l = []; for (let i = 0; i < 33; i++) l.push({ x: a[1 + 3 * i], y: a[2 + 3 * i], visibility: a[3 + 3 * i] });
    const ms = a[0] * 1000, cam = !gate.update(l, ms, asp).ok; for (const id of R.IDS) cs[id].update(l, ms, asp, cam);
    const rc = rec.update(l, ms, asp, cam), p = pick.update(rc, ms); if (!lock && p) auto = p;
    if (auto && !lock && cs[auto].reps >= 2) lock = auto; else if (lock) lock = R.relock(cs, lock, p, a[0], rc.scores);
    const ex = lock || auto, n = ex ? cs[ex].reps : 0;
    for (const id of R.IDS) if (id !== ex && cs[id].reps > 0 && a[0] - cs[id].lastRepT > AUTOSAVE_S) cs[id].forget();
    if (n !== shown) { shown = n; shownT = a[0]; }
    if (n > 0 && a[0] - shownT > AUTOSAVE_S && lock && R.relock(cs, lock, p, a[0], rc.scores, true) !== lock) { lock = R.relock(cs, lock, p, a[0], rc.scores, true); shown = cs[lock].reps; shownT = a[0]; }
    else if (n > 0 && a[0] - shownT > AUTOSAVE_S) { if (n >= 2 && R.plausibleSet(cs[ex].repTimes)) { keep(res(ex)); reset(); } else { cs[ex] = R.createCounter(ex); shown = 0; } } }
  if (lock) lock = R.relock(cs, lock, null, Fr[Fr.length - 1][0] + AUTOSAVE_S, null, true);
  const ex = lock || auto; if (ex && cs[ex].reps >= 2 && R.plausibleSet(cs[ex].repTimes)) keep(res(ex));
  if (saved) return saved; const r = ex ? res(ex) : null; return r && R.plausibleSet(r.times) ? r : { ex: null, reps: 0, times: [] };
}
// v8.13: Rune's own uncertain clips (review-own.json) play back as a stick figure from the logged landmarks — the video never
// leaves the box (public repo), only landmarks are committed. The detection is the engine's replay of those landmarks.
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [0, 11], [0, 12]];
let sk = null; // { t0 (performance ms at t=0), t (s), playing, speed }
function drawSkel() {
  if (!cur || !cur.frames) return;
  const F = cur.frames, dur = F[F.length - 1][0];
  if (sk.playing) { sk.t = F[0][0] + (performance.now() - sk.t0) / 1000 * sk.speed; if (sk.t >= dur) { sk.t = dur; sk.playing = false; show(true); } $('seek').value = sk.t; }
  let i = 0; while (i + 1 < F.length && F[i + 1][0] <= sk.t) i++;
  const a = F[i], W = c.width, H = c.height, P = k => [a[1 + 3 * k] * W, a[2 + 3 * k] * H, a[3 + 3 * k]];
  ctx.fillStyle = '#181818'; ctx.fillRect(0, 0, W, H); ctx.lineWidth = Math.max(3, W / 120); ctx.lineCap = 'round';
  for (const [p, q] of BONES) { const A = P(p), B = P(q); if (A[2] < 0.3 || B[2] < 0.3) continue; ctx.strokeStyle = p >= 23 || q >= 23 ? '#4fc3f7' : '#ff5a3c'; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); }
  const hd = P(0); if (hd[2] >= 0.3) { ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.arc(hd[0], hd[1], W / 40, 0, 7); ctx.fill(); }
  const n = det.times.filter(x => x <= sk.t + 0.05).length, flash = det.times.some(x => Math.abs(x - sk.t) < 0.3);
  ctx.fillStyle = flash ? '#7f7' : '#eee'; ctx.font = `${Math.round(W / 12)}px system-ui`; ctx.fillText(`${sk.t.toFixed(1)} s · rep ${n}`, W / 30, W / 10);
  const mk = (cur.marks || []).find(m => sk.t >= m.t0 && sk.t <= m.t1); if (mk) { ctx.fillStyle = '#ffb74d'; ctx.font = `${Math.round(W / 18)}px system-ui`; ctx.fillText(mk.label, W / 30, W / 10 + W / 12); }
  drawTl();
}
// v8.22 timeline under the stick figure: green tick = rep the engine counts, orange band = segment the question is about; tap to seek
function drawTl() {
  const T = $('tl'); if (!T || !cur || !cur.frames) return; const g = T.getContext('2d'), W = T.width = T.clientWidth * 2, H = T.height = 56;
  const F = cur.frames, a = F[0][0], b = F[F.length - 1][0], X = t => (t - a) / (b - a) * W;
  g.fillStyle = '#222'; g.fillRect(0, 0, W, H);
  for (const m of cur.marks || []) { g.fillStyle = 'rgba(255,152,0,.55)'; g.fillRect(X(m.t0), 0, Math.max(3, X(m.t1) - X(m.t0)), H); }
  const uf = $('tFrom').value, ut = $('tTo').value; g.fillStyle = 'rgba(0,0,0,.7)'; if (uf !== '') g.fillRect(0, 0, X(+uf), H); if (ut !== '') g.fillRect(X(+ut), 0, W - X(+ut), H);
  g.fillStyle = '#7f7'; det.times.forEach((t, i) => { g.fillRect(X(t) - 2, 8, 4, H - 16); g.font = '20px system-ui'; g.fillText(String(i + 1), X(t) + 4, 24); });
  g.fillStyle = '#fff'; g.fillRect(X(sk.t) - 1, 0, 3, H);
}
$('tl').onclick = e => { if (!sk || !cur || !cur.frames) return; const r = $('tl').getBoundingClientRect(), F = cur.frames, a = F[0][0], b = F[F.length - 1][0]; sk.t = a + (e.clientX - r.left) / r.width * (b - a); $('seek').value = sk.t; rebase(); };
function skelUi(on) { v.style.display = on ? 'none' : ''; c.style.position = on ? 'static' : ''; $('skc').style.display = on ? '' : 'none'; }
$('play').onclick = () => { if (!sk) return; sk.playing = !sk.playing; if (sk.playing) { if (sk.t >= +$('seek').max) sk.t = cur.frames[0][0]; sk.t0 = performance.now() - (sk.t - cur.frames[0][0]) * 1000 / sk.speed; } };
const rebase = () => { sk.t0 = performance.now() - (sk.t - cur.frames[0][0]) * 1000 / sk.speed; };
$('seek').oninput = () => { if (!sk) return; sk.t = +$('seek').value; rebase(); };
$('speed').onchange = () => { if (!sk) return; sk.speed = +$('speed').value; rebase(); };
function show(final) {
  if (cur && cur.frames) { det = replay(cur.frames, cur.w / cur.h);
    $('det').textContent = `Appen (ny motor): ${det.ex ? NAMES[det.ex] : 'ingen øvelse'}, ${det.reps} reps${det.times.length ? ' (ved ' + det.times.join(', ') + ' s)' : ''}`;
    if (final) { $('ex').value = $('ex').value || det.ex || ''; } return; }
  det = replay(lm, (v.videoWidth / v.videoHeight) || 1);
  $('det').textContent = `${final ? 'Ferdig' : 'Spiller'} – oppdaget: ${det.ex ? NAMES[det.ex] : 'ingen øvelse'}, ${det.reps} reps`;
  if (final) { $('ex').value = det.ex || cur.expected || ''; $('reps').value = det.reps; }
}
function next() {
  const d = done(), left = clips.filter(x => !d.includes(x.id)).sort((a, b) => skipped.indexOf(a.id) - skipped.indexOf(b.id)); /* skipped clips go last, never disappear */ $('left').textContent = `(${left.length} igjen)`;
  $('comment').value = ''; $('tFrom').value = $('tTo').value = '';
  cur = left[0]; lm = []; lastT = -1; lastLog = -1; sk = null; skelUi(false);
  if (!cur) { $('info').textContent = 'Alle klipp er gjennomgått 🎉'; v.removeAttribute('src'); return; }
  if (cur.frames) { // own clip: stick figure from landmarks, Rune's own question
    const a = cur.app || {}, dur = cur.frames[cur.frames.length - 1][0];
    $('info').innerHTML = `<b>Ditt klipp (usikkert)</b> · ${cur.title}<br>Appen ${a.version || ''} logget: ${NAMES[a.exercise] || a.exercise} × ${a.reps}${a.label && a.label.kind === 'corrected' ? ` · du rettet til ${a.label.reps} × ${a.label.kg} kg` : ''}${cur.issue ? `<br><b>Problem:</b> ${cur.issue}` : ''}<br><b>Spørsmål:</b> ${cur.question}`;
    c.width = 360; c.height = Math.round(360 * cur.h / cur.w); skelUi(true); $('seek').min = cur.frames[0][0]; $('seek').max = dur; $('seek').value = cur.frames[0][0];
    sk = { t0: performance.now(), t: cur.frames[0][0], playing: true, speed: +$('speed').value || 1 };
    $('ex').value = cur.expected || ''; $('reps').value = cur.expectedReps ?? ''; show(false); return; }
  $('info').innerHTML = `${cur.id}: <a href="${cur.page}" target="_blank">${cur.title}</a> · ${cur.licence} · ${cur.author || ''}${cur.expected ? ' · forventet: ' + NAMES[cur.expected] : ''}`;
  $('ex').value = cur.expected || ''; $('reps').value = ''; $('det').textContent = landmarker ? 'Spill av klippet …' : 'Laster modell …';
  v.src = cur.url; v.play().catch(() => {});
}
function loop() {
  if (sk) drawSkel();
  if (landmarker && cur && v.readyState >= 2 && !v.paused && v.currentTime !== lastT) {
    lastT = v.currentTime; c.width = v.videoWidth; c.height = v.videoHeight;
    const r = landmarker.detectForVideo(v, performance.now()); ctx.clearRect(0, 0, c.width, c.height);
    const p = r.landmarks && r.landmarks[0];
    if (p) { ctx.fillStyle = '#ff5a3c'; for (const q of p) ctx.fillRect(q.x * c.width - 3, q.y * c.height - 3, 6, 6);
      if (lastT - lastLog >= 0.1 || lastT < lastLog) { lastLog = lastT; lm.push([+lastT.toFixed(2), ...p.flatMap(q => [+q.x.toFixed(4), +q.y.toFixed(4), +(q.visibility ?? 1).toFixed(2)])]); if (lm.length % 10 === 0) show(false); } }
  }
  requestAnimationFrame(loop);
}
v.onended = () => show(true);
v.onerror = () => { $('st').textContent = 'Klippet kunne ikke spilles (' + cur.id + ') – trykk Hopp over.'; };
async function submit(action) {
  if (!cur) return;
  const ex = $('ex').value || null, reps = +$('reps').value || 0, cfg = window.REPCAM_STRAVA || {};
  const label = { kind: 'review', action, clipId: cur.id, clipUrl: cur.url, source: cur.source, licence: cur.licence, expected: cur.expected,
    detected: { exercise: det.ex, reps: det.reps, repTimes: det.times },
    exercise: action === 'notASet' ? null : ex, reps: action === 'notASet' ? 0 : reps, kg: null, notASet: action === 'notASet', missed: false,
    comment: $('comment').value.trim() || null,
    // v8.22 manual review of own clips: keep only data from useFrom to useTo (s), or drop the clip from the test data
    useFrom: $('tFrom').value === '' ? null : +$('tFrom').value, useTo: $('tTo').value === '' ? null : +$('tTo').value, removeFromTest: action === 'remove', currentTruth: cur.expectedReps ?? null,
    changed: ['exercise', 'reps'].filter(k => String(k === 'exercise' ? ex : reps) !== String(k === 'exercise' ? det.ex : det.reps)), at: new Date().toISOString() };
  if (action !== 'skip') {
    if (!cfg.workerUrl) { $('st').textContent = 'Mangler workerUrl'; return; }
    const rnd = b => crypto.getRandomValues(b);
    if (!LS.getItem(F.KEYS.inst)) { LS.setItem(F.KEYS.inst, F.rid(12, rnd)); LS.setItem(F.KEYS.tok, F.rid(32, rnd)); }
    const send = F.httpSender({ base: cfg.workerUrl, inst: LS.getItem(F.KEYS.inst), tok: LS.getItem(F.KEYS.tok), fetch: (...x) => fetch(...x) });
    const id = 'rv' + Date.now().toString(36) + F.rid(4, rnd);
    if (cur.frames) { label.own = true; label.question = cur.question; label.kg = cur.kg ?? null; delete label.clipUrl; }
    const meta = { id, app: '8.13', kind: 'review', created: label.at, comment: label.comment, clip: cur.frames ? { id: cur.id, own: true, title: cur.title, window: cur.window } : { id: cur.id, url: cur.url, page: cur.page, title: cur.title, licence: cur.licence },
      pred: { exercise: det.ex, reps: det.reps }, repTimes: det.times, durationS: cur.frames ? cur.frames[cur.frames.length - 1][0] : v.duration || null, video: cur.frames ? { w: cur.w, h: cur.h } : { w: v.videoWidth, h: v.videoHeight },
      landmarks: { hz: 10, layout: 't,(x,y,vis)*33', frames: cur.frames ? [] : lm }, device: { ua: navigator.userAgent } }; // own clips: landmarks already in review-own.json
    $('st').textContent = 'Sender …';
    try { await send('meta', id, JSON.stringify(meta), 'application/json'); await send('label', id, JSON.stringify(label), 'application/json'); $('st').textContent = 'Sendt ✓ ' + cur.id; }
    catch (e) { $('st').textContent = 'Opplasting feilet: ' + e.message; return; }
  } else $('st').textContent = 'Hoppet over ' + cur.id;
  if (action === 'skip') { skipped = [...skipped.filter(x => x !== cur.id), cur.id]; } else LS.setItem(DONE, JSON.stringify([...done(), cur.id])); next();
}
$('ok').onclick = () => submit('corrected'); $('rm').onclick = () => submit('remove');
$('tStart').onclick = () => { if (sk) { $('tFrom').value = sk.t.toFixed(1); drawTl(); } }; $('tEnd').onclick = () => { if (sk) { $('tTo').value = sk.t.toFixed(1); drawTl(); } }; $('tClr').onclick = () => { $('tFrom').value = $('tTo').value = ''; drawTl(); }; $('skip').onclick = () => submit('skip'); $('none').onclick = () => submit('notASet');
$('reset').onclick = e => { e.preventDefault(); LS.removeItem(DONE); next(); };
// own uncertain clips first, then the web clips
const own = await fetch('review-own.json?v=8.30r1').then(r => r.ok ? r.json() : []).catch(() => []);
clips = [...own, ...await (await fetch('review-clips.json?v=8.30r1')).json()]; next(); loop();
const { PoseLandmarker, FilesetResolver } = await import(VISION);
const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
const opts = d => ({ baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", delegate: d }, runningMode: "VIDEO", numPoses: 1 });
try { landmarker = await PoseLandmarker.createFromOptions(fs, opts('GPU')); } catch { landmarker = await PoseLandmarker.createFromOptions(fs, opts('CPU')); }
if (!(cur && cur.frames)) { $('det').textContent = 'Modell klar – spill av klippet'; lm = []; v.currentTime = 0; v.play().catch(() => {}); }
