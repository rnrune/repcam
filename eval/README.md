# RepCam rep-count accuracy harness

`node eval/eval.js` runs **the same `reps.js` the app ships** over MediaPipe pose landmarks extracted from real
exercise videos. It reports per-exercise exact-match rate, MAE, recognition accuracy, and a per-camera-angle breakdown.

* Landmarks come from MediaPipe tasks-vision 0.10.14 with `pose_landmarker_lite`, the same model and runtime as the app.
  They are extracted in headless Chrome (`tools/extract.html` + `tools/extract.js`) at 15 fps, and the counter sees the
  frames with real timestamps.
* Videos and landmark files are **not** in git. Download them with `tools/dl.sh` (Pexels via `videos.pexels.com`, Wikimedia
  Commons direct). Each one is cut to its first 60 s, 480 px, 15 fps. Then run `node tools/extract.js <ids>` and point
  `--lm` at the landmark directory (default `/workspace/repcam-eval/lm`).
* `manifest.json` lists for every clip: id, exercise, **ground truth**, camera **view** (`front|back|side|oblique|overhead|orbiting`),
  source page, license (Pexels License, CC BY 3.0, CC BY-SA 4.0 or public domain) and notes.

## Ground-truth method
For each clip I drew the exercise signal over time with a 2 fps thumbnail strip underneath (`tools/plot.py`) and counted reps
by eye from the frames.
* A rep counts when it is complete (bottom/turnaround **and** a return of at least about 60 %) and at least half of its descent is visible.
* A clip that starts in the bottom position does not count that first half-rep. Unracking, picking up the bar and walking out are not reps.
* Excluded clips (with reasons in my notes): legs or person cropped out of frame, several people, too dark, ambiguous movement, or long tracking dropouts.
* Bulgarian split squat footage is scarce. Split squats and (reverse/jumping) lunges are used as proxies and flagged in `notes`.
* Flat bench is used as a proxy for incline bench. Conventional deadlifts are used as a hinge proxy for RDL.
* "Stående roing" is interpreted as the **barbell bent-over row**. One-arm dumbbell rows and kettlebell rows are included as variants.
* Two negatives (hanging leg raises, GT 0) are included under pull-ups to test false positives.
* Caveat: I set the GT while looking at the same signal plots that the tuning used. That gives the GT some potential bias toward
  the signal, although every count was checked against the thumbnails.

## v8.13: real-clip benchmark tiers (`eval/real`)
`node eval/real/run.js [--tier core|worst|pass]` replays Rune's own clips (landmarks only). **core** = a small stable set
(2–3 clips per exercise + negatives) that must pass (exit 1 = regression); **worst** = the clips the app fails most — test a fix
there first and move solved clips to core; **pass** = solved, not core. Add new session clips capped at ~5 per exercise.
See `results-v8.13.md`.

## v8.2: strict counting + head-on push-ups (see `results-v8.2.md`)
* **Strict counter (default):** a rep only counts when, during the rep, the needed landmarks are visible and the shoulders
  are inside the frame (≤50 % bad frames), the person is not travelling across the frame, the exercise posture holds
  (push-ups prone, dips upright with hands at hip height, bench lying, pull-ups hanging…), and for pull-ups/dips/push-ups
  the shoulders really travel (hands planted). The **first rep is tentative** until a second rep with similar amplitude
  (≤2.5×) and tempo (≤4.5×) follows within 12 s, so a single random movement never shows up. `strict:false` restores v8.1.
* **Auto pick (`Reps.createPicker`, shared by app and eval):** a recognizer guess needs score ≥0.3 and a 25 % margin over the
  runner-up, held 1.5 s.
* **Head-on push-ups:** foreshortened torso (vertical torso < 1.0–1.3 × shoulder width), hands below shoulders *and* hips,
  legs hidden → push-ups; dips need a long upright torso and hands at hip height. Squat recognition needs visible legs.
* Negatives: 48 clips (stretching, phone handling, adjusting the camera, talking/gesturing, walking near the camera,
  picking up items, resting/drinking, dancing, household, gymnastics, plus the v8.1 set). False sets 16.7 % → **4.2 %**.

## Results (70 clips, 263 reps)
Before: the first v4 engine draft (`reps_before.js`). After: the current `reps.js`.

