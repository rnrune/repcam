# v8.18: upload queue that cannot hang + «Oppdater i Strava» + 30 Oct part 2 in eval

## Why only 3 of ~20 clips arrived
Every clip is stored in IndexedDB until the Worker confirms it (that already held in 8.17), so nothing was lost. But the
upload requests had **no timeout**, and they are sent one at a time. When a request never settled (iOS suspends the PWA
mid-upload, or Wi-Fi stalls), the single upload loop waited forever. «Send nå» returned that same hung promise, so it did nothing.
Reopening the app released it, and 13 more clips came in (22:06–22:20 Oslo) before it stalled again.

## Fix (feedback.js `QUEUE_CFG`, kill switch `localStorage repcam.fb.retryOff=1`)
- Each request aborts after 45 s + size at 50 kB/s; the item gets a backoff and the loop moves on (no head-of-line block).
- A forced «Send nå» aborts any stalled request and retries at once; a run older than 10 min is abandoned. The button shows progress, then the result or error.
- Max backoff 30 → 5 min, retry every 30 s while visible, plus on load, `online`, foreground and pageshow. It does not depend on navigator.onLine or connection type.
- «⇡ n» badge on Hjem and the workout screen. `navigator.storage.persist()`. New clips are not recorded while > 400 MB of unsent video is stored. The local blob is dropped only after HTTP 2xx.
- Not done: chunked/resumable upload sessions. Clips are ≤ 48 MB and the Worker takes the body in one PUT; a timeout plus retry covers it.
- `node tools/verify.js queue`: hung upload → clip kept, badge ⇡ 1 → page reload, still kept → Worker back + `online` → 3 uploads, badge gone, blob dropped. PASS.

## «Oppdater i Strava» (session card, Historikk/Hjem)
It finds the activity from the stored activityId, or else from the best start-time overlap. After a confirmation it does GET and then PUT /activities/{id} with the
Newrun Lift description block rewritten (the watch's own text is kept). The name is changed only on activities the app created. If no activity is found, it offers to create one, so there are no duplicates.
PUT /activities/{id} can change only name, description, sport_type, gear, trainer, commute and hide_from_home. It **cannot** change start time, duration, distance, or the structured sets of an uploaded strength file.
Strava API: a new base URL https://api-v3.strava.com from 4 Jan 2027, and the old host is retired 1 Jun 2027 (tokens already go in the header). Switch after 4 Jan.
`node tools/verify.js stravaup` (Strava fully mocked): 1 PUT on the stored id, the description is merged, no POST, and the «create?» dialog shows when there is no match. PASS.

## 30 Oct part 2 (truth from the plan + video; Rune's labels were shifted by one set and the false sets were deleted by him at 22:18)
| clip | truth | app 8.17 | replay 8.18 |
|---|---|---|---|
| en1et | benk 80 × 12 (set 2) | benk 12 ✓ (kg 50) | 12 ✓ |
| eorge | none (talking into phone) – benk set 3 never recorded | false dips 5 | dips 2 ✗ |
| esvuf/evvpu/ez2ad/f26hg | pull-ups 8, 8, 8, 8 | 7, 7, 6, 7 | 7, 7, 6, 7 |
| f3dw6 | rigging | false halvmark 3 | ✗ |
| f3zaq | setting up incline | false roing 5 | ✗ |
| f4x39 | incline 12 | 12 ✓ | 11 |
| f7yz6 | incline 10 | roing 11 ✗ | 10 (30 Hz roing) |
| fb0fq | incline 10 | 10 ✓ | 10 ✓ |
| fd85j | row 90 × 10 | roing 4 ✗ | dips 5 |
Rows 2–3, dips and EZ curl had not been uploaded yet (the queue stalled again at 22:20).

## Tried and reverted (core or stock regressions / no effect)
- Pull-ups, count the last pull when the lift-off from the bar ends a partial lowering (`endRise`): 2 tries, no effect on the 30 Oct clips.
- Dips: reject reps when the torso is > 0.25 of the frame (close-up at the phone): stock dips 9/11 → 2/11.
Core 21/21 throughout. All test*.js green.
