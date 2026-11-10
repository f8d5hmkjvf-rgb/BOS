import sys, subprocess, wave
import numpy as np
from core import build_timeline, norm

SR = 44100
PART = sys.argv[1]
SEGS, TOTAL = build_timeline(PART)
N = int((TOTAL + 0.5) * SR)
rng = np.random.default_rng(3)


def tt(n):
    return np.arange(n) / SR


def load_mp3(path):
    raw = subprocess.check_output(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"])
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def add(buf, sig, t0, gain=1.0):
    i = int(t0 * SR)
    if i >= len(buf) or i + len(sig) <= 0:
        return
    if i < 0:
        sig = sig[-i:]; i = 0
    n = min(len(sig), len(buf) - i)
    buf[i:i + n] += sig[:n] * gain


def movavg(x, k):
    c = np.cumsum(np.concatenate([np.zeros(1), x]))
    y = (c[k:] - c[:-k]) / k
    pad = len(x) - len(y)
    return np.concatenate([np.full(pad // 2, y[0]), y, np.full(pad - pad // 2, y[-1])]).astype(np.float32)


def lp(x, a):
    # one-pole lowpass, a in (0,1): smaller = darker
    y = np.empty_like(x); s = 0.0
    from itertools import accumulate
    # vectorised approximation via scipy-free IIR using cumulative filter on chunks
    for i in range(len(x)):
        s += a * (x[i] - s); y[i] = s
    return y


def env(n, att=0.005, dec=0.3):
    t = tt(n)
    e = np.minimum(1, t / max(att, 1e-4)) * np.exp(-t / dec)
    return e


# ---------------------------------------------------------------- sfx
def boom(dur=1.6, f0=70, f1=32, noise=0.35):
    n = int(dur * SR); t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t * 6)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * env(n, 0.003, 0.55)
    nz = rng.standard_normal(n) * env(n, 0.001, 0.06) * noise
    return np.tanh((s + nz) * 1.6) * 0.9


def whoosh(dur=0.6):
    n = int(dur * SR); t = tt(n)
    nz = rng.standard_normal(n)
    nz = np.convolve(nz, np.ones(18) / 18, "same")
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return nz * e * 1.4


def riser(dur=2.0):
    n = int(dur * SR); t = tt(n)
    f = 200 * (8 ** (t / dur))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    nz = np.convolve(rng.standard_normal(n), np.ones(8) / 8, "same") * 0.5
    return (s + nz) * (t / dur) ** 2


def tick():
    n = int(0.03 * SR)
    return rng.standard_normal(n) * env(n, 0.0005, 0.004) * 0.6 + np.sin(2 * np.pi * 2400 * tt(n)) * env(n, 0.0005, 0.006) * 0.4


def beep(f=880, dur=0.12):
    n = int(dur * SR); t = tt(n)
    return np.sign(np.sin(2 * np.pi * f * t)) * 0.18 * np.minimum(1, (dur - t) / 0.01)


def clang():
    n = int(1.4 * SR); t = tt(n)
    s = sum(np.sin(2 * np.pi * f * t) * a for f, a in ((523, 0.5), (1187, 0.35), (1810, 0.25), (2650, 0.15)))
    return s * env(n, 0.001, 0.35) * 0.6 + rng.standard_normal(n) * env(n, 0.0005, 0.02) * 0.5


def stamp_s():
    n = int(0.5 * SR); t = tt(n)
    return np.tanh((np.sin(2 * np.pi * 90 * t) * env(n, 0.001, 0.08) + rng.standard_normal(n) * env(n, 0.0005, 0.03)) * 2) * 0.8


def gavel():
    n = int(0.6 * SR); t = tt(n)
    return (np.sin(2 * np.pi * 220 * t) * env(n, 0.0005, 0.07) + rng.standard_normal(n) * env(n, 0.0003, 0.015)) * 0.9


def heartbeat():
    n = int(0.5 * SR); t = tt(n)
    one = np.sin(2 * np.pi * 52 * t) * env(n, 0.004, 0.09)
    out = np.zeros(int(0.8 * SR)); out[:n] += one; out[int(0.2 * SR):int(0.2 * SR) + n] += one * 0.7
    return out * 1.2


def glitch(dur=0.35):
    n = int(dur * SR)
    s = rng.standard_normal(n)
    s = np.repeat(s[::40], 40)[:n]
    gate = np.repeat((rng.random(n // 1500 + 1) > 0.4).astype(float), 1500)[:n]
    return np.sign(s) * gate * 0.25


def ding():
    n = int(1.2 * SR); t = tt(n)
    return (np.sin(2 * np.pi * 1318 * t) + 0.5 * np.sin(2 * np.pi * 1976 * t)) * env(n, 0.002, 0.3) * 0.35


SFX = {"boom": boom, "whoosh": whoosh, "tick": tick, "beep": beep, "clang": clang, "stamp": stamp_s,
       "gavel": gavel, "heart": heartbeat, "glitch": glitch, "ding": ding,
       "big": lambda: boom(2.5, 90, 28, 0.5) * 1.2, "soft": lambda: boom(1.0, 60, 40, 0.1) * 0.6}

# scene -> list of (anchor, kind, gain); anchor: float seconds (speech-relative) or word key
CUES = {
    "cold": [(-0.3, "big", 1.0), ("cinq", "boom", 0.9), ("seul", "glitch", 0.6), ("seul", "soft", 0.8), ("personne", "riser", 0.4, -0.6), ("personne", "boom", 0.8)],
    "hook": [(0.0, "whoosh", 0.5)],
    "fifty": [(0, "whoosh", 0.5), ("milliards", "boom", 0.9)],
    "reveal": [("jérôme", "glitch", 0.6), ("kerviel", "big", 0.9)],
    "forge": [("forgeron", "clang", 0.5, 0.9 * i) for i in range(6)] + [("coiffeuse", "tick", 0.5, 0.2 * i) for i in range(8)],
    "ambition": [("grande", "whoosh", 0.5, 0.3), ("réussir", "big", 0.8)],
    "tower": [(0, "whoosh", 0.5), ("middle", "soft", 0.8)],
    "scan": [("contrôles", "beep", 0.6), ("failles", "beep", 0.7), ("angles", "beep", 0.7)],
    "desk": [(0, "whoosh", 0.5), ("delta", "soft", 0.8)],
    "fake": [("fictives", "stamp", 0.8, -0.35), ("fictives", "stamp", 0.8, -0.07), ("fictives", "stamp", 0.9, 0.21)],
    "alerts": [(0.05 + i * 0.3, "beep", 0.35) for i in range(7)] + [("explication", "soft", 0.7)],
    "gain": [("milliard", "boom", 0.6), ("cent", "tick", 0.8)],
    "bet": [(0.0, "riser", 0.5), ("cinquante", "boom", 0.9)],
    "drop": [(0.1, "big", 1.0), (0.1, "glitch", 0.5)],
    "ghost": [("n'existe", "glitch", 0.7, -0.25), ("n'existe", "stamp", 0.9)],
    "bomb": [("bombe", "big", 1.0), ("suite", "whoosh", 0.5), ("partie", "boom", 0.9, 0.2)],
    "p2title": [(-0.3, "big", 0.9), ("découvrir", "boom", 0.8), ("partie", "big", 0.9)],
    "interro": [("cinquante", "boom", 0.7), ("cinquante", "gavel", 0.6, -0.05)],
    "sell": [("vendre", "soft", 1.0), ("vite", "soft", 1.0), ("secret", "boom", 0.8)],
    "krach": [("plongent", "big", 1.0), ("plongent", "glitch", 0.4), ("trois", "soft", 0.6)],
    "loss": [("quatre", "riser", 0.4, -1.0), ("perte", "big", 1.0, 0.1)],
    "news": [(-0.25 + 0.4 * i, "stamp", 0.6) for i in range(4)],
    "versions": [(0, "whoosh", 0.5), ("lui", "whoosh", 0.5)],
    "trial": [("coupable", "gavel", 1.0, -0.02), ("coupable", "gavel", 0.8, 0.5), ("coupable", "big", 0.7), ("cinq", "soft", 0.6), ("trois", "soft", 0.6)],
    "debt": [("cinquante", "boom", 0.9)],
    "walk": [],
    "twist": [("ramène", "glitch", 0.5), ("million", "big", 0.9)],
    "question": [("escroc", "boom", 0.8), ("bouc", "boom", 0.8)],
    "cta": [(0, "whoosh", 0.4), ("abonne", "ding", 0.8), ("__end", "stamp", 1.0)],
}
SFX["riser"] = riser
TENSION = {"cold": .8, "hook": .4, "fifty": .7, "reveal": .5, "forge": .2, "ambition": .4, "tower": .4, "scan": .5, "desk": .6,
           "fake": .8, "alerts": .9, "gain": .7, "bet": 1, "drop": 1, "ghost": .8, "bomb": .0,
           "p2title": .3, "interro": .5, "sell": .9, "krach": 1, "loss": .5, "news": .7, "versions": .5,
           "trial": .6, "debt": .5, "walk": .3, "twist": .6, "question": .2, "cta": .4}


def main():
    voice = np.zeros(N, np.float32)
    sfx = np.zeros(N, np.float32)
    cont = abs(SEGS[1].start - SEGS[1].s0 - (SEGS[0].start - SEGS[0].s0)) < 1e-6
    if cont:
        full = load_mp3(SEGS[0].file)[:int(SEGS[-1].s1 * SR)].copy()
        fade = int(0.05 * SR); full[-fade:] *= np.linspace(1, 0, fade)
        add(voice, full, SEGS[0].start - SEGS[0].s0)
    for sg in SEGS:
        if not cont:
            v = load_mp3(sg.file)[int(sg.s0 * SR):int(sg.s1 * SR)]
            fade = min(len(v), int(0.02 * SR))
            v[:fade] *= np.linspace(0, 1, fade); v[-fade:] *= np.linspace(1, 0, fade)
            add(voice, v, sg.start)
        for cue in CUES.get(sg.scene, []):
            anc, kind, g = cue[0], cue[1], cue[2]
            extra = cue[3] if len(cue) > 3 else 0
            if anc == "__end":
                t0 = sg.start + sg.speech + 0.4
            elif isinstance(anc, str):
                t0 = sg.start + sg.wt(anc)
            else:
                t0 = sg.start + anc
            add(sfx, SFX[kind]().astype(np.float32), t0 + extra, g)
        if sg.scene in ("bomb", "question"):
            k = 0.0
            while k < sg.dur - 0.4:
                add(sfx, heartbeat(), sg.vstart + k, 0.55)
                k += 60 / (72 if sg.scene == "bomb" else 66)
        if sg.scene == "sell":
            k = 0.0
            while k < sg.dur:
                add(sfx, tick(), sg.vstart + k, 0.5); k += 0.25
        if sg.scene == "walk":
            k = 0.2
            while k < sg.dur:
                add(sfx, boom(0.25, 70, 50, 0.6) * 0.25, sg.vstart + k, 0.6); k += 0.55

    # ------------------------------------------------ music bed
    t = tt(N)
    tension = np.zeros(N, np.float32)
    for sg in SEGS:
        a, b = int(sg.vstart * SR), int(sg.vend * SR)
        tension[a:b] = TENSION.get(sg.scene, .4)
    k = int(0.4 * SR)
    tension = movavg(tension, k)
    root = 55.0
    drone = (np.sin(2 * np.pi * root * t) * 0.5 + np.sin(2 * np.pi * root * 1.5 * t + 0.3) * 0.22
             + np.sin(2 * np.pi * root * 2.002 * t) * 0.18 + np.sin(2 * np.pi * root * 2.4 * t) * 0.08 * (0.5 + 0.5 * np.sin(t * 0.3)))
    drone *= 0.55 + 0.25 * np.sin(2 * np.pi * t / 7.0)
    air = movavg(rng.standard_normal(N), 60) * 0.6
    pad = drone * 0.22 + air * 0.08
    # pulse (dark techno-ish kick + offbeat hat) at 84 bpm scaled by tension
    bpm = 84; beat = 60 / bpm
    kick = boom(0.45, 110, 45, 0.05) * 0.8
    hat = (rng.standard_normal(int(0.04 * SR)) * env(int(0.04 * SR), 0.0005, 0.01)).astype(np.float32)
    pulse = np.zeros(N, np.float32)
    nb = int(TOTAL / beat)
    for i in range(nb):
        t0 = i * beat
        add(pulse, kick, t0, 1.0)
        add(pulse, hat, t0 + beat / 2, 0.25)
        if i % 4 == 3:
            add(pulse, beep(110, 0.18) * 0.6, t0 + beat * 0.75, 0.6)
    music = pad + pulse * (tension ** 1.3) * 0.55
    # cut music at cliffhanger / end
    for sg in SEGS:
        if sg.scene == "bomb":
            a = int((sg.start + sg.wt("bombe")) * SR)
            music[a:] *= 0.15
    # ducking under voice
    venv = np.abs(voice)
    w = int(0.15 * SR)
    venv = movavg(venv, w)
    duck = 1 - 0.55 * np.clip(venv / 0.05, 0, 1)
    mixd = voice * 1.0 + music * duck * 0.55 + sfx * 0.45
    mixd = np.tanh(mixd * 1.1) / np.tanh(1.1)
    fo = int(0.6 * SR)
    mixd[-fo:] *= np.linspace(1, 0, fo)
    st = np.stack([mixd, mixd], 1)
    st = (np.clip(st, -1, 1) * 32000).astype(np.int16)
    with wave.open(f"mix_{PART}.wav", "wb") as wf:
        wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR); wf.writeframes(st.tobytes())
    print("audio", PART, TOTAL)


main()
