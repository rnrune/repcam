# v8.2 — strict rep counting + head-on push-ups

Same harness (`node eval/eval.js`), 129 exercise clips (553 reps) + **48 negative clips** (15 old + 33 new).
"Before" = v8.1 `reps.js` with the v8.1 app pick logic (any recognizer guess > 0.12 held 1.5 s); "after" = v8.2.
Negatives are replayed exactly like the app in auto mode (all counters run, the picker chooses, lock at 2 reps); a
**false set** = the active exercise reaches 2 reps (the auto-save minimum). "Manual pick" = the same clip with each of the
10 exercises picked by hand (counter alone reaches 2 reps).

## False positives — before (v8.1)
| Negative activity | Clips | False sets, auto mode (≥2 reps) | FP rate | Manual pick: counters reaching 2 |
|---|---|---|---|---|
| walking | 3 | 0 | 0% | 15/30 |
| other | 1 | 0 | 0% | 7/10 |
| loading plates | 3 | 1 | 33% | 7/30 |
| sitting | 4 | 0 | 0% | 3/40 |
| standing | 4 | 0 | 0% | 15/40 |
| stretching | 7 | 2 | 29% | 25/70 |
| phone handling | 5 | 1 | 20% | 12/50 |
| adjusting camera | 2 | 1 | 50% | 5/20 |
| talking/gesturing | 3 | 0 | 0% | 0/30 |
| walking near camera | 2 | 0 | 0% | 5/20 |
| picking up items | 3 | 1 | 33% | 8/30 |
| resting/drinking/towel | 6 | 0 | 0% | 10/60 |
| dancing | 2 | 1 | 50% | 10/20 |
| dancing (2 people, far) | 1 | 1 | 100% | 10/10 |
| household | 1 | 0 | 0% | 0/10 |
| gymnastics (other) | 1 | 0 | 0% | 9/10 |
| **all** | 48 | 8 | 16.7% | 141/480 (29.4%) |


## False positives — after (v8.2)
| Negative activity | Clips | False sets, auto mode (≥2 reps) | FP rate | Manual pick: counters reaching 2 |
|---|---|---|---|---|
| walking | 3 | 0 | 0% | 2/30 |
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
| dancing (2 people, far) | 1 | 1 | 100% | 7/10 |
| household | 1 | 0 | 0% | 0/10 |
| gymnastics (other) | 1 | 0 | 0% | 7/10 |
| **all** | 48 | 2 | 4.2% | 56/480 (11.7%) |


## Exercise clips — before (v8.1)
| Exercise | Videos | GT reps | Exact | MAE | Recognition |
|---|---|---|---|---|---|
| knebøy | 17 | 60 | 17/17 (100%) | 0.00 | 17/17 |
| bulgarsk | 12 | 44 | 12/12 (100%) | 0.00 | 9/12 |
| pullups | 11 | 46 | 9/11 (82%) | 0.55 | 9/9 |
| dips | 11 | 58 | 9/11 (82%) | 0.64 | 9/11 |
| skråbenk | 9 | 35 | 8/9 (89%) | 0.11 | 8/9 |
| benkpress | 23 | 131 | 21/23 (91%) | 0.30 | 23/23 |
| halvmark | 6 | 14 | 6/6 (100%) | 0.00 | 5/6 |
| roing | 7 | 39 | 5/7 (71%) | 0.43 | 4/7 |
| armhevinger | 26 | 97 | 25/26 (96%) | 0.04 | 18/26 |
| situps | 7 | 29 | 7/7 (100%) | 0.00 | 5/7 |
| **all** | 129 | 553 | 119/129 (92%) | 0.19 | 107/127 (84%) |

## Exercise clips — after (v8.2)
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
| armhevinger | 26 | 97 | 25/26 (96%) | 0.04 | 23/26 |
| situps | 7 | 29 | 7/7 (100%) | 0.00 | 5/7 |
| **all** | 129 | 553 | 118/129 (91%) | 0.21 | 114/127 (90%) |

## By view — before
| View (all exercises) | Videos | Exact | MAE |
|---|---|---|---|
| front | 39 | 33/39 (85%) | 0.51 |
| oblique | 31 | 30/31 (97%) | 0.06 |
| side | 52 | 49/52 (94%) | 0.06 |
| head-end | 3 | 3/3 (100%) | 0.00 |
| orbiting | 2 | 2/2 (100%) | 0.00 |
| back | 2 | 2/2 (100%) | 0.00 |

