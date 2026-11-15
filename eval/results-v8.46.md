# v8.46 — camera/recorder self-heal + live warning, fresh exercise guess after a set (15 Nov 2026)

## Missing clips after 20:31 (Rune t265u: «alle klipp sendt, 0 venter»)
**Evidence.**
- Clips from 15 Nov: mwi7v8cd 20:14:51–20:17:30, mwi7wmjd –20:18:35, mwi802ro 20:20:50–20:21:16, mwi81af6 –20:22:13, mwi887bt 20:23:04–20:27:35, mwi89q18 –20:28:46, mwi8acvd –20:29:16, mwi8db6r 20:30:47–20:31:33. Nothing covers the time after 20:31:33.
- An end-to-end scan (plate track + pose replay) finds no hidden extra sets. Rigging/unrack runs only.
- Worker: no label-only objects, no rejects. The 21:37 label edits touch only these 8 clips.
- (a) queue full — ruled out. Clips were 3–30 MB (≈0.89 Mbps), 79 MB in total against a 400 MB limit. The blob is freed after upload, and 7/8 uploaded automatically within 4 s.
- (c) no per-session/day cap exists in app or Worker.
- (d) only `saveSet` (and «Mistet sett») cut clips. Sets added afterwards in the history have no video by design.
- (b) is the only path that matches «0 pending + no clips + Rune's log has only these 8 rows» (he re-labelled exactly these rows at 21:37). After ≈20:31 the app produced no saved sets, i.e. it had no live camera frames, and nothing told him. Code paths that do exactly that on an iOS PWA after an app switch:
  1. `resumeCam` trusted `readyState === 'live'`. iOS can return a muted/frozen track that is still 'live', so the last frame stays on screen and no counting or recording happens.
  2. Re-acquire with `getUserMedia` without a tap can hang on iOS. `pending` then stays true, and every later `resumeCam` returns at once.
  3. A MediaRecorder that dies is not noticed.
  4. Six silent clip-drop paths: no recorder, recorder stopped, empty blob, >48 MB (≈7 min), queue full, add failed. All of them only logged to the console.
- This could not be proven from the device; there is no telemetry. v8.46 adds it.

**Fix (kill switch `repcam.camHeal=off` = old behaviour; logging and warning stay).**
- A 1 s watchdog in a session re-acquires the camera when the track is ended/muted or no video frame arrives for 2.5 s. It uses requestVideoFrameCallback, or currentTime as a fallback, and is only trusted once frames were seen. It allows max 3 tries, then shows «Fortsett» (a tap = iOS gesture).
- getUserMedia on resume has a 6 s timeout; a late stream is stopped.
- On resume, a muted track counts as dead.
- The clip recorder is restarted when it is not recording (4 s grace), and MediaRecorder errors are caught.
- Live warning `#recWarn` (non-blocking, top of the camera view; kill switch `repcam.recWarn=off`):
  - «⚠ Kameraet står stille — starter det på nytt…»
  - «⚠ Klipp-opptaket er stoppet — klipp lagres ikke»
  - «⚠ Klipp ble ikke lagret (grunn)» for 10 s
- Clip meta `camLog` (hide/show/mute/ended/stall/reacquire/recStart/recError…, with track state) and `skips` (dropped clips, kept in localStorage until the next clip goes out).

**Browser proof** (headless Chrome, fake camera with the mwi81af6 video, feedback on, uploads blocked):
- Track killed during an app switch → re-acquired + recorder running after 4 s.
- Frozen stream (live, no frames) → re-acquired.
- Recorder killed → restarted after ≈5 s.
- With camHeal=off, the frozen stream stays frozen and the warning shows.
- 0 page errors. The v8.45 plate path still gives benkpress×8.
- Must still be verified on Rune's iPhone.

## Fresh exercise guess after a saved set (mwi8db6r live roing×7)
`Reps.AUTO_RESET_CFG.mode = 'on'`: after `saveSet` the picker is reset and `autoEx = null`. Kill switch `repcam.autoReset=off|shadow`.
- mwi8acvd + mwi8db6r back to back: pullups×6 + pullups×6. Before, the second set was lost.
- Gate --all vs v8.45 (plate on both): 99/112 = 99/112, 0 better, 0 worse, core 14/14. Single-clip eval cannot show the gain.

## Gate
`node tools/verify.js gate` (base origin/main v8.45, plate on as shipped): GATE PASS — 0 worse, exact 99/112, MAE 0.21, core 14/14.
