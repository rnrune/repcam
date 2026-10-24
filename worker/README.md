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
Stored in Dropbox (free plan, 2 GB) via an **App folder** app named «Newrun Lift-klipp» → `/Apps/Newrun Lift-klipp/` (the app sees nothing else).
Clips are deleted from Dropbox by `eval/feedback/pull.sh` once verified on the box. One-time setup:
1. https://www.dropbox.com/developers/apps → Create app → Scoped access → **App folder** → name `Newrun Lift-klipp`.
2. Permissions tab: tick `files.metadata.read`, `files.content.write`, `files.content.read` → Submit.
3. Get a refresh token: open `https://www.dropbox.com/oauth2/authorize?client_id=<APP_KEY>&response_type=code&token_access_type=offline`,
   allow, copy the code, then `curl -u <APP_KEY>:<APP_SECRET> -d code=<CODE> -d grant_type=authorization_code https://api.dropboxapi.com/oauth2/token`
   → `refresh_token`.
4. `wrangler secret put DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` / `DROPBOX_REFRESH_TOKEN`, `wrangler secret put FB_ADMIN_SECRET < /workspace/.secrets/newrun-feedback-admin`, `wrangler deploy`.
Routes: `PUT /fb/clip/<id>` (video/mp4|webm, ≤ 50 MB), `PUT /fb/meta/<id>`, `PUT /fb/label/<id>` (JSON ≤ 2 MB, label can be re-PUT any time).
Auth: headers `X-Install` + `X-Token` (random per install, generated in the app; the worker stores SHA-256(token) on first use and rejects
other tokens for that install). CORS/Origin locked to ALLOWED_ORIGINS, max 300 writes/install/day. Objects: `clips/<install>/<id>.{mp4,meta.json,label.json}`.
Admin (no public read): `GET /fb/admin/list?prefix=&cursor=`, `GET /fb/admin/get?key=`, `POST /fb/admin/delete?key=` with `Authorization: Bearer $FB_ADMIN_SECRET`.
Local test: `.dev.vars` with FB_ADMIN_SECRET + DROPBOX_* + `wrangler dev --port 8797` (talks to real Dropbox). Unit tests: `node test-feedback-worker.mjs` (mocked Dropbox).
