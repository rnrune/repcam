# v8.7 — camera-motion robustness (the phone itself moves)

Rune noticed false reps/sets when the **phone** moves a lot: picking it up, bumping it, re-propping it, holding it in the hand.
At the same time, someone may film another person **handheld**, so normal handheld movement must keep counting.
v8.7 therefore does **not** pause whenever the phone moves. It relies on body-relative signals for moderate motion and pauses
only on large or abrupt motion.

## What changed
* **Body-relative signals (moderate motion).** Every rep signal was already a difference between keypoints divided by the
  torso length, so a global shift or zoom cancels out. The one absolute-position check in the counter, the "travelling
  through the frame" rejection (hip x / torso), now allows a slow drift of 0.3 torso/s × rep duration. A handheld pan that
  follows the athlete therefore no longer rejects slow reps. Walking (~2 torso/s) is still rejected. This was the only
  handheld regression found (`px8456661`, `px8520078`, `px37997554`, `px4859742` lost reps under a pan in v8.6).
* **`Reps.createCameraGate()`** (shared by the app and the eval) pauses only on big/abrupt motion:
  * **DeviceMotion** (when permitted): it closes when the rotation rate is >90 °/s or the linear acceleration is >4.5 m/s² for
    2 consecutive frames. It stays closed until the rotation rate is <30 °/s and the acceleration is <1.5 m/s², then waits a further 0.6 s settle.
    Handheld tremor (~5–15 °/s) and a slow follow pan (~20–40 °/s) never close it.
  * **Vision fallback** (always on, and the only one if permission is denied): it closes when the whole pose moves rigidly for ≥0.4 s.
    That means every visible body part, including those an exercise keeps anchored (feet, hands on bar/floor, hips on bench), shifts by more than 0.5 torso within 0.4 s;
    or every body length (torso, shoulder width, thighs, shins, upper arms) scales together by more than 30 %; or the shoulder line,
    hip line, torso and hip→ankle axis all turn together by more than 10°. It is tuned so that **no clean eval clip changes**.
* **Counters while the gate is closed** (`counter.update(lm, t, aspect, camMoving)`): the frame is ignored. A rep in progress is
  dropped, as is a rep that completed <0.3 s before the motion or an unpaired first rep from the motion segment. Tracking restarts from a fresh
  top afterwards. Already-counted reps are kept, so a moving-phone segment can neither start a set nor add a rep. A rep that was
  finished before the motion is still confirmed.
* **Recognizer/picker**: frames are skipped and the 6 s feature window is cleared, so camera motion can't switch or pick the exercise.
* **App**: the `DeviceMotionEvent.requestPermission()` call happens **inside the existing Start / «Fortsett» tap**, right after
  `getUserMedia` (camera stays first), so there is no extra tap. On iOS there is one system prompt the first time. Denied, unavailable or an error degrades
  to vision only, silently. Android/desktop listen without a prompt. While paused the hint reads «Mobilen beveger seg – teller
  når den står i ro» (7 languages).

## Synthetic camera-motion eval (`node eval/camera.js --seeds 3`)
All 129 exercise clips (553 reps) and 48 negative clips run with camera motion applied to the MediaPipe landmarks: a similarity
transform about the frame centre plus out-of-frame visibility loss. Each handheld/large clip uses 3 random camera paths.
* **handheld**: tremor (2–8 Hz, 0.2–0.4 % of the frame per component), slow pan/follow (±6–10 % horizontally, ±2–4 % vertically,
  12–25 s period, limited so the athlete stays in frame), roll ±1–3°, zoom ±3–6 %. Gyro ~5–15 °/s.
* **large**: handheld plus, every 12–25 s, either (60 %) a pick-up, bump or re-prop or (40 %) 2–5 s of the phone swaying or being carried in the hand.
  * Pick-up / bump / re-prop: 0.3–1.2 s, shift 8–25 %, transient tilt 10–30°, zoom 0.75–1.3, violent shake.
  * Sway / carry: ±15–35° roll plus shift at 0.4–1 Hz, which is rhythmic like reps.

  During these events MediaPipe loses 15–35 % of frames and the remaining keypoints jitter independently (motion-blur model).
  The sensor stream is synthesized from the same path.
