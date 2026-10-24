// Cloudflare Worker: Strava token exchange/refresh for RepCam (Strava OAuth has no PKCE, so the secret must stay server-side).
// Secrets: wrangler secret put STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET. Only these two routes; CORS locked to ALLOWED_ORIGINS.
import { handleFeedback } from './feedback.js';
export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://rnrune.github.io').split(',').map(s => s.trim());
    const cors = { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0], 'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Install, X-Token', 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (new URL(req.url).pathname.startsWith('/fb/')) return handleFeedback(req, env, cors);
    if (req.method !== 'POST' || !allowed.includes(origin)) return new Response('forbidden', { status: 403, headers: cors });
    const path = new URL(req.url).pathname;
    let body; try { body = await req.json(); } catch { return new Response('bad json', { status: 400, headers: cors }); }
    const p = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET });
    if (path === '/token' && body.code) { p.set('grant_type', 'authorization_code'); p.set('code', body.code); }
    else if (path === '/refresh' && body.refresh_token) { p.set('grant_type', 'refresh_token'); p.set('refresh_token', body.refresh_token); }
    else return new Response('not found', { status: 404, headers: cors });
    const r = await fetch('https://www.strava.com/oauth/token', { method: 'POST', body: p });
    const j = await r.json();
    const out = r.ok ? { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at, athlete: j.athlete ? { firstname: j.athlete.firstname } : undefined } : { error: j.message || 'error' };
    return new Response(JSON.stringify(out), { status: r.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
};
