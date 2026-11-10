import certifi; certifi.where=lambda: "/root/.ccr/ca-bundle.crt"
import asyncio, edge_tts, json, subprocess, sys
from script import P1,P2
from core import norm
VOICE, RATE = sys.argv[1], sys.argv[2]
def letters(s): return "".join(ch for ch in norm(s) if ch.isalnum())
async def part(name, P):
    txt=" ".join(t for _,t in P)
    path=f"vo_{name}_full.mp3"
    c=edge_tts.Communicate(txt,VOICE,rate=RATE,boundary="WordBoundary")
    words=[]
    with open(path,"wb") as f:
        async for ch in c.stream():
            if ch["type"]=="audio": f.write(ch["data"])
            elif ch["type"]=="WordBoundary": words.append([ch["offset"]/1e7,ch["duration"]/1e7,ch["text"]])
    dur=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",path]))
    # assign words to segments by letter count
    bounds=[]; acc=0
    for _,t in P: acc+=len(letters(t)); bounds.append(acc)
    segw=[[] for _ in P]; consumed=0; si=0
    for w in words:
        while si<len(P)-1 and consumed>=bounds[si]: si+=1
        segw[si].append(w); consumed+=len(letters(w[2]))
    segs=[]
    for i,(sc,t) in enumerate(P):
        ws=segw[i]
        s0=max(0, ws[0][0]-0.06)
        s1=segw[i+1][0][0]-0.06 if i+1<len(P) else min(dur, ws[-1][0]+ws[-1][1]+0.35)
        segs.append(dict(scene=sc,text=t,file=path,dur=dur,words=ws,cs0=s0,cs1=s1))
    print(name, round(segs[-1]["cs1"],1),"s", [len(x) for x in segw])
    return segs
async def main():
    import os
    out=json.load(open("vo_cont.json")) if os.path.exists("vo_cont.json") else {}
    for n in sys.argv[3:]:
        out[n]=await asyncio.wait_for(part(n,{"p1":P1,"p2":P2}[n]),90)
        json.dump(out,open("vo_cont.json","w"),ensure_ascii=False,indent=1)
    if len(out)==2: json.dump(out,open("vo.json","w"),ensure_ascii=False,indent=1)
asyncio.run(main())
