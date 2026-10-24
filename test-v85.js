// v8.5 unit: deleteSet removes every record with the id (duplicates can't "come back"); addSet never reuses a timestamp.
const St = require('./store.js'), assert = require('assert');
function mem() { const m = {}; return { getItem: k => k in m ? m[k] : null, setItem: (k, v) => m[k] = String(v), removeItem: k => delete m[k], m }; }
const ls = mem(), s = St.createStore(ls), d = new Date('2026-10-24T17:00:00Z');
const a = s.addSet({ reps: 5, kg: 80 }, d), b = s.addSet({ reps: 5, kg: 85 }, d);
assert.notEqual(a.timestamp, b.timestamp);
const dup = { exercise: 'knebøy', reps: 5, kg: 90, timestamp: '2026-10-20T10:00:00.000Z', sessionId: 'x' };
ls.setItem('repcam.sets', JSON.stringify([...s.sets(), dup, { ...dup }, { ...dup, kg: 92.5 }]));
assert.equal(s.deleteSet(dup.timestamp), true); assert.ok(!s.sets().some(x => x.timestamp === dup.timestamp)); assert.equal(s.sets().length, 2);
assert.equal(s.deleteSet(dup.timestamp), false); assert.equal(s.deleteSet(a.timestamp), true); assert.deepEqual(s.sets().map(x => x.kg), [85]);
console.log('test-v85 ok');
