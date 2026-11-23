// v8.51b: plate bench is not authoritative unless the pose counter also has a press
// (empty rack / bar at rest: live 20.11 mwp4lpaf, mwp4m8eo, tail of mwp4ijue all had pose:0, plate:5–6).
// Kill switch: localStorage repcam.platePerson = off | shadow | on (default on). Threshold poseRepsMin in PLATE_PERSON_CFG.
const assert = require('assert'), fs = require('fs');
const app = fs.readFileSync('./app.js', 'utf8');
const P = require('./plate.js');
assert(P.PLATE_PERSON_CFG);
assert.strictEqual(P.PLATE_PERSON_CFG.mode, 'on');
assert.strictEqual(P.PLATE_PERSON_CFG.poseRepsMin, 1);
assert(app.includes("localStorage.getItem('repcam.platePerson')"));
assert(app.includes('Plate.PLATE_PERSON_CFG'));
assert(fs.readFileSync('./eval/real/run.js', 'utf8').includes("arg('--platePerson'"));
assert(fs.readFileSync('./plate.js', 'utf8').includes('personOk') && fs.readFileSync('./plate.js', 'utf8').includes('pose.reps'));

// Real side bench still uses the plate count (pose had ≥1 rep). Empty-rack clips are official negatives
// or non-bench (replay may not reproduce the live plate runs exactly, but must not save a plate-only bench).
const run = require('./eval/real/run.js');
function plate(id) {
  const f = './eval/real/' + id + '.plate.json';
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).track : null;
}
function official(id) {
  return run.replay(run.load(id), 0, { plate: plate(id) });
}
const real = official('mwp3rq7x4aa2037a');
assert.strictEqual(real.ex, 'benkpress');
assert.ok(real.reps >= 6, 'real side bench kept, got ' + real.reps);

for (const id of ['mwp4lpafbe01d77f', 'mwp4m8eoeb8f1b21']) {
  const r = official(id);
  assert.ok(!(r.ex === 'benkpress' && r.reps >= 2) && !(r.ex === 'skråbenk' && r.reps >= 2),
    id + ' must not save plate-only bench, got ' + r.ex + '×' + r.reps);
}

console.log('test-v851b OK');
