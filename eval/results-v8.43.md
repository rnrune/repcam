# v8.43 — archive regressions fixed, squat walk-out, 5 Nov clips in eval, push gate

Rune 5 Nov follow-up («Sett i gang og fiks alt du kan»). Every change verified alone; push only after the full `--all` per-clip gate vs v8.42 on the identical manifest showed 0 worse clips.

## 1. Archive regressions from v8.40 (fixed)
**Bug:** v8.40 refused *every* steal of a mature lock (4+ reps). That stopped the mw3uun14 end-of-set dips steal, but also three real corrections of a wrong early lock: mvr3vtnn knebøy→halvmark, mvvf7yz roing→skråbenk, mw15189o bulgarsk→curl (attribution with kill switches: all three return with RELOCK off; v8.41 ankDxQ is not involved).
**Fix:** a mature lock is only protected when the stealing counter has more than `RELOCK_CFG.matureSlack` (1) extra reps (good steals: +0/+1 — same reps; mw3uun14 dips: 11 vs 9). Kill switch `repcam.halvmarkDips=off|shadow`; shadow is now TRUE shadow (v8.39 behaviour + `RELOCK_CFG.shadowLog`). Rejected try: wait for one more pick rep before a mature steal (lost mvr3vtnn).

## 2. Squat walk-out sets the amplitude (new)
**Bug:** mw3u9xk (12×50 kg, app 8): a 7.6 s walk-out "rep" (amp 0.53) set the adaptive amplitude; the first real reps (~0.27) fell under cntRatio × typAmp. **Fix:** knebøy candidates slower than `AMP_DUR_CFG.maxDur` (7 s) no longer feed the adaptive amplitude. 8→11. Kill switch `repcam.sqAmpDur=off|shadow`. Rejected: maxDur 5 (5.8–5.9 s setup moves in negatives mvr3x5c8 / mw3uraal protected them).

## Not changed (tried, rejected)
- Bulgarian mw3v0giw 15/16: minAmp 0.13 gives 16 only through a spurious 0.8 s half-rep on leg 2; the real miss is a ≈0.10-deep rep at ≈236.4 s on leg 1. Kept 0.14.
- RDL first bar pickup as rep: rise-from-floor rule adds the pickup, but mvr3vtnn (Oct GT 9) → 10 and mw3uun14 → 10 (its 9th counted rep is the bar going down), and it shifted relock. Needs an end-of-set "bar down" drop too — later.

## Eval (same manifest, 100 clips incl. 13 new 5 Nov clips, 4 negatives)
| | v8.42 | v8.43 |
|---|---|---|
| exact | 86/100 | 89/100 |
| exercise | 73/77 | 76/77 |
| rep MAE | 0.64 | 0.22 |
| false sets | 2/23 | 2/23 |
| core | 14/14 | 14/14 |
| 30 Hz core | 12/14 | 12/14 |

Per-clip diff: 4 better, 0 worse (mvr3vtnn, mvvf7yz, mw15189o fixed; mw3u9xk 8→11).

## Tooling
`run.js --json FILE` / `--diff FILE` (per-clip badness; any worse → exit 1). `node tools/verify.js gate [--base REF]` runs REF's reps.js and the working tree on the same manifest and blocks on any worse clip; writes `eval/baseline.json`.
