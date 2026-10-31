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

## v8.22 (31 Oct)
* tempo gate roing 2.5 → 1.7 s (shadow): with `--tempo on` false sets 2/15 → **0/15**, core 21/21.
* dips `cntRatio` 0.45 (was 0.5): mvvfo3h7 9 → 12 ✓.
* curl `endBend {tilt 40°, dur 0.4 s}`: reps after the bar is put down are not counted: mvvfsawp 14 → 12 ✓.
* pull-ups `edgeGapTail` 4.5 (was 4): slow last rep kept: mvvf26hg 7 → 8 ✓. mvvez2ad stays 6/8 (its last two "reps" are out-of-pose dismount frames; video already deleted, could not inspect).
* Rolled back: roing set-posture gate (torso tilt > 15°, frac 0.75 with 1.5 s lead → broke core mvno4ocl; frac 0.6 no lead → no gain).
* 10 Hz, `--tempo on`: exact 47/64, exercise 48/49, MAE 0.84. 30 Hz: core 18/21 (same 3 pre-existing misses).

## v8.23 (31 Oct) — after Rune's manual review (clean data)
* Review applied: mvr3phm8 → last 6 reps (31.9–52.9 s), mvnnso2a → 122.1–134.6 s, truth 5 ("5 rene reps"), mvnoc4f7 → 57.9–85 s, mvvfd85j removed. mvr3cnad/ehf7/k128 skipped (unchanged, still in the review queue).
* dips `tailDrop {amp 0.75, gap 1.25}`: a last rep shallower than 0.75× the set median AND later than 1.25× the median gap (stepping off the bars) is dropped: mvvfl1ka-dips 13 → 12. mvnogfwn still 13.
* Rolled back: roing edgeGap 2.0 / 2.2 (no effect on mvvfl1ka-row 11/10).
* 10 Hz: tempo off exact 44/61, false sets 5/13; tempo on exact 50/61, false sets 0/13, MAE 0.29, exercise 48/48, core 21/21. Tempo on loses no clip that is correct with it off.

## v8.24 (31 Oct) — tempo rule ON by default
* Rune's review of the last 3: mvr3cnad removed, mvr3ehf7 from 51 s (truth 8, now exact), mvr3k128 118–133.3 s truth 4 (replay 3: rep 4 completes at 133.4 s, just after the cut).
* `TEMPO_CFG.mode = 'on'`: a slow set is saved and asked «Ser ikke ut som et sett – ✓ for å beholde»; ✓/Endre keeps, ✗ removes (notASet), no answer → removed when the toast goes (label kind `tempoRemoved`, not ground truth). Log in localStorage `repcam.tempo.log` + feedback meta. `repcam.tempo=off` kill switch, `=shadow` log only.
* Eval (tempo on): exact 50/60, MAE 0.21, exercise 47/47, false sets 0/13, core 21/21. Tempo off: 45/60, false sets 5/13.
* Bar tracker (shadow, live summaries in feedback meta; offline re-run impossible — videos deleted): benk 13/15, 10/12; skråbenk 5/12, 4/10; roing 2/10; 0/7 sets exact. Keep shadow, do not enable.

## v8.25
- Tempo: unanswered ✓/✗ now keeps the set, marked "usikker" (set card + history), not logged as truth; only ✗ removes.
- mvr3k128 trim end 134.0 s (gt 4) → 4 ✓.
- 10 Hz tempo on: exact 51/60, MAE 0.19, exercise 47/47, false sets 0/13, core 21/21.

## v8.26 — frame-rate study (10 Hz vs 30 Hz)
- Real rate: logged landmarks (fbSample, ≥100 ms throttle) are 8.3–10 Hz per clip (gaps p5/p50/p95 0.10/0.12/0.13 s). Detection itself is unthrottled (every rAF, detectForVideo); gap quantization (0.11/0.12 dominant) implies ≈17–26 Hz live. App now logs `poseRate` (n, med/p10/p90 ms, hz) in each label to measure it exactly.
- Eval: recorded timestamps as-is (real jitter) stay primary. New flags: --jitter f, --hold (repeat poses, new timestamps only), --jump, --ids.
- Baseline: rec 51/60 core 21/21 · 17 Hz 42 · 25 Hz 42 · 30 Hz 43/60 core 18/21. Hold@30: 45/60.
- Cause 1 (real frame-count dependency): median-of-3-FRAMES spike filter. Time-based (FILTER_CFG.medWin) makes hold@30 = 49/60 ≈ rec, but costs core curl mvnohgsi at rec (20/21); tried 0.27 and 0.3 s → kept OFF (medWin null).
- Cause 2: camera gate window span = win + 1 frame (10 Hz sees ~15 % more displacement). Span normalization (opts.normSpan) + minDisp 0.43: rec neutral, 30 Hz 41/60 → kept OFF.
- Remaining 30 Hz gap is mostly a linear-upsampling artifact (1-frame spikes become 200 ms ramps that survive filtering); glitch-step upsampling (--jump) did not close it. No engine change shipped.

## v8.27 — full-rate pose log
- App logs every processed pose frame (real per-frame timestamps) when feedback recording is on; kill switch localStorage `repcam.lmFull=0` (or Feedback.LM_CFG.full=false) → old 100 ms throttle + plain frames.
- Encoding `i16b64` (x,y int16 ×5000, vis uint8 ×100, t as ms deltas): 224 B/frame vs 524 before, max error 0.0001. ≈330 KB/min at 25 Hz, ≈400 KB/min at 30 Hz.
- Worker MAX_JSON 2 MB unchanged: client halves frames (marked `decimated`) if packed data > 1.8 MB (≈5 min at 25 Hz). Upload timeout already scales with size (45 s + size/50 kB/s).
- Eval loader (run.js normLm) reads old {frames} and new packed clips; replays recorded timestamps as-is. tools/meta-to-lm.js converts pulled metas.
