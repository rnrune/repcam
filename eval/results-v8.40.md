# v8.40 — halvmark↔dips mature-lock steal

**Bug:** On `mw3uun1418e0dd87` (RDL / halvmark ×9 @110) the live app 8.39 saved **dips×9**. Diagnosis: `relock`'s v8.13 "ambiguous start" path stole a **mature** halvmark lock (9 reps) at set end when dips noise spiked the score and the dips counter had inflated to 11. The comment already said 4+ reps are never re-assigned, but that guard ran *after* the steal.

**Fix (one change):** `RELOCK_CFG = { matureMin: 4, mode: 'on' }` — refuse the v8.13 steal when the locked set already has ≥4 reps. Kill switch: `localStorage repcam.halvmarkDips = off | shadow`.

**Eval:** core **14/14**, `--all` must-fail **0**. New worst clip `mw3uun1418e0dd87` → halvmark×9 ✓. With kill switch off, same clip → dips×9 (reproduces the bug).

**Not in this change:** bulgarsk↔knebøy; halvmark undercount/first-pickup policy on other clips; mw3ucgew knebøy.
