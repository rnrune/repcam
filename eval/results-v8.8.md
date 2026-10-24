# v8.8 — first real-user feedback clips (eval/real)

## Real clips (app replay in auto mode, logged ~10 Hz landmarks; `node eval/real/run.js`, also checked at --hz 30)
App 8.7 live: mvmtfqlo8d46051c → armhevinger **8** (repTimes 0.2, 0.2, 5.95 …); mvmtju2917da1c69 → **halvmark 7 × 25 kg** (repTimes 11.83, 11.83 …).

v8.7 engine replay:
| Clip | GT | Pred | Exercise (GT → pred) | kg | Rep times (s) |
|---|---|---|---|---|---|
| ✓ mvmtfqlo8d46051c | 6 | 6 | armhevinger → armhevinger | 0 | 5, 7.5, 9.8, 12.2, 14.5, 17.1 |
| ✗ mvmtju2917da1c69 | 5 | 4 | armhevinger → halvmark | 40 | 17, 18.8, 20.6, 24.9 |

v8.8:
| Clip | GT | Pred | Exercise (GT → pred) | kg | Rep times (s) |
|---|---|---|---|---|---|
| ✓ mvmtfqlo8d46051c | 6 | 6 | armhevinger → armhevinger | 0 | 5, 7.5, 9.8, 12.2, 14.5, 17.1 |
| ✓ mvmtju2917da1c69 | 5 | 5 | armhevinger → armhevinger | 0 | 13.5, 15.2, 16.9, 18.8, 20.6 |

GT note mvmtfqlo8d46051c: set to **6** — 4 fps frame review and the shoulder signal show 6 descents (bottoms ≈4.3, 6.7, 9.0, 11.4, 13.7, 16.1 s); the brief said 7, Rune was unsure. Re-check and edit eval/real/manifest.json if needed.

## Root cause
1. **Phantom first pair (+2):** the feedback recorder's `trimIdle` restarted the clip while the counter held *tentative* (unpaired) first reps from setup motion (getting down on the floor). Those two paired 0.2 s into the new clip; since the app logged the *confirmation* time for both, they share one timestamp. The frames that produced them were trimmed away, so they cannot be replayed (the logged landmarks give 6). Fixes: no idle-trim while any counter has tentative reps; meta.repTimes now come from the counter's own per-rep times (`counter.repTimes`, not the wall time of the count change, no t≥t0 filter so pre-clip reps show as negative times); push-ups require the plank (posture) to be held over the top before the first rep (`topHold`, rejects 'setup').
2. **Push-ups picked as RDL:** walking back + bending down to kneel scored halvmark 1.0 and the score stayed high during head-on push-ups (no prone/legs check), so the picker never had the 25 % margin to switch. halvmark recognition now needs visible legs, not prone (proneHoriz), and not "wrists far below shoulders with a foreshortened torso"; halvmark counter posture added.
3. **25 kg:** no weight detection exists — kg is the remembered/last kg for the picked exercise (halvmark). Correct exercise → push-ups → 0 kg.

## Standard eval (129 clips + 48 negatives) — v8.7 → v8.8
* All exercises/angles exact-match unchanged: 118/129 (91 %), MAE 0.21; per-exercise × view table identical.
* Push-up recognition 23 → 24/26; overall recognition 114 → 115/127.
* Negatives: false sets 2/48 (4.2 %) unchanged; manual-pick counters 57 → 56/480.
* Camera-motion eval not rerun (camera gate untouched).

