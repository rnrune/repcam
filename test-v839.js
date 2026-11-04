// v8.39 rows: trailing reps done standing upright (tailTilt) dropped; shadow keeps them; kill switch in app.js
const assert=require('assert'),fs=require('fs'),R=require('./reps.js'),X=require('./eval/real/run.js');
const d=X.load('mw14myut3d7b4551');let r=X.replay(d,0);assert.strictEqual(r.ex,'roing');assert.strictEqual(r.reps,10);assert(r.times.at(-1)<28);
const t=R.EX.roing.tailTilt;R.EX.roing.tailTilt={...t,mode:'shadow'};r=X.replay(d,0);assert.strictEqual(r.reps,12,'shadow keeps');R.EX.roing.tailTilt=t;
for(const id of ['mvnoa62be037036e','mw14pclpa99b380d']){const e=X.man().find(x=>x.id===id);const dd=X.load(e.lm||id);const rr=X.replay(e.win?{...dd,frames:dd.frames.filter(a=>a[0]>=e.win[0]&&a[0]<=e.win[1])}:dd,0);assert.strictEqual(rr.reps,e.gt,id);}
const a=fs.readFileSync('app.js','utf8');assert(a.includes("repcam.rowTilt")&&a.includes("APP_VERSION = '8.39'"));assert(fs.readFileSync('index.html','utf8').includes('?v=8.39'));
console.log('test-v839 ok');
