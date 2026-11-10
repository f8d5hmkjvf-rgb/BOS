import sys, subprocess, os
from multiprocessing import Pool
from scenes2 import *

PART = sys.argv[1]
SEGS, TOTAL = build_timeline(PART)
NF = int(math.ceil(TOTAL * FPS))
LABEL = "PARTIE 1/2" if PART == "p1" else "PARTIE 2/2"

# ---------------------------------------------------------------- captions
def build_chunks():
    chunks = []
    for sg in SEGS:
        ws = [(sg.start + w[0], w[1], w[2]) for w in sg.words]
        cur = []
        for i, w in enumerate(ws):
            if cur and (len(cur) >= 3 or w[0] - (cur[-1][0] + cur[-1][1]) > 0.16 or len(" ".join(x[2] for x in cur + [w])) > 22):
                chunks.append(cur); cur = []
            cur.append(w)
        if cur:
            chunks.append(cur)
    out = []
    for i, ch in enumerate(chunks):
        st = ch[0][0]
        en = ch[-1][0] + ch[-1][1] + 0.25
        if i + 1 < len(chunks):
            en = min(en, chunks[i + 1][0][0])
        out.append((st, en, ch))
    return out


CHUNKS = build_chunks()
CAP_Y = 1400


def captions(c, T):
    for st, en, ch in CHUNKS:
        if st <= T < en:
            words = [w[2].upper() for w in ch]
            size = 82
            sp = F(FONT_BLACK, size).getlength(" ")
            while size > 40:
                tot = sum(text_width(w, FONT_BLACK, size) for w in words) + sp * (len(words) - 1)
                if tot <= 900:
                    break
                size -= 4
                sp = F(FONT_BLACK, size).getlength(" ")
            pop = back_out((T - st) / 0.14, 2.2)
            sc = lerp(0.82, 1.0, pop)
            x = W / 2 - tot * sc / 2
            for i, w in enumerate(ch):
                active = w[0] <= T
                cur = active and (i + 1 == len(ch) or ch[i + 1][0] > T)
                col = GOLD_L if cur else (CREAM if active else (200, 196, 190))
                ww = text_width(words[i], FONT_BLACK, size) * sc
                text(c, words[i], x, CAP_Y, FONT_BLACK, size, col, stroke=9, anchor="l", scale=sc,
                     alpha=1.0 if active else 0.75)
                x += ww + sp * sc
            break


def hud(c, T):
    text(c, "DOSSIER N°01 · L'AFFAIRE KERVIEL", W / 2, 205, FONT_MONO, 25, GOLD, tracking=4, alpha=0.85)
    d = ImageDraw.Draw(c)
    x0, x1, y = 190, 890, 240
    d.line((x0, y, x1, y), fill=(255, 255, 255, 50), width=4)
    d.line((x0, y, lerp(x0, x1, T / TOTAL), y), fill=GOLD + (230,), width=4)
    text(c, LABEL, x1 + 14, y, FONT_MONO, 20, CREAM, anchor="l", alpha=0.7)


# ---------------------------------------------------------------- post fx
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
VIG = (1 - 0.55 * np.clip(np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2) - 0.35, 0, 1) ** 1.4)[..., None]
_g = np.random.default_rng(1)
GRAIN = [(_g.standard_normal((H // 2, W // 2)) * 9).astype(np.float32) for _ in range(6)]
GRAIN = [np.repeat(np.repeat(g, 2, 0), 2, 1)[..., None] for g in GRAIN]
del yy, xx


def find_seg(T):
    for sg in SEGS:
        if sg.vstart <= T < sg.vend:
            return sg
    return SEGS[-1]


def frame(fi):
    T = fi / FPS
    sg = find_seg(T)
    lt = T - sg.vstart
    c = Image.new("RGBA", (W, H), NOIR + (255,))
    fx = SCENES[sg.scene](c, lt, sg) or {}
    # entry punch
    punch = 1 + 0.06 * (1 - ease_out(lt / 0.35))
    sh = min(40, fx.get("shake", 0))
    if punch > 1.001 or sh > 0.5:
        r = R(fi)
        ox, oy = (r.uniform(-1, 1) * sh, r.uniform(-1, 1) * sh) if sh > 0.5 else (0, 0)
        punch = max(punch, W / (W - 2 * sh - 4))
        cw, ch_ = W / punch, H / punch
        x0 = clamp((W - cw) / 2 - ox, 0, W - cw); y0 = clamp((H - ch_) / 2 - oy, 0, H - ch_)
        c = c.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch_))
    arr = np.asarray(c.convert("RGB"), np.float32)
    k = int(fx.get("chroma", 0))
    if k:
        arr[..., 0] = np.roll(arr[..., 0], k, axis=1)
        arr[..., 2] = np.roll(arr[..., 2], -k, axis=1)
    fl = fx.get("flash")
    entry = 0.22 * (1 - ease_out(lt / 0.25)) if fi > 0 else 0
    if fl and fl[1] > 0.005:
        arr += np.array(fl[0], np.float32) * fl[1]
    if entry > 0.005:
        arr += np.array(GOLD_L, np.float32) * entry * 0.5
    c = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert("RGBA")
    hud(c, T)
    captions(c, T)
    # fade in / out
    arr = np.asarray(c.convert("RGB"), np.float32) * VIG + GRAIN[fi % 6]
    if T > TOTAL - 0.6:
        arr *= clamp((TOTAL - T) / 0.6)
    return np.clip(arr, 0, 255).astype(np.uint8)


def render_chunk(args):
    i, f0, f1 = args
    out = f"chunk_{PART}_{i:02d}.mp4"
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                          "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
                          "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    for fi in range(f0, f1):
        p.stdin.write(frame(fi).tobytes())
    p.stdin.close(); p.wait()
    return out


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[2] == "preview":
        os.makedirs("prev", exist_ok=True)
        for sg in SEGS:
            for frac in (0.35, 0.9):
                fi = int((sg.vstart + sg.dur * frac) * FPS)
                Image.fromarray(frame(fi)).resize((540, 960)).save(f"prev/{PART}_{sg.scene}_{int(frac*100)}.png")
        print("preview ok")
        sys.exit()
    n = 8
    step = math.ceil(NF / n)
    jobs = [(i, i * step, min(NF, (i + 1) * step)) for i in range(n)]
    with Pool(4) as pool:
        outs = pool.map(render_chunk, jobs)
    with open(f"list_{PART}.txt", "w") as f:
        for o in outs:
            f.write(f"file '{o}'\n")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", f"list_{PART}.txt",
                    "-c", "copy", f"video_{PART}.mp4"], check=True)
    print("video", PART, NF, "frames", TOTAL)
