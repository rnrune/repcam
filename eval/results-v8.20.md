# v8.20 (31 Oct 2026) — Rune's clips only

Tempo gate (`Reps.TEMPO_CFG`, median rep gap > roing 2.5 s / curl 3 s / dips 2.5 s / halvmark 4 s = not a set). Ships in
**shadow** (verdict in feedback meta `tempoShadow`); `localStorage repcam.tempo=on` enforces, `=off` kill switch.
Eval `node eval/real/run.js --tempo on`: false sets 7/15 → 2/15, exact 35 → 41/61 (10 Hz), core 21/21.

Relabel: mvvfl1ka = row set 3 (t<190 s, replay roing 11 vs 10) + dips set 1 (t 190–236 s, replay dips 13 vs 12) — the "row read as dips" was a real dips set.

Tried and rolled back (2 tries each): dips minAmp 0.12/0.10 (no effect); dips cleanStill (+minRep 0.7): o3h7 9→13 but
mvvesvuf pullups→dips; curl wrists-level 0.3/0.2: breaks core mvnohgsi; pull-ups knee aux −0.35/−0.7: no effect.

## v8.21 / v8.22 (31 Oct)
* v8.21 «Bekreft usikkert sett»: ✓/✗ in the set toast (slow tempo or ≤3 reps); kill switch repcam.confirmOff=1; `verify.js confirm` PASS.
* Tempo gate roing 2.5 → 1.7 s (still shadow): with `--tempo on` false sets 2/15 → 0/15, core 21/21.
* dips cntRatio 0.45 (was 0.5): mvvfo3h7 9 → 12.
* curl endBend {tilt 40°, 0.4 s}: after bending to put the bar down no more reps; mvvfsawp 14 → 12.
* pull-ups edgeGapTail 4.5 (was 4): mvvf26hg 7 → 8.
* 10 Hz (`--tempo on`): exact 42 → 47/64, false sets 0/15, core 21/21. 30 Hz: core 18/21 (same 3 pre-existing misses).
* Rolled back: set-posture gate for rows (torso tilt > 15° share 0.75 / 0.6, no gain); rest/rigging posture only helped via tempo.
* Still open: mvvez2ad pull-ups 6/8 (kipping reps with knees up, wrists at frame top → pose 0), mvnnpi95 5/6, mvnnso2a 7/6, mvnogfwn dips 13/12, mvvfl1ka-dips 13/12, mvvfl1ka-row 11/10.
