# v8.10 — standing rows: setup/re-rack excursion not counted

Rows (`roing` counter only, `bigEdge: 1.25`): after the set's tempo/edge trim, an edge rep whose amplitude is >1.25× the set median
and that is either slower than the rhythm (gap >1.4× median) or paired with another oversized edge rep is dropped (max 2, keeps ≥5).
This is the bar lift from floor/hang into the hinge and putting it back down.

eval/real (`node eval/real/run.js`) row clips, GT 10:

| Clip | v8.9 | v8.10 |
|---|---|---|
| mvno4ocl012d89f9 | 12 | 10 |
| mvno6wnoab08c185 | 11 | 10 |
| mvnoa62be037036e | 12 | 10 |

Overall: exact 14/30 → 17/30, rep MAE 1.08 → 0.88, must-fail 0; no other clip changed except mvnoc4f7aa1e6640 (dips misread as roing) 13 → 12.
