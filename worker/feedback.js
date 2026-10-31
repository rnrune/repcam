// Newrun Lift feedback clips (private Dropbox storage). Routes under /fb/. Install auth: trust-on-first-use per-install token
// (the app generates installId + 32-byte random token; the worker stores only SHA-256(token) at installs/<id>.json).
// Admin reads need Authorization: Bearer <FB_ADMIN_SECRET> (worker secret). No public read of anything.
// Storage: Dropbox HTTP API with a long-lived refresh token (secrets DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN).
// Intended for an "App folder" Dropbox app named «Newrun Lift-klipp» → files live in /Apps/Newrun Lift-klipp/ and the app can't
// see anything else. DROPBOX_ROOT (var, default "") is prepended to every path; only needed for a full-Dropbox app.
const MAX_CLIP = 50 * 1024 * 1024, MAX_JSON = 2 * 1024 * 1024, MAX_PER_DAY = 300;
const ID = /^[A-Za-z0-9_-]{6,64}$/;
const KEY = /^(clips\/[A-Za-z0-9_-]{6,64}\/[A-Za-z0-9_-]{6,64}\.(mp4|webm|meta\.json|label\.json)|installs\/[A-Za-z0-9_-]{6,64}\.json|nets\/[A-Za-z0-9_-]{6,64}\.json)$/;
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const eq = (a, b) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;
const json = (o, status, h) => new Response(JSON.stringify(o), { status: status || 200, headers: { ...h, 'Content-Type': 'application/json' } });
// Dropbox-API-Arg must be ASCII: escape non-ASCII as \uXXXX
const arg = o => JSON.stringify(o).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

let tokenCache = null; // { t, exp, k } per isolate
export function _resetTokenCache() { tokenCache = null; }

