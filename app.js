const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
let PoseLandmarker, FilesetResolver, DrawingUtils;
const $ = id => document.getElementById(id);
const v = $('v'), c = $('c'), ctx = c.getContext('2d');
const counter = Reps.createCounter();
let landmarker, modelP, stream, facing = 'user', kg = +(localStorage.getItem('repcam.kg') || 20), lastTs = -1;
const KEY = 'repcam.sets';
const sets = () => JSON.parse(localStorage.getItem(KEY) || '[]');
function render() {
  const s = sets(), today = new Date().toDateString();
  const todays = s.filter(x => new Date(x.timestamp).toDateString() === today);
  $('setno').textContent = 'Sett ' + (todays.length + 1);
  $('kg').textContent = kg.toLocaleString('nb-NO') + ' kg';
  $('log').innerHTML = s.slice(-5).reverse().map(x => `${new Date(x.timestamp).toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'})} · Knebøy · ${x.reps} reps · ${x.kg.toLocaleString('nb-NO')} kg`).join('<br>');
}
function setKg(d) { kg = Math.max(0, Math.round((kg + d) * 10) / 10); localStorage.setItem('repcam.kg', kg); render(); }
$('minus').onclick = () => setKg(-2.5); $('plus').onclick = () => setKg(2.5);
$('confirm').onclick = () => {
  const s = sets(); s.push({ exercise: 'knebøy', reps: counter.reps, kg, timestamp: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(s)); counter.reset(); $('reps').textContent = '0'; render();
  navigator.vibrate?.(50);
};
render();
async function initModel() {
  ({ PoseLandmarker, FilesetResolver, DrawingUtils } = await import(VISION));
  const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  const opts = d => ({ baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", delegate: d }, runningMode: "VIDEO", numPoses: 1 });
  try { return await PoseLandmarker.createFromOptions(fs, opts("GPU")); }
  catch (e) { console.warn('GPU feilet, bruker CPU', e); return await PoseLandmarker.createFromOptions(fs, opts("CPU")); }
}
const UA = navigator.userAgent;
const inApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|Snapchat|LinkedInApp|Twitter|TikTok|musical_ly|GSA\/|MicroMessenger|; wv\)/i.test(UA)
  || (/iPhone|iPad|iPod/.test(UA) && /AppleWebKit/.test(UA) && !/Safari\//.test(UA));
function getCam(f) {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return Promise.reject(Object.assign(new Error('getUserMedia mangler'), { name: 'NoMediaDevices' }));
  return md.getUserMedia({ audio: false, video: { facingMode: { ideal: f }, width: { ideal: 1280 }, height: { ideal: 720 } } })
    .catch(e => (e.name === 'OverconstrainedError' || e.name === 'NotFoundError') ? md.getUserMedia({ audio: false, video: true }) : Promise.reject(e));
}
async function attach(s) {
  stream?.getTracks().forEach(t => t.stop());
  stream = s; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('autoplay', '');
  v.srcObject = s; await v.play();
  [v, c].forEach(el => el.classList.toggle('mirror', facing === 'user'));
}
function showHelp(e) {
  const h = $('help'); h.style.display = 'block';
  let msg;
  if (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'NoMediaDevices') {
    msg = `<b>Fikk ikke tilgang til kameraet.</b><br>
1. Åpne lenken <b>direkte i Safari</b> – ikke inne i en annen app (Messenger, Snapchat, Instagram o.l.).<br>
2. Safari: trykk <b>aA</b> i adressefeltet › <b>Nettstedinnstillinger</b> › <b>Kamera</b> › <b>Spør</b> eller <b>Tillat</b>, og last siden på nytt.<br>
3. Innstillinger › <b>Safari</b> › <b>Kamera</b> › <b>Spør</b> eller <b>Tillat</b>.`;
  } else if (e.name === 'NotFoundError') msg = 'Fant ikke noe kamera på enheten.';
  else if (e.name === 'NotReadableError') msg = 'Kameraet er i bruk av en annen app. Lukk den og prøv igjen.';
  else msg = 'Noe gikk galt: ' + e.message;
  $('helptext').innerHTML = msg;
}
if (inApp) { $('help').style.display = 'block'; $('helptext').innerHTML = '<b>Du ser ut til å være i en app-nettleser.</b> Kameraet virker ofte ikke her. Trykk ⋯ / del-ikonet og velg <b>Åpne i Safari</b>, eller kopier lenken og lim den inn i Safari.'; }
$('copy').onclick = async () => { try { await navigator.clipboard.writeText(location.href); $('copy').textContent = 'Lenke kopiert ✓'; } catch { prompt('Kopier lenken:', location.href); } };
modelP = initModel().then(m => landmarker = m).catch(e => { modelP = null; throw e; });
modelP.catch(e => console.warn('Modell feilet', e));
$('go').onclick = () => {
  const st = $('status'), go = $('go');
  const camP = getCam(facing); // MUST be first, synchronous in the tap (iOS user activation)
  go.disabled = true; st.textContent = 'Starter kamera…';
  camP.then(attach).then(() => {
    st.textContent = 'Laster modell…';
    if (!modelP) modelP = initModel().then(m => landmarker = m);
    return modelP;
  }).then(() => { $('start').style.display = 'none'; requestAnimationFrame(loop); })
  .catch(e => { console.error(e); st.textContent = 'Feil: ' + e.message; showHelp(e); go.disabled = false; go.textContent = 'Prøv igjen'; });
};
$('flip').onclick = async () => { facing = facing === 'user' ? 'environment' : 'user'; try { await attach(await getCam(facing)); } catch (e) { alert('Kunne ikke bytte kamera: ' + e.message); } };
const vis = p => p ? (p.visibility ?? 1) : 0;
function loop() {
  requestAnimationFrame(loop);
  if (!landmarker || v.readyState < 2) return;
  if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
  const ts = performance.now(); if (ts <= lastTs) return; lastTs = ts;
  const res = landmarker.detectForVideo(v, ts);
  ctx.clearRect(0, 0, c.width, c.height);
  const lm = res.landmarks?.[0];
  let hint = true;
  if (lm) {
    const du = new DrawingUtils(ctx);
    du.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: '#39ff6a', lineWidth: 4 });
    du.drawLandmarks(lm, { color: '#ffffff', fillColor: '#39ff6a', radius: 4 });
    const L = [23, 25, 27], R = [24, 26, 28];
    const score = s => Math.min(...s.map(i => vis(lm[i])));
    const side = score(L) >= score(R) ? L : R;
    if (score(side) > 0.5 && vis(lm[0]) > 0.3) {
      hint = false;
      const r = counter.update(Reps.angle(lm[side[0]], lm[side[1]], lm[side[2]]));
      if ($('reps').textContent != r.reps) { $('reps').textContent = r.reps; navigator.vibrate?.(30); }
    }
  }
  $('hint').style.display = hint ? 'block' : 'none';
  $('ring').style.strokeDashoffset = 276.5 * (1 - counter.progress());
}
