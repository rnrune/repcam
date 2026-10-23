import json,sys,subprocess,os,matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from PIL import Image
S=json.load(open('/tmp/sig.json')); os.makedirs('plots',exist_ok=True)
FPS=float(os.environ.get('TF','2'))
ids=sys.argv[1].split(',') if len(sys.argv)>1 else list(S)
for id in ids:
    if id not in S: continue
    d=S[id]; n=len(d['sig']); T=n/d['fps']; k=int(T*FPS)
    subprocess.run(['ffmpeg','-v','error','-y','-i',f'videos/{id}.mp4','-vf',f'fps={FPS},scale=-2:120,tile={k}x1','-frames:v','1','/tmp/tile.png'])
    tile=Image.open('/tmp/tile.png'); W=tile.width; fw=W/k
    t=[i/d['fps'] for i in range(n)]; y=[v if v is not None else float('nan') for v in d['sig']]
    fig=plt.figure(figsize=(W/80,2.6),dpi=80); ax=fig.add_axes([0,0.1,1,0.85]); ax.plot(t,y,'-',lw=1.5); ax.set_xlim(0,k/FPS); ax.set_xticks([i/2 for i in range(int(T*2)+1)]); ax.tick_params(labelsize=7); ax.grid(True,alpha=.4); ax.text(0.01,0.9,f'{id} {d["cat"]}',transform=ax.transAxes)
    fig.savefig('/tmp/p.png'); plt.close(fig); p=Image.open('/tmp/p.png')
    out=Image.new('RGB',(W,p.height+120),'white'); out.paste(p,(0,0)); out.paste(tile,(0,p.height))
    # wrap into chunks of 1800px
    rows=[out.crop((x,0,min(W,x+1800),out.height)) for x in range(0,W,1800)]
    fin=Image.new('RGB',(1800,out.height*len(rows)),'white')
    for i,r in enumerate(rows): fin.paste(r,(0,i*out.height))
    fin.save(f'plots/{id}.png')
print('done')
