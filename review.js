// v8.11 hidden review mode (?review=1 -> review.html): runs the app's pose + recognizer + counters on a web clip,
// Rune corrects exercise/reps, the result goes to the feedback worker as meta + label (kind 'review'), clip marked done.
const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const $ = id => document.getElementById(id), v = $('v'), c = $('c'), ctx = c.getContext('2d'), LS = localStorage, R = Reps, F = Feedback;
const DONE = 'repcam.review.done', AUTOSAVE_S = 9;
const NAMES = { knebøy: 'Knebøy', bulgarsk: 'Bulgarsk utfall', pullups: 'Pull-ups', dips: 'Dips', benkpress: 'Benkpress', skråbenk: 'Skråbenk', halvmark: 'Markløft', roing: 'Roing', armhevinger: 'Armhevinger', curl: 'Curl', situps: 'Situps' };
$('ex').innerHTML = '<option value="">– ingen –</option>' + R.IDS.map(i => `<option value="${i}">${NAMES[i] || i}</option>`).join('');
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
    else if (n > 0 && a[0] - shownT > AUTOSAVE_S) { if (n >= 2) { keep(res(ex)); reset(); } else { cs[ex] = R.createCounter(ex); shown = 0; } } }
  if (lock) lock = R.relock(cs, lock, null, Fr[Fr.length - 1][0] + AUTOSAVE_S, null, true);
  const ex = lock || auto; if (ex && cs[ex].reps >= 2) keep(res(ex));
  return saved || (ex ? res(ex) : { ex: null, reps: 0, times: [] });
}
function show(final) {
  det = replay(lm, (v.videoWidth / v.videoHeight) || 1);
  $('det').textContent = `${final ? 'Ferdig' : 'Spiller'} – oppdaget: ${det.ex ? NAMES[det.ex] : 'ingen øvelse'}, ${det.reps} reps`;
  if (final) { $('ex').value = det.ex || cur.expected || ''; $('reps').value = det.reps; }
}
function next() {
  const d = done(), left = clips.filter(x => !d.includes(x.id)); $('left').textContent = `(${left.length} igjen)`;
  cur = left[0]; lm = []; lastT = -1; lastLog = -1;
  if (!cur) { $('info').textContent = 'Alle klipp er gjennomgått 🎉'; v.removeAttribute('src'); return; }
  $('info').innerHTML = `${cur.id}: <a href="${cur.page}" target="_blank">${cur.title}</a> · ${cur.licence} · ${cur.author || ''}${cur.expected ? ' · forventet: ' + NAMES[cur.expected] : ''}`;
  $('ex').value = cur.expected || ''; $('reps').value = ''; $('det').textContent = landmarker ? 'Spill av klippet …' : 'Laster modell …';
  v.src = cur.url; v.play().catch(() => {});
}
function loop() {
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
    changed: ['exercise', 'reps'].filter(k => String(k === 'exercise' ? ex : reps) !== String(k === 'exercise' ? det.ex : det.reps)), at: new Date().toISOString() };
  if (action !== 'skip') {
    if (!cfg.workerUrl) { $('st').textContent = 'Mangler workerUrl'; return; }
    const rnd = b => crypto.getRandomValues(b);
    if (!LS.getItem(F.KEYS.inst)) { LS.setItem(F.KEYS.inst, F.rid(12, rnd)); LS.setItem(F.KEYS.tok, F.rid(32, rnd)); }
    const send = F.httpSender({ base: cfg.workerUrl, inst: LS.getItem(F.KEYS.inst), tok: LS.getItem(F.KEYS.tok), fetch: (...x) => fetch(...x) });
    const id = 'rv' + Date.now().toString(36) + F.rid(4, rnd);
    const meta = { id, app: '8.11', kind: 'review', created: label.at, clip: { id: cur.id, url: cur.url, page: cur.page, title: cur.title, licence: cur.licence },
      pred: { exercise: det.ex, reps: det.reps }, repTimes: det.times, durationS: v.duration || null, video: { w: v.videoWidth, h: v.videoHeight },
      landmarks: { hz: 10, layout: 't,(x,y,vis)*33', frames: lm }, device: { ua: navigator.userAgent } };
    $('st').textContent = 'Sender …';
    try { await send('meta', id, JSON.stringify(meta), 'application/json'); await send('label', id, JSON.stringify(label), 'application/json'); $('st').textContent = 'Sendt ✓ ' + cur.id; }
    catch (e) { $('st').textContent = 'Opplasting feilet: ' + e.message; return; }
  } else $('st').textContent = 'Hoppet over ' + cur.id;
  LS.setItem(DONE, JSON.stringify([...done(), cur.id])); next();
}
$('ok').onclick = () => submit('corrected'); $('skip').onclick = () => submit('skip'); $('none').onclick = () => submit('notASet');
$('reset').onclick = e => { e.preventDefault(); LS.removeItem(DONE); next(); };
clips = await (await fetch('review-clips.json?v=8.11')).json(); next(); loop();
const { PoseLandmarker, FilesetResolver } = await import(VISION);
const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
const opts = d => ({ baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", delegate: d }, runningMode: "VIDEO", numPoses: 1 });
try { landmarker = await PoseLandmarker.createFromOptions(fs, opts('GPU')); } catch { landmarker = await PoseLandmarker.createFromOptions(fs, opts('CPU')); }
$('det').textContent = 'Modell klar – spill av klippet'; lm = []; v.currentTime = 0; v.play().catch(() => {});
