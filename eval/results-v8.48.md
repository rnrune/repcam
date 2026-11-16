# v8.48 — battery (Rune 16 Nov 10:06: «appen bruker mye batteri»). Counting unchanged.

## Where the energy goes (ranked; evidence)
1. **Screen on + camera capture (1280×720) for the whole session.** Unavoidable: wake lock + live view. Display is likely the biggest single draw, but no web API can lower it. Not changed.
2. **Pose inference (MediaPipe lite, GPU) on every animation frame.**
   - Clip meta `poseRate` shows median steps of 30 ms (≈30–33 Hz) on the current iPhone. An Oct clip (mvw6fsc9) ran at 58.8 Hz.
   - It runs the whole session, also with nobody in view (the person detector then runs every frame, which costs more than tracking).
3. **Clip recording + upload (feedback on).**
   - Continuous H.264 1 Mbps at 720p; clips of 3–30 MB are uploaded over Wi-Fi or cellular.
   - The encoder is hardware; radio time scales with bytes. Not changed (review quality); `bps` could be lowered later.
4. **v8.16 bar tracker (shadow only, never counts).**
   - 8.7 ms JS per call (node, this box; slower on a phone) at 5 Hz, plus a video→CPU canvas read-back each time.
   - Runs during squat / RDL / bench / incline / row sets. → **off by default.**
5. **Skeleton overlay.** clearRect + draw on a full-resolution canvas (720×1280) at the pose rate, with a new DrawingUtils per frame. → **half-resolution canvas, DrawingUtils reused, no clear when nothing was drawn.**
6. **Per-frame DOM style writes** (#ring strokeDashoffset, #hint display) at 30 Hz → style recalcs. → **written only on change.**
7. **Small costs, unchanged:**
   - Counting JS: 0.56 ms per frame for all counters + recognizer + sig (node).
   - plate.js: 0.05 ms per sample at 15 Hz, side sessions only, plus a 72 px read-back.
   - camWatch 1 s; upload retry 30 s (visible only).
   - Strava 5 min; tick 1 s (writes localStorage every 5 s).
   - Nothing per-frame goes to storage. Loops stop when the page is hidden: rAF pauses, and the loop/camWatch check visibility.

## Changes (POWER_CFG in app.js; kill switches = localStorage)
| Saving | Default | Kill switch | Counting effect |
|---|---|---|---|
| Bar shadow tracker off | off | `repcam.barShadow=on` (= v8.47) | none (shadow only; clip meta loses `barShadow`) |
| Overlay at 0.5× resolution, DrawingUtils reused | on | `repcam.lowDraw=off` | none |
| Style writes on change only | on | `repcam.domDiff=off` | none |
| Idle throttle: nobody in view ≥ 3 s → pose at 5 Hz until a person is seen (not in side sessions: plate tracker) | on | `repcam.idleThrottle=off\|shadow` | eval sim (worst case, first 0.2 s after each gap lost): 0 changed clips |
| Duplicate-frame skip (no new camera frame since the last pose run) | shadow (counts only) | `repcam.dupSkip=on\|off` | not verifiable offline → shadow, telemetry `power.dup` |
| Camera 960×540 | opt-in | `repcam.camRes=low` | NOT verified → iPhone A/B only |

Telemetry per clip: `meta.power` = { frames, idleSkip, dupSkip, dup, draws, modes }.

## Verification
- `run.js --all --idleSim` vs `--all`: identical on all 112 clips (105/112, core 14/14).
  - Only 4 non-side clips have a person-less gap ≥ 3 s, so the offline evidence is thin. The real gain is between sets when Rune walks out of view; those periods are trimmed from the clips.
  - Margin check: a harsher 1.5 s / 2 Hz setting breaks mvvfl1ka-row (roing → halvmark). Do not lower the thresholds without new data.
- Headless Chrome, fake camera (iPhone 13 profile), 12 s each:
  - No person: pose runs ≈5/s with the throttle on, and `idleSkip` counts the skipped frames. Shadow mode runs every frame and only counts.
  - Pull-up y4m: 6 reps with every setting (all savings on, everything off, dupSkip on).
  - Canvas 180×320 vs 360×640, bar tracker off, no page errors.
  - Software GL there is slow (≈5–9 Hz), so the absolute saving can only be measured on the iPhone.