| Exercise | Clips | GT reps | Exact before | Exact after | MAE before | MAE after | Recognition before → after |
|---|---|---|---|---|---|---|---|
| Knebøy | 17 | 60 | 16/17 | **17/17** | 0.06 | **0.00** | 13 → 17/17 |
| Bulgarsk utfall | 12 | 44 | 11/12 | **12/12** | 0.08 | **0.00** | 8 → 9/12 |
| Pull-ups (incl. 2 negatives) | 11 | 46 | 8/11 | **9/11** | 1.45 | **0.55** | 7 → 7/9 |
| Dips | 9 | 37 | 7/9 | **9/9** | 0.22 | **0.00** | 7 → 7/9 |
| Skråbenk | 8 | 23 | 6/8 | **7/8** | 0.38 | **0.13** | 8 → 8/8 |
| Halvmark (RDL) | 6 | 14 | 5/6 | **6/6** | 0.17 | **0.00** | 4 → 5/6 |
| Roing | 7 | 39 | 3/7 | **5/7** | 1.14 | **0.43** | 4 → 4/7 |
| **All** | 70 | 263 | 56/70 (80 %) | **65/70 (93 %)** | 0.46 | **0.14** | 75 % → **84 %** |

Pull-ups on real pull-up clips are 9/9 exact. Both pull-up misses are the hanging-leg-raise negatives (counted 2 and 4).
The remaining misses are:
* `wc295071`: the last press is cut off by the end of the clip.
* `px7875577`: a noisy one-arm dumbbell row.
* `px5837737`: an orbiting camera filming Pendlay rows with torso swing.

### By camera angle (after)
| View | Clips | Exact | MAE |
|---|---|---|---|
| side | 30 | 28/30 (93 %) | 0.07 |
| oblique (~45°) | 14 | 13/14 (93 %) | 0.14 |
| front | 22 | 20/22 (91 %) | 0.27 (both misses are the leg-raise negatives) |
| back | 2 | 2/2 | 0 |
| overhead / orbiting | 2 | 2/2 | 0 |

Before the changes, front was 73 % exact and oblique 86 %. The full exercise × view table is in `results-after.md`.
**Coverage gaps:** back-view clips exist only for pull-ups. Free stock footage has almost no back-view squats, rows or RDLs, so
those combinations are untested.

## What changed (and why it is view-invariant)
* Every signal is a **vertical displacement normalized by body size** (torso length):
  * squat / split squat: knee-to-hip height
  * pull-ups / dips: wrist-to-shoulder height
  * RDL: hip-to-shoulder height
  * presses and rows: wrist-to-shoulder distance on the better-visible side
  
  Vertical displacement survives front, back and oblique views. Knee and elbow angles are foreshortened in frontal views, so
  they are not used for counting.
* A median-of-3 filter removes single-frame landmark glitches. A validity gate drops pull-up frames where the wrists are
  below the shoulders (off the bar).
* The "top" is a rolling 2 s maximum instead of a slowly decaying peak, so a spike at the start can no longer block a set.
  If a rep "takes" longer than `maxRep`, the counter re-anchors on the real top.
* A rep is first held as **pending** and confirmed once the signal settles at the top. It is rejected if the signal keeps
  rising well above where the descent started. This covers clips or sets that start in the bottom position, unracking, and
  deadlifts from the floor.
* An adaptive threshold rejects half reps: a rep must exceed 50 % of the set's median amplitude.
* Pull-up reps where the knees rise above the hips are rejected (hanging leg raises).
* Rows normalize by the recent (2 s) torso length, which makes them robust to camera zoom and drift.
* Recognizer: split stance is now detected from knee-height asymmetry or front-to-back foot distance instead of raw ankle
  spread. The old feature confused wide front-view squats with split squats.

## Recommended camera placement (shown in the app's Øvelser tab)
* Squat / RDL / row / split squat: **side or 45° oblique, 2–3 m away, at hip height, whole body in frame**. Front view works for squats and split squats.
* Pull-ups: front or back, far enough to see the bar and the hips.
* Dips: side.
* Incline/bench: side of the bench at bench height.
* Weak spots:
  * frontal rows: arm motion is mostly toward the camera, so it is foreshortened
  * one-arm dumbbell rows
  * a moving or orbiting camera
  * clips where the lifter is partly out of frame

## v8.7: camera-motion robustness (see `results-v8.7.md`)
`node eval/camera.js [--seeds 3] [--conds clean,handheld,large] [--modes v86,nogate,vision,sensor]` replays every clip with
synthetic camera motion: handheld (tremor, slow pan, roll, zoom), or large (pick-up/bump/re-prop and swaying in the hand, with
motion-blur keypoint jitter and dropouts, plus synthesized DeviceMotion). It compares the frozen v8.6 engine
(`reps_v86.js`) with v8.7 with no gate, the vision gate only, and vision + sensor.
`eval.js` runs `Reps.createCameraGate()` (vision only) exactly like the app.
