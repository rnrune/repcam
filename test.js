const {angle,createCounter}=require('./reps.js');const assert=require('assert');
assert(Math.abs(angle({x:0,y:1},{x:0,y:0},{x:1,y:0})-90)<1e-9);
assert(Math.abs(angle({x:0,y:1},{x:0,y:0},{x:0,y:-1})-180)<1e-9);
function run(seq){const c=createCounter();let r;for(const a of seq)r=c.update(a);return r.reps;}
const rep=()=>[...Array(10).fill(170),...Array(10).fill(80),...Array(10).fill(170)];
assert.equal(run(rep()),1);
assert.equal(run([].concat(rep(),rep(),rep())),3);
// jitter around thresholds must not double count
const j=[];for(let i=0;i<10;i++)j.push(170);for(let i=0;i<20;i++)j.push(i%2?85:105);for(let i=0;i<20;i++)j.push(i%2?150:168);for(let i=0;i<10;i++)j.push(175);
assert.equal(run(j),1);
// shallow squat (120) no rep
assert.equal(run([...Array(10).fill(170),...Array(10).fill(120),...Array(10).fill(170)]),0);
// single-frame spike no rep
assert.equal(run([...Array(10).fill(170),60,...Array(10).fill(170)]),0);
// nulls ignored
assert.equal(run([170,null,...Array(10).fill(80),null,...Array(10).fill(170)]),1);
console.log('all tests passed');
