// Unit tests for worker/feedback.js against a mocked Dropbox HTTP API (token refresh, upload, download, list, delete),
// plus Dropbox content_hash (eval/feedback/dbx-hash.js) and pull.sh end-to-end against a local mock worker.
import { handleFeedback, _resetTokenCache } from './worker/feedback.js';
import assert from 'assert'; import http from 'http'; import fs from 'fs'; import os from 'os'; import path from 'path'; import crypto from 'crypto';
import { execFile } from 'child_process'; import { createRequire } from 'module';
const { dropboxHash } = createRequire(import.meta.url)('./eval/feedback/dbx-hash.js');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const dbxHashBuf = b => { const o = crypto.createHash('sha256'); for (let i = 0; i < b.length; i += 4 << 20) o.update(crypto.createHash('sha256').update(b.subarray(i, i + (4 << 20))).digest()); return o.digest('hex'); };

function mockDropbox() {
  const files = new Map(), log = []; let tokens = 0, expireNext = false, valid = new Set();
  const res = (body, status = 200, h = {}) => new Response(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), { status, headers: h });
  const nf = tag => res({ error_summary: tag + '/not_found/..', error: {} }, 409);
  const fetch = async (url, init) => {
    log.push(url);
    if (url.endsWith('/oauth2/token')) {
      assert.equal(init.headers.Authorization, 'Basic ' + btoa('KEY:SECRET'));
      const p = new URLSearchParams(init.body); assert.equal(p.get('grant_type'), 'refresh_token');
      if (p.get('refresh_token') !== 'REFRESH') return res({ error: 'invalid_grant' }, 400);
      const t = 'AT' + (++tokens); valid.add(t); return res({ access_token: t, expires_in: 14400, token_type: 'bearer' });
    }
    const t = (init.headers.Authorization || '').replace('Bearer ', '');
    if (expireNext) { expireNext = false; valid.delete(t); }
    if (!valid.has(t)) return res({ error_summary: 'expired_access_token/' }, 401);
    const a = init.headers['Dropbox-API-Arg'] ? JSON.parse(init.headers['Dropbox-API-Arg']) : JSON.parse(init.body || '{}');
    if (url.endsWith('/2/files/upload')) {
      assert.equal(a.mode, 'overwrite'); const b = new Uint8Array(typeof init.body === 'string' ? new TextEncoder().encode(init.body) : init.body);
      files.set(a.path.toLowerCase(), { path: a.path, b, t: new Date().toISOString() }); return res({ size: b.length, content_hash: dbxHashBuf(Buffer.from(b)), path_display: a.path });
    }
    if (url.endsWith('/2/files/download')) { const f = files.get(a.path.toLowerCase()); return f ? res(f.b, 200, { 'Content-Length': '' + f.b.length }) : nf('path'); }
    if (url.endsWith('/2/files/delete_v2')) { return files.delete(a.path.toLowerCase()) ? res({ metadata: {} }) : nf('path_lookup'); }
    if (url.endsWith('/2/files/list_folder') || url.endsWith('/list_folder/continue')) {
      let start = 0, p = a.path;
      if (a.cursor) [p, start] = JSON.parse(a.cursor);
      const all = [...files.values()].filter(f => f.path.toLowerCase().startsWith(p.toLowerCase() + '/')).sort((x, y) => x.path < y.path ? -1 : 1);
      if (!a.cursor && !all.length) return nf('path');
      const page = all.slice(start, start + 2), more = start + 2 < all.length;
      return res({ entries: [{ '.tag': 'folder', path_display: p }, ...page.map(f => ({ '.tag': 'file', path_display: f.path, size: f.b.length, content_hash: dbxHashBuf(Buffer.from(f.b)), server_modified: f.t }))],
        has_more: more, cursor: JSON.stringify([p, start + 2]) });
    }
    return res('?', 404);
  };
  return { fetch, files, log, expire: () => { expireNext = true; }, tokens: () => tokens };
}

const ORIGIN = 'https://rnrune.github.io', TOK = 'x'.repeat(40), INST = 'inst0001';
const env0 = { DROPBOX_APP_KEY: 'KEY', DROPBOX_APP_SECRET: 'SECRET', DROPBOX_REFRESH_TOKEN: 'REFRESH', FB_ADMIN_SECRET: 'adminsecret', ALLOWED_ORIGINS: ORIGIN };
const req = (p, o = {}) => new Request('https://w.test' + p, { method: o.method || 'PUT', body: o.body, headers: { Origin: ORIGIN, 'X-Install': o.inst || INST, 'X-Token': o.tok || TOK, ...(o.h || {}) } });
const adm = (p, m = 'GET', s = 'adminsecret') => new Request('https://w.test' + p, { method: m, headers: { Authorization: 'Bearer ' + s } });

