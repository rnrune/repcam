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
const strava = Strava.createClient({ ls: localStorage, fetch: (...x) => fetch(...x), config: window.REPCAM_STRAVA || {} });
const stravaFmt = () => ({ name: exName, kgf: L.kgf, title: L.t('st.actName') });
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
function openSheet(html, onClose) { $('sheet').innerHTML = '<div class="grab"></div>' + html; $('sheet').classList.add('on'); $('sheetBg').classList.add('on'); sheetClose = onClose || null; }
function closeSheet() { $('sheet').classList.remove('on'); $('sheetBg').classList.remove('on'); const f = sheetClose; sheetClose = null; f?.(); }
$('sheetBg').onclick = closeSheet;
function confirmDialog(title, text, okLabel) {
  return new Promise(res => {
    openSheet(`<h3>${title}</h3><div class="muted">${text}</div><div class="btns" style="margin-top:18px"><button class="ghost" id="dNo">${L.t('edit.cancel')}</button><button class="grad danger" id="dYes" style="margin-top:8px">${okLabel}</button></div>`);
    $('dNo').onclick = () => { closeSheet(); res(false); }; $('dYes').onclick = () => { closeSheet(); res(true); };
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
    <button class="grad" id="eSave">${L.t('edit.save')}</button><div class="btns"><button class="ghost" id="eDel">${L.t('edit.delete')}</button><button class="ghost" id="eNo">${L.t('edit.cancel')}</button></div>`);
  const sh = $('sheet'); wireSteppers(sh);
  sh.querySelectorAll('.exgrid button').forEach(b => b.onclick = () => { ex = b.dataset.ex; sh.querySelectorAll('.exgrid button').forEach(x => x.classList.toggle('on', x === b)); });
  $('eSave').onclick = () => { store.updateSet(ts, { reps: parseNum($('eReps').value), kg: parseNum($('eKg').value), exercise: ex }); setKgFor(ex, parseNum($('eKg').value)); closeSheet(); after?.(); };
  $('eNo').onclick = closeSheet;
  $('eDel').onclick = async () => { if (await confirmDialog(L.t('del.title'), L.t('del.text'), L.t('del.ok'))) { store.deleteSet(ts); after?.(); } };
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
function renderHome() {
  const h = new Date().getHours(), name = profile().name;
  const g = L.t(h < 5 ? 'greet.night' : h < 10 ? 'greet.morning' : h < 17 ? 'greet.day' : h < 23 ? 'greet.evening' : 'greet.night');
  $('greet').textContent = name ? g + ', ' + name : g;
  $('avatar').textContent = (name || '🙂')[0].toUpperCase();
  $('title').textContent = L.t(h < 12 ? 'title.morning' : h < 17 ? 'title.day' : 'title.evening');
  const all = store.sets(), today = Store.todaySets(all), groups = Store.groupByExercise(today);
  $('todayVol').textContent = today.length ? L.t('home.total', { v: L.nf(Store.volume(today)) }) : '';
  renderStravaNote();
  $('todayList').innerHTML = groups.length ? groups.map(g => `<div class="card"><div class="ex"><div class="ex-ic">${g.icon}</div><div class="ex-main"><b>${esc(exName(g.id))}</b><span class="muted">${groupLabel(g)}</span></div><span class="badge">${L.kgf(g.topKg)}</span></div>
    <div class="ex-foot"><div><div class="muted small" style="margin:0">${L.t('home.volume')}</div><b>${L.nf(g.volume)} kg</b></div>${spark(Store.kgHistory(all, g.id))}</div></div>`).join('')
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
    out += `<div class="card"><div class="row"><b>${L.hm(s.start)}–${L.hm(s.end)}</b><span class="muted">${L.t('sets', { n: s.sets.length })} · ${L.nf(s.volume)} kg</span></div>` +
      s.sets.map(x => `<div class="setrow" data-ts="${esc(x.timestamp)}" role="button" tabindex="0"><span>${icon(x.exercise)} ${esc(exName(x.exercise || 'knebøy'))} · <b>${L.t('reps', { n: x.reps })}</b> × ${L.kgf(x.kg)}</span><span class="muted">✎</span></div>`).join('') + '</div>';
  }
  $('histList').innerHTML = out;
}
$('histList').onclick = e => { const r = e.target.closest('.setrow'); if (r) openEdit(r.dataset.ts, renderHist); };
/* ---------- Strava ---------- */
function renderStravaNote() {
  const nm = strava.connected() ? strava.queue().filter(x => x.status === 'nomatch') : [];
  $('stravaNote').innerHTML = nm.map(x => `<div class="card"><div class="muted">${L.t('st.nomatch', { d: esc(L.date(x.start, { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + L.hm(x.start)) })}</div><button class="btn" data-create="${esc(x.id)}">${L.t('st.create')}</button></div>`).join('');
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
  if (stravaBusy || !strava.connected() || !strava.queue().some(x => x.status === 'waiting' || x.status === 'creating')) return;
  stravaBusy = true; try { await strava.process(stravaFmt()); } catch (e) { console.warn('strava', e); } stravaBusy = false;
  if (cur === 'profil') renderStrava(); if (cur === 'home') renderStravaNote();
}
function renderProf() {
  renderStrava();
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
let lastRepWall = 0, lastActivity = Date.now(), shownReps = -1, toastT = 0;
const DEFAULT_KG = { knebøy: 20, bulgarsk: 0, pullups: 0, dips: 0, benkpress: 20, skråbenk: 20, halvmark: 40, roing: 30, armhevinger: 0, situps: 0 };
function kgFor(ex) { const x = LS.getItem('repcam.kg.' + ex); if (x != null) return +x; const l = store.lastKg(ex); return l != null ? l : (DEFAULT_KG[ex] ?? 0); }
function setKgFor(ex, x) { LS.setItem('repcam.kg.' + ex, Math.max(0, Math.round(x * 100) / 100)); }
const curEx = () => manualEx || lockEx || autoEx;
function resetCounters() { counters = {}; for (const id of Reps.IDS) counters[id] = Reps.createCounter(id); lockEx = null; shownReps = -1; lastRepWall = 0; }
function currentReps() { const e = curEx(); return e ? counters[e].reps : 0; }
function renderWorkout() {
  const a = store.active(), mine = a ? store.sets().filter(s => s.sessionId === a.id) : [], ex = curEx();
  $('setno').textContent = L.t('w.set', { n: mine.length + 1 });
  $('exIc').textContent = ex ? icon(ex) : '✨';
  $('exName').textContent = ex ? (manualEx ? '' : L.t('w.auto') + ': ') + exName(ex) : L.t('w.detecting');
  $('kg').textContent = L.kgf(kgFor(ex || 'knebøy'));
  $('log').innerHTML = mine.slice(-3).reverse().map(x => `${L.hm(x.timestamp)} · ${esc(exName(x.exercise))} · ${L.t('reps', { n: x.reps })} × ${L.kgf(x.kg)}`).join('<br>');
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
function finishPending() { const r = currentReps(); if (r >= MIN_AUTO_REPS) return saveSet(); if (r > 0) resetCounters(); return null; }
function saveSet() {
  const ex = curEx(); if (!ex) return null;
  const reps = counters[ex].flush(); if (!reps) return null;
  const rec = store.addSet({ exercise: ex, reps, kg: kgFor(ex) });
  resetCounters(); navigator.vibrate?.([40, 60, 40]);
  showToast(L.t('w.saved', { ex: exName(ex), r: reps, kg: L.kgf(rec.kg) }), rec.timestamp);
  renderWorkout(); return rec;
}
function showToast(text, ts) {
  $('toastTx').textContent = text; $('toast').classList.add('on');
  $('tUndo').style.display = $('tEdit').style.display = ts ? '' : 'none';
  $('tUndo').onclick = () => { store.deleteSet(ts); hideToast(); showToast(L.t('w.undone')); renderWorkout(); };
  $('tEdit').onclick = () => { hideToast(); openEdit(ts, renderWorkout); };
  clearTimeout(toastT); toastT = setTimeout(hideToast, ts ? 7000 : 2500);
}
function hideToast() { $('toast').classList.remove('on'); }
$('confirm').onclick = () => { saveSet(); };
function enterWorkout() {
  const resumed = !!store.active();
  const a = store.startSession(); resetCounters(); recognizer.reset(); picker.reset(); autoEx = null; manualEx = a.manualEx || null; lastActivity = Date.now(); renderWorkout();
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
  hiddenAt = Date.now(); finishPending();
  store.touchActive({ seen: hiddenAt, manualEx });
}
function onShow() {
  stravaSync();
  if (cur !== 'okt' || !store.active()) return;
  const away = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = 0;
  if (away && Date.now() - lastActivity > AWAY_END_MS) { endAt = new Date(Date.now() - away); endedByIdle = true; location.hash = '#/'; return; }
  lastActivity += away; // time away doesn't count toward the on-screen idle rule
  store.touchActive({ seen: Date.now() });
  resumeCam();
}
function resumeCam() {
  if (pending || cur !== 'okt') return;
  if (camLive()) { if (v.paused) v.play().catch(() => setStartUI(true)); return; }
  runCam(getCam(facing), true); // no gesture: works if iOS still has permission; otherwise the big «Fortsett» shows
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' ? onHide() : onShow());
addEventListener('pagehide', onHide);
addEventListener('pageshow', e => { if (e.persisted) onShow(); });
function leaveWorkout() {
  finishPending();
  hideToast(); clearInterval(tick); cancelAnimationFrame(raf); raf = 0; wake.off();
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
  v.srcObject = s; await v.play();
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
  }).then(() => { pending = false; if (cur !== 'okt') { stream?.getTracks().forEach(t => t.stop()); stream = null; return; } $('start').style.display = 'none'; st.textContent = ''; lastActivity = Date.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); })
  .catch(e => { pending = false; console.warn(e); if (resume && cur === 'okt') { setStartUI(true); return; } $('start').style.display = 'flex'; st.textContent = L.t('start.err', { m: e.message }); showHelp(e); go.disabled = false; go.textContent = L.t('start.retry'); });
}
// Both buttons: getUserMedia MUST be the first call, synchronous in the tap (iOS user activation)
$('go').onclick = () => { const camP = getCam(facing); wake.acquire(); runCam(camP); };
$('startOkt').onclick = () => {
  const camP = getCam(facing); wake.on();
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
  let tracking = false;
  for (const id in counters) { const r = counters[id].update(lm, ts, asp); if (id === curEx()) tracking = r.tracking; }
  // recognition (Reps.createPicker, same logic as the eval): switch only after a clear guess (score + margin) has held for
  // 1.5 s; lock once the set has 2+ reps. Counters are strict on their own (posture, visibility, paired first rep).
  const rc = recognizer.update(lm, ts, asp), pk = picker.update(rc, ts);
  if (!manualEx && !lockEx && pk && pk !== autoEx) { autoEx = pk; renderWorkout(); }
  const ex = curEx(), reps = currentReps();
  if (ex && !lockEx && !manualEx && reps >= 2) lockEx = ex;
  if (reps !== shownReps) { if (reps > shownReps && shownReps >= 0) navigator.vibrate?.(30); shownReps = reps; $('reps').textContent = reps; lastRepWall = Date.now(); if (reps > 0) lastActivity = Date.now(); }
  if (reps > 0 && Date.now() - lastRepWall > AUTOSAVE_MS) finishPending();
  $('hint').style.display = lm && (tracking || !ex) ? 'none' : 'block';
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
window.__repcam = { store, strava, wake, AWAY_END_MS, counters: () => counters, curEx, saveSet, I18n, lang: () => L.lang };