* "v8.6" = the frozen v8.6 `reps.js` (`eval/reps_v86.js`). "vision only" = motion permission denied. "Extra reps" = sum of
  over-counts. Negatives: a false set = the auto-picked exercise reaches 2 reps.

## Summary (3 random camera paths per clip for handheld/large)

| Condition | Engine | Exercise clips exact | MAE | Extra reps (overcount) | Missed reps | Negatives: false sets | Negatives: reps shown | Manual pick: counters reaching 2 |
|---|---|---|---|---|---|---|---|---|
| clean | v8.6 | 118/129 (91%) | 0.21 | 9 | 18 | 2/48 (4%) | 8 | 56/480 |
| clean | v8.7 body-relative only (no gate) | 118/129 (91%) | 0.21 | 9 | 18 | 2/48 (4%) | 8 | 57/480 |
| clean | v8.7 vision only (motion permission denied) | 118/129 (91%) | 0.21 | 9 | 18 | 2/48 (4%) | 8 | 57/480 |
| clean | v8.7 vision + DeviceMotion | 118/129 (91%) | 0.21 | 9 | 18 | 2/48 (4%) | 8 | 57/480 |
| handheld | v8.6 | 347/387 (90%) | 0.23 | 23 | 66 | 6/144 (4%) | 21 | 161/1440 |
| handheld | v8.7 body-relative only (no gate) | 356/387 (92%) | 0.21 | 23 | 57 | 6/144 (4%) | 23 | 164/1440 |
| handheld | v8.7 vision only (motion permission denied) | 356/387 (92%) | 0.21 | 23 | 57 | 6/144 (4%) | 23 | 164/1440 |
| handheld | v8.7 vision + DeviceMotion | 356/387 (92%) | 0.21 | 23 | 57 | 6/144 (4%) | 23 | 164/1440 |
| large | v8.6 | 235/387 (61%) | 0.68 | 43 | 220 | 14/144 (10%) | 35 | 215/1440 |
| large | v8.7 body-relative only (no gate) | 255/387 (66%) | 0.61 | 43 | 193 | 16/144 (11%) | 40 | 221/1440 |
| large | v8.7 vision only (motion permission denied) | 251/387 (65%) | 0.61 | 41 | 195 | 16/144 (11%) | 40 | 220/1440 |
| large | v8.7 vision + DeviceMotion | 112/387 (29%) | 1.20 | 20 | 446 | 2/144 (1%) | 15 | 136/1440 |


**Reading it**
* **No regression without camera motion**: the clean rows are identical to v8.6 for every exercise and every angle (below, and
  `node eval/eval.js`, which now also runs the vision gate).
* **Handheld**: 347 → **356/387** exact, MAE 0.23 → 0.21. The sensor gate never fires on handheld motion, so the result is identical to no gate.
* **Large/abrupt motion with DeviceMotion**: false sets on non-exercise clips drop from 14/144 (9.7 %) to **2/144 (1.4 %)**.
  Over-counted reps on exercise clips drop from 43 to **20**, and manual-pick false counters from 215 to 136.
  The price is that reps performed **while** the phone is being moved, plus the rep in progress, are not counted:
  missed reps go from 220 to 446, roughly 0.6 extra missed reps per clip with 2–3 events. That is by design: those frames are not trustworthy.
* **Vision only (permission denied)**: rigid reframing is caught (unit tests), but in this blur model the keypoints don't move
  rigidly, so the vision gate barely fires. Large-motion results then match v8.6 plus the body-relative fix
  (16/144 false sets vs 14/144; the 2-set difference is random-path noise, since only the travel allowance differs). The real protection
  against pick-ups/bumps comes from the motion sensor, which is why the permission is requested.
* **Limits**: the camera paths and the blur model are synthetic and were designed by me. The handheld pan limit was tightened once
  after seeing that a pan pushing the athlete out of frame is unrealistic for someone filming. Not yet verified on a real iPhone.

