// v8.52: for a low/uncertain auto set, «Endre reps» is the first (primary) action, not delete.
// So a correction like skråbenk 3→5 is an edit, not a notASet disappearance.
const assert = require('assert'), fs = require('fs');
const app = fs.readFileSync('./app.js', 'utf8'), css = fs.readFileSync('./style.css', 'utf8');
const i18n = fs.readFileSync('./i18n.js', 'utf8');
assert(app.includes("classList.toggle('editFirst', focus)"));
assert(app.includes("L.t('w.editReps')"));
assert(css.includes('.toast.ask.editFirst #tEdit') && css.includes('order:-2'));
assert.strictEqual((i18n.match(/'w\.editReps'/g) || []).length, 7);
assert(i18n.includes("'w.editReps': 'Endre reps'"));
console.log('test-v852e OK');
