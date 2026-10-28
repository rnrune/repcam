# v8.16: bar/plate tracker in SHADOW mode

## What it is
`bar.js` (`BAR_CFG`, kill switch `enabled` or `localStorage repcam.barOff=1`) uses classical CV only:
- a 160 px wide gray frame at 5 Hz, only while the current exercise is knebøy, halvmark, benkpress, skråbenk or roing;
- Sobel edges in an ROI around the wrists, then a gradient-direction Hough vote for one circle (the plate);
- **coupling**, so rigging does not count: the plate centre must be level with the wrists (≤ 1.2 r), outside the hands on the bar axis (0.08–0.5 W), and its y step must follow the wrist y step. When both wrists are clearly visible, they must be level (horizontal bar);
- reps come from hysteresis on the coupled plate y (swing ≥ 0.8 r). Only **rhythmic** runs are kept: ≥ 2 reps and interval CV ≤ 0.5;
- `staticSeen` is set when the bar's y stays within 0.15 r for ≥ 2 s. It is an optional extra rest signal for barbell exercises only. The rest gate stays pose-only and does not read it, and a missing bar never blocks anything.

`app.js` logs `[barShadow]` to the console. On every saved barbell set, it adds `barShadow` {detFrac, cplFrac, reps, rawReps, repTimes (s relative to the first pose rep), staticMaxS, staticSeen, reliable, agree} to the feedback meta.json. Counts, the exercise guess and saves are untouched. Everything is wrapped in try/catch. It costs about 15 ms per detector frame in node at 5 Hz.

## Offline: `node eval/real/bar-shadow.js` (27 Oct videos on the box, whole clip incl. rigging/rest)
| clip | ex | truth | pose (replay) | bar | bar det | coupled | false bar reps in rigging/rest |
|---|---|---|---|---|---|---|---|
| mvr3cnad | knebøy 50 | 12 | 8 | 13 | 83% | 49% | 1 (84.4 s, before the set) |
| mvr3ehf7 | knebøy 80 | 8 | 9 | **8** | 71% | 43% | 0 |
| mvr3gojt | knebøy 100 | 8 | **8** | 10 | 84% | 59% | 2 (35.4 s unrack/walk-out, 70 s re-rack) |
| mvr3k128 | knebøy 100 | 8 | 7 | **8** | 85% | 48% | 0 (bar found the rep pose missed at 136 s) |
| mvr3naxy | knebøy 100 | 8 | **8** | **8** | 94% | 54% | 0 |
| mvr3o841 | halvmark | 9* | 1 | 0 | 96% | 19% | 0 |
| mvr3phm8 | halvmark | 9 | 10 | 7 | 96% | 55% | 0 |
| mvr3vtnn | halvmark | 9 | **9** | 0 | 96% | 21% | 0 |

Exact: bar 3/8, pose 3/8. Squat only: bar 3/5 exact and within ±2 on all 5; pose 2/5.
\* The eval manifest marks mvr3o841 as rigging only (the real set is not in the clip). Bar gives 0 reps there, which is correct.

Raw "det" is high everywhere because the Hough step always finds *some* circle (floor plates, the rack, the head). The meaningful number is "coupled". The squat.y4m proof (bodyweight squat, no barbell) gave detFrac 0.98, coupled 0.26 and 0 bar reps: no false reps, even with spurious circles.

All 3 false rigging reps on the squat clips are **unrack/re-rack** movements. The bar really is in the hands and moving vertically there, so coupling cannot reject them. Rejecting them would need walk detection (hip x travel) or trimming to the rhythmic core.

RDL: the near plate is visible and gets detected, but MediaPipe wrists in this side view are noisy, with the far wrist occluded and 20–30 px apart. Coupling therefore holds only about 20% of the time, giving 7/9 and 0/9.

## Checks
- `node tools/verify.js replay --tier core`: 19/19 exact.
- All test*.js pass, plus the new test-v816.js.
- doctor: ok (8.16 cache-bust).
- `node tools/verify.js app squat.y4m`: set saved as before, `[barShadow]` logged (proof json now records the shadow logs).

## Verdict
On squats from this camera angle, classical plate tracking is roughly as good as pose (3/5 exact vs 2/5) and fails in different places, so it is worth keeping in shadow as a second opinion. It is not ready to activate. It gets rack/walk-out reps, RDL coupling is weak, and it has not been tested on bench/row or other angles. A trained detector (for example a small YOLO/SSD for "plate" + "bar end", about 300–500 labelled frames across angles, lighting and plate colours, int8 on mobile) would remove the spurious circles and the dependence on wrist landmarks.
