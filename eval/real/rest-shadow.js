#!/usr/bin/env node
// v8.15: what would the rest gate change on eval/real? Compares the normal replay with the gate ACTIVE, plus shadow verdicts.
// Usage: node eval/real/rest-shadow.js [--tier core] [--cfg '{"refractMs":3000}']
const path = require('path'), R = require('./run.js');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const tier = arg('--tier', null), cfg = JSON.parse(arg('--cfg', '{}'));
const load = e => { const d = R.load(e.lm || e.id); return e.win ? { ...d, frames: d.frames.filter(a => a[0] >= e.win[0] && a[0] <= e.win[1]) } : d; };
const S = { cases: 0, base: 0, act: 0, falseBase: 0, falseAct: 0, lost: 0, gained: 0, coreBase: 0, coreAct: 0, core: 0 };
const ok = (e, r) => e.gt ? r.reps === e.gt && r.ex === e.exercise : r.reps < 2; // same rule as run.js (a lone rep is dropped)
for (const e of R.man().filter(x => tier ? x.tier === tier : x.tier !== 'excluded')) {
  const d = load(e), b = R.replay(d, 10), a = R.replay(d, 10, { rest: { cfg, active: true } }), sh = R.replay(d, 10, { rest: { cfg } });
  S.cases++; if (ok(e, b)) S.base++; if (ok(e, a)) S.act++;
  if (e.tier === 'core') { S.core++; if (ok(e, b)) S.coreBase++; if (ok(e, a)) S.coreAct++; }
  if (!e.gt) { if (b.reps >= 2) S.falseBase++; if (a.reps >= 2) S.falseAct++; }
  if (ok(e, b) && !ok(e, a)) S.lost++; if (!ok(e, b) && ok(e, a)) S.gained++;
  const ch = ok(e, b) !== ok(e, a) || b.reps !== a.reps ? ' ◀' : '';
  console.log(`${e.id.padEnd(20)} ${e.tier.padEnd(5)} truth ${(e.exercise || 'none') + ' ' + e.gt} | now ${b.ex || '-'} ${b.reps} | gate ${a.ex || '-'} ${a.reps} | shadow ${(sh.restVerdicts || []).map(v => v.ex + ' ' + v.reps + ':' + v.v.replace('would-', '')).join(', ') || '-'}${ch}`);
}
console.log(`\nexact now ${S.base}/${S.cases} → gate ${S.act}/${S.cases} · core ${S.coreBase}/${S.core} → ${S.coreAct}/${S.core} · false sets on rest/rigging clips ${S.falseBase} → ${S.falseAct} · correct cases lost ${S.lost}, gained ${S.gained}`);
