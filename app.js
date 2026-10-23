const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
let PoseLandmarker, FilesetResolver, DrawingUtils;
const $ = id => document.getElementById(id);
const v = $('v'), c = $('c'), ctx = c.getContext('2d');
const counter = Reps.createCounter();
const store = Store.createStore(localStorage);
let pending = false, landmarker, modelP, stream, facing = 'user', kg = +(localStorage.getItem('repcam.kg') || 20), lastTs = -1, raf = 0, tick = 0;
const nf = (n, d = 0) => (+n).toLocaleString('nb-NO', { maximumFractionDigits: d });
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const hm = d => new Date(d).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });

/* ---------- tema ---------- */
const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = localStorage.getItem('repcam.theme') || 'auto';
  const dark = t === 'dark' || (t === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('view-okt').classList.toggle('lightui', t === 'light');
  $('tc').content = document.body.classList.contains('workout') ? '#000000' : dark ? '#0d0e12' : '#f5f6fa';
  document.querySelectorAll('#themeSeg button').forEach(b => { b.classList.toggle('on', b.dataset.t === t); b.setAttribute('aria-checked', b.dataset.t === t); });
}
mq.addEventListener?.('change', applyTheme);
document.querySelectorAll('#themeSeg button').forEach(b => b.onclick = () => { localStorage.setItem('repcam.theme', b.dataset.t); applyTheme(); });

/* ---------- sheet ---------- */
function openSheet(html) { $('sheet').innerHTML = '<div class="grab"></div>' + html; $('sheet').classList.add('on'); $('sheetBg').classList.add('on'); }
function closeSheet() { $('sheet').classList.remove('on'); $('sheetBg').classList.remove('on'); }
$('sheetBg').onclick = closeSheet;
function confirmDialog(title, text, okLabel) {
  return new Promise(res => {
    openSheet(`<h3>${title}</h3><div class="muted">${text}</div><div class="btns" style="margin-top:18px"><button class="ghost" id="dNo">Avbryt</button><button class="grad danger" id="dYes" style="margin-top:8px">${okLabel}</button></div>`);
    $('dNo').onclick = () => { closeSheet(); res(false); }; $('dYes').onclick = () => { closeSheet(); res(true); };
  });
}

