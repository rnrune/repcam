# v8.17: 30 Oct session — close-up after-effect on bench, plate-loading false sets, resume/black-frame fix

## Session data
Only **3 clips** reached the feedback store for 30 Oct (21:02–21:07 Oslo); the other ~17 sets of the session were never uploaded
(still queued on the phone, or not recorded). Pulled to `/workspace/repcam-feedback-clips/2026-10-30/` (Dropbox content_hash verified),
landmarks in `eval/real/` (no video in git).

| clip | what it really is | app 8.16 | replay 8.16 | replay 8.17 |
|---|---|---|---|---|
| mvveg0gc | loading plates / rigging (negative) | **bulgarsk 6 @70 (false set)** | knebøy 4 | none ✓ |
| mvvehvtk | benk 50 kg × 15 | benkpress 15 ✓ (kg corrected 100→50) | 15 ✓ | 15 ✓ |
| mvvelxx5 0–95 s | benk 80 kg × 12 (set 1) | **nothing saved (set missed)** | 5 | 12 ✓ |
| mvvelxx5 95–190 s | rest, standing at the rack (negative) | **dips 3 (false set)** | curl 2 | curl 2 ✗ (open) |

## Fixes (one at a time, each measured on eval/real + stock eval/eval.js)
1. **Bench/incline body-size reference after a close-up.** Bug: walking up to the phone (face fills the frame) sets the press
   counters' body-size reference to ~3× the real size; with the default 60 s decay the following set's reps look 3× too shallow
   (< minAmp) and are not counted. Fix: `refTau: 12, refTauBelow: 0.5` on benkpress and skråbenk (fast decay only once the body is
   < half the reference). Try 1 (`refTauBelow` 0.9 like squats) fixed the clip but cost a stock bench clip (yt9f 22→17); try 2 (0.5)
   fixed it with the stock eval byte-identical. New `refTauBelow` key, default 0.9 = old behaviour.
2. **Squat/split-squat reps with the pose flipped upside down** (bending over at the frame edge while loading plates). New
   `flipMax: 0.2` on knebøy/bulgarsk: a rep is rejected ('flip') when > 20 % of its frames had the torso upside down (> 120°).
   0.1 and 0.2 gave the same result; 0.2 kept. Stock eval identical, eval/real only change = mvveg0gc fixed. Kill switch: `flipMax: null`.
3. Tried and **reverted**: curl needs both wrists to travel (`bothArms` 0.5 and 0.25) — removed the rest-time curl false set but broke
   core curl mvnohgsi (10 → knebøy 9) both times. Two tries, dropped.

## Eval
- `verify.js replay --tier core`: **21/21** (19 old + 2 new 30 Oct cases). worst 1/19. pass 8/8.
- `eval/real/run.js`: exact 28/45 → 30/48, false sets 3/10 → 4/12 (only the new open dips/curl rest case added).
- 30 Hz core: same 3 pre-existing 30 Hz-only misses as 8.16, both new cases pass.
- Stock `eval/eval.js`: unchanged (118/129, MAE 0.21); manual-mode false reps on negatives 70 → 69.
- All test*.js + new test-v817.js green. `verify.js app mvvelxx5-bench`: Benkpress 12 saved; `app mvveg0gc`: no set.

## Shadow logs
- restShadow: all 3 sets `would-allow` (readyAt −34 s, −49 s, −158 s): the gate would **not** have stopped either false set
  (Rune is visible, still and at a plausible distance while rigging/resting). Offline rest-shadow: active gate still costs core k2vt.
  → keep SHADOW.
- barShadow (benk 50 × 15, live): bar 13 vs pose 15, coupled 67 %, reliable, no rack-in/out false rep (first bar rep at +0.1 s);
  2 reps missed mid-set (gap 4.2→6.8→9.4 s). Benk 80 set: no log (set never saved). Offline `bar-shadow.js --cases` on the recorded
  files gives 0 bar reps for both bench clips (live gave 13): the offline harness does not reproduce the live tracker on front-camera
  bench — open. → keep SHADOW.

## C) Black frame after app switch
Restated: after leaving the PWA and coming back, the camera picture is drawn much smaller with black around it.
The stage itself is pure CSS (`position:fixed; inset:0`, video `object-fit:cover`), and nothing re-laid it out on resume: iOS can
return with the viewport size/scale from while the app was away (rotated/resized in the background without a resize event) and a
WebKit video layer keeps its old geometry when the camera stream is restarted (iOS kills the camera when backgrounded and we
re-`getUserMedia`). Also `#view-okt` inherited the `.view` fade animation (a transform on the fixed stage's ancestor).
Fix (`app.js` `fitStage`, `FIT_CFG`, kill switch `localStorage repcam.fitOff=1`): on visible/pageshow, resize, orientationchange,
visualViewport resize, video `resize` and after every camera (re)attach → reset the viewport meta (scale 1), force a stage re-layout,
re-bind the stream to the video, re-size the canvas; repeated at 0/250/1000 ms. `#view-okt` has no animation.
Proof: `node tools/verify.js resume` (new): hidden + pagehide, camera track killed, viewport rotated and back while hidden, visible +
pageshow → stage/video/canvas = viewport, content covers. Headless Chrome does not show the WebKit bug (8.16 also passes there), so
the final confirmation must be on Rune's iPhone.
