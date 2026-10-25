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
// updateSet / lastKg / exercise list
const u=S.createStore(mem());const a=u.addSet({exercise:'dips',reps:5,kg:0},new Date('2026-10-23T18:00:00Z'));const b=u.addSet({exercise:'dips',reps:6,kg:10},new Date('2026-10-23T18:05:00Z'));
assert.equal(u.lastKg('dips'),10);assert.equal(u.lastKg('roing'),null);
assert.equal(u.updateSet(a.timestamp,{reps:'7',kg:'12.5'}).reps,7);assert.equal(u.sets()[0].kg,12.5);
u.updateSet(b.timestamp,{exercise:'pullups',kg:-5});assert.equal(u.sets()[1].exercise,'pullups');assert.equal(u.sets()[1].kg,0);assert.equal(u.lastKg('dips'),12.5);
assert.equal(u.updateSet('nope',{reps:1}),null);
assert.deepEqual(S.EX.map(e=>e.id),['knebøy','bulgarsk','pullups','dips','benkpress','skråbenk','halvmark','roing','armhevinger','situps','curl']);assert(S.EX.every(e=>e.active&&e.icon));
assert.equal(S.exInfo('benkpress').name,'Benkpress');assert(S.exInfo('benkpress').active);
// bench press: last-weight memory is per exercise (bench vs incline kept apart)
{const w=S.createStore(mem());w.addSet({exercise:'benkpress',reps:5,kg:80},new Date('2026-10-23T18:00:00Z'));w.addSet({exercise:'skråbenk',reps:8,kg:60},new Date('2026-10-23T18:10:00Z'));
assert.equal(w.lastKg('benkpress'),80);assert.equal(w.lastKg('skråbenk'),60);}
// i18n
const I=require('./i18n.js');
assert.equal(I.detect(['nb-NO']),'nb');assert.equal(I.detect(['no']),'nb');assert.equal(I.detect(['nn']),'nb');assert.equal(I.detect(['de-AT','en']),'de');assert.equal(I.detect(['ja-JP']),'en');assert.equal(I.detect(['sv-SE']),'sv');assert.equal(I.detect(['da']),'da');
const keys=Object.keys(I.DICT.nb);for(const l in I.LANGS){assert.deepEqual(Object.keys(I.DICT[l]).sort(),[...keys].sort(),'missing keys in '+l);}
for(const l in I.LANGS){const x=I.create(l);assert.equal(x.weekdays().length,7);assert(x.exName('knebøy'));assert(x.t('w.saved',{ex:'A',r:3,kg:'5 kg'}).includes('3'));}
assert.equal(I.create('de').nf(1234.5,1),'1.234,5');assert.equal(I.create('en').kgf(0),'Bodyweight');assert.equal(I.create('nb').kgf(62.5),'62,5 kg');
assert.equal(I.create('de').t('n.knebøy'),'Kniebeuge');
{const exp={nb:'Benkpress',en:'Bench press',es:'Press de banca',de:'Bankdrücken',fr:'Développé couché',sv:'Bänkpress',da:'Bænkpres'};for(const l in exp){assert.equal(I.create(l).exName('benkpress'),exp[l]);assert(I.create(l).t('onb.title').includes('Newrun Lift'));assert(!JSON.stringify(I.DICT[l]).includes('RepCam'));}}
console.log('store + i18n tests passed');
