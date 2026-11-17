# v8.49 — landscape layout, storage warning, full camera frame, upload-network fixes. Counting unchanged.

## 1. Clips missing on 17 Nov (storage)
- **Bug:** Rune recorded 14 sets, but only 3 reached the Worker (all before 17:30 CET).
- **Evidence:**
  - The next clip carried one skip: `addFailed` with InvalidStateError at 17:56 CET.
  - camLog shows the recorder was fine.
  - No quota error was logged.
- **Conclusion:** consistent with full phone storage. IndexedDB stopped accepting writes. It is not a v8.48 regression, since v8.48 does not touch the recorder or queue.
- **Fix (`STORE_CFG`, kill switch `repcam.storeWarn=off|shadow|on`, default on):**
  - `navigator.storage.estimate()` runs at workout start and after each clip. If less than `warnFreeMB` (500) is free, a warning is shown for 12 s: «Lite lagringsplass (N MB ledig) …».
  - A failed save with QuotaExceeded or low storage shows «⚠ Lite lagringsplass – klipp lagres ikke».
  - The skip reason is `storage`.
  - Clip meta gains `storage {quotaMB, usageMB, freeMB}`.
  - `navigator.storage.persist()` is requested at start.
- **Proposed next (not in v8.49):** reopen IndexedDB on InvalidStateError and retry once.

## 2. Telemetry
- `meta.power.dup` (the duplicate-frame counts) was overwritten by the mode string. It is now sent as `power.dupMode`.

## 3. Landscape layout unreadable
- **Fix (`html.landUI`, kill switch `repcam.landUI=off`):** in landscape with height ≤ 500 px:
  - the workout card becomes a right column;
  - the ring is centred in the camera area;
  - hint, toasts, camAsk and recWarn are repositioned.
- **Screenshots:** `/workspace/repcam-shots/landscape/before-*`, `after-*`.

## 4. Camera image cropped («Rammen er fortsatt et problem»)
- **Bug:** video and pose canvas used `object-fit: cover`. A portrait 360×640 stream showed only 82 % of the frame in portrait (390×844) and 26 % in landscape (844×390).
- **Fix (`html.fullFrame`, kill switch `repcam.fullFrame=off`):**
  - `object-fit: contain` on both video and canvas, on a black stage.
  - The canvas keeps the video's aspect ratio (0.5× resolution), so the skeleton overlay stays on the same rectangle.
- **Measured:** 100 % visible in 390×844, 844×390 and 932×430. Video and canvas rectangles are identical. 0 page errors.
- **Screenshots:** `ff-before-*`, `ff-after-*` (rune-bench and rune-pullups).
- `tools/verify.js resume`: `contentCovers` accepts contain (the whole frame fills one axis).

## 5. «Husk dette nettverket» never appears
- **Bug:** the trusted-network prompt never shows.
- **Cause:**
  1. The button was only shown right after «Send nå».
  2. Rune's clips carry `wifiOnly:false` («Send automatisk på alle nett» is on). In that mode no trust is needed, so the prompt is not offered by design.
  3. The status line still said «Nå: ukjent nett – sender ikke automatisk» even though it does send. This is misleading.
- **Fix A (kill switch `repcam.netRemember=off`):** the button shows in Profil whenever wifi-only is on and the network is unknown and untrusted.
- **Fix B (kill switch `repcam.netLine=off`):** with «alle nett» on, the line reads «Nå: sender automatisk på alle nett».
- **Browser test** (scratch/net-browser.js):

| Setting | Button | Status line |
|---|---|---|
| default | shown | — |
| netRemember=off | hidden | — |
| wifiOnly=0 | hidden | «sender automatisk på alle nett» |

- Screenshot: `net-remember-390x844.png`.
