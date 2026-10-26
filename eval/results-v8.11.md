# v8.11 – skjult gjennomgangsmodus (Gjennomgang)

- `?review=1` (index.html) → `review.html`: spiller ett nettklipp om gangen fra `review-clips.json` (17 klipp, Wikimedia Commons,
  CC BY / CC BY-SA / public domain, webm, `Access-Control-Allow-Origin: *` verifisert med curl), kjører MediaPipe pose → samme
  recognizer/picker/counter/autosave-replay som `eval/real/run.js`, viser oppdaget øvelse + reps.
- Korrigering (øvelse + reps, «Ikke et sett», «Hopp over») sendes via feedback-workeren som `<id>.meta.json` (landemerker 10 Hz,
  klipp-URL, deteksjon) + `<id>.label.json` (`kind: 'review'`); ingen video lastes opp. Ferdige klipp lagres i localStorage `repcam.review.done`.
- Ingen motoreendring; test-v89 versjonssjekk godtar 8.x. Ingen full eval kjørt (budsjett).