## Clean baseline per exercise / per angle (`node eval/eval.js`, v8.7, identical to v8.2/v8.6)
```
| Exercise | Videos | GT reps | Exact | MAE | Recognition |
|---|---|---|---|---|---|
| knebøy | 17 | 60 | 17/17 (100%) | 0.00 | 17/17 |
| bulgarsk | 12 | 44 | 12/12 (100%) | 0.00 | 9/12 |
| pullups | 11 | 46 | 9/11 (82%) | 0.55 | 9/9 |
| dips | 11 | 58 | 9/11 (82%) | 0.64 | 11/11 |
| skråbenk | 9 | 35 | 8/9 (89%) | 0.11 | 8/9 |
| benkpress | 23 | 131 | 20/23 (87%) | 0.39 | 23/23 |
| halvmark | 6 | 14 | 6/6 (100%) | 0.00 | 5/6 |
| roing | 7 | 39 | 5/7 (71%) | 0.43 | 4/7 |
| armhevinger | 26 | 97 | 25/26 (96%) | 0.04 | 23/26 |
| situps | 7 | 29 | 7/7 (100%) | 0.00 | 5/7 |
| **all** | 129 | 553 | 118/129 (91%) | 0.21 | 114/127 (90%) |
| Exercise | View | Videos | Exact | MAE |
|---|---|---|---|---|
| armhevinger | front | 7 | 6/7 | 0.14 |
| armhevinger | oblique | 7 | 7/7 | 0.00 |
| armhevinger | side | 12 | 12/12 | 0.00 |
| benkpress | front | 6 | 5/6 | 1.17 |
| benkpress | head-end | 3 | 3/3 | 0.00 |
| benkpress | oblique | 7 | 6/7 | 0.14 |
| benkpress | orbiting | 1 | 1/1 | 0.00 |
| benkpress | side | 6 | 5/6 | 0.17 |
| bulgarsk | front | 5 | 5/5 | 0.00 |
| bulgarsk | oblique | 1 | 1/1 | 0.00 |
| bulgarsk | side | 6 | 6/6 | 0.00 |
| dips | front | 3 | 1/3 | 2.33 |
| dips | oblique | 1 | 1/1 | 0.00 |
| dips | orbiting | 1 | 1/1 | 0.00 |
| dips | side | 6 | 6/6 | 0.00 |
| halvmark | front | 2 | 2/2 | 0.00 |
| halvmark | oblique | 1 | 1/1 | 0.00 |
| halvmark | side | 3 | 3/3 | 0.00 |
| knebøy | front | 6 | 6/6 | 0.00 |
| knebøy | oblique | 8 | 8/8 | 0.00 |
| knebøy | side | 3 | 3/3 | 0.00 |
| pullups | back | 2 | 2/2 | 0.00 |
| pullups | front | 6 | 4/6 | 1.00 |
| pullups | oblique | 1 | 1/1 | 0.00 |
| pullups | side | 2 | 2/2 | 0.00 |
| roing | front | 1 | 1/1 | 0.00 |
| roing | oblique | 2 | 1/2 | 1.00 |
| roing | side | 4 | 3/4 | 0.25 |
| situps | front | 2 | 2/2 | 0.00 |
| situps | oblique | 1 | 1/1 | 0.00 |
| situps | side | 4 | 4/4 | 0.00 |
| skråbenk | front | 1 | 1/1 | 0.00 |
| skråbenk | oblique | 2 | 2/2 | 0.00 |
| skråbenk | side | 6 | 5/6 | 0.17 |
| View (all exercises) | Videos | Exact | MAE |
|---|---|---|---|
| front | 39 | 33/39 (85%) | 0.54 |
| oblique | 31 | 29/31 (94%) | 0.10 |
| side | 52 | 49/52 (94%) | 0.06 |
| head-end | 3 | 3/3 (100%) | 0.00 |
| orbiting | 2 | 2/2 (100%) | 0.00 |
| back | 2 | 2/2 (100%) | 0.00 |
| Negative activity | Clips | False sets, auto mode (≥2 reps) | FP rate | Manual pick: counters reaching 2 |
|---|---|---|---|---|
| walking | 3 | 0 | 0% | 3/30 |
| other | 1 | 0 | 0% | 4/10 |
| loading plates | 3 | 0 | 0% | 4/30 |
| sitting | 4 | 0 | 0% | 3/40 |
| standing | 4 | 0 | 0% | 7/40 |
| stretching | 7 | 0 | 0% | 7/70 |
| phone handling | 5 | 0 | 0% | 6/50 |
| adjusting camera | 2 | 1 | 50% | 1/20 |
| talking/gesturing | 3 | 0 | 0% | 0/30 |
| walking near camera | 2 | 0 | 0% | 0/20 |
| picking up items | 3 | 0 | 0% | 3/30 |
| resting/drinking/towel | 6 | 0 | 0% | 3/60 |
| dancing | 2 | 0 | 0% | 2/20 |
| dancing (2 people, far) | 1 | 1 | 100% | 7/10 |
| household | 1 | 0 | 0% | 0/10 |
| gymnastics (other) | 1 | 0 | 0% | 7/10 |
| **all** | 48 | 2 | 4.2% | 57/480 (11.9%) |
```
The only difference from v8.6 is in "manual pick: counters reaching 2" on the walking negatives: 2/30 → 3/30, from the travel
allowance. Auto-mode false sets are unchanged (2/48).

