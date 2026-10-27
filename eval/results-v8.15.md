# v8.15: rest gate (shadow) and session summary cards

The bug, in one sentence: between sets the app keeps the last exercise guess and every counter running, so two rigging motions (loading plates, walking to the phone) lock and autosave as a false set.

## A) Rest gate: SHADOW mode only, the engine is unchanged

`rest.js` holds `REST_CFG`: `refractMs` 2000, `readyHoldMs` 700, `minVis` 0.5, `torsoMin`/`torsoMax` 0.08/0.6 of frame height, `stillTorso` 0.25.

How it works:
1. After a save (and at session start) the app is in REST.
2. A set may only start once the person holds a READY posture: shoulders and hips visible, plus knees or wrists, at a plausible distance, and still.
3. When the gate is ACTIVE, the counters ignore frames and the picker is cleared until READY.

In the app (shadow) the gate decides nothing. Each saved set gets `restShadow` `{v: would-allow|would-suppress, readyAt (s relative to first rep), ex, reps, auto}`, both in the feedback `meta.json` and in the console as `[restShadow]`.

Offline result, `node eval/real/rest-shadow.js` (eval/real, excluded tier skipped, 45 cases):

| | now | gate active |
|---|---|---|
| exact | 28/45 | 29/45 |
| core | 19/19 | **18/19** (k2vt dips 12 → roing 11) |
| false sets on rest/rigging clips (≥ 2 reps) | 3 | 2 (nq3e curl 2 removed) |
| correct cases lost / gained | | 1 / 2 (gained: ehf7 knebøy 9 → 8, nq3e) |

Other observations:
- Lone stray reps are also removed (o841, ztyb, rto3, ctaf, i53q). These already counted as OK, because a single rep is never saved.
- Shadow verdicts on correct sets: `would-suppress` on k2vt dips 12 and on V-situp s3 (a junk set saved a few seconds earlier restarts REST).

An earlier stricter config (`refractMs` 4000, `readyHoldMs` 1000, `stillTorso` 0.12) was worse: core 17/19.

Verdict: not clearly good (core is not intact), so no toggle yet; it stays in shadow only. The `restShadow` field in real feedback should show whether REST should only restart after a *real* set (≥ 4 reps) and whether READY needs a per-exercise posture.

## B) UI: session summary cards

Hjem (today's workouts) and Historikk now show one collapsed card per workout. Each card has:
- the time range, duration and volume;
- per exercise: number of sets, total reps and top weight;
- the Strava status (when connected) and the number of sets.

Tapping a card opens it. The open card shows:
- on Hjem only: the per-exercise summary with its sparkline;
- every set (tap to edit or delete);
- ＋ Legg til sett and 🗑 slett økt.

Open cards stay open across re-renders and reloads in the same tab. The texts are in all 7 languages.

## Checks

- Unit tests: test, store/i18n, v87, v88, v89, v813, and the new test-v815 (7 tests). All green.
- tests/e2e-v813 passes; it now opens the card first.
- `tools/verify.js replay --tier core`: 19/19.
- `tools/verify.js app mvr3gojt`: knebøy 8 × 20, no page errors.
- `tools/verify.js ui` (new subcommand): screenshots of Hjem and Historikk.
- `reps.js` is unchanged, so the full stock eval was not run.
