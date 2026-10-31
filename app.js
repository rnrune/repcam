const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
let PoseLandmarker, FilesetResolver, DrawingUtils;
const $ = id => document.getElementById(id);
const v = $('v'), c = $('c'), ctx = c.getContext('2d');
const store = Store.createStore(localStorage);
const LS = localStorage;
// Private mode / blocked storage: detect so we can tell the user instead of silently forgetting everything.
const storageOK = (() => { try { LS.setItem('repcam.probe', '1'); LS.removeItem('repcam.probe'); return true; } catch { return false; } })();
navigator.storage?.persist?.().catch(() => {});
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const AUTOSAVE_MS = +(LS.getItem('repcam.autosaveMs') || 9000);   // pause after last rep before the set is saved
// A set is only saved automatically with 2+ reps: walking, sitting down, bending to load plates or re-racking can fake ONE
// rep, never a rhythm. A deliberate 1-rep set can still be saved with the ✓ button.
const MIN_AUTO_REPS = 2;
const IDLE_END_MS = +(LS.getItem('repcam.idleEndMs') || 10 * 60e3); // on screen, camera running: auto-end after this long without reps
// Time spent in other apps does NOT count toward IDLE_END_MS. The session only ends from being away when there have been no reps
// for AWAY_END_MS (default 30 min), measured from the last rep, and the app was away (background or closed).
const AWAY_END_MS = +(LS.getItem('repcam.awayEndMs') || 30 * 60e3);
const wake = Wake.createWake();
const APP_VERSION = '8.25';
const liveSets = id => store.sets().filter(s => s.sessionId === id);
const strava = Strava.createClient({ ls: localStorage, fetch: (...x) => fetch(...x), config: window.REPCAM_STRAVA || {}, liveSets });
// A set was edited/deleted: pending Strava sync/auto-create follows the current sets; zero sets left = cancelled.
const stravaResync = sid => { if (sid) { strava.update(sid, liveSets(sid)); setTimeout(() => stravaSync(), 0); } }; // v8.13: synced activities get their description rewritten
const stravaFmt = () => ({ name: exName, kgf: L.kgf, title: L.t('st.actName') });
const restGate = Rest.createRestGate(); // v8.15 (rest.js, REST_CFG)
// v8.16 bar/plate tracker, SHADOW only (bar.js, BAR_CFG; kill switch BAR_CFG.enabled or localStorage repcam.barOff=1).
// Runs at BAR_CFG.hz on a tiny gray copy of the frame, only while the current exercise is a barbell one. Never affects counting.
const barTr = window.Bar && LS.getItem('repcam.barOff') !== '1' ? Bar.createBarTracker() : null;
let barCv = null, barCtx = null;
function barFrame(lm, ts) {
  if (!barTr || !barTr.cfg.enabled || !barTr.due(ts / 1000) || !barTr.cfg.exercises.includes(curEx()) || !v.videoWidth) return;
  try { const W = barTr.cfg.frameW, H = Math.round(W * v.videoHeight / v.videoWidth);
    if (!barCv || barCv.height !== H) { barCv = document.createElement('canvas'); barCv.width = W; barCv.height = H; barCtx = barCv.getContext('2d', { willReadFrequently: true }); }
    barCtx.drawImage(v, 0, 0, W, H); barTr.frame(ts / 1000, Bar.toGray(barCtx.getImageData(0, 0, W, H).data, W, H), W, H, lm);
  } catch (e) { /* shadow: never break the camera loop */ } }