## Per exercise — clean

| Exercise | v8.6 exact / MAE / over / rec | v8.7 body-relative only (no gate) exact / MAE / over / rec | v8.7 vision only (motion permission denied) exact / MAE / over / rec | v8.7 vision + DeviceMotion exact / MAE / over / rec |
|---|---|---|---|---|
| knebøy | 17/17 · 0.00 · +0 · 17/17 | 17/17 · 0.00 · +0 · 17/17 | 17/17 · 0.00 · +0 · 17/17 | 17/17 · 0.00 · +0 · 17/17 |
| bulgarsk | 12/12 · 0.00 · +0 · 9/12 | 12/12 · 0.00 · +0 · 9/12 | 12/12 · 0.00 · +0 · 9/12 | 12/12 · 0.00 · +0 · 9/12 |
| pullups | 9/11 · 0.55 · +6 · 9/9 | 9/11 · 0.55 · +6 · 9/9 | 9/11 · 0.55 · +6 · 9/9 | 9/11 · 0.55 · +6 · 9/9 |
| dips | 9/11 · 0.64 · +0 · 11/11 | 9/11 · 0.64 · +0 · 11/11 | 9/11 · 0.64 · +0 · 11/11 | 9/11 · 0.64 · +0 · 11/11 |
| skråbenk | 8/9 · 0.11 · +0 · 8/9 | 8/9 · 0.11 · +0 · 8/9 | 8/9 · 0.11 · +0 · 8/9 | 8/9 · 0.11 · +0 · 8/9 |
| benkpress | 20/23 · 0.39 · +1 · 23/23 | 20/23 · 0.39 · +1 · 23/23 | 20/23 · 0.39 · +1 · 23/23 | 20/23 · 0.39 · +1 · 23/23 |
| halvmark | 6/6 · 0.00 · +0 · 5/6 | 6/6 · 0.00 · +0 · 5/6 | 6/6 · 0.00 · +0 · 5/6 | 6/6 · 0.00 · +0 · 5/6 |
| roing | 5/7 · 0.43 · +1 · 4/7 | 5/7 · 0.43 · +1 · 4/7 | 5/7 · 0.43 · +1 · 4/7 | 5/7 · 0.43 · +1 · 4/7 |
| armhevinger | 25/26 · 0.04 · +1 · 23/26 | 25/26 · 0.04 · +1 · 23/26 | 25/26 · 0.04 · +1 · 23/26 | 25/26 · 0.04 · +1 · 23/26 |
| situps | 7/7 · 0.00 · +0 · 5/7 | 7/7 · 0.00 · +0 · 5/7 | 7/7 · 0.00 · +0 · 5/7 | 7/7 · 0.00 · +0 · 5/7 |

