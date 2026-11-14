// v8.38: dips last-rep shoulder travel, row forgetAmps/minAmp, SIG posture drop
const assert=require('assert'),fs=require('fs');
const R=require('./eval/real/run.js');
const want={mw14ui9f1618f5a7:['dips',8],mvnok2vt347693bc:['dips',12],mw150kj7:null,mw14pclpa99b380d:['roing',10],mvnoa62b:null,mw14c1uf79bc3b22:['pullups',5]};
const m=R.man();let n=0;
for(const [k,v] of Object.entries(want)){const e=m.find(x=>x.id.startsWith(k));assert(e,k);
 const d=R.load(e.lm||e.id);const r=R.replay(e.win?{...d,frames:d.frames.filter(a=>a[0]>=e.win[0]&&a[0]<=e.win[1])}:d);const exp=v||[e.exercise,e.gt];
 assert.strictEqual(r&&r.ex,exp[0],k+' ex '+(r&&r.ex));assert.strictEqual(r.reps,exp[1],k+' reps '+r.reps);n++;}
const a=fs.readFileSync('app.js','utf8');
for(const s of ["repcam.dipsBody","repcam.rowAmps","repcam.sig"]) assert(a.includes(s),s);
const V=(fs.readFileSync('app.js','utf8').match(/APP_VERSION = '([\d.]+)'/)||[])[1];assert(V,'APP_VERSION');assert(+V.split('.')[0]*1000+ +V.split('.')[1]>=8038,'version >= 8.38 ('+V+')');assert(fs.readFileSync('index.html','utf8').includes('?v='+V),'index.html cache-bust = APP_VERSION '+V); // version-agnostic (was hardcoded)
console.log('test-v838 ok',n);
