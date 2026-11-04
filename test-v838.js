// v8.38: dips last-rep shoulder travel, row forgetAmps/minAmp, SIG posture drop
const assert=require('assert'),fs=require('fs');
const R=require('./eval/real/run.js');
const want={mw14ui9f1618f5a7:['dips',8],mvnok2vt347693bc:['dips',12],mw150kj7:null,mw14pclpa99b380d:['roing',10],mvnoa62b:null,mw14c1uf79bc3b22:['pullups',5]};
const m=R.man();let n=0;
for(const [k,v] of Object.entries(want)){const e=m.find(x=>x.id.startsWith(k));assert(e,k);
 const d=R.load(e.lm||e.id);const r=R.replay(e.win?{...d,frames:d.frames.filter(a=>a[0]>=e.win[0]&&a[0]<=e.win[1])}:d);const exp=v||[e.exercise,e.gt];
 assert.strictEqual(r&&r.ex,exp[0],k+' ex '+(r&&r.ex));assert.strictEqual(r.reps,exp[1],k+' reps '+r.reps);n++;}
const a=fs.readFileSync('app.js','utf8');
for(const s of ["repcam.dipsBody","repcam.rowAmps","repcam.sig","APP_VERSION = '8.38'"]) assert(a.includes(s),s);
assert(fs.readFileSync('index.html','utf8').includes('?v=8.38'));
console.log('test-v838 ok',n);