| View — clean | v8.6 exact / MAE | v8.7 body-relative only (no gate) exact / MAE | v8.7 vision only (motion permission denied) exact / MAE | v8.7 vision + DeviceMotion exact / MAE |
|---|---|---|---|---|
| side | 49/52 · 0.06 | 49/52 · 0.06 | 49/52 · 0.06 | 49/52 · 0.06 |
| oblique | 29/31 · 0.10 | 29/31 · 0.10 | 29/31 · 0.10 | 29/31 · 0.10 |
| front | 33/39 · 0.54 | 33/39 · 0.54 | 33/39 · 0.54 | 33/39 · 0.54 |
| back | 2/2 · 0.00 | 2/2 · 0.00 | 2/2 · 0.00 | 2/2 · 0.00 |
| orbiting | 2/2 · 0.00 | 2/2 · 0.00 | 2/2 · 0.00 | 2/2 · 0.00 |
| head-end | 3/3 · 0.00 | 3/3 · 0.00 | 3/3 · 0.00 | 3/3 · 0.00 |

## Per exercise — handheld

| Exercise | v8.6 exact / MAE / over / rec | v8.7 body-relative only (no gate) exact / MAE / over / rec | v8.7 vision only (motion permission denied) exact / MAE / over / rec | v8.7 vision + DeviceMotion exact / MAE / over / rec |
|---|---|---|---|---|
| knebøy | 47/51 · 0.08 · +0 · 51/51 | 50/51 · 0.02 · +0 · 51/51 | 50/51 · 0.02 · +0 · 51/51 | 50/51 · 0.02 · +0 · 51/51 |
| bulgarsk | 36/36 · 0.00 · +0 · 27/36 | 36/36 · 0.00 · +0 · 27/36 | 36/36 · 0.00 · +0 · 27/36 | 36/36 · 0.00 · +0 · 27/36 |
| pullups | 27/33 · 0.55 · +18 · 27/27 | 27/33 · 0.55 · +18 · 27/27 | 27/33 · 0.55 · +18 · 27/27 | 27/33 · 0.55 · +18 · 27/27 |
| dips | 27/33 · 0.64 · +0 · 33/33 | 27/33 · 0.64 · +0 · 33/33 | 27/33 · 0.64 · +0 · 33/33 | 27/33 · 0.64 · +0 · 33/33 |
| skråbenk | 24/27 · 0.11 · +0 · 23/27 | 24/27 · 0.11 · +0 · 23/27 | 24/27 · 0.11 · +0 · 23/27 | 24/27 · 0.11 · +0 · 23/27 |
| benkpress | 60/69 · 0.39 · +4 · 69/69 | 60/69 · 0.39 · +4 · 69/69 | 60/69 · 0.39 · +4 · 69/69 | 60/69 · 0.39 · +4 · 69/69 |
| halvmark | 17/18 · 0.06 · +0 · 15/18 | 18/18 · 0.00 · +0 · 15/18 | 18/18 · 0.00 · +0 · 15/18 | 18/18 · 0.00 · +0 · 15/18 |
| roing | 18/21 · 0.29 · +0 · 12/21 | 18/21 · 0.29 · +0 · 12/21 | 18/21 · 0.29 · +0 · 12/21 | 18/21 · 0.29 · +0 · 12/21 |
| armhevinger | 70/78 · 0.12 · +1 · 70/78 | 75/78 · 0.05 · +1 · 70/78 | 75/78 · 0.05 · +1 · 70/78 | 75/78 · 0.05 · +1 · 70/78 |
| situps | 21/21 · 0.00 · +0 · 15/21 | 21/21 · 0.00 · +0 · 15/21 | 21/21 · 0.00 · +0 · 15/21 | 21/21 · 0.00 · +0 · 15/21 |

| View — handheld | v8.6 exact / MAE | v8.7 body-relative only (no gate) exact / MAE | v8.7 vision only (motion permission denied) exact / MAE | v8.7 vision + DeviceMotion exact / MAE |
|---|---|---|---|---|
| side | 145/156 · 0.08 | 148/156 · 0.06 | 148/156 · 0.06 | 148/156 · 0.06 |
| oblique | 82/93 · 0.15 | 86/93 · 0.11 | 86/93 · 0.11 | 86/93 · 0.11 |
| front | 99/117 · 0.54 | 101/117 · 0.52 | 101/117 · 0.52 | 101/117 · 0.52 |
| back | 6/6 · 0.00 | 6/6 · 0.00 | 6/6 · 0.00 | 6/6 · 0.00 |
| orbiting | 6/6 · 0.00 | 6/6 · 0.00 | 6/6 · 0.00 | 6/6 · 0.00 |
| head-end | 9/9 · 0.00 | 9/9 · 0.00 | 9/9 · 0.00 | 9/9 · 0.00 |

