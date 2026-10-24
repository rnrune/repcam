// Convert pulled feedback clips (clips/<install>/<id>.{mp4,webm,meta.json,label.json}) to eval manifest entries.
// gt = the user's label (corrected/confirmed/implicit); notASet → gt 0 (negative clip); missed → gt null + needsCount.
const fs = require('fs'), path = require('path');
const [dir = 'clips', out = 'manifest.json'] = process.argv.slice(2);
const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const entries = [];
for (const inst of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  const d = path.join(dir, inst); if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    const m = f.match(/^(.+)\.(mp4|webm)$/); if (!m) continue;
    const id = m[1], meta = rd(path.join(d, id + '.meta.json')) || {}, lab = rd(path.join(d, id + '.label.json')) || {}, pred = meta.pred || {};
    entries.push({ id: 'fb-' + id, exercise: lab.missed ? (pred.exercise || null) : (lab.exercise || pred.exercise || null),
      gt: lab.missed ? null : lab.notASet ? 0 : (lab.reps ?? pred.reps ?? null), view: meta.viewHint || null,
      notes: `feedback ${lab.kind || 'unlabeled'}; app ${meta.app || '?'} predicted ${pred.exercise || '-'} × ${pred.reps ?? '-'}${lab.missed ? '; MISSED set: count reps manually' : ''}`,
      source: 'feedback', license: 'private (Rune)', file: path.resolve(d, f), kg: lab.kg ?? pred.kg ?? null,
      label: lab.kind || null, negative: !!lab.notASet, needsCount: !!lab.missed, pred, repTimes: meta.repTimes || [], facing: meta.facing || null,
      app: meta.app || null, created: meta.created || null, install: inst });
  }
}
entries.sort((a, b) => String(a.created).localeCompare(String(b.created)));
fs.writeFileSync(out, JSON.stringify(entries, null, 1));
console.log(`${entries.length} manifest entries → ${out}`);
