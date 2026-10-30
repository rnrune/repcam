# Eval

Since 30 Oct 2026 the eval uses **only Rune's own training clips** (full ground truth). The earlier public/web clip
eval (Pexels/Wikimedia, `eval.js`, `camera.js`) was removed; it remains in git history before this commit.

* `eval/real/` — landmark files (`<id>.lm.json`) from Rune's feedback clips plus `manifest.json` with tiers
  `core` (must stay exact), `worst`, `pass`, `excluded`. Run `node eval/real/run.js [--hz 30]`.
* `eval/real/bar-shadow.js` — bar tracker shadow analysis.
* `eval/feedback/` — feedback pipeline tooling.
* `eval/results-v*.md` — per-version results.
* Videos are never committed. Fake-camera clips for `tools/verify.js` / e2e tests are cut from Rune's clips into
  `/workspace/repcam-test/rune-bench.y4m` and `rune-pullups.y4m`.
