# tools/verify.js: self-check for Newrun Lift

This is a fast, cheap check that the app still behaves.

- It uses no paid APIs and uploads nothing: Dropbox and Strava hosts are blocked, and it runs in a throwaway browser profile.
- It reuses the e2e setup: playwright-core, `/usr/bin/google-chrome`, and the fake-camera `.y4m` clips in `/workspace/repcam-test`.

```bash
node tools/verify.js doctor                 # env/deps: node, playwright, chrome, y4m clips, eval landmarks, version/cache-bust match, output dir
node tools/verify.js replay mvr3gojt        # one or more case ids (prefix ok): pred vs truth from eval/real
node tools/verify.js replay --tier core     # a whole tier (core|worst|pass|excluded); exit 1 if any case fails
node tools/verify.js app mvr3gojt           # real app in headless iPhone 13, case landmarks fed into the app pipeline
node tools/verify.js app squat.y4m          # real app with fake camera video (MediaPipe runs on it), waits for the autosave toast
node tools/verify.js app <x> --url https://rnrune.github.io/repcam/   # live site instead of the built-in local server
node tools/verify.js ui                     # Hjem + Historikk screenshots (seeded sessions, collapsed + one opened)
node tools/verify.js app <x> --dry-run      # print what would happen, touch nothing
```

## How `app` works

1. It serves the repo on a random local port, unless you pass `--url`.
2. It opens the app as an onboarded Norwegian user and taps **Start økt**.
3. For a **caseId**, it stops the camera loop and feeds the case's 10 Hz landmarks through `__repcam.processFrame`. It is the same code path as the camera. A virtual `Date.now` clock lets the 9 s autosave fire without waiting in real time. It then adds 12 s of empty frames so the set gets saved.
4. For a **.y4m clip**, Chrome plays the clip as the camera, and the tool waits for the save toast. Autosave is 4 s; `--secs N` sets the max wait.
5. It writes `/workspace/repcam-shots/verify/<case|clip>-<UTC time>.png` (screenshot) and `.json` (proof). The proof holds the app version, exercise chip, shown reps, toast text, logged sets, truth (for a case) and page errors.

Use `replay` for logic checks. It runs in seconds with no browser. Use `app` once per change, as screenshot proof that the real UI agrees.
