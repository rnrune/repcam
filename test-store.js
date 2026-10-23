const S=require('./store.js');const assert=require('assert');
function mem(){const m={};return{getItem:k=>k in m?m[k]:null,setItem:(k,v)=>m[k]=String(v),removeItem:k=>delete m[k],m};}
// legacy grouping
const L=[{exercise:'knebøy',reps:8,kg:60,timestamp:'2026-10-20T17:00:00Z'},{exercise:'knebøy',reps:8,kg:62.5,timestamp:'2026-10-20T17:05:00Z'},{exercise:'knebøy',reps:5,kg:70,timestamp:'2026-10-21T17:00:00Z'}];
const ss=S.sessions(L);assert.equal(ss.length,2);assert.equal(ss[1].sets.length,2);assert.equal(ss[1].volume,8*60+8*62.5);assert.equal(ss[0].volume,350);
assert.equal(S.volume(L),480+500+350);
// groupByExercise labels
let g=S.groupByExercise([{reps:8,kg:60},{reps:8,kg:70},{reps:8,kg:65}]);assert.equal(g[0].label,'3 sett × 8 reps');assert.equal(g[0].topKg,70);assert.equal(g[0].name,'Knebøy');
g=S.groupByExercise([{reps:8,kg:60},{reps:10,kg:60}]);assert.equal(g[0].label,'2 sett · 8–10 reps');
// kg history
assert.deepEqual(S.kgHistory(L,'knebøy'),[62.5,70]);
// weekly: 2026-10-23 is Friday; week starts Mon 19
const now=new Date(2026,9,23,20);const W=[{reps:10,kg:50,timestamp:new Date(2026,9,19,18).toISOString()},{reps:10,kg:50,timestamp:new Date(2026,9,23,18).toISOString()},{reps:10,kg:80,timestamp:new Date(2026,9,14,18).toISOString()},{reps:1,kg:999,timestamp:new Date(2026,9,5).toISOString()}];
const w=S.weekly(W,now);assert.deepEqual(w.days,[500,0,0,0,500,0,0]);assert.equal(w.total,1000);assert.equal(w.last,800);assert.equal(w.pct,25);assert.equal(w.today,4);
assert.equal(S.weekly([],now).pct,null);
// store sessions
const ls=mem();ls.setItem('repcam.sets',JSON.stringify(L));const st=S.createStore(ls);
const t0=new Date('2026-10-23T18:00:00Z');st.startSession(t0);st.addSet({reps:8,kg:80},new Date('2026-10-23T18:03:00Z'));st.addSet({reps:6,kg:85},new Date('2026-10-23T18:08:00Z'));
const sum=st.endSession(new Date('2026-10-23T18:30:00Z'));assert.equal(sum.sets,2);assert.equal(sum.reps,14);assert.equal(sum.volume,640+510);assert.equal(sum.durationMin,30);
assert.equal(st.active(),null);assert.equal(st.sets().length,5);assert.equal(st.sessions().length,3);assert.equal(st.sessions()[0].id,sum.id);
// legacy entries untouched in storage
assert.equal(st.sets()[0].sessionId,undefined);
// empty session not stored in meta
st.startSession();assert.equal(st.endSession().sets,0);assert.equal(st.meta().length,1);
// delete
assert(st.deleteSet('2026-10-21T17:00:00Z'));assert.equal(st.sessions().length,2);assert(!st.deleteSet('nope'));
st.deleteSet(st.sets().find(s=>s.reps===8&&s.kg===80).timestamp);st.deleteSet(st.sets().find(s=>s.kg===85).timestamp);assert.equal(st.meta().length,0);
// corrupt storage
const bad=mem();bad.setItem('repcam.sets','{oops');assert.deepEqual(S.createStore(bad).sets(),[]);
assert(JSON.parse(st.exportJSON()).sets.length===2);
console.log('store tests passed');