## By view — after
| View (all exercises) | Videos | Exact | MAE |
|---|---|---|---|
| front | 39 | 33/39 (85%) | 0.54 |
| oblique | 31 | 29/31 (94%) | 0.10 |
| side | 52 | 49/52 (94%) | 0.06 |
| head-end | 3 | 3/3 (100%) | 0.00 |
| orbiting | 2 | 2/2 (100%) | 0.00 |
| back | 2 | 2/2 (100%) | 0.00 |

## Exercise × view — after
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

## Misses — after
```
✗ none/adjusting camera px33874625  rec=armhevinger reps=4 manual=armhevinger
✗ none/dancing (2 people, far) px6262593   rec=dips reps=4 manual=knebøy,bulgarsk,dips,skråbenk,halvmark,roing,situps
✗ pullups   px31622705  gt=0 pred=2 rec=pullups 
✗ pullups   px31622708  gt=0 pred=4 rec=pullups 
✗ benkpress wc295071    gt=1 pred=2 rec=benkpress 
✗ roing     px7875577   gt=4 pred=5 rec=roing 
✗ roing     px5837737   gt=5 pred=3 rec=roing 
✗ benkpress yt9fPaZLJcwQc gt=23 pred=22 rec=benkpress 
✗ skråbenk  yteA81J-16v1Y gt=4 pred=3 rec=skråbenk 
✗ benkpress ytM2_te5uI7Tw gt=9 pred=2 rec=benkpress 
✗ armhevinger px8544666   gt=3 pred=4 rec=armhevinger 
✗ dips      px40252346  gt=10 pred=9 rec=dips 
✗ dips      px40401181  gt=11 pred=5 rec=dips 
```

## Misses — before
```
✗ none/loading plates px4746004   rec=benkpress reps=3 manual=benkpress,skråbenk,roing
✗ none/stretching     px6446121   rec=benkpress reps=3 manual=knebøy,bulgarsk,benkpress,skråbenk,roing
✗ none/stretching     px8456949   rec=skråbenk reps=2 manual=dips,benkpress,skråbenk,roing,armhevinger
✗ none/phone handling px4367754   rec=knebøy reps=2 manual=knebøy,bulgarsk,dips,benkpress,skråbenk,halvmark,roing,armhevinger,situps
✗ none/adjusting camera px33874625  rec=armhevinger reps=4 manual=pullups,dips,skråbenk,roing,armhevinger
✗ none/picking up items px6594038   rec=knebøy reps=3 manual=knebøy,bulgarsk,dips,benkpress,skråbenk,halvmark,roing,armhevinger
✗ none/dancing        px8921456   rec=dips reps=2 manual=dips,benkpress,skråbenk,roing,armhevinger
✗ none/dancing (2 people, far) px6262593   rec=knebøy reps=5 manual=knebøy,bulgarsk,pullups,dips,benkpress,skråbenk,halvmark,roing,armhevinger,situps
✗ pullups   px31622705  gt=0 pred=2 rec=pullups 
✗ pullups   px31622708  gt=0 pred=4 rec=pullups 
✗ benkpress wc295071    gt=1 pred=2 rec=benkpress 
✗ roing     px7875577   gt=4 pred=5 rec=roing 
✗ roing     px5837737   gt=5 pred=3 rec=roing 
✗ skråbenk  yteA81J-16v1Y gt=4 pred=3 rec=skråbenk 
✗ benkpress ytM2_te5uI7Tw gt=9 pred=3 rec=benkpress 
✗ armhevinger px8544666   gt=3 pred=4 rec=armhevinger 
✗ dips      px40252346  gt=10 pred=9 rec=dips 
✗ dips      px40401181  gt=11 pred=5 rec=dips 
```

## Push-ups vs dips (recognizer, clip-level majority after 3 s)
| | v8.1 | v8.2 |
|---|---|---|
| push-ups → push-ups | 18/26 | 23/26 |
| push-ups → dips | 4 | **0** |
| dips → dips | 9/11 | **11/11** |
| dips → push-ups | 0 | 0 |
| head-on / front push-ups recognized (7 clips) | 2/7 (4 → dips, 1 → squat) | **7/7** |

Head-on push-up clips: px6455340 (camera on the floor in front of the head — Rune's setup), px8520078, px8544666 (close,
on the ground), px10483843 (low front-oblique), plus the earlier front clips px4258997, px6293131, px6893304.
New front dips: px40252346, px40401181. YouTube downloads were blocked (HTTP 429 / bot check) from the eval box, so all new
clips are Pexels.
