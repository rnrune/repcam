# v8.13 – Runes økt 2026-10-27, benchmark-tiers, rigging-sett, V-situp, redigere ferdig økt, usikre klipp i gjennomgang

## Økta mot fasit (16 klipp kom fram; appen på telefonen var 8.11)
| # | Klipp | Appen logget (pred) | Etter Runes retting | Fasit | Rettet? |
|---|---|---|---|---|---|
| 1 | mvr3cnad | Knebøy 5 × 22,5 | Knebøy 12 × 50 | Knebøy 50 × 12 | ja (reps, kg) |
| 2 | mvr3ehf7 | Knebøy 1 × 50 | Knebøy 8 × 80 | Knebøy 80 × 8 | ja (reps, kg) |
| 3 | mvr3gojt | Knebøy 3 × 80 | Knebøy 8 × 100 | Knebøy 100 × 8 | ja (reps, kg) |
| 4 | mvr3k128 | Knebøy 7 × 100 | Knebøy 8 × 100 | Knebøy 100 × 8 | ja (reps) |
| 5 | mvr3naxy | Knebøy 8 × 100 | – | Knebøy 100 × 8 | nei (riktig) |
| – | mvr3nq3e | Curl 2 × 20 | – | rigging (falskt sett) | nei |
| – | mvr3o841 | Halvmark 2 × 0 | – | rigging (falskt sett) | nei |
| 6 | mvr3phm8 | Halvmark 9 × 0 | – | Rumensk mark 100 × 9 | nei (kg feil) |
| – | mvr3rto3 | Curl 3 × 20 | – | hvile/tøying (falskt sett) | nei |
| 7 | mvr3slr3 | Sit-ups 9 × 0 | – | Rumensk mark 100 × 9 | nei (øvelse + kg feil) |
| – | mvr3syhj | Curl 2 × 20 | – | tøying (falskt sett) | nei |
| 8 | mvr3vtnn | Halvmark 9 × 0 | – | Rumensk mark 100 × 9 | nei (kg feil) |
| – | mvr3wf15 | Roing 4 × 30 | – | rigging (falskt sett) | nei |
| – | mvr3x5c8 | Knebøy 2 × 100 | – | rigging/flytte benk (falskt sett) | nei |
| 9 | mvr3yc9w | Dips 3 × 0 | Bulgarsk 8 × 70 | Bulgarsk 70 × 8 (ett bein) | ja (alt) |
| – | mvr3ztyb | Roing 2 × 30 | – | hvile, prater i kamera (falskt sett) | nei |
Mangler: bulgarsk sett 2–3 (begge bein) og alle 3 V-situp-settene (20, 20, 12 @ 15 kg) – ingen klipp kom fram.
**Bulgarsk = ett sett per bein (8 reps)**, ikke 16: hvert bein er en egen serie med pause/bytte, kg og reps gjelder per bein,
og appen/Strava teller da riktig volum (70 kg × 8 × 2 bein). 3 sett per bein = 6 sett.
**Rumensk markløft = eksisterende `halvmark`** (vises allerede som «Rumensk markløft», Strava BARBELL_ROMANIAN_DEADLIFT).

## Benchmark-omlegging (eval/real/run.js `--tier core|worst|pass`)
- `core` (19 klipp, 2–3 per øvelse + negativer): stabile, må passere (exit 1). `worst` (26): klippene appen bommer mest på –
  test fikser her først, flytt løste til core. `pass` (8): løst, ikke core. Kveldens 14 klipp lagt til (bare landemerker), maks 5 per øvelse.

## Rettinger (én om gangen, målt på worst/kveldens klipp)
1. *Knebøy i stativ: MediaPipe-glitcher (stang/skiver skjuler hofta → torso kollapser / snus opp-ned) ga kjempereps som forgiftet adaptiv amplitude, så ekte reps ble for «grunne».*
   → glitch-rammer droppes (knebøy/bulgarsk), og bevegelser avvist for posture/sikt mater ikke amplituden.
2. *Gå bort til mobilen (rigging) blåste opp kroppsstørrelse-referansen i ett minutt, så neste sett så for grunt ut.* → raskere decay (12 s) når kroppen er klart mindre (knebøy/bulgarsk).
3. *Recognizer: de samme glitchene ga store tilt-/hinge-utslag → knebøy i stativ ble lest som roing.* → glitch-rammer droppes også i recognizer-vinduet.
4. *Rigging/hvile ga falske korte sett (2–5 «reps» med lange, ujevne pauser).* → `Reps.plausibleSet`: autosave av ≤5 reps krever settrytme (median gap ≤5,5 s, ingen gap >6 s som er >2× korteste). Manuelt valgt øvelse påvirkes ikke.
5. *RDL plukket opp fra gulvet låste på knebøy ved 2 reps og ble aldri flyttet.* → relock når recognizeren klart foretrekker en annen øvelse som teller de samme repsene (samme antall ±2, siste rep <1,5 s siden).
6. Ny øvelse **V-situp** (`vsitup`, vektet V-up/jackknife, standard 15 kg): hoftevinkel skulder–hofte–ankel; recognizer: skuldre OG føtter løftes rundt rolige hofter (sit-ups: føttene i gulvet). Kun syntetisk testet – ingen ekte klipp ennå.
Forsøkt og forkastet: `stillBody` på roing (fikset dips→roing, men knebøy/rader i stock-eval falt 5/7→2/7).

## Tall (før = v8.12-motor, etter = v8.13)
| Sett | Før | Etter |
|---|---|---|
| eval/real core (19) | 17/19 (de 2 nye feilet) | **19/19** |
| eval/real alle (53) | exact 23/53 · øvelse 37/43 · MAE 2.21 · falske sett 6/10 | **27/53 · 39/43 · 1.74 · 3/10** |
| Kveldens 14 klipp | 6/14 | 8/14 |
| Kveldens knebøy (5 sett) reps | 1, 1, 7 (roing), 6, 8 – MAE 5.6 | 8, 9, 8, 7, 8 – **MAE 1.2** |
| Stock eval (129 klipp) | 118/129 · MAE 0.21 · gjenkjenning 117/127 · falske sett 4,2 % | 118/129 · 0.21 · 116/127 · 4,2 % |
Stock-gjenkjenning −1: px4859740 (RDL forfra) får recognizer «curl» (telling uendret, 3/3).

## Redigere ferdig økt (Historikk)
Trykk et sett → endre øvelse/reps/kg eller slett (fantes); nytt: «＋ Legg til sett» nederst i hver ferdige økt.
Endringer på klipp-sett sendes som korreksjon (label `corrected`/`notASet`) via feedback-køen. Strava: ventende synk får nye sett
(slettede sett sendes aldri); allerede synkede/opprettede aktiviteter får Newrun Lift-blokken i beskrivelsen skrevet om (PUT description).
Strukturerte sett i en aktivitet vi lastet opp kan ikke endres via API-et; sletting av hele økta sletter aldri på Strava.

## Usikre klipp til Rune
`review.html` (eller `?review=1`) viser først «Ditt klipp (usikkert)» fra `review-own.json`: 4 klipp som strekfigur-animasjon fra
landemerkene (ingen video i repoet eller offentlige URL-er), med spørsmål, appens deteksjon og rep-tider. Svar + kommentar → worker (`kind: 'review'`, `own: true`).

Tester: test.js 173, test-v813 14 (+ core-tier), test-v89, v88, v87, v85, store, strava, feedback, delete, worker; e2e-v813 (legg til/endre/slett i Historikk).