```
| Exercise | Videos | GT reps | Exact | MAE | Recognition |
|---|---|---|---|---|---|
| knebøy | 17 | 60 | 17/17 (100%) | 0.00 | 17/17 |
| bulgarsk | 12 | 44 | 12/12 (100%) | 0.00 | 9/12 |
| pullups | 11 | 46 | 9/11 (82%) | 0.55 | 9/9 |
| dips | 11 | 58 | 9/11 (82%) | 0.64 | 11/11 |
| skråbenk | 9 | 35 | 8/9 (89%) | 0.11 | 8/9 |
| benkpress | 23 | 131 | 20/23 (87%) | 0.39 | 23/23 |
| halvmark | 6 | 14 | 6/6 (100%) | 0.00 | 5/6 |
| roing | 7 | 39 | 5/7 (71%) | 0.43 | 4/7 |
| armhevinger | 26 | 97 | 25/26 (96%) | 0.04 | 24/26 |
| situps | 7 | 29 | 7/7 (100%) | 0.00 | 5/7 |
| **all** | 129 | 553 | 118/129 (91%) | 0.21 | 115/127 (91%) |

| Exercise | View | Videos | Exact | MAE |
|---|---|---|---|---|
| armhevinger | front | 7 | 6/7 | 0.14 |
| armhevinger | oblique | 7 | 7/7 | 0.00 |
| armhevinger | side | 12 | 12/12 | 0.00 |
| benkpress | front | 6 | 5/6 | 1.17 |
| benkpress | head-end | 3 | 3/3 | 0.00 |
| benkpress | oblique | 7 | 6/7 | 0.14 |
| benkpress | orbiting | 1 | 1/1 | 0.00 |
| benkpress | side | 6 | 5/6 | 0.17 |
| bulgarsk | front | 5 | 5/5 | 0.00 |
| bulgarsk | oblique | 1 | 1/1 | 0.00 |
| bulgarsk | side | 6 | 6/6 | 0.00 |
| dips | front | 3 | 1/3 | 2.33 |
| dips | oblique | 1 | 1/1 | 0.00 |
| dips | orbiting | 1 | 1/1 | 0.00 |
| dips | side | 6 | 6/6 | 0.00 |
| halvmark | front | 2 | 2/2 | 0.00 |
| halvmark | oblique | 1 | 1/1 | 0.00 |
| halvmark | side | 3 | 3/3 | 0.00 |
| knebøy | front | 6 | 6/6 | 0.00 |
| knebøy | oblique | 8 | 8/8 | 0.00 |
| knebøy | side | 3 | 3/3 | 0.00 |
| pullups | back | 2 | 2/2 | 0.00 |
| pullups | front | 6 | 4/6 | 1.00 |
| pullups | oblique | 1 | 1/1 | 0.00 |
| pullups | side | 2 | 2/2 | 0.00 |
| roing | front | 1 | 1/1 | 0.00 |
| roing | oblique | 2 | 1/2 | 1.00 |
| roing | side | 4 | 3/4 | 0.25 |
| situps | front | 2 | 2/2 | 0.00 |
| situps | oblique | 1 | 1/1 | 0.00 |
| situps | side | 4 | 4/4 | 0.00 |
| skråbenk | front | 1 | 1/1 | 0.00 |
| skråbenk | oblique | 2 | 2/2 | 0.00 |
| skråbenk | side | 6 | 5/6 | 0.17 |

| View (all exercises) | Videos | Exact | MAE |
|---|---|---|---|
| front | 39 | 33/39 (85%) | 0.54 |
| oblique | 31 | 29/31 (94%) | 0.10 |
| side | 52 | 49/52 (94%) | 0.06 |
| head-end | 3 | 3/3 (100%) | 0.00 |
| orbiting | 2 | 2/2 (100%) | 0.00 |
| back | 2 | 2/2 (100%) | 0.00 |

| Negative activity | Clips | False sets, auto mode (≥2 reps) | FP rate | Manual pick: counters reaching 2 |
|---|---|---|---|---|
| walking | 3 | 0 | 0% | 3/30 |
| other | 1 | 0 | 0% | 4/10 |
| loading plates | 3 | 0 | 0% | 4/30 |
| sitting | 4 | 0 | 0% | 3/40 |
| standing | 4 | 0 | 0% | 7/40 |
| stretching | 7 | 0 | 0% | 7/70 |
| phone handling | 5 | 0 | 0% | 6/50 |
| adjusting camera | 2 | 1 | 50% | 1/20 |
| talking/gesturing | 3 | 0 | 0% | 0/30 |
| walking near camera | 2 | 0 | 0% | 0/20 |
| picking up items | 3 | 0 | 0% | 3/30 |
| resting/drinking/towel | 6 | 0 | 0% | 3/60 |
| dancing | 2 | 0 | 0% | 2/20 |
| dancing (2 people, far) | 1 | 1 | 100% | 6/10 |
| household | 1 | 0 | 0% | 0/10 |
| gymnastics (other) | 1 | 0 | 0% | 7/10 |
| **all** | 48 | 2 | 4.2% | 56/480 (11.7%) |
```
