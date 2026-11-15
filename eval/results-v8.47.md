# v8.47 — false sets, autosave relock, counters kept over a save, V-sit-up (15–16 Nov 2026, overnight iteration)

Base = v8.46 (origin/main), eval `--all`, plate on. One change at a time, each gated (`node tools/verify.js gate`: 0 worse).

| | v8.46 | v8.47 |
|---|---|---|
| exact | 99/112 | 105/112 |
| exercise | 84/86 | 85/86 |
| rep MAE | 0.24 | 0.15 |
| false sets | 3/26 | 0/26 |
| core | 14/14 | 14/14 |

(v8.46 is re-measured with the corrected runner, see "Eval fidelity". The runner used to report 99/112 · 85/86 · 0.21.)

## Changes (all thresholds in config, kill switches via localStorage; shadow = baseline + log)
1. **Pull-ups: hips must follow the shoulders** (`Reps.HIP_FOLLOW_CFG {ratio 0.6, minVis 0.6}`, `repcam.hipFollow=off|shadow`).
   - Bug: mwi89q18 rigging (hanging/adjusting) was counted as pull-ups×4.
   - Fix: a rep is rejected ('hipStill') when the hips are visible and their range is < 0.6 × the shoulder range.
   - Real reps measure ≥ 0.76 (mostly ≈1.1); the fakes measure 0.18–0.42.
2. **Leg sets: hip travel** (`Reps.LEG_TRAVEL_CFG {ex: knebøy/bulgarsk/halvmark, iqrMax 0.8}`, `repcam.legTravel=off|shadow`).
   - Bug: walking between stations was saved as a set: mw3un16x 'bulgarsk×4' (IQR 1.33) and mw14lzxg 'halvmark×4' (0.97).
   - Every real leg set has an IQR ≤ 0.51.
   - Fix: the sig check drops such a set ('legTravel').
3. **Autosave relock tie** (`Reps.RELOCK_TIE_CFG {maxLock 2, activeS 4}`, `repcam.relockTie=off|shadow`).
   - Bug: in mw3ufjnh, a 2-rep 'dips' lock from the walk-in autosaved while the squat counter was mid-set with 2 reps. The app saved dips×2.
   - Fix: at the autosave, a counter with ≥ as many reps (all after the lock's last rep, last rep < 4 s old) takes over. Result: knebøy×4.
4. **Counters kept over a save** (`Reps.SAVE_KEEP_CFG`, `repcam.saveKeep=off|shadow`).
   - Bug: in mw3ub9yv, the autosave of an earlier set fell in the descent of the squat set's first rep, and recreating every counter lost that rep (7/8).
   - Fix: the saved exercise's counter starts fresh. The others `forget(true)`: their reps and amplitudes are cleared, but the movement phase in progress is kept. Result: 8/8.
   - First try (forget without clearing amplitudes) made mw3v0giw 15 → 9, so it was not kept.
5. **V-sit-up ampIdle 20 s** (`Reps.EX.vsitup.ampIdle`, `repcam.vsitIdle=off`).
   - Bug: in mw3vd962, a 0.90 amplitude from 70 s earlier, together with a camera pause, hid the set's first 3 reps (17/20).
   - Fix: amplitudes older than 20 s are forgotten before the first rep. Result: 20/20.

## Eval fidelity (runner, not app)
- A set the sig check drops at the clip end is no longer reported, because the app does not save it.
- The eval-only sig 'veto→alt' relabel was removed: app.js `finishPending` only drops, it never relabels. Only mw3ufjnh depended on the relabel; with it removed, v8.46 actually gave dips×2 there.
- Plate counter: inactive unless the session camera position derives 'side' for bench/incline (`Camera.derive`; front45 → rear45 for lying presses). The runner applies it for angle 'side' only. Rigging negatives (mwi7v8cd, mwi887bt-c) stay at 0.

## Not fixed (needs data or too risky)
- mw3uo69 (halvmark → knebøy×10). The lock lands on early setup squats, and the halvmark counter only reaches 4 (amplitude ≈ 0.23 vs minAmp 0.22). Changing it needs more RDL clips filmed rear45.
- mw3uraal (RDL 7/8). The missed rep at 127.2 s is half depth (amp 0.24 vs ≈0.45). Lowering the threshold would count bar set-downs.
- mw3u9xk5 (knebøy 11/12). The first rep's descent includes the walk-in, giving a 7.6 s duration that breaks the pairing rule. pairDur 8 has no effect, and 12 also counts the walk-in rep.
- mw3ucgew 4/3; mvvf4x39 11/12 and mw14kx4t 9/8 (skråbenk front45): no root cause found without a new look at the video.
- Core at "30 Hz": the core clips are about 8 Hz natively, so 30 Hz is an upsampling artifact. Skipped.
