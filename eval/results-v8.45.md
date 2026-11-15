# v8.45 — plate-based bench counter at the side angle (15 Nov 2026)

**Bug.** From the side, the bar's plate hides the upper body, so the pose collapses: the wrists jitter and benkpress/skråbenk reps are missed or made up. Session 15 Nov (side, about 80–85°): app/replay gave 3/12, 2 (replay 1)/5, 0 (replay 1)/8, 0 (replay 13)/8 and 5 (replay 0)/8.

**Fix (plate.js).**
- The bar is followed as a dark blob on a 72 px wide gray frame at 15 Hz. Each pixel has a causal background: it follows a brighter pixel fast (0.25) and a darker one slowly (0.004). The mask is background − frame > 40; we track its centroid y and its mass.
- **Counter.** A zigzag on the smoothed y (prominence 0.03 of frame height) finds the bottoms. Bottoms are grouped into runs: gap 0.6–4 s and amplitude within ×2.5 of the run.
- **Unrack** is not a rep. A first bottom where the plate sat still for more than 0.8 s is dropped, and so is an edge gap more than 2× the median.
- **Rack-and-still ends the set.** The plate staying within 0.02 for 2.5 s after a run of 3 or more triggers an immediate autosave.
- All thresholds are in `PLATE_CFG`.
- **Wrapper.** `Plate.wrapCounter` wraps the benkpress/skråbenk counters only when the session camera gives a side angle for them. In on-mode, while the plate is seen in at least 60% of samples, the set's reps and repTimes come from the plate.
- **Kill switch** `localStorage repcam.plateBench = off | shadow | on`:
  - shadow = the pose count exactly as before; the plate count goes to the clip meta `plateLog`.
  - The rack-still end belongs to the same switch and is active only in on-mode.
- **Clip meta** now carries `plateTrack` (`[t, y, mass]` at 15 Hz, numbers only), so later sessions can be replayed with the plate.
- **Eval.** `tools/plate-track.js` runs the same tracker on a clip and writes `eval/real/<id>.plate.json`; this is derived numbers only, never video. `run.js` feeds the track to the wrapped counters (side-angle entries, window-filtered) and has `--plate off|shadow|on`. The gate's base always runs `--plate off`.

## Gate (`node tools/verify.js gate`, --all, identical manifest, 112 clips)
| | exact | exercise | rep MAE | false sets | side angle | core | worst |
|---|---|---|---|---|---|---|---|
| v8.44 (origin/main) | 94/112 | 85/86 | 0.59 | 3/26 | 6/12 | 14/14 | 12/30 |
| v8.45 shadow | 94/112 | 85/86 | 0.59 | 3/26 | 6/12 | 14/14 | 12/30 |
| **v8.45 on (shipped)** | **99/112** | 85/86 | **0.21** | 3/26 | **11/12** | 14/14 | 17/30 |

On vs v8.44: 5 better, 0 worse.
- mwi7wmjd benk 3→12 ✓
- mwi802ro 1→5 ✓
- mwi887bt-a 1→8 ✓
- mwi887bt-b 13→8 ✓
- mwi81af6 0→8 ✓

Shadow vs v8.44: 0 changed (a true shadow). Negatives at the side angle (rigging mwi7v8cd, mwi887bt-c) stay 0 in on-mode. The remaining side failure is mwi89q18 (pullups×4 on a dip-belt hang with 1 real pull-up); it is a pose issue, not a plate issue.

**Default = on**, because the gate showed 0 regressions and all 5 side bench sets were exact, against 0/5 before. Caveat: tuned and tested on one session (one gym, one camera position, 5 sets). The unrack-dwell rule was added after seeing mwi81af6, so there is no held-out bench data yet. Revert with `repcam.plateBench=shadow`.

**Browser proof** (headless Chrome, real MediaPipe, fake camera = the mwi81af6 video, camera position side):
- on: benkpress×8 saved by rack-and-still (pose alone counted 1), 0 page errors.
- shadow: the app saved vsitup×6, which is the old behaviour, while the plate counted 8 in the background.

## Live vs replay (mwi8db6r: live roing×7, replay pullups×6)
**Cause:** state carried over between sets in the live app.
- The picker is sticky and `autoEx` survives saves, so a new set is locked at 2 reps on the **stale** exercise from earlier activity (roing in the live run). The clip is trimmed to 30 s of idle before the set, so the frames that made roing the pick are not in the clip.
- The stale roing counter then holds more reps than pull-ups (roing 9 vs pullups 6, because the arms move in both), so `relock` refuses the steal.
- At save, sig gave 'veto-noalt' (kept) and tempo said 'slow' → «Bekreft usikkert sett». Rune confirmed, so it was saved as roing×7.

**Reproduction:** replaying mwi8acvd + mwi8db6r back to back (real time offsets):
- The picker keeps 'skråbenk' from the end of the previous clip for 120 s, and the set locks to skråbenk×8.
- Sig 'posture' then drops it, so the pull-up set is lost in replay too.
- A fresh replay of the single clip gives pullups×6.

**Not fixed:** the live frames before the clip are missing, so a stale-pick guard (for example a picker reset after save, or deferring the lock when the pick predates the set) cannot be validated on stored data. A candidate with its own kill switch is planned for when the queued clips arrive.
