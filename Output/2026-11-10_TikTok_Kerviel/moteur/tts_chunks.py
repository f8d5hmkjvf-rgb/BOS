import certifi; certifi.where=lambda: "/root/.ccr/ca-bundle.crt"
import asyncio, edge_tts, json, subprocess, sys, os
import numpy as np
from script import P1,P2
from core import norm
VOICE,RATE,NAME=sys.argv[1],sys.argv[2],sys.argv[3]
P={"p1":P1,"p2":P2}[NAME]
CUTS=[int(x) for x in sys.argv[4].split(",")]   # segment indices where a new chunk starts
SR=24000
def letters(s): return "".join(ch for ch in norm(s) if ch.isalnum())
async def gen(text,path):
    for attempt in range(6):
        words=[]
        try:
            async def run():
                c=edge_tts.Communicate(text,VOICE,rate=RATE,boundary="WordBoundary")
                with open(path,"wb") as f:
                    async for ch in c.stream():
                        if ch["type"]=="audio": f.write(ch["data"])
                        elif ch["type"]=="WordBoundary": words.append([ch["offset"]/1e7,ch["duration"]/1e7,ch["text"]])
            await asyncio.wait_for(run(),45); return words
        except Exception as e: print("retry",attempt,type(e).__name__,flush=True)
    raise SystemExit("tts failed")
def pcm(path):
    return np.frombuffer(subprocess.check_output(["ffmpeg","-loglevel","error","-i",path,"-f","s16le","-ac","1","-ar",str(SR),"-"]),np.int16)
async def main():
    bounds=CUTS+[len(P)]
    audio=[]; allw=[]; off=0.0; PAUSE=0.28
    for k in range(len(CUTS)):
        segs=P[bounds[k]:bounds[k+1]]
        w=await gen(" ".join(t for _,t in segs), f"ch_{NAME}_{k}.mp3")
        a=pcm(f"ch_{NAME}_{k}.mp3")
        end=int((w[-1][0]+w[-1][1]+0.05)*SR); a=a[:end]
        allw+= [[x[0]+off,x[1],x[2]] for x in w]
        audio.append(a); audio.append(np.zeros(int(PAUSE*SR),np.int16))
        off+=len(a)/SR+PAUSE
    full=np.concatenate(audio)
    import wave
    path=f"vo_{NAME}_full.wav"
    with wave.open(path,"wb") as wf: wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR); wf.writeframes(full.tobytes())
    dur=len(full)/SR
    b=[]; acc=0
    for _,t in P: acc+=len(letters(t)); b.append(acc)
    segw=[[] for _ in P]; consumed=0; si=0
    for w in allw:
        while si<len(P)-1 and consumed>=b[si]: si+=1
        segw[si].append(w); consumed+=len(letters(w[2]))
    segs=[]
    for i,(sc,t) in enumerate(P):
        ws=segw[i]; s0=max(0,ws[0][0]-0.06)
        s1=segw[i+1][0][0]-0.06 if i+1<len(P) else min(dur,ws[-1][0]+ws[-1][1]+0.3)
        segs.append(dict(scene=sc,text=t,file=path,dur=dur,words=ws,cs0=s0,cs1=s1))
    out=json.load(open("vo_cont.json")) if os.path.exists("vo_cont.json") else {}
    out[NAME]=segs; json.dump(out,open("vo_cont.json","w"),ensure_ascii=False,indent=1)
    print(NAME,"ok",round(dur,1),[len(x) for x in segw])
asyncio.run(main())
