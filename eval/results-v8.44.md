# v8.44 — RDL bar set down (Rune 14 Nov: first lift is not a rep)

**Fasit change (commit 94943c7):** rumensk markløft/halvmark no longer counts the first bar pickup: mw3uo69 8→7, mw3uraal 9→8, mw3uun14 9→8. Archive halvmark GT unchanged (mvr3vtnn/mvr3slr3 implicit «9 × 100 kg» = app count, no sign of pickup; mvr3phm8 already GT 6 clean reps).

**Bug:** mw3uun14 counted 9: 8 reps (amp 0.30–0.43), a 5.6 s pause, then the bar goes to the floor (pose flips, amp 1.43) = 9th "rep".
**Fix:** halvmark last rep ≥ `RDL_TAIL_CFG.ratio` (2.5) × median amp AND gap ≥ 1.4 × median gap → dropped (≥4 other reps). Kill switch `repcam.rdlTail=off|shadow` (true shadow: baseline + shadowLog).
**Gate vs v8.43 (same manifest):** 1 better (mw3uun14 9→8 ✓), 0 worse. exact 88→89/100, MAE 0.21→0.19, false sets 2/23, core 14/14, 30 Hz core unchanged.
**Left:** mw3uraal 7/8 (one shallow rep ≈0.17 < minAmp 0.22), mw3uo69 read as knebøy.