/* ---------- små grafer ---------- */
function spark(vals) {
  if (vals.length < 2) return '<svg class="spark" viewBox="0 0 96 30"><line x1="4" y1="15" x2="92" y2="15" stroke="var(--line)" stroke-width="2" stroke-dasharray="3 4"/></svg>';
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((x, i) => [4 + i * 88 / (vals.length - 1), 26 - (x - mn) / r * 22]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const l = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 96 30"><defs><linearGradient id="sg"><stop offset="0" stop-color="#ff8a00"/><stop offset="1" stop-color="#ff2d87"/></linearGradient></defs><path d="${d}" fill="none" stroke="url(#sg)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${l[0]}" cy="${l[1]}" r="3" fill="#ff2d87"/></svg>`;
}
function weekChart(w) {
  const D = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'], mx = Math.max(...w.days, 1), bw = 26, gap = (320 - 7 * bw) / 7;
  let s = '<defs><linearGradient id="bg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff8a00"/><stop offset="1" stop-color="#ff2d87"/></linearGradient></defs>';
  w.days.forEach((val, i) => {
    const x = gap / 2 + i * (bw + gap), h = val ? Math.max(6, val / mx * 96) : 4, y = 104 - h;
    s += `<rect x="${x}" y="8" width="${bw}" height="96" rx="9" fill="var(--chip)"/>`;
    s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="9" fill="${val ? 'url(#bg)' : 'var(--line)'}"><title>${D[i]}: ${nf(val)} kg</title></rect>`;
    s += `<text x="${x + bw / 2}" y="124" text-anchor="middle" style="${i === w.today ? 'fill:var(--tx);font-weight:800' : ''}">${D[i]}</text>`;
  });
  return s;
}

/* ---------- views ---------- */
function renderHome() {
  const h = new Date().getHours();
  $('greet').textContent = (h < 5 ? 'God natt' : h < 10 ? 'God morgen' : h < 17 ? 'God dag' : h < 23 ? 'God kveld' : 'God natt') + ', Rune';
  $('title').textContent = h < 12 ? 'Klar for en sterk dag?' : h < 17 ? 'Tid for å løfte litt?' : 'Klar for en sterk kveld?';
  const all = store.sets(), today = Store.todaySets(all), groups = Store.groupByExercise(today);
  $('todayVol').textContent = today.length ? nf(Store.volume(today)) + ' kg totalt' : '';
  $('todayList').innerHTML = groups.length ? groups.map(g => `<div class="card"><div class="ex"><div class="ex-ic">${g.icon}</div><div class="ex-main"><b>${esc(g.name)}</b><span class="muted">${g.label}</span></div><span class="badge">${nf(g.topKg, 1)} kg</span></div>
    <div class="ex-foot"><div><div class="muted small" style="margin:0">Volum</div><b>${nf(g.volume)} kg</b></div>${spark(Store.kgHistory(all, g.id))}</div></div>`).join('')
    : `<div class="card empty"><div class="e">🌱</div><b>Ingen sett i dag ennå</b>Trykk «Start økt» og la kameraet telle repsene for deg.</div>`;
  const w = Store.weekly(all);
  $('weekTotal').textContent = nf(w.total) + ' kg';
  const p = $('weekPct');
  p.className = 'pill' + (w.pct == null ? '' : w.pct >= 0 ? ' up' : ' down');
  p.textContent = w.pct == null ? (w.total ? 'Første uke 🎉' : 'Ingen data') : (w.pct >= 0 ? '▲ ' : '▼ ') + Math.abs(w.pct) + ' % vs forrige uke';
  $('weekChart').innerHTML = weekChart(w);
}
function renderEx() {
  $('exList').innerHTML = Store.EX.map(e => `<div class="card ex ${e.active ? '' : 'soon'}"><div class="ex-ic">${e.icon}</div><div class="ex-main"><b>${e.name}</b><span class="muted">${e.active ? 'Teller reps med kamera' : 'Kommer snart'}</span></div><span class="badge ${e.active ? '' : 'soft'}">${e.active ? 'Aktiv' : 'Snart'}</span></div>`).join('')
    + '<div class="muted" style="text-align:center;margin-top:14px">Flere øvelser er på vei 🚀</div>';
}
function renderHist() {
  const ss = store.sessions();
  if (!ss.length) { $('histList').innerHTML = `<div class="card empty"><div class="e">📅</div><b>Ingen økter ennå</b>Når du logger sett, dukker de opp her.</div>`; return; }
  let last = '', out = '';
  for (const s of ss) {
    const d = new Date(s.start).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
    if (d !== last) { out += `<div class="day">${d}</div>`; last = d; }
    out += `<div class="card"><div class="row"><b>${hm(s.start)}–${hm(s.end)}</b><span class="muted">${s.sets.length} sett · ${nf(s.volume)} kg</span></div>` +
      s.sets.map(x => `<div class="setrow"><span>${Store.exInfo(x.exercise).icon} ${esc(Store.exInfo(x.exercise).name)} · <b>${x.reps} reps</b> × ${nf(x.kg, 1)} kg</span><button class="del" data-ts="${esc(x.timestamp)}" aria-label="Slett sett">🗑</button></div>`).join('') + '</div>';
  }
  $('histList').innerHTML = out;
}
$('histList').onclick = async e => {
  const b = e.target.closest('.del'); if (!b) return;
  if (await confirmDialog('Slette settet?', 'Settet fjernes permanent fra historikken.', 'Slett')) { store.deleteSet(b.dataset.ts); renderHist(); }
};
function renderProf() {
  const ss = store.sessions(), all = store.sets();
  $('profStats').textContent = `${ss.length} økter · ${all.length} sett · ${nf(Store.volume(all))} kg løftet`;
  applyTheme();
}
$('export').onclick = () => {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'repcam-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/* ---------- ruting ---------- */
const VIEWS = { '': 'home', ovelser: 'ovelser', historikk: 'historikk', profil: 'profil', okt: 'okt' };
let cur = null;
function route() {
  const name = VIEWS[location.hash.replace(/^#\/?/, '')] || 'home';
  if (cur === 'okt' && name !== 'okt') leaveWorkout();
  cur = name;
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id === 'view-' + name));
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.v === name));
  document.body.classList.toggle('workout', name === 'okt');
  if (name === 'okt') enterWorkout();
  ({ home: renderHome, ovelser: renderEx, historikk: renderHist, profil: renderProf })[name]?.();
  applyTheme(); window.scrollTo(0, 0);
}
addEventListener('hashchange', route);

/* ---------- økt / kamera ---------- */
function renderWorkout() {
  const a = store.active(), mine = a ? store.sets().filter(s => s.sessionId === a.id) : [];
  $('setno').textContent = 'Sett ' + (mine.length + 1);
  $('kg').textContent = nf(kg, 1) + ' kg';
  $('log').innerHTML = mine.slice(-4).reverse().map(x => `${hm(x.timestamp)} · ${x.reps} reps · ${nf(x.kg, 1)} kg`).join('<br>');
}
function setKg(d) { kg = Math.max(0, Math.round((kg + d) * 10) / 10); localStorage.setItem('repcam.kg', kg); renderWorkout(); }
$('minus').onclick = () => setKg(-2.5); $('plus').onclick = () => setKg(2.5);
$('confirm').onclick = () => {
  store.addSet({ exercise: 'knebøy', reps: counter.reps, kg });
  counter.reset(); $('reps').textContent = '0'; renderWorkout(); navigator.vibrate?.(50);
};
function enterWorkout() {
  store.startSession(); counter.reset(); $('reps').textContent = '0'; renderWorkout();
  if (!stream && !pending) { $('start').style.display = 'flex'; $('go').disabled = false; $('go').textContent = 'Start kamera'; }
  clearInterval(tick); tick = setInterval(() => { const a = store.active(); if (!a) return; const s = Math.floor((Date.now() - new Date(a.start)) / 1000); $('elapsed').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 1000);
}
function leaveWorkout() {
  clearInterval(tick); cancelAnimationFrame(raf); raf = 0;
  stream?.getTracks().forEach(t => t.stop()); stream = null; v.srcObject = null;
  const sum = store.endSession();
  if (sum && sum.sets) setTimeout(() => showSummary(sum), 150);
}
function showSummary(s) {
  openSheet(`<h3>Bra jobba! 💪</h3><div class="muted">Økta er lagret i historikken.</div>
  <div class="stats"><div class="stat"><span class="muted">Sett</span><b>${s.sets}</b></div><div class="stat"><span class="muted">Reps</span><b>${s.reps}</b></div>
  <div class="stat"><span class="muted">Volum</span><b>${nf(s.volume)} kg</b></div><div class="stat"><span class="muted">Varighet</span><b>${s.durationMin < 1 ? '< 1' : s.durationMin} min</b></div></div>
  <button class="grad" id="sumOk">Ferdig</button>`);
  $('sumOk').onclick = closeSheet;
}
$('finish').onclick = $('close').onclick = $('back').onclick = () => { location.hash = '#/'; };

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
function runCam(camP) {
  const st = $('status'), go = $('go');
  pending = true; go.disabled = true; st.textContent = 'Starter kamera…';
  camP.then(attach).then(() => {
    st.textContent = 'Laster modell…';
    if (!modelP) modelP = initModel().then(m => landmarker = m);
    return modelP;
  }).then(() => { pending = false; if (cur !== 'okt') { stream?.getTracks().forEach(t => t.stop()); stream = null; return; } $('start').style.display = 'none'; st.textContent = ''; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); })
  .catch(e => { pending = false; console.error(e); $('start').style.display = 'flex'; st.textContent = 'Feil: ' + e.message; showHelp(e); go.disabled = false; go.textContent = 'Prøv igjen'; });
}
// Both buttons: getUserMedia MUST be the first call, synchronous in the tap (iOS user activation)
$('go').onclick = () => { const camP = getCam(facing); runCam(camP); };
$('startOkt').onclick = () => {
  const camP = getCam(facing);
  $('start').style.display = 'flex'; location.hash = '#/okt'; runCam(camP);
};
$('flip').onclick = async () => { facing = facing === 'user' ? 'environment' : 'user'; try { await attach(await getCam(facing)); } catch (e) { alert('Kunne ikke bytte kamera: ' + e.message); } };
const vis = p => p ? (p.visibility ?? 1) : 0;
function loop() {
  raf = requestAnimationFrame(loop);
  if (!landmarker || v.readyState < 2) return;
  if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
  const ts = performance.now(); if (ts <= lastTs) return; lastTs = ts;
  const res = landmarker.detectForVideo(v, ts);
  ctx.clearRect(0, 0, c.width, c.height);
  const lm = res.landmarks?.[0];
  let hint = true;
  if (lm) {
    const du = new DrawingUtils(ctx);
    du.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: '#ff5a3c', lineWidth: 4 });
    du.drawLandmarks(lm, { color: '#ffffff', fillColor: '#ff2d87', radius: 4 });
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
// A stale active session from a closed tab: if we load outside the workout, close it.
if (!/okt/.test(location.hash) && store.active()) store.endSession();
route();