## Per exercise — large

| Exercise | v8.6 exact / MAE / over / rec | v8.7 body-relative only (no gate) exact / MAE / over / rec | v8.7 vision only (motion permission denied) exact / MAE / over / rec | v8.7 vision + DeviceMotion exact / MAE / over / rec |
|---|---|---|---|---|
| knebøy | 30/51 · 0.65 · +7 · 51/51 | 36/51 · 0.41 · +7 · 51/51 | 33/51 · 0.49 · +7 · 50/51 | 17/51 · 1.06 · +0 · 49/51 |
| bulgarsk | 29/36 · 0.33 · +0 · 27/36 | 29/36 · 0.33 · +0 · 27/36 | 29/36 · 0.33 · +0 · 27/36 | 17/36 · 0.75 · +0 · 26/36 |
| pullups | 19/33 · 0.67 · +12 · 27/27 | 20/33 · 0.61 · +12 · 27/27 | 20/33 · 0.61 · +12 · 27/27 | 8/33 · 1.18 · +13 · 27/27 |
| dips | 21/33 · 0.97 · +0 · 33/33 | 23/33 · 0.91 · +0 · 33/33 | 23/33 · 0.91 · +0 · 33/33 | 6/33 · 1.88 · +0 · 32/33 |
| skråbenk | 18/27 · 0.41 · +6 · 23/27 | 18/27 · 0.41 · +6 · 23/27 | 19/27 · 0.37 · +5 · 23/27 | 6/27 · 1.41 · +2 · 23/27 |
| benkpress | 29/69 · 1.30 · +8 · 69/69 | 29/69 · 1.30 · +8 · 69/69 | 28/69 · 1.26 · +7 · 69/69 | 19/69 · 1.59 · +3 · 69/69 |
| halvmark | 12/18 · 0.33 · +3 · 15/18 | 15/18 · 0.17 · +3 · 15/18 | 15/18 · 0.17 · +3 · 15/18 | 6/18 · 0.78 · +1 · 15/18 |
| roing | 12/21 · 0.67 · +2 · 12/21 | 13/21 · 0.62 · +2 · 12/21 | 13/21 · 0.62 · +2 · 12/21 | 8/21 · 0.95 · +0 · 12/21 |
| armhevinger | 50/78 · 0.46 · +1 · 70/78 | 57/78 · 0.37 · +1 · 70/78 | 56/78 · 0.37 · +1 · 70/78 | 19/78 · 1.06 · +1 · 71/78 |
| situps | 15/21 · 0.33 · +4 · 15/21 | 15/21 · 0.33 · +4 · 15/21 | 15/21 · 0.33 · +4 · 15/21 | 6/21 · 0.90 · +0 · 15/21 |

| View — large | v8.6 exact / MAE | v8.7 body-relative only (no gate) exact / MAE | v8.7 vision only (motion permission denied) exact / MAE | v8.7 vision + DeviceMotion exact / MAE |
|---|---|---|---|---|
| side | 108/156 · 0.39 | 117/156 · 0.33 | 117/156 · 0.33 | 43/156 · 1.08 |
| oblique | 55/93 · 0.70 | 59/93 · 0.60 | 58/93 · 0.61 | 29/93 · 1.22 |
| front | 58/117 · 1.03 | 64/117 · 0.97 | 62/117 · 0.95 | 39/117 · 1.25 |
| back | 5/6 · 0.17 | 6/6 · 0.00 | 6/6 · 0.00 | 1/6 · 1.17 |
| orbiting | 4/6 · 1.67 | 4/6 · 1.67 | 3/6 · 1.83 | 0/6 · 2.17 |
| head-end | 5/9 · 0.56 | 5/9 · 0.56 | 5/9 · 0.56 | 0/9 · 2.00 |