export function dropboxStore(env, fetchFn = fetch) {
  const root = (env.DROPBOX_ROOT || '').replace(/\/+$/, '');
  if (root && !/^\/[^/]/.test(root)) throw new Error('bad DROPBOX_ROOT');
  const full = key => { if (!KEY.test(key)) throw Object.assign(new Error('bad key'), { status: 400 }); return root + '/' + key; };
  const rel = p => { const r = root.toLowerCase(); return p.toLowerCase().startsWith(r + '/') ? p.slice(root.length + 1) : p.replace(/^\//, ''); };
  async function token(force) {
    const k = env.DROPBOX_APP_KEY + ':' + env.DROPBOX_REFRESH_TOKEN.slice(0, 8);
    if (!force && tokenCache && tokenCache.k === k && tokenCache.exp > Date.now()) return tokenCache.t;
    const r = await fetchFn('https://api.dropboxapi.com/oauth2/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(env.DROPBOX_APP_KEY + ':' + env.DROPBOX_APP_SECRET) },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.DROPBOX_REFRESH_TOKEN }).toString() });
    if (!r.ok) throw Object.assign(new Error('dropbox token ' + r.status), { status: 502 });
    const j = await r.json();
    tokenCache = { t: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in || 14400) - 300) * 1000, k };
    return tokenCache.t;
  }
  async function call(url, init) { // retries once on 401 (expired token) and once on 429/5xx
    for (let i = 0; ; i++) {
      const t = await token(i > 0 && init._401);
      const r = await fetchFn(url, { ...init, headers: { ...init.headers, Authorization: 'Bearer ' + t } });
      if (r.status === 401 && i === 0) { init._401 = true; continue; }
      if ((r.status === 429 || r.status >= 500) && i === 0) { await new Promise(s => setTimeout(s, +(r.headers.get('Retry-After') || 0) * 1000 || 300)); continue; }
      return r;
    }
  }
  const notFound = async r => r.status === 409 && /not_found/.test(await r.clone().text());
  const fail = async (r, what) => { throw Object.assign(new Error('dropbox ' + what + ' ' + r.status + ' ' + (await r.text()).slice(0, 200)), { status: 502 }); };
  return {
    async get(key) {
      const r = await call('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { 'Dropbox-API-Arg': arg({ path: full(key) }) } });
      if (await notFound(r)) return null; if (!r.ok) await fail(r, 'download');
      const ext = key.endsWith('.json') ? 'application/json' : key.endsWith('.webm') ? 'video/webm' : 'video/mp4';
      return { body: r.body, contentType: ext, json: () => r.json(), size: +(r.headers.get('Content-Length') || 0) };
    },
    async put(key, data) { // data: string | ArrayBuffer | Uint8Array
      const r = await call('https://content.dropboxapi.com/2/files/upload', { method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': arg({ path: full(key), mode: 'overwrite', autorename: false, mute: true }) }, body: data });
      if (!r.ok) await fail(r, 'upload');
      const j = await r.json(); return { key, size: j.size, content_hash: j.content_hash };
    },
    async list(prefix, cursor) {
      if (!/^clips\/([A-Za-z0-9_-]{6,64}\/)?$/.test(prefix)) throw Object.assign(new Error('bad prefix'), { status: 400 });
      const r = cursor
        ? await call('https://api.dropboxapi.com/2/files/list_folder/continue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor }) })
        : await call('https://api.dropboxapi.com/2/files/list_folder', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: root + '/' + prefix.replace(/\/$/, ''), recursive: true, limit: 1000 }) });
      if (!cursor && await notFound(r)) return { objects: [], cursor: null };
      if (!r.ok) await fail(r, 'list');
      const j = await r.json();
      return { objects: j.entries.filter(e => e['.tag'] === 'file').map(e => ({ key: rel(e.path_display), size: e.size, content_hash: e.content_hash, uploaded: e.server_modified })),
        cursor: j.has_more ? j.cursor : null };
    },
    async delete(key) {
      const r = await call('https://api.dropboxapi.com/2/files/delete_v2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: full(key) }) });
      if (await notFound(r)) return false; if (!r.ok) await fail(r, 'delete'); return true;
    },
  };
}

async function auth(req, st) {
  const inst = req.headers.get('X-Install') || '', tok = req.headers.get('X-Token') || '';
  if (!ID.test(inst) || tok.length < 32 || tok.length > 128) return { err: 'auth' };
  const key = 'installs/' + inst + '.json', h = await sha(tok), day = new Date().toISOString().slice(0, 10);
  const o = await st.get(key);
  let rec = o ? await o.json() : null;
  if (rec && !eq(rec.h, h)) return { err: 'auth' };
  if (!rec) rec = { h, created: new Date().toISOString(), day, n: 0 };
  if (rec.day !== day) { rec.day = day; rec.n = 0; }
  return { inst, rec, key };
}
export function netKey(ip) { ip = String(ip).trim(); if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return '4:' + ip;
  if (ip.includes(':')) { const [l, r = ''] = ip.split('::'), L = l ? l.split(':') : [], R = r ? r.split(':') : [], g = [...L, ...Array(Math.max(0, 8 - L.length - R.length)).fill('0'), ...R].map(x => (parseInt(x || '0', 16) || 0).toString(16)); return '6:' + g.slice(0, 4).join(':'); }
  return null; }
async function bump(st, a) { a.rec.n++; await st.put(a.key, JSON.stringify(a.rec)); }

export async function handleFeedback(req, env, cors, fetchFn) {
  try { return await route(req, env, cors, fetchFn); }
  catch (e) { return json({ error: e.status === 400 ? 'bad request' : 'storage error' }, e.status || 500, cors); }
}
async function route(req, env, cors, fetchFn) {
  const url = new URL(req.url), p = url.pathname;
  if (!env.DROPBOX_APP_KEY || !env.DROPBOX_APP_SECRET || !env.DROPBOX_REFRESH_TOKEN) return json({ error: 'storage not configured' }, 503, cors);
  const st = dropboxStore(env, fetchFn);
  // ---- admin (box-side pull script)
  if (p.startsWith('/fb/admin/')) {
    const want = env.FB_ADMIN_SECRET || '', got = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (!want || !eq(want, got)) return json({ error: 'forbidden' }, 403);
    if (p === '/fb/admin/list') return json(await st.list(url.searchParams.get('prefix') || 'clips/', url.searchParams.get('cursor') || undefined));
    const key = url.searchParams.get('key') || '';
    if (!key.startsWith('clips/')) return json({ error: 'bad key' }, 400);
    if (p === '/fb/admin/get') {
      const o = await st.get(key); if (!o) return json({ error: 'not found' }, 404);
      return new Response(o.body, { headers: { 'Content-Type': o.contentType } });
    }
    if (p === '/fb/admin/delete' && req.method === 'POST') return json({ ok: true, deleted: await st.delete(key) });
    return json({ error: 'not found' }, 404);
  }
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || 'https://rnrune.github.io').split(',').map(s => s.trim());
  if (!allowed.includes(origin)) return json({ error: 'forbidden' }, 403, cors);
  const a = await auth(req, st); if (a.err) return json({ error: 'auth' }, 401, cors);
  if (a.rec.n >= MAX_PER_DAY) return json({ error: 'rate' }, 429, cors);
  // v8.29 learned trusted networks (iOS cannot tell wifi from cellular): the app asks whether its current public IP is one
  // Rune marked as his wifi. Only a per-install salted SHA-256 of the IP is stored (IPv6: the /64 network prefix, which stays
  // stable on one wifi while iOS rotates the interface part). nets/<install>.json = { nets: [{ id, h, label, added, last }] }.
  if (p.startsWith('/fb/net/')) {
    if (req.method !== 'POST') return json({ error: 'not found' }, 404, cors);
    const ip = netKey(req.headers.get('CF-Connecting-IP') || ''); if (!ip) return json({ error: 'no ip' }, 400, cors);
    const h = await sha('net:' + a.inst + ':' + ip), nk = 'nets/' + a.inst + '.json';
    const o = await st.get(nk); const rec = o ? await o.json() : { nets: [] }; const cur = rec.nets.find(n => n.h === h);
    const now = new Date().toISOString(), pub = n => ({ id: n.id, label: n.label, added: n.added, last: n.last, current: n.h === h });
    let body = {}; try { body = JSON.parse(await req.text() || '{}'); } catch {}
    if (p === '/fb/net/check') { if (cur && (!cur.last || now.slice(0, 10) !== cur.last.slice(0, 10))) { cur.last = now; await st.put(nk, JSON.stringify(rec)); } return json({ trusted: !!cur, id: cur ? cur.id : null, label: cur ? cur.label : null }, 200, cors); }
    if (p === '/fb/net/list') return json({ nets: rec.nets.map(pub) }, 200, cors);
    if (p === '/fb/net/trust') { if (!cur) { if (rec.nets.length >= 20) rec.nets.shift(); rec.nets.push({ id: h.slice(0, 12), h, label: String(body.label || '').slice(0, 40) || 'Wifi', added: now, last: now }); }
      else if (body.label) cur.label = String(body.label).slice(0, 40);
      await st.put(nk, JSON.stringify(rec)); if (!o && !a.stored) await st.put(a.key, JSON.stringify(a.rec)); return json({ ok: true, trusted: true, nets: rec.nets.map(pub) }, 200, cors); }
    if (p === '/fb/net/forget') { rec.nets = rec.nets.filter(n => n.id !== body.id); await st.put(nk, JSON.stringify(rec)); return json({ ok: true, nets: rec.nets.map(pub) }, 200, cors); }
    return json({ error: 'not found' }, 404, cors);
  }
  const m = p.match(/^\/fb\/(clip|meta|label)\/([A-Za-z0-9_-]{6,64})$/);
  if (!m || (req.method !== 'PUT' && req.method !== 'POST')) return json({ error: 'not found' }, 404, cors);
  const [, kind, id] = m, base = 'clips/' + a.inst + '/' + id;
  const len = +(req.headers.get('Content-Length') || 0);
  if (kind === 'clip') {
    if (!len || len > MAX_CLIP) return json({ error: 'size' }, 413, cors);
    const ct = (req.headers.get('Content-Type') || 'video/mp4').split(';')[0];
    if (!/^video\/(mp4|webm|quicktime)$/.test(ct)) return json({ error: 'type' }, 415, cors);
    const buf = await req.arrayBuffer();
    if (buf.byteLength !== len || buf.byteLength > MAX_CLIP) return json({ error: 'size' }, 413, cors);
    await st.put(base + '.' + (ct === 'video/webm' ? 'webm' : 'mp4'), buf);
  } else {
    const t = await req.text(); if (t.length > MAX_JSON) return json({ error: 'size' }, 413, cors);
    let o; try { o = JSON.parse(t); } catch { return json({ error: 'bad json' }, 400, cors); }
    o._received = new Date().toISOString();
    await st.put(base + '.' + kind + '.json', JSON.stringify(o));
  }
  await bump(st, a);
  return json({ ok: true, key: base }, 200, cors);
}
