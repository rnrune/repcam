# v8.9 — Rune's gym session 2026-10-25 (28 feedback clips), less over-counting, EZ curl, longer edit window

## Session → clips (eval/real, landmarks only, no video in git)
Rune's actual session: bench 50×12, 80×6, 100 4×6 · pull-ups +10 kg 4×6 · incline 80 3×8 · standing row 100 3×10 · then dips +15 ×12 / EZ curl 40 ×10 alternating 3×.
All 28 clips of the day (app 8.8, 09:41–10:24 UTC) were mapped from the clip end time (= the set's log time), the order above and the
10 Hz pose landmarks (signal plots: wrist–shoulder distance, shoulder height, wrist height, elbow/knee angles, torso tilt).
Truth = what happens **inside the clip**: the app split two bench sets in two (80×6 → clips 5r2m + 63hc, 100×6 #1 → 79nr + 7o35, 3 reps each),
and 5 clips are setup/rest/phone handling with no set (truth 0). The third curl set has no clip. Weights are not detected (kg = remembered value),
the replay checks the default kg only. Row truth 10 is Rune's number; the landmarks show 11–12 short pulls per set (re-check).

| Clip (UTC end) | Truth | App 8.8 live | v8.8 replay | v8.9 replay |
|---|---|---|---|---|
| mvnn4l651c1e1196 (09:43:49) | benkpress 12 | benkpress 13 | benkpress 13 | benkpress 12 ✓ |
| mvnn5r2m4dcaaed1 (09:44:44) | benkpress 3 | knebøy 2 | benkpress 2 | benkpress 2 |
| mvnn63hcade41090 (09:45:00) | benkpress 3 | benkpress 3 | benkpress 3 ✓ | benkpress 3 ✓ |
| mvnn79nr4e8f55a4 (09:45:54) | benkpress 3 | situps 4 | 0 | 0 |
| mvnn7o35d80c0438 (09:46:13) | benkpress 3 | benkpress 3 | benkpress 3 ✓ | benkpress 3 ✓ |
| mvnnauvh327e01f6 (09:48:42) | benkpress 6 | benkpress 7 | benkpress 7 | benkpress 7 |
| mvnne20j922852c2 (09:51:11) | benkpress 6 | benkpress 7 | benkpress 6 ✓ | benkpress 6 ✓ |
| mvnnh70nea07ec8a (09:53:37) | benkpress 6 | benkpress 6 | benkpress 6 ✓ | benkpress 6 ✓ |
| mvnni53q2857159c (09:54:22) | ingen sett (0) | knebøy 4 | knebøy 4 | knebøy 4 |
| mvnnjow896196e28 (09:55:34) | pullups 6 | skråbenk 6 | skråbenk 6 | pullups 6 ✓ |
| mvnnmlyb8d46d904 (09:57:50) | pullups 6 | pullups 5 | pullups 5 | pullups 5 |
| mvnnpi950c4573ee (10:00:05) | pullups 6 | knebøy 3 | knebøy 3 | pullups 5 |
| mvnnso2aea1f27b0 (10:02:33) | pullups 6 | pullups 6 | pullups 3 | pullups 7 |
| mvnnu10fd5aab31c (10:03:36) | ingen sett (0) | halvmark 6 | roing 7 | halvmark 4 |
| mvnnumk35bc1533f (10:04:04) | ingen sett (0) | roing 4 | roing 4 | roing 4 |
| mvnnvm4m78a14062 (10:04:50) | skråbenk 8 | skråbenk 11 | skråbenk 11 | skråbenk 8 ✓ |
| mvnnyske91a727d2 (10:07:19) | skråbenk 8 | skråbenk 12 | skråbenk 11 | skråbenk 8 ✓ |
| mvno21b4b03d0f8b (10:09:50) | skråbenk 8 | skråbenk 9 | skråbenk 9 | skråbenk 8 ✓ |
| mvno2nrl20c2da02 (10:10:19) | ingen sett (0) | halvmark 2 | 0 ✓ | 0 ✓ |
| mvno4ocl012d89f9 (10:11:53) | roing 10 | dips 8 | dips 9 | roing 12 |
| mvno6wnoab08c185 (10:13:37) | roing 10 | roing 13 | roing 12 | roing 11 |
| mvnoa62be037036e (10:16:09) | roing 10 | halvmark 4 | halvmark 2 | roing 12 |
| mvnoc4f7aa1e6640 (10:17:40) | dips 12 | dips 16 | dips 14 | roing 13 |
| mvnoctaf7a668445 (10:18:13) | ingen sett (0) | roing 8 | roing 4 | roing 4 |
| mvnoe7jm75332b16 (10:19:18) | curl 10 | roing 20 | roing 21 | curl 9 |
| mvnogfwn500e341f (10:21:02) | dips 12 | dips 13 | dips 13 | dips 13 |
| mvnohgsi2c916059 (10:21:50) | curl 10 | knebøy 9 | knebøy 8 | curl 10 ✓ |
| mvnok2vt347693bc (10:23:52) | dips 12 | dips 16 | dips 16 | dips 12 ✓ |

`node eval/real/run.js` (log rate, replays app auto mode incl. the 9 s autosave, the session's 28 clips + the 2 v8.8 clips):
* v8.8 engine: exact **7/30**, right exercise 19/25, rep MAE 3.12, false sets 4/5
* v8.9: exact **14/30**, right exercise **24/25**, rep MAE **1.08**, false sets 4/5 (`--hz 30`: 15/30, 24/25, MAE 1.12)
* Clips v8.9 gets exactly right are marked `regress` and fail the run / `test-v89.js` if they break.

## Root causes and fixes
1. **Over-counting (setup/re-rack "reps" at the edges of a set)** — incline 11/12 instead of 8, bench 13 instead of 12, dips 16 instead of 12.
   `flush()` now splits the set where a rep-to-rep gap is ≫ the set's own tempo (40th-percentile gap × 2.6, ≥3 s; ≥4 s at the tail so a
   grinding last rep stays) and drops edge groups of ≤2 reps, or ≤½ of the rest after a long (≥6 s) pause. Applies to every exercise.
2. **Stale background counters** — every exercise's counter runs all the time; a counter that collected junk minutes earlier handed it over
   when the picker switched to it (dips 16 = 4 old + 12). Counters that are not the current exercise now `forget()` reps older than 9 s
   (tracking continues).
3. **Set locked on setup motion / sets cut in half** — 2 "squats" while lying down locked knebøy, then the 9 s autosave saved
   "knebøy 2" mid bench set and reset every counter. `Reps.relock()`: while the locked set has ≤3 reps and has been idle ≥5 s, switch to
   the picked exercise if its counter has 3+ reps since; at the autosave (and the end of a clip) a counter with 2+ reps since and clearly
   more reps wins without a vote. A stray single rep now only resets *its* counter (it used to wipe a pull-up set in progress).
4. **EZ curl (new exercise `curl`, «EZ-curl»)** — upright, still torso, wrists swing ≥0.4 torso toward the shoulders while the shoulders
   barely move (rejects dips/pull-ups), no hip drop (squat) or hinge (RDL), whole body in view, straight legs. Squat score is damped when
   the hands swing much more than the shoulders. v8.8 logged these as roing 20 / knebøy 9 → now curl 9 / 10. Default kg 20, Strava EZ_BAR_CURL.
5. **Recognition**: pull-ups filmed from below with weight (median wrist only just above the shoulders, far above the hips, shoulders
   travel) were knebøy/skråbenk → pull-ups. Shallow "standing" rows (torso ~20–30°) were not roing at all (needed ≥25–45°) → roing;
   a lying torso (>80°) is no longer a row.
6. **Edit window**: the «Lagret … Angre / Endre» toast vanished after 7 s. It now stays until the next set has started (a rep counted)
   and at least 60 s (max 15 min). The workout log lists the session's last 3 sets as buttons — tap one to edit (✎) at any time.

## Standard eval (129 clips + 48 negatives), v8.8 → v8.9
* Exact 118/129 (91 %), MAE 0.21 — unchanged; per-exercise exact unchanged.
* Recognition 115 → **117/127** (roing 4/7 → 6/7).
* Negatives: false sets 2/48 (4.2 %) unchanged; manual-pick counters 56/480 → 64/528 (the 8 new ones are the curl counter when it is
  picked by hand on standing/stretching/dancing clips; auto mode never picks curl there).
* Camera-motion eval not rerun (gate untouched; test-v87 synthetic gate tests pass incl. curl).

## Tests run
test.js (160, + curl synthetic), test-v87 (41), test-v88 (must clips at log + 30 Hz), **test-v89 (37: session floor, curl, re-lock,
forget, edit window)**, test-store/strava/delete/feedback/v85, `tests/e2e.js` (36 PASS, + toast still shown after 9 s, tappable log row).

## Remaining weaknesses
* Rows count 11–12 per set vs Rune's 10 (short partial pulls between full ones?); dips +1 on one set (gfwn).
* Dips set 1 (c4f7) is still logged as roing: rows-like junk before the set locks roing with 4+ reps, and the row signal also moves in dips.
* Bench halves of split sets: 5r2m 2/3, 79nr 0/3 (lying down, unrack); pull-ups 5 instead of 6 in two sets (first rep from a dead hang).
* Setup/rest clips still produce a 4-rep "set" in 4 of 5 cases (slow irregular motion) — the app should get a rhythm check for 4-rep sets.
* Weights are still not detected.
