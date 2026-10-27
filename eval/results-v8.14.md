# v8.14 results

Changes:
- Ground truth from Rune's review answers: ehf7 = 8 and k128 = 8 are confirmed. yc9w is bulgarsk 16 (8 per leg, both legs in the clip).
- New real clip mvr4g3o2 (weighted V-situps, plate held up, side view). Two windowed cases were added: s2 (20 reps) and s3 (12 reps), tier worst. Only landmarks are stored.
- Recognizer:
  - V-situp gets a second scoring path for a small shoulder move (0.06–0.16) with a big leg lift (legLift 0.9–1.15). The old path stays for the synthetic cases.
  - Bench press and incline bench are damped when the legs swing (legLift 1.0–1.2).

| | v8.13 | v8.14 |
|---|---|---|
| real core | 19/19 | 19/19 |
| real exact | 27/55 | 28/55 |
| real exercise | 39/45 | 40/45 |
| real MAE | 2.56 | 1.91 |
| V-situp s2 / s3 | armhevinger 0 / benkpress 10 | vsitup 20 / vsitup 11 |
| stock eval | 118/129, MAE 0.21, rec 116/127 | 118/129, MAE 0.21, rec 115/127 (one stock clip with the right count changes its recognizer label) |

Still open:
- yc9w bulgarsk (legs hidden behind the bench, pose unusable) → roing 12.
- V-situp sets 1 and bulgarsk sets 2–3 never uploaded.

## Eval prune after Rune's full review (no engine change)

Rune's new rule: keep only clips that clearly show the exercise, in one continuous take, with no change of camera, angle or distance.

Removed or excluded:
- Deleted wc-06, wc-09, wc-10 (Rune: «Dette klippet kan du fjerne»).
- Tier `excluded` (kept in the manifest but not scored):
  - wc-01/04/05/07/12: Rune answered 2 reps each (wc-01 comment: «Starter og slutter midt i»). These are edited demo videos: the replayed rep times jump back, which means looped or cut footage.
  - wc-03: an edited demo with angle changes (13 landmark jumps), never reviewed.
  - yc9w bulgarsk: the legs are hidden behind the bench.
- run.js skips the `excluded` tier unless you run it with `--tier excluded`.

Other updates:
- RDL phm8, slr3 and vtnn: Rune confirmed 9 × 100 kg in the app (stored as `kgTrue`; the scored `kg` stays at the app default).

Result: core 19/19 · worst 1/18 · pass 8/8 · exact 28/45 · exercise 34/35 · MAE 0.86 · false sets 3/10.
Before the prune: worst 1/28, exact 28/55, exercise 40/45, MAE 1.91.
