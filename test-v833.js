// v8.33: camera position per session -> angle per exercise (flip for lying presses, V-situp side), per-set override, label carries camera
const assert = require('assert'), C = require('./camera.js'), F = require('./feedback.js');
const p = { dir: 'rear', deg: 45, side: null };
assert.strictEqual(C.derive(p, 'dips'), 'rear45'); assert.strictEqual(C.derive(p, 'benkpress'), 'front45'); assert.strictEqual(C.derive(p, 'skråbenk'), 'front45'); assert.strictEqual(C.derive(p, 'vsitup'), 'side');
assert.strictEqual(C.derive({ dir: 'front', deg: 0 }, 'benkpress'), 'rear'); assert.strictEqual(C.derive({ dir: 'front', deg: 90, side: 'left' }, 'knebøy'), 'side'); assert.strictEqual(C.derive(null, 'dips'), null);
const s = C.forSet(p, 'benkpress'); assert.deepStrictEqual(s, { sessionPos: p, derivedAngle: 'front45', angle: 'front45', overridden: false });
const o = C.override(s, 'side'); assert.strictEqual(o.angle, 'side'); assert.strictEqual(o.overridden, true); assert.strictEqual(o.derivedAngle, 'front45');
assert.strictEqual(C.override(s, 'front45').overridden, false); assert.strictEqual(C.override(null, 'rear').overridden, true);
const l = F.labelFrom({ exercise: 'dips', reps: 12, kg: 0 }, 'edit', { exercise: 'dips', reps: 12, kg: 0, camera: o }); assert.strictEqual(l.kind, 'confirmed'); assert.deepStrictEqual(l.camera, o);
assert(!('camera' in F.labelFrom({ exercise: 'dips', reps: 1, kg: 0 }, 'edit', { reps: 2 })));
console.log('test-v833 ok');