(async () => {
  // not configured → 503, no Dropbox calls
  let d = mockDropbox(); _resetTokenCache();
  let r = await handleFeedback(req('/fb/meta/clip0001', { body: '{}' }), { ...env0, DROPBOX_REFRESH_TOKEN: '' }, {}, d.fetch);
  ok(r.status === 503 && d.log.length === 0, 'missing creds → 503');

  for (const root of ['', '/Newrun Lift-klipp']) {
    d = mockDropbox(); _resetTokenCache(); const env = { ...env0, DROPBOX_ROOT: root }, H = (q) => handleFeedback(q, env, {}, d.fetch);
    const vid = crypto.randomBytes(9 << 20); // > 2 blocks for content_hash
    r = await H(req('/fb/clip/clip0001', { body: vid, h: { 'Content-Type': 'video/mp4', 'Content-Length': '' + vid.length } }));
    ok(r.status === 200, 'clip upload ' + root);
    ok(d.files.has((root + '/clips/inst0001/clip0001.mp4').toLowerCase()), 'stored at root path ' + root);
    ok(d.files.has((root + '/installs/inst0001.json').toLowerCase()), 'install record');
    ok([...d.files.keys()].every(k => k.startsWith(root.toLowerCase() + '/')), 'nothing outside root');
    r = await H(req('/fb/meta/clip0001', { body: JSON.stringify({ pred: { reps: 8 } }) })); ok(r.status === 200);
    r = await H(req('/fb/label/clip0001', { body: JSON.stringify({ kind: 'corrected', reps: 7 }) })); ok(r.status === 200);
    ok(d.tokens() === 1, 'access token cached');
    d.expire(); r = await H(req('/fb/label/clip0001', { body: JSON.stringify({ kind: 'corrected', reps: 6 }) }));
    ok(r.status === 200 && d.tokens() === 2, 'expired token → refresh + retry');
    // auth: other token for same install rejected
    r = await H(req('/fb/meta/clip0001', { body: '{}', tok: 'y'.repeat(40) })); ok(r.status === 401, 'wrong token 401');
    r = await H(req('/fb/clip/clip0002', { body: 'abc', h: { 'Content-Type': 'text/plain', 'Content-Length': '3' } })); ok(r.status === 415, 'type');
    r = await H(req('/fb/clip/clip0002', { body: 'abc', h: { 'Content-Type': 'video/mp4', 'Content-Length': '' + (60 << 20) } })); ok(r.status === 413, 'size');
    r = await H(new Request('https://w.test/fb/meta/clip0001', { method: 'PUT', body: '{}', headers: { Origin: 'https://evil.test', 'X-Install': INST, 'X-Token': TOK } })); ok(r.status === 403, 'origin');
    // admin
    ok((await H(adm('/fb/admin/list', 'GET', 'nope'))).status === 403, 'admin forbidden');
    let all = [], cur = null;
    do { const j = await (await H(adm('/fb/admin/list?prefix=clips/' + (cur ? '&cursor=' + encodeURIComponent(cur) : '')))).json(); all.push(...j.objects); cur = j.cursor; } while (cur);
    ok(all.map(o => o.key).sort().join() === 'clips/inst0001/clip0001.label.json,clips/inst0001/clip0001.meta.json,clips/inst0001/clip0001.mp4', 'list paginated, relative keys, no installs');
    const mo = all.find(o => o.key.endsWith('.mp4')); ok(mo.size === vid.length && mo.content_hash === dbxHashBuf(vid), 'size+hash');
    r = await H(adm('/fb/admin/get?key=clips/inst0001/clip0001.mp4')); ok(Buffer.from(await r.arrayBuffer()).equals(vid), 'download bytes');
    r = await H(adm('/fb/admin/get?key=clips/inst0001/clip0001.label.json')); ok((await r.json()).reps === 6, 'latest label');
    ok((await H(adm('/fb/admin/get?key=installs/inst0001.json'))).status === 400, 'cannot read installs');
    ok((await H(adm('/fb/admin/get?key=clips/../../x.mp4'))).status === 400, 'path traversal rejected');
    ok((await H(adm('/fb/admin/list?prefix=/'))).status === 400, 'bad prefix rejected');
    ok((await H(adm('/fb/admin/get?key=clips/inst0001/nope0001.mp4'))).status === 404, '404');
    r = await H(adm('/fb/admin/delete?key=clips/inst0001/clip0001.mp4', 'POST')); ok((await r.json()).deleted === true && !d.files.has((root + '/clips/inst0001/clip0001.mp4').toLowerCase()), 'delete');
    r = await H(adm('/fb/admin/delete?key=clips/inst0001/clip0001.mp4', 'POST')); ok(r.status === 200 && (await r.json()).deleted === false, 'delete idempotent');
  }
  // empty folder list
  d = mockDropbox(); _resetTokenCache();
  r = await handleFeedback(adm('/fb/admin/list'), env0, {}, d.fetch); ok((await r.json()).objects.length === 0, 'empty list');
  // bad refresh token → 502, not crash
  _resetTokenCache(); r = await handleFeedback(adm('/fb/admin/list'), { ...env0, DROPBOX_REFRESH_TOKEN: 'BAD' }, {}, d.fetch); ok(r.status === 502, 'token error 502');

  // dbx-hash vs reference (Dropbox's published example algorithm), incl. empty file
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbt-')), b = crypto.randomBytes((4 << 20) * 2 + 5);
  fs.writeFileSync(tmp + '/a', b); ok(dropboxHash(tmp + '/a') === dbxHashBuf(b), 'local hash');
  fs.writeFileSync(tmp + '/e', ''); ok(dropboxHash(tmp + '/e') === crypto.createHash('sha256').digest('hex'), 'empty hash');

  // pull.sh end-to-end against mock worker (Dropbox mock behind it); one object corrupted → kept in Dropbox
  d = mockDropbox(); _resetTokenCache(); const env = { ...env0 };
  const put = (id, kind, body, h) => handleFeedback(req('/fb/' + kind + '/' + id, { body, h }), env, {}, d.fetch);
  const v1 = crypto.randomBytes(300000), v2 = crypto.randomBytes(1000);
  await put('clipAAAA', 'clip', v1, { 'Content-Type': 'video/mp4', 'Content-Length': '' + v1.length });
  await put('clipAAAA', 'meta', JSON.stringify({ pred: { exercise: 'knebøy', reps: 8 }, created: '2026-10-24' }));
  await put('clipAAAA', 'label', JSON.stringify({ kind: 'corrected', reps: 7 }));
  await put('clipBBBB', 'clip', v2, { 'Content-Type': 'video/webm', 'Content-Length': '' + v2.length });
  let corrupt = 'clips/inst0001/clipBBBB.webm';
  const srv = http.createServer(async (q, s) => {
    const body = []; for await (const c of q) body.push(c);
    const rq = new Request('http://x' + q.url, { method: q.method, headers: q.headers, body: body.length ? Buffer.concat(body) : undefined });
    let rr = await handleFeedback(rq, env, {}, d.fetch); let buf = Buffer.from(await rr.arrayBuffer());
    if (q.url.includes(encodeURIComponent(corrupt)) && q.url.includes('/get')) buf = Buffer.concat([buf.subarray(1), Buffer.from('X')]);
    s.writeHead(rr.status, { 'Content-Type': rr.headers.get('Content-Type') || '' }); s.end(buf);
  }).listen(0);
  await new Promise(r => srv.on('listening', r));
  fs.writeFileSync(tmp + '/secret', 'adminsecret');
  const run = (extra = []) => new Promise(res => execFile('bash', ['eval/feedback/pull.sh', ...extra], { env: { ...process.env, FB_URL: 'http://127.0.0.1:' + srv.address().port, FB_SECRET_FILE: tmp + '/secret', FB_DIR: tmp + '/clips' }, encoding: 'utf8' }, (e, so, se) => res({ out: so + se, code: e ? e.code : 0 })));
  const mf = 'eval/feedback/manifest.json', mfBak = fs.existsSync(mf) ? fs.readFileSync(mf) : null;
  try {
    let o = await run();
    ok(o.code !== 0 && /VERIFY FAILED.*clipBBBB/.test(o.out) && !/adminsecret/.test(o.out), 'corrupt → nonzero, reported, secret not printed');
    ok(Buffer.compare(fs.readFileSync(tmp + '/clips/inst0001/clipAAAA.mp4'), v1) === 0, 'clip A verified locally');
    ok(!fs.existsSync(tmp + '/clips/inst0001/clipBBBB.webm') && !fs.existsSync(tmp + '/clips/inst0001/clipBBBB.webm.part'), 'corrupt not kept');
    const left = [...d.files.keys()].filter(k => k.startsWith('/clips/'));
    ok(left.join() === '/clips/inst0001/clipbbbb.webm', 'only unverified file left in Dropbox: ' + left);
    const m = JSON.parse(fs.readFileSync(mf)); ok(m.length === 1 && m[0].gt === 7, 'manifest built');
    corrupt = 'none'; o = await run(); ok(o.code === 0 && d.files.size === 1 && fs.existsSync(tmp + '/clips/inst0001/clipBBBB.webm'), 'second pull clears Dropbox (installs/ kept)');
    await put('clipCCCC', 'clip', v2, { 'Content-Type': 'video/mp4', 'Content-Length': '' + v2.length });
    o = await run(['--keep']); ok(o.code === 0 && d.files.size === 2, '--keep leaves Dropbox');
  } finally { srv.close(); if (mfBak) fs.writeFileSync(mf, mfBak); else fs.rmSync(mf, { force: true }); fs.rmSync(tmp, { recursive: true }); }
  console.log('feedback worker tests OK', n);
})().catch(e => { console.error(e); process.exit(1); });
