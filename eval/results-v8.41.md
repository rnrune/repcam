# v8.41 — bulgarsk↔knebøy (rear-foot split)

**Bug:** Live app saved **knebøy×4** on `mw3v0giwaffe81c2` (fasit **bulgarsk×16** @70, 8/foot). Related `mw3v3mef43e63298` is the tail of the same set (bulgarsk×8). Rune cue (5 Nov): «Jeg ser i hvert fall tydelig at en fot strekkes ut bakover» — rear foot stretched backward.

**Diagnosis:** `split` used `ankDx` **median** (q=0.5) with side-view bars 1.12–1.3. In rear45 the horizontal foot gap only spikes intermittently; the median stayed below threshold so `bulgarsk` lost to `knebøy`.

**Fix (one change):** `SPLIT_CFG = { ankDxQ: 0.85, kneeDy: [0.3, 0.42], ankDx: [1.12, 1.3], mode: 'on' }` — high percentile on ankle separation captures the rear-foot stretch. Thresholds unchanged. Kill switch: `localStorage repcam.bulgSquat = off | shadow` (`off` → ankDxQ 0.5).

**Eval:** core **14/14**, `--all` must-fail **0**. Target clips: exercise **bulgarsk** (was knebøy); reps still undercount (10/16 and 5/8) — out of scope. Squat core `mvr3gojt` unchanged. Kill switch off reproduces knebøy×4.

**Not in this change:** halvmark first-pickup undercount; other open fasit items.
