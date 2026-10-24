# Feedback clips from the app
`./pull.sh` downloads new clips + labels from the private R2 bucket (worker admin endpoint, secret in `/workspace/.secrets/newrun-feedback-admin`)
into `clips/<install>/` (git-ignored) and writes `manifest.json` (eval manifest entries; git-ignored, private).
Label → gt: `corrected`/`confirmed` = user-edited values, `implicit` = untouched (weak label), `notASet` (undo/delete) → gt 0 negative,
`missed` (⚑ button) → gt null + `needsCount` (count reps by hand). `FB_URL=http://localhost:8797 ./pull.sh` for a local worker.
Meta per clip: predicted exercise/reps/kg, repTimes (s from clip start), 10 Hz pose landmarks `[t, (x,y,vis)×33]`, viewHint, facing, device, app version.