let pending = false, landmarker, modelP, stream, facing = 'user', lastTs = -1, raf = 0, tick = 0;
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/* ---------- språk ---------- */
let L;
const langPref = () => LS.getItem('repcam.lang') || 'auto';
function setLang() {
  const p = langPref();
  L = I18n.create(p === 'auto' ? I18n.detect(navigator.languages?.length ? navigator.languages : [navigator.language]) : p);
  document.documentElement.lang = L.lang;
  document.querySelectorAll('[data-i]').forEach(el => { el.textContent = L.t(el.dataset.i); });
  document.querySelectorAll('[data-ia]').forEach(el => el.setAttribute('aria-label', L.t(el.dataset.ia)));
  $('weekChart').setAttribute('aria-label', L.t('a.chart'));
  $('langSel').innerHTML = `<option value="auto">${L.t('prof.langAuto')}</option>` + Object.entries(I18n.LANGS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  $('langSel').value = p;
}
$('langSel').onchange = () => { LS.setItem('repcam.lang', $('langSel').value); setLang(); route(); };
const exName = id => L.exName(id);
const icon = id => Store.exInfo(id).icon;

/* ---------- profil ---------- */
function profile() { try { const p = JSON.parse(LS.getItem('repcam.profile')); if (p) return p; } catch {} return { name: store.sets().length ? 'Rune' : '', bw: null }; }
function saveProfile(p) { try { LS.setItem('repcam.profile', JSON.stringify(p)); } catch (e) { console.warn('profile save', e); } }
$('pName').onchange = () => { saveProfile({ ...profile(), name: $('pName').value.trim() }); renderProf(); };
$('pBw').onchange = () => { const x = parseFloat($('pBw').value); saveProfile({ ...profile(), bw: x > 0 ? x : null }); };

/* ---------- tema ---------- */
const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = LS.getItem('repcam.theme') || 'auto';
  const dark = t === 'dark' || (t === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('view-okt').classList.toggle('lightui', t === 'light');
  $('tc').content = document.body.classList.contains('workout') ? '#000000' : dark ? '#0d0e12' : '#f5f6fa';
  document.querySelectorAll('#themeSeg button').forEach(b => { b.classList.toggle('on', b.dataset.t === t); b.setAttribute('aria-checked', b.dataset.t === t); });
}
mq.addEventListener?.('change', applyTheme);
document.querySelectorAll('#themeSeg button').forEach(b => b.onclick = () => { LS.setItem('repcam.theme', b.dataset.t); applyTheme(); });

/* ---------- sheet ---------- */
let sheetClose = null;
function openSheet(html, onClose) { $('sheet').innerHTML = '<div class="grab"></div>' + html; $('sheet').scrollTop = 0; $('sheet').classList.add('on'); $('sheetBg').classList.add('on'); sheetClose = onClose || null; }
function closeSheet() { $('sheet').classList.remove('on'); $('sheetBg').classList.remove('on'); const f = sheetClose; sheetClose = null; f?.(); }
$('sheetBg').onclick = closeSheet;
function confirmDialog(title, text, okLabel) {
  return new Promise(res => {
    openSheet(`<h3>${title}</h3><div class="muted">${text}</div><div class="btns" style="margin-top:18px"><button class="ghost" id="dNo">${L.t('edit.cancel')}</button><button class="grad danger" id="dYes" style="margin-top:8px">${okLabel}</button></div>`);
    let done = false; const fin = v => { if (done) return; done = true; closeSheet(); res(v); }; // one answer per dialog (rapid taps)
    $('dNo').onclick = () => fin(false); $('dYes').onclick = () => fin(true); sheetClose = () => { if (!done) { done = true; res(false); } };
  });
}
// +/- stepper: tap = one step, hold = repeat, tap the number to type.
function stepper(id, val, step, fmt) {
  return `<div class="stepper" data-step="${step}"><button type="button" data-d="-1" aria-label="${L.t('a.less')}">−</button><input class="val" id="${id}" inputmode="decimal" type="text" value="${fmt(val)}" aria-label="${L.t('edit.type')}"><button type="button" data-d="1" aria-label="${L.t('a.more')}">+</button></div>`;
}
const parseNum = s => { const x = parseFloat(String(s).replace(',', '.').replace(/[^\d.]/g, '')); return isFinite(x) ? x : 0; };
function wireSteppers(root, onChange) {
  root.querySelectorAll('.stepper').forEach(st => {
    const inp = st.querySelector('input'), step = +st.dataset.step;
    const bump = d => { const x = Math.max(0, Math.round((parseNum(inp.value) + d * step) * 100) / 100); inp.value = step < 1 || x % 1 ? L.nf(x, 2) : String(x); onChange?.(); };
    st.querySelectorAll('button').forEach(b => {
      let t1, t2; const d = +b.dataset.d;
      const stop = () => { clearTimeout(t1); clearInterval(t2); };
      b.onpointerdown = e => { e.preventDefault(); bump(d); t1 = setTimeout(() => t2 = setInterval(() => bump(d), 90), 420); };
      b.onpointerup = b.onpointerleave = b.onpointercancel = stop;
      b.onclick = e => { if (e.detail === 0) bump(d); }; // keyboard activation
    });
    inp.onfocus = () => inp.select();
    inp.onchange = onChange;
  });
}
function exGrid(sel, withAuto) {
  return `<div class="exgrid">${withAuto ? `<button class="wide ${sel == null ? 'on' : ''}" data-ex=""><b>${L.t('w.autoPick')}</b><div class="muted small" style="margin:0">${L.t('w.autoPickSub')}</div></button>` : ''}${Store.EX.map(e => `<button data-ex="${e.id}" class="${sel === e.id ? 'on' : ''}">${e.icon} ${esc(exName(e.id))}</button>`).join('')}</div>`;
}
// Edit a logged set (reps, kg, exercise). Used from the "saved" toast and from Historikk.
function openEdit(ts, after) {
  const s = store.sets().find(x => x.timestamp === ts); if (!s) return;
  let ex = s.exercise || 'knebøy';
  openSheet(`<h3>${L.t('edit.title')}</h3><div class="muted">${L.date(s.timestamp, { weekday: 'long', day: 'numeric', month: 'long' })} · ${L.hm(s.timestamp)}</div>
    <div class="muted small">${L.t('w.repsL')}</div>${stepper('eReps', +s.reps || 0, 1, x => String(x))}
    <div class="muted small">${L.t('w.weight')} (kg · 0 = ${L.t('bw')})</div>${stepper('eKg', +s.kg || 0, 2.5, x => L.nf(x, 2))}
    <div class="muted small">${L.t('edit.ex')}</div>${exGrid(ex, false)}
    <div class="sheetfoot"><button class="grad" id="eSave">${L.t('edit.save')}</button><div class="btns"><button class="ghost" id="eDel">${L.t('edit.delete')}</button><button class="ghost" id="eNo">${L.t('edit.cancel')}</button></div></div>`);
  const sh = $('sheet'); wireSteppers(sh);
  sh.querySelectorAll('.exgrid button').forEach(b => b.onclick = () => { ex = b.dataset.ex; sh.querySelectorAll('.exgrid button').forEach(x => x.classList.toggle('on', x === b)); });
  const sid = s.sessionId || store.sessionOf(ts);
  $('eSave').onclick = () => { fbLabel(ts, 'edit', { reps: parseNum($('eReps').value), kg: parseNum($('eKg').value), exercise: ex }); store.updateSet(ts, { reps: parseNum($('eReps').value), kg: parseNum($('eKg').value), exercise: ex }); setKgFor(ex, parseNum($('eKg').value)); stravaResync(sid); closeSheet(); after?.(); };
  $('eNo').onclick = closeSheet;
  $('eDel').onclick = async () => { if (await confirmDialog(L.t('del.title'), L.t('del.text'), L.t('del.ok'))) { fbLabel(ts, 'delete'); store.deleteSet(ts); stravaResync(sid); after?.(); } };
}

// v8.13: add a set to a finished session (Historikk). Defaults to the session's last set; Strava: pending sync gets the new
// set, an existing activity gets its description block rewritten (stravaResync).
function openAdd(sid, after) {
  const mine = liveSets(sid), last = mine[mine.length - 1] || {}; let ex = last.exercise || 'knebøy';
  openSheet(`<h3>${L.t('hist.addSet')}</h3>
    <div class="muted small">${L.t('w.repsL')}</div>${stepper('eReps', +last.reps || 8, 1, x => String(x))}
    <div class="muted small">${L.t('w.weight')} (kg · 0 = ${L.t('bw')})</div>${stepper('eKg', +last.kg || 0, 2.5, x => L.nf(x, 2))}
    <div class="muted small">${L.t('edit.ex')}</div>${exGrid(ex, false)}
    <div class="sheetfoot"><button class="grad" id="eSave">${L.t('edit.save')}</button><div class="btns"><button class="ghost" id="eNo">${L.t('edit.cancel')}</button></div></div>`);
  const sh = $('sheet'); wireSteppers(sh);
  sh.querySelectorAll('.exgrid button').forEach(b => b.onclick = () => { ex = b.dataset.ex; sh.querySelectorAll('.exgrid button').forEach(x => x.classList.toggle('on', x === b)); });
  $('eSave').onclick = () => { const reps = parseNum($('eReps').value); if (reps > 0) { store.addSetTo(sid, { exercise: ex, reps, kg: parseNum($('eKg').value) }); stravaResync(sid); } closeSheet(); after?.(); };
  $('eNo').onclick = closeSheet;
}

/* ---------- «Hjelp til å forbedre»: per-set clips + labels (feedback.js) ---------- */
const fb = { rec: null, mime: '', repT: [], lm: [], lastLm: 0, lastTrim: 0, early: {}, cutting: {}, q: null };
const fbOn = () => LS.getItem(Feedback.KEYS.on) === '1' && typeof MediaRecorder !== 'undefined' && !!(window.REPCAM_STRAVA || {}).workerUrl;
function fbQueue() {
  if (fb.q) return fb.q;
  const rnd = b => crypto.getRandomValues(b);
  if (!LS.getItem(Feedback.KEYS.inst)) { LS.setItem(Feedback.KEYS.inst, Feedback.rid(12, rnd)); LS.setItem(Feedback.KEYS.tok, Feedback.rid(32, rnd)); }
  const send = Feedback.httpSender({ base: window.REPCAM_STRAVA.workerUrl, inst: LS.getItem(Feedback.KEYS.inst), tok: LS.getItem(Feedback.KEYS.tok), fetch: (...x) => fetch(...x) });
  try { navigator.storage?.persist?.(); } catch {} // v8.18: ask iOS not to evict the local clip queue
  return fb.q = Feedback.createQueue({ kv: Feedback.idbKV(), send, maxBackoffMs: Feedback.QUEUE_CFG.maxBackoffMs });
}
function fbStart() {
  fbStop(true);
  if (!fbOn() || !camLive()) return;
  try { fb.mime = Feedback.pickMime(m => MediaRecorder.isTypeSupported(m)); fb.rec = Feedback.createRecorder(stream, { mime: fb.mime, bps: 1e6 }); fb.repT = []; fb.lm = []; }
  catch (e) { console.warn('fb rec', e); fb.rec = null; }
}
function fbStop(discard) { const r = fb.rec; fb.rec = null; if (r) r.stop().catch(() => {}); }
function fbSample(lm, ts) {
  if (!fb.rec || !lm || ts - fb.lastLm < 100) return; fb.lastLm = ts;
  const a = [Math.round(ts)]; for (const p of lm) a.push(+p.x.toFixed(3), +p.y.toFixed(3), +(p.visibility ?? 0).toFixed(2));
  fb.lm.push(a); if (fb.lm.length > 3000) fb.lm.splice(0, 600);
}
function fbViewHint(lm) { // rough camera angle: shoulder width relative to torso height
  const fr = lm.slice(-50); if (!fr.length) return null;
  const r = fr.map(a => { const sx = Math.abs(a[1 + 11 * 3] - a[1 + 12 * 3]), ty = Math.abs((a[2 + 11 * 3] + a[2 + 12 * 3]) / 2 - (a[2 + 23 * 3] + a[2 + 24 * 3]) / 2) || 1; return sx / ty; }).sort((x, y) => x - y)[fr.length >> 1];
  return r > 0.55 ? 'front' : r < 0.25 ? 'side' : 'oblique';
}
function fbCut(pred, setTs, label) { const p = fbCut1(pred, setTs, label); if (setTs) fb.cutting[setTs] = p; p.finally(() => { if (fb.cutting[setTs] === p) delete fb.cutting[setTs]; }); return p; }
async function fbCut1(pred, setTs, label) {
  const r = fb.rec; if (!r) return;
  const repT = fb.repT, lmAll = fb.lm, restShadow = fb.restShadow, barShadow = fb.barShadow, tempoShadow = fb.tempoShadow || null; fb.tempoShadow = null; fb.repT = []; fb.lm = []; fb.restShadow = null; fb.barShadow = null;
  const seg = await r.cut(); if (!seg || !seg.blob.size || seg.blob.size > Feedback.MAX_BYTES) return;
  const t0 = seg.t0, rel = t => +((t - t0) / 1000).toFixed(2);
  const lm = lmAll.filter(a => a[0] >= t0).map(a => [rel(a[0]), ...a.slice(1)]);
  const id = Date.now().toString(36) + Feedback.rid(4, b => crypto.getRandomValues(b));
  const meta = { id, app: APP_VERSION, created: new Date().toISOString(), setTs, pred, manualEx: !!manualEx,
    restShadow, barShadow, tempoShadow, repTimes: repT.map(rel), durationS: rel(seg.t1), facing, viewHint: fbViewHint(lm),
    video: { mime: seg.blob.type, bytes: seg.blob.size, w: v.videoWidth, h: v.videoHeight, bps: 1e6 },
    landmarks: { hz: 10, layout: 't,(x,y,vis)*33', frames: lm },
    device: { ua: navigator.userAgent, w: screen.width, h: screen.height, dpr: devicePixelRatio, standalone, lang: L.lang } };
  try { const st = await fbQueue().stats(); if (st.bytes + seg.blob.size > Feedback.QUEUE_CFG.maxLocalBytes) { console.warn('fb: local queue full, clip skipped'); return; } } catch {}
  const lab = fb.early[setTs] || label || Feedback.labelFrom(pred, 'implicit'); delete fb.early[setTs];
  try { await fbQueue().add({ id, setTs, blob: seg.blob, mime: seg.blob.type.split(';')[0], meta, label: lab, created: Date.now() }); } catch (e) { console.warn('fb add', e); }
  fbUpload();
}
async function fbLabel(ts, action, val) {
  if (!LS.getItem(Feedback.KEYS.inst)) return;
  const s0 = store.sets().find(x => x.timestamp === ts);
  if (fb.cutting[ts]) await fb.cutting[ts].catch(() => {});
  const s = s0 || store.sets().find(x => x.timestamp === ts) || {}, mk = pred => Feedback.labelFrom(pred, action, val);
  try { if (!(await fbQueue().label(ts, mk))) fb.early[ts] = mk({ exercise: s.exercise, reps: s.reps, kg: s.kg }); } catch (e) { console.warn('fb label', e); }
  fbUpload();
}
// The queue itself coalesces concurrent calls (feedback.js process), so every trigger is forwarded: a clip enqueued while
// an upload runs is picked up by the same loop. Retries are timed to the earliest backoff, and the queue is drained on
// start, on returning to the foreground and on pageshow (iOS resumes/reloads PWAs on its own schedule).
let fbTimer = 0;
const fbAuto = () => Feedback.QUEUE_CFG.retry && LS.getItem('repcam.fb.retryOff') !== '1';
async function fbUpload(force) {
  if (!LS.getItem(Feedback.KEYS.inst)) return;
  if (force !== true && !fbAuto()) return fbPending();
  // navigator.onLine is only a hint (iOS reports true on dead gym Wi-Fi, and navigator.connection is missing): a forced try runs anyway
  if (navigator.onLine !== false || force === true) { try { await fbQueue().process({ force: force === true }); } catch (e) { console.warn('fb up', e); } }
  try { const t = await fbQueue().nextDue(); clearTimeout(fbTimer); if (t != null && fbAuto()) fbTimer = setTimeout(fbUpload, Math.max(2e3, t - Date.now() + 50)); } catch {}
  fbPending(); if (cur === 'profil') renderFb();
}
// v8.18: small «⇡ n» badge (home + workout) while clips are waiting to be sent
async function fbPending() {
  let n = 0; try { if (LS.getItem(Feedback.KEYS.inst)) n = (await fbQueue().stats()).pending; } catch {}
  document.querySelectorAll('.fbPend').forEach(el => { el.textContent = n ? '⇡ ' + n : ''; el.style.display = n ? '' : 'none'; el.title = n ? L.t('fb.stats', { p: n, u: '', mb: '' }) : ''; });
  return n;
}
addEventListener('online', () => fbUpload(true)); setInterval(() => { if (document.visibilityState === 'visible') fbUpload(); }, Feedback.QUEUE_CFG.periodMs);
addEventListener('pageshow', () => fbUpload()); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fbUpload(true); });
setTimeout(() => fbUpload(true), 1500);
async function renderFb() {
  const el = $('fbCard'); if (!el) return;
  const on = LS.getItem(Feedback.KEYS.on) === '1';
  let st = { pending: 0, uploaded: 0, bytes: 0 }; if (LS.getItem(Feedback.KEYS.inst)) { try { st = await fbQueue().stats(); } catch {} }
  el.innerHTML = `<label class="row" style="gap:12px"><span><b>${L.t('fb.title')}</b><div class="muted small" style="margin:2px 0 0">${L.t('fb.sub')}</div></span><input type="checkbox" id="fbOn" class="sw" ${on ? 'checked' : ''}></label>
    ${typeof MediaRecorder === 'undefined' ? `<div class="muted small">${L.t('fb.unsupported')}</div>` : ''}
    <div class="muted small" id="fbStats">${L.t('fb.stats', { p: st.pending, u: st.uploaded, mb: L.nf(Math.round(st.bytes / 1e5) / 10, 1) })}</div>
    ${st.pending ? `<div class="btns"><button class="ghost" id="fbSend">${L.t('fb.send')}</button><button class="ghost" id="fbDel">${L.t('fb.del')}</button></div>` : ''}`;
  $('fbOn').onchange = () => { LS.setItem(Feedback.KEYS.on, $('fbOn').checked ? '1' : '0'); if ($('fbOn').checked) fbQueue(); renderFb(); };
  if ($('fbSend')) $('fbSend').onclick = async () => { const b = $('fbSend'); b.disabled = true; b.textContent = '…'; // v8.18: visible feedback
    let r = null; try { r = await fbQueue().process({ force: true }); } catch (e) { r = { error: e.message }; }
    await fbUpload(); const n = await fbPending(); showToastGlobal(n ? `⇡ ${n} · ${r && r.error ? r.error : ''}` : '✓'); renderFb(); };
  if ($('fbDel')) $('fbDel').onclick = async () => { if (await confirmDialog(L.t('fb.del'), L.t('fb.delText'), L.t('del.ok'))) { await fbQueue().clearPending(); } renderFb(); };
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
  const D = L.weekdays(), mx = Math.max(...w.days, 1), bw = 26, gap = (320 - 7 * bw) / 7;
  let s = '<defs><linearGradient id="bg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff8a00"/><stop offset="1" stop-color="#ff2d87"/></linearGradient></defs>';
  w.days.forEach((val, i) => {
    const x = gap / 2 + i * (bw + gap), h = val ? Math.max(6, val / mx * 96) : 4, y = 104 - h;
    s += `<rect x="${x}" y="8" width="${bw}" height="96" rx="9" fill="var(--chip)"/>`;
    s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="9" fill="${val ? 'url(#bg)' : 'var(--line)'}"><title>${esc(D[i])}: ${L.nf(val)} kg</title></rect>`;
    s += `<text x="${x + bw / 2}" y="124" text-anchor="middle" style="${i === w.today ? 'fill:var(--tx);font-weight:800' : ''}">${esc(D[i])}</text>`;
  });
  return s;
}

/* ---------- views ---------- */
function groupLabel(g) {
  const reps = g.sets.map(s => +s.reps || 0), same = reps.every(r => r === reps[0]);
  return same ? L.t('setsXreps', { n: g.count, r: reps[0] }) : L.t('setsRange', { n: g.count, a: Math.min(...reps), b: Math.max(...reps) });
}
// v8.15: one collapsed summary card per workout session (Hjem + Historikk); tap to open all sets with edit / add / delete
function stravaBadge(id) {
  if (!strava.connected()) return '';
  const st = (strava.queue().find(x => x.id === id) || {}).status;
  const k = st === 'synced' || st === 'created' ? 'on' : st === 'creating' ? 'up' : st === 'waiting' ? 'wait' : st === 'nomatch' ? 'none' : null;
  return k ? `<span class="sbadge st-${k}">${L.t('sess.st.' + k)}</span>` : '';
}
const openSess = new Set(JSON.parse(sessionStorage.getItem('repcam.openSess') || '[]')); // cards stay open across re-renders/reload (this tab)
document.addEventListener('toggle', e => { const d = e.target; if (!d.matches?.('details.sess')) return; d.open ? openSess.add(d.dataset.sid) : openSess.delete(d.dataset.sid); sessionStorage.setItem('repcam.openSess', JSON.stringify([...openSess])); }, true);
function sessionCard(s, opts = {}) {
  const live = store.active()?.id === s.id, mins = Math.max(1, Math.round((new Date(live ? Date.now() : s.end) - new Date(s.start)) / 60e3));
  const groups = Store.groupByExercise(s.sets);
  const exLine = groups.map(g => `<span class="sx">${g.icon} ${esc(exName(g.id))} <b>${L.t('sets', { n: g.count })}</b> · ${L.t('reps', { n: g.sets.reduce((a, x) => a + (+x.reps || 0), 0) })}${g.topKg ? ' · ' + L.t('sess.top', { kg: L.kgf(g.topKg) }) : ''}</span>`).join('');
  const day = L.date(s.start, { weekday: 'short', day: 'numeric', month: 'short' });
  return `<details class="card sess"${opts.open || openSess.has(s.id) ? ' open' : ''} data-sid="${esc(s.id)}"><summary><div class="row"><b>${opts.noDay ? '' : esc(day) + ' · '}${L.hm(s.start)}–${live ? '…' : L.hm(s.end)}</b><span class="muted">${L.t('sess.min', { n: mins })} · ${L.nf(s.volume)} kg</span><span class="chev">›</span></div>
    <div class="sxl">${exLine}</div><div class="row small">${stravaBadge(s.id)}<span class="muted" style="margin-left:auto">${L.t('sets', { n: s.sets.length })}</span></div></summary>
    <div class="sdet">${opts.spark ? groups.map(g => `<div class="ex-foot"><div><b>${g.icon} ${esc(exName(g.id))}</b><div class="muted small" style="margin:0">${groupLabel(g)} · ${L.nf(g.volume)} kg</div></div>${spark(Store.kgHistory(opts.all, g.id))}</div>`).join('') : ''}
    ${s.sets.map(x => `<div class="setrow" data-ts="${esc(x.timestamp)}" role="button" tabindex="0"><span>${icon(x.exercise)} ${esc(exName(x.exercise || 'knebøy'))} · <b>${L.t('reps', { n: x.reps })}</b> × ${L.kgf(x.kg)}${x.unsure ? ` <span class="unsure">${L.t('w.unsureTag')}</span>` : ''}</span><span class="muted">✎</span></div>`).join('')}
    ${live ? '' : `<div class="row"><button class="ghost addset" data-sadd="${esc(s.id)}">＋ ${L.t('hist.addSet')}</button>${strava.connected() ? `<button class="ghost supd" data-supd="${esc(s.id)}">⟳ ${L.t('sup.btn')}</button>` : ''}<button class="ghost sessdel" data-sdel="${esc(s.id)}" aria-label="${L.t('sdel.btn')}" title="${L.t('sdel.btn')}">🗑</button></div>`}</div></details>`;
}
function sessClick(e, rerender) { const u = e.target.closest('[data-supd]'); if (u) return stravaRefresh(u.dataset.supd, u, rerender); const d = e.target.closest('[data-sdel]'); if (d) return deleteSession(d.dataset.sdel); const a = e.target.closest('[data-sadd]'); if (a) return openAdd(a.dataset.sadd, rerender); const r = e.target.closest('.setrow'); if (r) openEdit(r.dataset.ts, rerender); }
function renderHome() {
  const h = new Date().getHours(), name = profile().name;
  const g = L.t(h < 5 ? 'greet.night' : h < 10 ? 'greet.morning' : h < 17 ? 'greet.day' : h < 23 ? 'greet.evening' : 'greet.night');
  $('greet').textContent = name ? g + ', ' + name : g;
  $('avatar').textContent = (name || '🙂')[0].toUpperCase();
  $('title').textContent = L.t(h < 12 ? 'title.morning' : h < 17 ? 'title.day' : 'title.evening');
  const all = store.sets(), today = Store.todaySets(all);
  $('todayVol').textContent = today.length ? L.t('home.total', { v: L.nf(Store.volume(today)) }) : '';
  renderStravaNote();
  const todayS = store.sessions().filter(s => Store.todaySets(s.sets).length || store.active()?.id === s.id);
  $('todayList').innerHTML = todayS.length ? todayS.map(s => sessionCard(s, { noDay: true, spark: true, all })).join('')
    : `<div class="card empty"><div class="e">🌱</div><b>${L.t('home.empty')}</b>${L.t('home.emptySub')}</div>`;
  const w = Store.weekly(all);
  $('weekTotal').textContent = L.nf(w.total) + ' kg';
  const p = $('weekPct');
  p.className = 'pill' + (w.pct == null ? '' : w.pct >= 0 ? ' up' : ' down');
  p.textContent = w.pct == null ? L.t(w.total ? 'home.firstWeek' : 'home.noData') : (w.pct >= 0 ? '▲ ' : '▼ ') + L.t('home.vsLast', { p: L.nf(Math.abs(w.pct)) });
  $('weekChart').innerHTML = weekChart(w);
}
function renderEx() {
  $('exList').innerHTML = Store.EX.map(e => `<div class="card"><div class="ex"><div class="ex-ic">${e.icon}</div><div class="ex-main"><b>${esc(exName(e.id))}</b></div><span class="badge">${L.t('ex.active')}</span></div>
    <div class="tip">📷 <b>${L.t('ex.tip')}:</b> ${L.t('tip.' + e.id)}</div></div>`).join('');
}
function renderHist() {
  const ss = store.sessions();
  if (!ss.length) { $('histList').innerHTML = `<div class="card empty"><div class="e">📅</div><b>${L.t('hist.empty')}</b>${L.t('hist.emptySub')}</div>`; return; }
  let last = '', out = `<div class="muted" style="margin:-8px 4px 10px">${L.t('hist.editHint')}</div>`;
  for (const s of ss) {
    const d = L.date(s.start, { weekday: 'long', day: 'numeric', month: 'long' });
    if (d !== last) { out += `<div class="day">${esc(d)}</div>`; last = d; }
    out += sessionCard(s, { noDay: true });
  }
  $('histList').innerHTML = out;
}
$('histList').onclick = e => sessClick(e, renderHist);
$('todayList').onclick = e => sessClick(e, renderHome);
// "Slett hele økten": one confirmation, removes every set locally and cancels any pending Strava sync/auto-create. Never deletes on Strava.
let sdelBusy = false;
async function deleteSession(id) {
  if (sdelBusy) return; sdelBusy = true; try { await deleteSession1(id); } finally { sdelBusy = false; }
}
async function deleteSession1(id) {
  const ss = store.sessions().find(x => x.id === id); if (!ss) return;
  const q = strava.queue().find(x => x.id === id), onStrava = q && ['synced', 'created', 'creating'].includes(q.status);
  const text = L.t('sdel.text', { n: ss.sets.length }) + ' ' + L.t(onStrava ? 'sdel.onStrava' : 'sdel.strava');
  if (!(await confirmDialog(L.t('sdel.title'), text, L.t('sdel.ok')))) return;
  store.deleteSession(id); strava.cancel(id); renderHist();
}
/* ---------- Strava ---------- */
function renderStravaNote() {
  const nm = strava.connected() ? strava.queue().filter(x => x.status === 'nomatch') : [];
  $('stravaNote').innerHTML = nm.map(x => `<div class="card"><div class="muted">${L.t('st.nomatch', { d: esc(L.date(x.start, { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + L.hm(x.start)) })}</div><button class="btn" data-create="${esc(x.id)}">${L.t('st.create')}</button></div>`).join('');
}
// v8.18 «Oppdater i Strava»: update the session's existing activity (stored id, else time overlap) after a confirmation; never a duplicate.
async function stravaRefresh(id, btn, rerender) {
  const ss = store.sessions().find(x => x.id === id); if (!ss || !strava.connected()) return;
  const sess = { ...ss, sets: ss.sets }; if (btn) btn.disabled = true;
  try {
    const loc = await strava.locate(sess);
    if (!loc) { if (await confirmDialog(L.t('sup.btn'), L.t('sup.none'), L.t('sup.create'))) { await strava.createFor(sess, stravaFmt()); showToastGlobal(L.t('st.created')); } return; }
    if (!(await confirmDialog(L.t('sup.title'), L.t('sup.text', { a: esc(loc.name || loc.activityId), n: loc.ours ? L.t('sup.name') : '' }), L.t('sup.ok')))) return;
    const r = await strava.refresh(sess, loc, stravaFmt()); showToastGlobal(L.t('sup.done', { a: r.name || r.activityId }));
  } catch (e) { console.warn('strava refresh', e); showToastGlobal(e.message); }
  finally { if (btn) btn.disabled = false; rerender && rerender(); }
}
async function stravaCreate(id) { try { await strava.createManual(id, stravaFmt()); showToastGlobal(L.t('st.created')); } catch (e) { showToastGlobal(e.message); } renderStravaNote(); renderStrava(); }
document.addEventListener('click', e => { const b = e.target.closest('[data-create]'); if (b) { b.disabled = true; stravaCreate(b.dataset.create); } });
function showToastGlobal(t) { const n = $('stravaNote'); if (n) { n.insertAdjacentHTML('afterbegin', `<div class="card muted">${esc(t)}</div>`); } }
function renderStrava() {
  const el = $('stravaCard'); if (!el) return;
  if (!strava.configured()) { el.innerHTML = `<div class="muted small">${L.t('st.sub')}</div><div class="muted">${L.t('st.notConf')}</div>`; return; }
  if (!strava.connected()) { el.innerHTML = `<div class="muted small">${L.t('st.sub')}</div><button class="btn" id="stConnect">${L.t('st.connect')}</button>`;
    $('stConnect').onclick = () => { const p = profile(); location.href = strava.authUrl(location.origin + location.pathname, { web: standalone, carry: { n: p.name || '', b: p.bw || null, l: langPref() } }); }; return; }
  const q = strava.queue().slice(-3).reverse().map(x => `<div class="muted small">${L.hm(x.start)} · ${x.status === 'synced' ? L.t('st.synced', { a: esc(x.activityName || x.activityId) }) : x.status === 'created' ? L.t('st.created') : x.status === 'nomatch' ? L.t('st.nomatch', { d: '' }) : L.t('st.waiting')}</div>`).join('');
  el.innerHTML = `<div class="row"><b>✓ ${L.t('st.connected')}${strava.athlete() ? ' · ' + esc(strava.athlete()) : ''}</b><button class="ghost" id="stOff" style="width:auto">${L.t('st.disconnect')}</button></div><div class="muted small">${L.t('st.sub')}</div>${q}`;
  $('stOff').onclick = () => { strava.disconnect(); renderStrava(); };
}
// Auto-create runs 1 h after a session if no watch activity showed up: re-check while the app is open (and on every return to it).
setInterval(() => { if (document.visibilityState === 'visible') stravaSync(); }, 5 * 60e3);
const queueStrava = sum => strava.enqueue({ ...sum, sets: store.sets().filter(s => s.sessionId === sum.id) });
let stravaBusy = false;
async function stravaSync() {
  if (stravaBusy || !strava.connected() || !strava.queue().some(x => x.status === 'waiting' || x.status === 'creating' || x.descDirty)) return;
  stravaBusy = true; try { await strava.process(stravaFmt()); } catch (e) { console.warn('strava', e); } stravaBusy = false;
  if (cur === 'profil') renderStrava(); if (cur === 'home') renderStravaNote();
}
function renderProf() {
  renderStrava(); renderFb();
  const ss = store.sessions(), all = store.sets(), p = profile();
  $('pName').placeholder = L.t('onb.namePh'); $('pName').value = p.name || ''; $('pBw').value = p.bw || ''; $('pBw').placeholder = L.t('onb.bwPh');
  $('avatar2').textContent = (p.name || '🙂')[0].toUpperCase();
  $('profStats').textContent = L.t('prof.stats', { s: ss.length, n: all.length, v: L.nf(Store.volume(all)) });
  applyTheme();
}
$('export').onclick = () => {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'repcam-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
function onboarding() {
  if (LS.getItem('repcam.onboarded')) return;
  const p = profile();
  // A saved profile means setup was already done (flag lost/never written): don't ask again.
  if (LS.getItem('repcam.profile') && (p.name || p.bw)) { LS.setItem('repcam.onboarded', '1'); return; }
  openSheet(`<h3>${L.t('onb.title')}</h3><div class="muted">${L.t('onb.text')}</div>
    <div class="muted small">${L.t('prof.lang')}</div><select id="oLang" class="inp">${$('langSel').innerHTML}</select>
    <div class="muted small">${L.t('prof.name')}</div><input id="oName" class="inp" placeholder="${L.t('onb.namePh')}" value="${esc(p.name || '')}">
    <div class="muted small">${L.t('prof.bw')}</div><input id="oBw" class="inp" type="number" inputmode="decimal" placeholder="${L.t('onb.bwPh')}" value="${p.bw || ''}">
    ${storageOK ? '' : `<div class="muted small" id="oPriv">${L.t('onb.private')}</div>`}
    <button class="grad" id="oGo">${L.t('onb.go')}</button>`, () => LS.setItem('repcam.onboarded', '1'));
  $('oLang').value = langPref();
  $('oLang').onchange = () => { LS.setItem('repcam.lang', $('oLang').value); const n = $('oName').value, b = $('oBw').value; setLang(); renderHome(); LS.removeItem('repcam.onboarded'); onboarding(); $('oName').value = n; $('oBw').value = b; };
  const keep = () => { const bw = parseNum($('oBw').value), name = $('oName').value.trim(); if (name || bw > 0) saveProfile({ name, bw: bw > 0 ? bw : null }); };
  $('oName').oninput = keep; $('oBw').oninput = keep;
  $('oGo').onclick = () => { const bw = parseNum($('oBw').value); saveProfile({ name: $('oName').value.trim(), bw: bw > 0 ? bw : null }); closeSheet(); renderHome(); };
}

/* ---------- ruting ---------- */
const VIEWS = { '': 'home', ovelser: 'ovelser', historikk: 'historikk', profil: 'profil', okt: 'okt' };
let cur = null;
function route() {
  const name = VIEWS[location.hash.replace(/^#\/?/, '')] || 'home';
  if (cur === 'okt' && name !== 'okt') leaveWorkout();
  const entering = name === 'okt' && cur !== 'okt';
  cur = name;
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id === 'view-' + name));
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.v === name));
  document.body.classList.toggle('workout', name === 'okt');
  if (entering) enterWorkout(); else if (name === 'okt') renderWorkout();
  ({ home: renderHome, ovelser: renderEx, historikk: renderHist, profil: renderProf })[name]?.();
  applyTheme(); window.scrollTo(0, 0);
}
addEventListener('hashchange', route);

/* ---------- økt: gjenkjenning, telling, autolagring ---------- */
// One counter per exercise runs in parallel on the same landmarks; the recognizer (or the manual pick) decides which one is shown.
let counters = {}, recognizer = Reps.createRecognizer(), picker = Reps.createPicker(), manualEx = null, autoEx = null, lockEx = null;
// v8.7 camera-motion gate: big/abrupt phone movement (pick-up, bump, re-propping) pauses counting; handheld filming doesn't.
let camGate = Reps.createCameraGate(), camPaused = false;
// DeviceMotion: rotation rate (deg/s) + acceleration without gravity (m/s²), max since the last video frame. iOS needs
// DeviceMotionEvent.requestPermission() from a tap: asked inside the Start/Fortsett tap (after getUserMedia), never on its own.
// Denied/unavailable → the vision fallback in Reps.createCameraGate still works.
const motion = { state: 'off', gyro: 0, acc: 0, last: 0,
  onEv(e) { const r = e.rotationRate, a = e.acceleration; motion.last = performance.now();
    if (r) motion.gyro = Math.max(motion.gyro, Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0));
    if (a) motion.acc = Math.max(motion.acc, Math.hypot(a.x || 0, a.y || 0, a.z || 0)); },
  listen() { if (motion.state === 'on') return; motion.state = 'on'; addEventListener('devicemotion', motion.onEv); },
  // must run synchronously inside a user tap
  enable() {
    if (motion.state === 'on' || motion.state === 'asking') return;
    const DME = window.DeviceMotionEvent;
    if (!DME) { motion.state = 'unavailable'; return; }
    if (typeof DME.requestPermission !== 'function') return motion.listen(); // Android / desktop: no prompt
    if (motion.state === 'denied') return; // iOS won't ask again; vision fallback
    motion.state = 'asking';
    // an error (e.g. no user activation) is not a denial: the next tap (Fortsett) tries again
    try { DME.requestPermission().then(r => { if (r === 'granted') { motion.state = 'off'; motion.listen(); } else motion.state = 'denied'; LS.setItem('repcam.motion', r); }, () => { motion.state = 'error'; }); }
    catch { motion.state = 'error'; }
  },
  // no tap needed when iOS already granted it earlier (resume after backgrounding / reload)
  resume() { if (motion.state !== 'on' && (typeof window.DeviceMotionEvent?.requestPermission !== 'function' || LS.getItem('repcam.motion') === 'granted')) { if (window.DeviceMotionEvent) motion.listen(); } },
  // readings since the previous frame; null when there is no live sensor (no events for 1 s)
  read() { if (motion.state !== 'on' || performance.now() - motion.last > 1000) { motion.gyro = motion.acc = 0; return null; } const r = { gyro: motion.gyro, acc: motion.acc }; motion.gyro = motion.acc = 0; return r; } };
let lastRepWall = 0, lastActivity = Date.now(), shownReps = -1, toastT = 0, lastFrameT = null;
const DEFAULT_KG = { knebøy: 20, bulgarsk: 0, pullups: 0, dips: 0, benkpress: 20, skråbenk: 20, halvmark: 40, roing: 30, armhevinger: 0, situps: 0, vsitup: 15, curl: 20 };
function kgFor(ex) { const x = LS.getItem('repcam.kg.' + ex); if (x != null) return +x; const l = store.lastKg(ex); return l != null ? l : (DEFAULT_KG[ex] ?? 0); }
function setKgFor(ex, x) { LS.setItem('repcam.kg.' + ex, Math.max(0, Math.round(x * 100) / 100)); }
const curEx = () => manualEx || lockEx || autoEx;
function resetCounters() { counters = {}; for (const id of Reps.IDS) counters[id] = Reps.createCounter(id); lockEx = null; shownReps = -1; lastRepWall = 0; }
function currentReps() { const e = curEx(); return e ? counters[e].reps : 0; }
function renderWorkout() {
  $('fbMiss').style.display = fb.rec ? '' : 'none';
  const a = store.active(), mine = a ? store.sets().filter(s => s.sessionId === a.id) : [], ex = curEx();
  $('setno').textContent = L.t('w.set', { n: mine.length + 1 });
  $('exIc').textContent = ex ? icon(ex) : '✨';
  $('exName').textContent = ex ? (manualEx ? '' : L.t('w.auto') + ': ') + exName(ex) : L.t('w.detecting');
  $('kg').textContent = L.kgf(kgFor(ex || 'knebøy'));
  // v8.9: every set of this session stays editable — tap a line in the log (newest first)
  $('log').innerHTML = mine.slice(-3).reverse().map(x => `<button class="logrow" data-ts="${esc(x.timestamp)}">${L.hm(x.timestamp)} · ${esc(exName(x.exercise))} · ${L.t('reps', { n: x.reps })} × ${L.kgf(x.kg)}${x.unsure ? ' · ' + L.t('w.unsureTag') : ''} ✎</button>`).join('');
  $('log').querySelectorAll('.logrow').forEach(b => b.onclick = () => openEdit(b.dataset.ts, renderWorkout));
  $('reps').textContent = currentReps();
}
function bumpKg(d) { const ex = curEx() || 'knebøy'; finishPending(); setKgFor(ex, kgFor(ex) + d); renderWorkout(); }
$('minus').onclick = () => bumpKg(-2.5); $('plus').onclick = () => bumpKg(2.5);
$('kg').onclick = () => {
  const ex = curEx() || 'knebøy';
  openSheet(`<h3>${L.t('w.weight')} · ${esc(exName(ex))}</h3><div class="muted small">0 = ${L.t('bw')}</div>${stepper('wKg', kgFor(ex), 2.5, x => L.nf(x, 2))}<button class="grad" id="wOk">${L.t('edit.save')}</button>`);
  wireSteppers($('sheet')); $('wOk').onclick = () => { const x = parseNum($('wKg').value); if (x !== kgFor(ex)) finishPending(); setKgFor(ex, x); closeSheet(); renderWorkout(); };
};
$('exChip').onclick = () => {
  openSheet(`<h3>${L.t('w.pick')}</h3>${exGrid(manualEx, true)}`);
  $('sheet').querySelectorAll('.exgrid button').forEach(b => b.onclick = () => {
    finishPending(); manualEx = b.dataset.ex || null; lockEx = null; store.touchActive({ manualEx });
    closeSheet(); renderWorkout();
  });
};
// Close the pending set without a tap: keep it if it is a real set (2+ reps), drop a lone stray rep.
// v8.9: a stray rep only resets ITS exercise's counter — resetting all of them used to wipe a set that another counter was
// already counting (e.g. pull-ups in progress while the picker still showed the previous exercise).
function finishPending() {
  // v8.9: last-chance re-lock — the set was locked on setup motion while another exercise's counter holds the real set
  if (lockEx && !manualEx && lastFrameT != null) { const nl = Reps.relock(counters, lockEx, null, lastFrameT, null, true); if (nl !== lockEx) lockEx = nl; }
  const r = currentReps(), ce = curEx();
  // v8.20 tempo gate (Reps.TEMPO_CFG): shadow by default, verdict goes into feedback meta. localStorage repcam.tempo = on | off (kill switch)
  const tMode = LS.getItem('repcam.tempo') || Reps.TEMPO_CFG.mode, tSlow = !!(ce && !manualEx && tMode !== 'off' && Reps.tempoSlow(ce, counters[ce].repTimes));
  fb.tempoShadow = { slow: tSlow, mode: tMode, ex: ce, reps: r }; if (tSlow) console.info('[tempoShadow] slow', ce, r, tMode);
  if (r >= MIN_AUTO_REPS && (manualEx || !ce || Reps.plausibleSet(counters[ce].repTimes))) return saveSet(); /* v8.24: a tempo-rejected set is saved and ASKED (✓ keeps, ✗ or no answer removes), see saveSet */ /* v8.13: sparse rigging 'reps' are not a set */ fb.tempoShadow = null; if (r > 0) { const e = ce; counters[e] = Reps.createCounter(e); shownReps = -1; lastRepWall = 0; } return null; }
function saveSet() {
  const ex = curEx(); if (!ex) return null;
  const reps = counters[ex].flush(); if (!reps) return null;
  const tsh = fb.tempoShadow, slowNow = !!(tsh && tsh.slow && tsh.ex === ex);
  const rec = store.addSet({ exercise: ex, reps, kg: kgFor(ex) });
  // v8.8: feedback repTimes = each rep's own time from the counter (a paired first rep used to get the confirmation time twice)
  if (fb.rec) fb.repT = counters[ex].repTimes.map(t => t * 1000);
  // v8.15 rest gate, SHADOW mode: log what it would have done; the old logic still decides
  { const first = (counters[ex].repTimes[0] ?? lastFrameT ?? 0) * 1000, v = restGate.verdict(first - 1);
    fb.restShadow = { v, mode: restGate.cfg.mode, readyAt: restGate.readyAt == null ? null : +((restGate.readyAt - first) / 1000).toFixed(2), ex, reps, auto: !manualEx };
    console.info('[restShadow]', v, ex, reps, fb.restShadow); restGate.rest((lastFrameT ?? 0) * 1000); }
  // v8.16 bar tracker, SHADOW: summary over this set (first rep − 4 s … now); bar times relative to the first pose rep
  if (barTr && barTr.cfg.exercises.includes(ex)) { try { const rt = counters[ex].repTimes, f = rt[0] ?? lastFrameT ?? 0, s = barTr.summary(f - 4, (lastFrameT ?? f) + 1, reps);
    s.repTimes = s.repTimes.map(t => +(t - f).toFixed(2)); fb.barShadow = { ...s, ex, poseReps: reps }; console.info('[barShadow]', ex, 'pose', reps, 'bar', s.reps, fb.barShadow); } catch (e) {} }
  if (barTr) barTr.reset();
  fbCut({ exercise: ex, reps, kg: rec.kg, auto: !manualEx }, rec.timestamp);
  if (!fb.rec) fb.tempoShadow = null; resetCounters(); navigator.vibrate?.([40, 60, 40]);
  // v8.20 «Bekreft usikkert sett»: an auto set the tempo gate calls slow (or with few reps) asks ✓/✗ in the toast.
  // ✓ = confirmed label, ✗ = removed + 'notASet' label, no answer = kept. Kill switch localStorage repcam.confirmOff=1.
  const tOn = slowNow && (tsh.mode === 'on'); // v8.24 tempo rule ON: the set must be confirmed, otherwise it is removed
  const unsure = !manualEx && (tOn || (LS.getItem('repcam.confirmOff') !== '1' && (slowNow || reps <= CONFIRM_MAX_REPS)));
  tempoPend = tOn && !manualEx ? { ts: rec.timestamp, ex, reps } : null; if (tOn) tempoLog(ex, reps, 'asked');
  showToast(L.t('w.saved', { ex: exName(ex), r: reps, kg: L.kgf(rec.kg) }) + (tempoPend ? ' · ' + L.t('w.tempoQ') : unsure ? ' · ' + L.t('w.unsure') : ''), rec.timestamp, unsure);
  renderWorkout(); return rec;
}
const CONFIRM_MAX_REPS = 3; // v8.20: auto sets with this few reps count as uncertain
function showToast(text, ts, ask) {
  $('toastTx').textContent = text; $('toast').classList.add('on');
  $('tYes').style.display = $('tNo').style.display = ask && ts ? '' : 'none';
  $('tYes').onclick = () => { if (tempoPend && tempoPend.ts === ts) { tempoLog(tempoPend.ex, tempoPend.reps, 'kept'); tempoPend = null; } store.updateSet(ts, { unsure: false }); const r = store.sets().find(x => x.timestamp === ts); fbLabel(ts, 'edit', r ? { reps: r.reps, kg: r.kg, exercise: r.exercise } : undefined); hideToast(); showToast(L.t('w.kept')); };
  $('tNo').onclick = () => $('tUndo').onclick();
  $('tUndo').style.display = $('tEdit').style.display = ts ? '' : 'none';
  if (ask && ts) $('tUndo').style.display = 'none'; // ✗ does the same as Angre
  $('tUndo').onclick = () => { if (tempoPend && tempoPend.ts === ts) { tempoLog(tempoPend.ex, tempoPend.reps, 'removed-user'); tempoPend = null; } fbLabel(ts, 'delete'); const sid = store.sessionOf(ts); store.deleteSet(ts); stravaResync(sid); hideToast(); showToast(L.t('w.undone')); renderWorkout(); };
  $('tEdit').onclick = () => { if (tempoPend && tempoPend.ts === ts) { tempoLog(tempoPend.ex, tempoPend.reps, 'edited'); tempoPend = null; } hideToast(); openEdit(ts, renderWorkout); };
  // v8.9: a saved set's toast (Angre/Endre) stays until the NEXT set has started, and at least SET_TOAST_MIN_MS (60 s);
  // it used to vanish after 7 s. Plain notices still disappear after 2.5 s.
  clearTimeout(toastT); setToast = ts ? { at: Date.now() } : null; toastT = setTimeout(hideToast, ts ? SET_TOAST_MAX_MS : 2500);
}
const SET_TOAST_MIN_MS = 60e3, SET_TOAST_MAX_MS = 15 * 60e3;
let setToast = null;
// called every frame: hide the set toast once the next set is under way (a rep counted) and the minimum time has passed
function setToastTick() { if (setToast && currentReps() > 0 && Date.now() - setToast.at >= SET_TOAST_MIN_MS) hideToast(); }
$('fbMiss').onclick = () => { fbCut({ exercise: curEx(), reps: currentReps(), kg: kgFor(curEx() || 'knebøy') }, null, Feedback.labelFrom({}, 'missed')); showToast(L.t('fb.missedOk')); };
function hideToast() { $('toast').classList.remove('on'); setToast = null;
  // v8.25 (Rune): no answer KEEPS the set, marked 'usikker' in the log/history to fix later; no label is sent (not ground truth), Strava keeps it
  if (tempoPend) { const p = tempoPend; tempoPend = null; if (store.sets().some(x => x.timestamp === p.ts)) { store.updateSet(p.ts, { unsure: true }); tempoLog(p.ex, p.reps, 'kept-noanswer'); renderWorkout(); } } }
// v8.24 tempo decisions, kept locally for measuring the rule after a session (also in each clip's feedback meta)
let tempoPend = null;
function tempoLog(ex, reps, outcome) { try { const a = JSON.parse(LS.getItem('repcam.tempo.log') || '[]'); a.push({ at: new Date().toISOString(), ex, reps, outcome }); LS.setItem('repcam.tempo.log', JSON.stringify(a.slice(-200))); } catch {} console.info('[tempo]', outcome, ex, reps); }
$('confirm').onclick = () => { saveSet(); };
function enterWorkout() {
  const resumed = !!store.active();
  const a = store.startSession(); resetCounters(); recognizer.reset(); picker.reset(); camGate.reset(); restGate.rest(-1e12); camPaused = false; motion.resume(); autoEx = null; manualEx = a.manualEx || null; lastActivity = Date.now(); renderWorkout();
  wake.on();
  if (!stream && !pending) { setStartUI(resumed); if (resumed) runCam(getCam(facing), true); }
  clearInterval(tick); tick = setInterval(() => {
    const a = store.active(); if (!a) return; const s = Math.floor((Date.now() - new Date(a.start)) / 1000);
    $('elapsed').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    if (document.visibilityState === 'visible') { if (s % 5 === 0) store.touchActive({ seen: Date.now() }); }
    if (camLive() && Date.now() - lastActivity > IDLE_END_MS) { endedByIdle = true; location.hash = '#/'; }
  }, 1000);
}
function setStartUI(resume) {
  $('start').style.display = 'flex'; $('go').disabled = false; $('help').style.display = 'none'; $('status').textContent = '';
  $('startT').textContent = L.t(resume ? 'w.resumeT' : 'start.title'); $('startTx').textContent = L.t(resume ? 'w.resumeTx' : 'start.text');
  $('go').textContent = L.t(resume ? 'w.resume' : 'start.go'); $('go').classList.toggle('big', !!resume);
}
const camLive = () => !!stream && stream.getVideoTracks().some(t => t.readyState === 'live');
let endedByIdle = false, endAt = null, hiddenAt = 0;
// Backgrounded (other app, lock screen) or camera killed by iOS: keep the session, save any half-counted set, and come back without extra taps.
function onHide() {
  if (cur !== 'okt' || !store.active()) return;
  hiddenAt = Date.now(); finishPending(); fbStop();
  store.touchActive({ seen: hiddenAt, manualEx });
}
function onShow() {
  stravaSync();
  if (cur !== 'okt' || !store.active()) return;
  const away = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = 0;
  if (away && Date.now() - lastActivity > AWAY_END_MS) { endAt = new Date(Date.now() - away); endedByIdle = true; location.hash = '#/'; return; }
  lastActivity += away; // time away doesn't count toward the on-screen idle rule
  store.touchActive({ seen: Date.now() });
  resumeCam(); fitStageSoon(true);
}
// v8.17 bug: back from the app switcher (iOS PWA/Safari) the camera view could come back much smaller, framed by black.
// iOS can resume with a stale layout: the viewport scale/size from while the app was hidden (rotated or resized in the
// background, no resize event delivered) and a video layer that keeps its old geometry after the camera stream is
// restarted. On every resume/resize: reset the viewport meta (forces scale 1), re-layout the stage, re-bind the stream to
// the <video> (WebKit then re-computes object-fit) and let the loop re-size the canvas. Kill switch: localStorage repcam.fitOff=1.
const FIT_CFG = { enabled: LS.getItem('repcam.fitOff') !== '1', delaysMs: [0, 250, 1000] };
let fitTimers = [];
function fitStage(rebind) {
  if (!FIT_CFG.enabled) return;
  try {
    const m = document.querySelector('meta[name=viewport]'); if (m) { const c0 = m.content; m.content = c0 + ',maximum-scale=1'; m.content = c0; }
    const st = $('stage'); if (st) { st.style.display = 'none'; void st.offsetHeight; st.style.display = ''; }
    if (rebind && stream && v.srcObject === stream) { v.srcObject = null; v.srcObject = stream; v.play().catch(() => {}); }
    c.width = 0; // loop() re-sizes the canvas to the (possibly new) stream resolution on the next frame
  } catch (e) { console.warn('fitStage', e); }
}
function fitStageSoon(rebind) { fitTimers.forEach(clearTimeout); fitTimers = FIT_CFG.delaysMs.map((d, i) => setTimeout(() => fitStage(rebind && i === 0), d)); }
addEventListener('resize', () => fitStageSoon(false)); addEventListener('orientationchange', () => fitStageSoon(false));
window.visualViewport?.addEventListener('resize', () => fitStageSoon(false));
v.addEventListener('resize', () => fitStageSoon(false)); // the stream's resolution/orientation changed
function resumeCam() {
  if (pending || cur !== 'okt') return;
  motion.resume();
  if (camLive()) { if (v.paused) v.play().catch(() => setStartUI(true)); if (!fb.rec) fbStart(); return; }
  runCam(getCam(facing), true); // no gesture: works if iOS still has permission; otherwise the big «Fortsett» shows
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' ? onHide() : onShow());
addEventListener('pagehide', onHide);
addEventListener('pageshow', e => { if (e.persisted) onShow(); });
function leaveWorkout() {
  finishPending();
  hideToast(); clearInterval(tick); cancelAnimationFrame(raf); raf = 0; wake.off(); fbStop();
  stream?.getTracks().forEach(t => t.stop()); stream = null; v.srcObject = null;
  const sum = store.endSession(endAt || new Date()), idle = endedByIdle; endedByIdle = false; endAt = null;
  if (sum && sum.sets) { queueStrava(sum); stravaSync(); setTimeout(() => showSummary(sum, idle), 150); }
}
function showSummary(s, idle) {
  openSheet(`<h3>${L.t('sum.title')}</h3><div class="muted">${idle ? L.t('w.ended') + '. ' : ''}${L.t('sum.text')}</div>
  <div class="stats"><div class="stat"><span class="muted">${L.t('sum.sets')}</span><b>${s.sets}</b></div><div class="stat"><span class="muted">${L.t('sum.reps')}</span><b>${s.reps}</b></div>
  <div class="stat"><span class="muted">${L.t('sum.vol')}</span><b>${L.nf(s.volume)} kg</b></div><div class="stat"><span class="muted">${L.t('sum.dur')}</span><b>${L.t('sum.min', { n: s.durationMin < 1 ? '< 1' : s.durationMin })}</b></div></div>
  <button class="grad" id="sumOk">${L.t('sum.done')}</button>`);
  $('sumOk').onclick = closeSheet;
}
$('finish').onclick = $('close').onclick = $('back').onclick = () => { location.hash = '#/'; };

async function initModel() {
  ({ PoseLandmarker, FilesetResolver, DrawingUtils } = await import(VISION));
  const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  const opts = d => ({ baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", delegate: d }, runningMode: "VIDEO", numPoses: 1 });
  try { return await PoseLandmarker.createFromOptions(fs, opts("GPU")); }
  catch (e) { console.warn('GPU failed, using CPU', e); return await PoseLandmarker.createFromOptions(fs, opts("CPU")); }
}
const UA = navigator.userAgent;
const inApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|Snapchat|LinkedInApp|Twitter|TikTok|musical_ly|GSA\/|MicroMessenger|; wv\)/i.test(UA)
  || (/iPhone|iPad|iPod/.test(UA) && /AppleWebKit/.test(UA) && !/Safari\//.test(UA));
function getCam(f) {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return Promise.reject(Object.assign(new Error('getUserMedia missing'), { name: 'NoMediaDevices' }));
  return md.getUserMedia({ audio: false, video: { facingMode: { ideal: f }, width: { ideal: 1280 }, height: { ideal: 720 } } })
    .catch(e => (e.name === 'OverconstrainedError' || e.name === 'NotFoundError') ? md.getUserMedia({ audio: false, video: true }) : Promise.reject(e));
}
async function attach(s) {
  stream?.getTracks().forEach(t => t.stop());
  stream = s; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('autoplay', '');
  s.getVideoTracks().forEach(t => t.addEventListener('ended', () => { if (stream === s && document.visibilityState === 'visible') setTimeout(resumeCam, 300); }));
  v.srcObject = s; await v.play(); fitStageSoon(false);
  if (cur === 'okt') fbStart();
  [v, c].forEach(el => el.classList.toggle('mirror', facing === 'user'));
}
function showHelp(e) {
  $('help').style.display = 'block';
  const k = (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'NoMediaDevices') ? 'help.denied' : e.name === 'NotFoundError' ? 'help.nocam' : e.name === 'NotReadableError' ? 'help.busy' : 'help.other';
  $('helptext').innerHTML = L.t(k, { m: esc(e.message) });
}
$('copy').onclick = async () => { try { await navigator.clipboard.writeText(location.href); $('copy').textContent = L.t('start.copied'); } catch { prompt(L.t('start.copy'), location.href); } };
function runCam(camP, resume) {
  const st = $('status'), go = $('go');
  pending = true; go.disabled = true; st.textContent = L.t('start.cam');
  camP.then(attach).then(() => {
    st.textContent = L.t('start.model');
    if (!modelP) modelP = initModel().then(m => landmarker = m);
    return modelP;
  }).then(() => { pending = false; if (cur !== 'okt') { stream?.getTracks().forEach(t => t.stop()); stream = null; return; } $('start').style.display = 'none'; st.textContent = ''; lastActivity = Date.now(); if (!fb.rec) fbStart(); renderWorkout(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); })
  .catch(e => { pending = false; console.warn(e); if (resume && cur === 'okt') { setStartUI(true); return; } $('start').style.display = 'flex'; st.textContent = L.t('start.err', { m: e.message }); showHelp(e); go.disabled = false; go.textContent = L.t('start.retry'); });
}
// Both buttons: getUserMedia MUST be the first call, synchronous in the tap (iOS user activation); the motion-sensor
// permission is asked in the same tap (iOS shows it once, after the camera prompt)
$('go').onclick = () => { const camP = getCam(facing); motion.enable(); wake.acquire(); runCam(camP); };
$('startOkt').onclick = () => {
  const camP = getCam(facing); motion.enable(); wake.on();
  $('start').style.display = 'flex'; location.hash = '#/okt'; runCam(camP);
};
$('flip').onclick = async () => { facing = facing === 'user' ? 'environment' : 'user'; try { await attach(await getCam(facing)); } catch (e) { alert(e.message); } };
function loop() {
  raf = requestAnimationFrame(loop);
  if (!landmarker || v.readyState < 2 || document.visibilityState !== 'visible') return;
  if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
  const ts = performance.now(); if (ts <= lastTs) return; lastTs = ts;
  const res = landmarker.detectForVideo(v, ts);
  ctx.clearRect(0, 0, c.width, c.height);
  const lm = res.landmarks?.[0], asp = v.videoWidth / v.videoHeight || 1;
  if (lm) {
    const du = new DrawingUtils(ctx);
    du.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: '#ff5a3c', lineWidth: 4 });
    du.drawLandmarks(lm, { color: '#ffffff', fillColor: '#ff2d87', radius: 4 });
  }
  processFrame(lm, ts, asp, motion.read());
}
// One video frame through gate → counters → recognizer → picker → UI (exposed for tests as __repcam.processFrame).
function processFrame(lm, ts, asp, sensor) {
  // v8.7: while the phone itself moves a lot (and briefly after), frames are ignored — no rep, no set start, no exercise switch
  const cg = camGate.update(lm, ts, asp, sensor), cam = !cg.ok;
  restGate.update(lm, ts, asp); // v8.15 shadow only: does not affect counting
  barFrame(lm, ts); // v8.16 shadow only
  if (cam !== camPaused) { camPaused = cam; $('hint').textContent = L.t(cam ? 'w.camMoving' : 'w.hint'); }
  let tracking = false;
  for (const id in counters) { const r = counters[id].update(lm, ts, asp, cam); if (id === curEx()) tracking = r.tracking; }
  // recognition (Reps.createPicker, same logic as the eval): switch only after a clear guess (score + margin) has held for
  // 1.5 s; lock once the set has 2+ reps. Counters are strict on their own (posture, visibility, paired first rep).
  const rc = recognizer.update(lm, ts, asp, cam), pk = picker.update(rc, ts);
  if (!manualEx && !lockEx && pk && pk !== autoEx) { autoEx = pk; renderWorkout(); }
  lastFrameT = ts / 1000;
  // v8.9: the set was locked (2 reps) on setup motion of another exercise -> follow the exercise that is really counting
  if (lockEx && !manualEx) { const nl = Reps.relock(counters, lockEx, pk, lastFrameT, rc.scores); if (nl !== lockEx) { lockEx = nl; autoEx = nl; renderWorkout(); } }
  const ex = curEx(), reps = currentReps();
  if (ex && !lockEx && !manualEx && reps >= 2) lockEx = ex;
  // v8.9: background counters forget stale reps (none for AUTOSAVE_MS) so switching to them later does not inherit old junk
  for (const id in counters) if (id !== ex && counters[id].reps > 0 && lastFrameT - counters[id].lastRepT > AUTOSAVE_MS / 1000) counters[id].forget();
  setToastTick();
  fbSample(lm, ts);
  if (fb.rec && reps > shownReps) for (let i = Math.max(shownReps, 0); i < reps; i++) fb.repT.push(ts);
  if (fb.rec && reps === 0 && !Reps.IDS.some(id => counters[id].tentative) && ts - fb.lastTrim > 2000) { fb.lastTrim = ts; fb.rec.trimIdle(30e3); }
  if (reps !== shownReps) { if (reps > shownReps && shownReps >= 0) navigator.vibrate?.(30); shownReps = reps; $('reps').textContent = reps; lastRepWall = Date.now(); if (reps > 0) lastActivity = Date.now(); }
  if (reps > 0 && Date.now() - lastRepWall > AUTOSAVE_MS) finishPending();
  $('hint').style.display = !cam && lm && (tracking || !ex) ? 'none' : 'block';
  $('ring').style.strokeDashoffset = 276.5 * (1 - (ex ? counters[ex].progress() : 0));
}
setLang();
if (inApp) { $('help').style.display = 'block'; $('helptext').innerHTML = L.t('help.inapp'); }
modelP = initModel().then(m => landmarker = m).catch(e => { modelP = null; throw e; });
modelP.catch(e => console.warn('model failed', e));
// Active session from a backgrounded/killed tab: resume it if it was alive recently, otherwise close it at the last moment it was seen.
{ const a = store.active();
  if (a) { const seen = new Date(a.seen || a.start).getTime();
    if (Date.now() - seen > AWAY_END_MS) { const sum = store.endSession(new Date(seen)); if (sum && sum.sets) queueStrava(sum); }
    else if (!/okt/.test(location.hash)) history.replaceState(null, '', '#/okt'); } }
route();
// Back from Strava's OAuth page (?code=…&state=…)
if (/[?&](code|error)=/.test(location.search)) {
  const foreign = !LS.getItem(Strava.KEYS.state), carry = Strava.parseState(location.search);
  // Landed in a context that doesn't have our profile (e.g. Safari instead of the home-screen app): restore it from `state`.
  if (carry && !LS.getItem('repcam.profile') && (carry.n || carry.b)) { saveProfile({ name: carry.n || '', bw: carry.b || null }); if (carry.l) LS.setItem('repcam.lang', carry.l); LS.setItem('repcam.onboarded', '1'); setLang(); }
  strava.handleRedirect(location.search).then(okk => { if (okk && foreign && !standalone) setTimeout(() => showToastGlobal(L.t('st.otherCtx')), 0); }).catch(e => console.warn('strava auth', e)).finally(() => { history.replaceState(null, '', location.pathname + '#/profil'); route(); stravaSync(); });
} else stravaSync();
if (cur !== 'okt') onboarding();
window.__repcam = { APP_VERSION, showToast, hideToast, tempoPendSet: p => { tempoPend = p; }, fbPending, fitStage, FIT_CFG, barTr, fb, fbQueue, fbUpload, store, strava, wake, AWAY_END_MS, counters: () => counters, curEx, saveSet, processFrame, motion, camPaused: () => camPaused, currentReps, stopLoop: () => { cancelAnimationFrame(raf); raf = 0; landmarker = null; }, I18n, lang: () => L.lang };
