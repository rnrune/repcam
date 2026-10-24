# Strava token Worker (free Cloudflare Workers plan)
Strava OAuth does not support PKCE; the token endpoint needs `client_secret`, which a static site cannot hide.
This Worker does only `/token` (code → tokens) and `/refresh`. All other Strava calls go directly from the browser.

1. Strava: https://www.strava.com/settings/api → create app. Category: Training. Website: https://rnrune.github.io/repcam/ ·
   **Authorization Callback Domain: `rnrune.github.io`**. Note Client ID + Client Secret.
2. Cloudflare (free account): `npm i -g wrangler && wrangler login`, then in this folder:
   `wrangler secret put STRAVA_CLIENT_ID` · `wrangler secret put STRAVA_CLIENT_SECRET` · `wrangler deploy`
   → URL like `https://repcam-strava.<you>.workers.dev`.
3. Put `clientId` and `workerUrl` in `../strava-config.js`, commit, push.
4. In RepCam: Profil → Strava → Koble til.

## Feedback clips («Hjelp til å forbedre», `feedback.js`)
Private R2 bucket `newrun-feedback` bound as `FB`. One-time setup:
1. Enable R2 on the Cloudflare account (Dashboard → R2 → *Purchase R2 / Enable*; free tier 10 GB, but Cloudflare requires a payment method on file).
2. `wrangler r2 bucket create newrun-feedback`
3. `wrangler secret put FB_ADMIN_SECRET < /workspace/.secrets/newrun-feedback-admin` then `wrangler deploy`.
Routes: `PUT /fb/clip/<id>` (video/mp4|webm, ≤ 50 MB), `PUT /fb/meta/<id>`, `PUT /fb/label/<id>` (JSON ≤ 2 MB, label can be re-PUT any time).
Auth: headers `X-Install` + `X-Token` (random per install, generated in the app; the worker stores SHA-256(token) on first use and rejects
other tokens for that install). CORS/Origin locked to ALLOWED_ORIGINS, max 300 writes/install/day. Objects: `clips/<install>/<id>.{mp4,meta.json,label.json}`.
Admin (no public read): `GET /fb/admin/list?prefix=&cursor=`, `GET /fb/admin/get?key=`, `POST /fb/admin/delete?key=` with `Authorization: Bearer $FB_ADMIN_SECRET`.
Local test: `.dev.vars` with FB_ADMIN_SECRET + `wrangler dev --local --port 8797` (R2 simulated).
