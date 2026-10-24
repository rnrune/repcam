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
