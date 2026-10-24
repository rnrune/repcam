// Newrun Lift feedback clips (R2, private). Routes under /fb/. Install auth: trust-on-first-use per-install token
// (the app generates installId + 32-byte random token; the worker stores only SHA-256(token) at installs/<id>.json).
// Admin reads need Authorization: Bearer <FB_ADMIN_SECRET> (worker secret). No public read of anything.
const MAX_CLIP = 50 * 1024 * 1024, MAX_JSON = 2 * 1024 * 1024, MAX_PER_DAY = 300;
const ID = /^[A-Za-z0-9_-]{6,64}$/;
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const eq = (a, b) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;
const json = (o, status, h) => new Response(JSON.stringify(o), { status: status || 200, headers: { ...h, 'Content-Type': 'application/json' } });

async function auth(req, env) {
  const inst = req.headers.get('X-Install') || '', tok = req.headers.get('X-Token') || '';
  if (!ID.test(inst) || tok.length < 32 || tok.length > 128) return { err: 'auth' };
  const key = 'installs/' + inst + '.json', h = await sha(tok), day = new Date().toISOString().slice(0, 10);
  const o = await env.FB.get(key);
  let rec = o ? await o.json() : null;
  if (rec && !eq(rec.h, h)) return { err: 'auth' };
  if (!rec) rec = { h, created: new Date().toISOString(), day, n: 0 };
  if (rec.day !== day) { rec.day = day; rec.n = 0; }
  return { inst, rec, key };
}
async function bump(env, a) { a.rec.n++; await env.FB.put(a.key, JSON.stringify(a.rec)); }

export async function handleFeedback(req, env, cors) {
  const url = new URL(req.url), p = url.pathname;
  if (!env.FB) return json({ error: 'storage not configured' }, 503, cors);
  // ---- admin (box-side pull script)
  if (p.startsWith('/fb/admin/')) {
    const want = env.FB_ADMIN_SECRET || '', got = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (!want || !eq(want, got)) return json({ error: 'forbidden' }, 403);
    if (p === '/fb/admin/list') {
      const r = await env.FB.list({ prefix: url.searchParams.get('prefix') || 'clips/', cursor: url.searchParams.get('cursor') || undefined, limit: 1000 });
      return json({ objects: r.objects.map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded })), cursor: r.truncated ? r.cursor : null });
    }
    if (p === '/fb/admin/get') {
      const o = await env.FB.get(url.searchParams.get('key') || ''); if (!o) return json({ error: 'not found' }, 404);
      return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType || 'application/octet-stream' } });
    }
    if (p === '/fb/admin/delete' && req.method === 'POST') { await env.FB.delete(url.searchParams.get('key') || ''); return json({ ok: true }); }
    return json({ error: 'not found' }, 404);
  }
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || 'https://rnrune.github.io').split(',').map(s => s.trim());
  if (!allowed.includes(origin)) return json({ error: 'forbidden' }, 403, cors);
  const a = await auth(req, env); if (a.err) return json({ error: 'auth' }, 401, cors);
  if (a.rec.n >= MAX_PER_DAY) return json({ error: 'rate' }, 429, cors);
  const m = p.match(/^\/fb\/(clip|meta|label)\/([A-Za-z0-9_-]{6,64})$/);
  if (!m || (req.method !== 'PUT' && req.method !== 'POST')) return json({ error: 'not found' }, 404, cors);
  const [, kind, id] = m, base = 'clips/' + a.inst + '/' + id;
  const len = +(req.headers.get('Content-Length') || 0);
  if (kind === 'clip') {
    if (!len || len > MAX_CLIP) return json({ error: 'size' }, 413, cors);
    const ct = (req.headers.get('Content-Type') || 'video/mp4').split(';')[0];
    if (!/^video\/(mp4|webm|quicktime)$/.test(ct)) return json({ error: 'type' }, 415, cors);
    await env.FB.put(base + '.' + (ct === 'video/webm' ? 'webm' : 'mp4'), req.body, { httpMetadata: { contentType: ct } });
  } else {
    const t = await req.text(); if (t.length > MAX_JSON) return json({ error: 'size' }, 413, cors);
    let o; try { o = JSON.parse(t); } catch { return json({ error: 'bad json' }, 400, cors); }
    o._received = new Date().toISOString();
    await env.FB.put(base + '.' + kind + '.json', JSON.stringify(o), { httpMetadata: { contentType: 'application/json' } });
  }
  await bump(env, a);
  return json({ ok: true, key: base }, 200, cors);
}
