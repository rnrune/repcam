# v8.42 — Bulgarian undercount (minAmp)

**Bug:** After v8.41 IDs Bulgarian correctly, counts still short: `mw3v0giwaffe81c2` 10 vs GT 16; `mw3v3mef43e63298` 5 vs GT 8. Rune: try a count fix; compare to start-of-day.

**Diagnosis:** Rejects in the saved window are rare. Working-leg knee travel in rear45 often sits just under `minAmp` 0.18 (torso units), so cycles never become pending reps. (Separate issue: an earlier window ~50–120 can be stolen by sticky `armhevinger`/`skråbenk` before lock — not changed here.)

**Fix (one change):** `BULG_COUNT_CFG = { minAmp: 0.14, mode: 'on' }` (was 0.18). Kill switch `localStorage repcam.bulgCount = off | shadow` restores 0.18 (**true shadow** = baseline behavior).

**Eval:** core **14/14**, `--all` must-fail **0**. vs v8.41: **0 per-clip regressions**; mw3v3mef 5→8; mw3v0giw 10→15 (GT 16). Rep MAE 0.59→0.47.

**Apples-to-apples (same manifest):** v8.39 exact 81/87 · v8.41 79/87 · cand 79/87. Day's ID fixes help session clips; three archive exercise regs vs morning (already in v8.41: mvr3vtnn, mvvf7yz, mw15189o) remain.

**Not in this change:** sticky false pick wiping first Bulgarian window; camera/FPS; RDL first-pickup.
