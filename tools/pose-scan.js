// Pose-corruption scan over eval/real set windows: flip, torso/arm length jumps, low visibility, out of frame, teleports. Usage: node tools/pose-scan.js
const R=require('/workspace/repcam/reps.js');const X=require('/workspace/repcam/eval/real/run.js');
const loadE = e => { const d = X.load(e.lm || e.id); return e.win ? { ...d, frames: d.frames.filter(a => a[0] >= e.win[0] && a[0] <= e.win[1]) } : d; };
const LY=new Set(['benkpress','skråbenk','vsitup','situps','armhevinger']);
const dst=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
for(const e of X.man().filter(x=>x.tier!=='excluded'&&x.exercise)){const d=loadE(e);const asp=d.w/d.h;const r=X.replay(d,0);
 const c=R.createCounter(e.exercise);const gate=R.createCameraGate();
 for(const a of d.frames){const lm=[];for(let i=0;i<33;i++)lm.push({x:a[1+3*i],y:a[2+3*i],visibility:a[3+3*i]});c.update(lm,a[0]*1000,asp,!gate.update(lm,a[0]*1000,asp).ok);}
 const T=(r.ex===e.exercise&&r.times.length?r.times:c.repTimes); if(!T.length){console.log(e.id,e.exercise,'NO REPS FOUND');continue;}
 const t0=T[0]-2.5,t1=T[T.length-1]+1.5; const F=d.frames.filter(a=>a[0]>=t0&&a[0]<=t1);
 const G=F.map(a=>{const lm=[];for(let i=0;i<33;i++)lm.push({x:a[1+3*i]*asp,y:a[2+3*i],visibility:a[3+3*i]});return {t:a[0],lm,g:R.geom(lm.map(p=>({...p,x:p.x/asp})),asp)}});
 const tor=G.filter(x=>x.g).map(x=>x.g.torso).sort((a,b)=>a-b);const tm=tor[tor.length>>1]||1;
 const arm=G.map(x=>dst(x.lm[11],x.lm[13])+dst(x.lm[12],x.lm[14])).sort((a,b)=>a-b);const am=arm[arm.length>>1];
 const bad=[];let prev=null;
 for(const x of G){const w=[];const L=x.lm;
  if(!x.g) w.push('nopose'); else {
   if(!LY.has(e.exercise)&&x.g.torsoTilt>120) w.push('flip');
   if(x.g.torso<0.5*tm||x.g.torso>1.8*tm) w.push('torso');
   const av=[11,12,23,24].map(i=>L[i].visibility).reduce((a,b)=>a+b)/4; if(av<0.4) w.push('lowvis');
   if([11,12,23,24].some(i=>L[i].y<-0.03||L[i].y>1.03||L[i].x<-0.03||L[i].x>asp+0.03)) w.push('outframe');
   const ar=dst(L[11],L[13])+dst(L[12],L[14]); if(ar>2.2*am||ar<0.4*am) w.push('arms');
   if(prev&&x.t-prev.t<0.25){const m=(dst(L[11],prev.lm[11])+dst(L[12],prev.lm[12])+dst(L[23],prev.lm[23])+dst(L[24],prev.lm[24]))/4; if(m>0.6*tm) w.push('jump');}}
  prev=x; if(w.length) bad.push([x.t,w]);}
 const seg=[];for(const [t,w] of bad){const s=seg[seg.length-1];if(s&&t-s.t1<=0.35){s.t1=t;s.n++;w.forEach(k=>s.k.add(k));}else seg.push({t0:t,t1:t,n:1,k:new Set(w)});}
 const S=seg.filter(s=>s.n>=2||s.k.has('jump')||s.k.has('flip'));
 if(S.length) console.log(e.tier,e.id,e.exercise,'gt',e.gt,'reps',T.map(x=>x.toFixed(1)).join(' '),'\n   ',S.map(s=>`${s.t0.toFixed(1)}-${s.t1.toFixed(1)}[${[...s.k].join('+')} n${s.n}]${T.some(t=>t>=s.t0-0.8&&t<=s.t1+0.8)?' *REP*':''}`).join('  '));}
