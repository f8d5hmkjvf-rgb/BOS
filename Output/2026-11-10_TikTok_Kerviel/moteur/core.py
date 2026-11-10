# Shared engine: timeline, fonts, text, character, helpers
import json, math, random, unicodedata, functools
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30

NOIR = (7, 7, 10)
GOLD = (222, 182, 84)
GOLD_L = (247, 220, 140)
GOLD_D = (140, 104, 38)
RED = (226, 44, 38)
RED_D = (120, 14, 14)
GREEN = (52, 206, 120)
CREAM = (243, 237, 228)
GREY = (150, 146, 140)

FONT_BLACK = "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf"
FONT_XB = "/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf"
FONT_MED = "/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf"
FONT_SERIF = "/usr/share/fonts/truetype/crosextra/Caladea-Bold.ttf"
FONT_SERIF_I = "/usr/share/fonts/truetype/crosextra/Caladea-BoldItalic.ttf"
FONT_MONO = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-ExtraBold.ttf"


@functools.lru_cache(maxsize=None)
def F(path, size):
    return ImageFont.truetype(path, size)


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp(x)
    return 3 * x * x - 2 * x * x * x


def back_out(x, s=1.7):
    x = clamp(x)
    x -= 1
    return x * x * ((s + 1) * x + s) + 1


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn" and (c.isalnum() or c in "'"))


# ---------------------------------------------------------------- text layers
@functools.lru_cache(maxsize=4096)
def text_layer(text, path, size, fill, tracking=0, stroke=0, stroke_fill=(0, 0, 0)):
    f = F(path, size)
    widths = [f.getlength(ch) for ch in text]
    total = sum(widths) + tracking * max(0, len(text) - 1)
    asc, desc = f.getmetrics()
    pad = stroke + 8
    im = Image.new("RGBA", (int(total + 2 * pad), asc + desc + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x = pad
    if tracking == 0:
        d.text((pad, pad), text, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
    else:
        for ch, w in zip(text, widths):
            d.text((x, pad), ch, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
            x += w + tracking
    return im


@functools.lru_cache(maxsize=1024)
def glow_of(layer_key, radius):
    layer = text_layer(*layer_key)
    pad = radius * 2
    big = Image.new("RGBA", (layer.width + 2 * pad, layer.height + 2 * pad), (0, 0, 0, 0))
    big.paste(layer, (pad, pad))
    return big.filter(ImageFilter.GaussianBlur(radius)), pad


def put(canvas, layer, cx, cy, alpha=1.0, scale=1.0, anchor="c"):
    if alpha <= 0.003:
        return
    if abs(scale - 1) > 1e-3:
        nw, nh = max(1, int(layer.width * scale)), max(1, int(layer.height * scale))
        layer = layer.resize((nw, nh), Image.BILINEAR)
    if alpha < 0.999:
        a = layer.getchannel("A").point(lambda v: int(v * alpha))
        layer = layer.copy()
        layer.putalpha(a)
    if anchor == "c":
        x, y = int(cx - layer.width / 2), int(cy - layer.height / 2)
    elif anchor == "l":
        x, y = int(cx), int(cy - layer.height / 2)
    else:
        x, y = int(cx - layer.width), int(cy - layer.height / 2)
    canvas.alpha_composite(layer, (x, y)) if x >= 0 and y >= 0 and x + layer.width <= canvas.width and y + layer.height <= canvas.height else safe_paste(canvas, layer, x, y)


def safe_paste(canvas, layer, x, y):
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(canvas.width, x + layer.width), min(canvas.height, y + layer.height)
    if x1 <= x0 or y1 <= y0:
        return
    crop = layer.crop((x0 - x, y0 - y, x1 - x, y1 - y))
    canvas.alpha_composite(crop, (x0, y0))


def text(canvas, s, cx, cy, path=FONT_BLACK, size=80, fill=CREAM, tracking=0, stroke=0,
         alpha=1.0, scale=1.0, glow=0, glow_alpha=0.8, anchor="c", stroke_fill=(0, 0, 0)):
    key = (s, path, size, tuple(fill) + ((255,) if len(fill) == 3 else ()), tracking, stroke, stroke_fill)
    if glow:
        g, pad = glow_of(key, glow)
        put(canvas, g, cx, cy, alpha * glow_alpha, scale, anchor)
    put(canvas, text_layer(*key), cx, cy, alpha, scale, anchor)


def text_width(s, path, size, tracking=0):
    f = F(path, size)
    return f.getlength(s) + tracking * max(0, len(s) - 1)


def fit_size(s, path, size, maxw, tracking=0):
    while size > 20 and text_width(s, path, size, tracking) > maxw:
        size -= 2
    return size


# ---------------------------------------------------------------- backgrounds
@functools.lru_cache(maxsize=64)
def vgrad(top, bottom, w=W, h=H):
    a = np.linspace(0, 1, h)[:, None, None]
    arr = np.array(top)[None, None, :] * (1 - a) + np.array(bottom)[None, None, :] * a
    arr = np.repeat(arr, w, axis=1).astype(np.uint8)
    return Image.fromarray(arr, "RGB").convert("RGBA")


@functools.lru_cache(maxsize=16)
def radial(w, h, cx, cy, r, color, power=2.0):
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx - cx) / r) ** 2 + ((yy - cy) / r) ** 2)
    a = np.clip(1 - d, 0, 1) ** power
    arr = np.zeros((h, w, 4), np.uint8)
    arr[..., :3] = color
    arr[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def zoom(img, s, fx=0.5, fy=0.5):
    """scale up img by s around focus (fx,fy) and crop to W,H"""
    if s <= 1.0005:
        return img if img.size == (W, H) else img.resize((W, H), Image.BILINEAR)
    cw, ch = img.width / s, img.height / s
    x0 = (img.width - cw) * fx
    y0 = (img.height - ch) * fy
    return img.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch))


# ---------------------------------------------------------------- particles
_rng = np.random.default_rng(7)
DUST = _rng.random((90, 5))


def dust(canvas, t, color=GOLD_L, n=90, speed=1.0, alpha=1.0):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for i in range(n):
        x0, y0, sz, ph, sp = DUST[i % len(DUST)]
        x = (x0 * W + 30 * math.sin(t * 0.5 + ph * 6.28)) % W
        y = (y0 * H - t * (20 + 60 * sp) * speed) % H
        r = 1.2 + sz * 3.2
        a = int(255 * alpha * (0.25 + 0.6 * (0.5 + 0.5 * math.sin(t * 2 + ph * 9))) * (0.4 + 0.6 * sz))
        d.ellipse((x - r, y - r, x + r, y + r), fill=color + (a,))
    ov = ov.filter(ImageFilter.GaussianBlur(1.2))
    canvas.alpha_composite(ov)


# ---------------------------------------------------------------- charts
def candles(seed, n, drift=0.0, vol=1.0, start=100.0):
    r = random.Random(seed)
    out, p = [], start
    for i in range(n):
        o = p
        c = o + r.gauss(drift, 1.6 * vol)
        hi = max(o, c) + abs(r.gauss(0, 0.9 * vol))
        lo = min(o, c) - abs(r.gauss(0, 0.9 * vol))
        out.append((o, hi, lo, c))
        p = c
    return out


def draw_candles(d, rect, data, upto=1.0, up=GREEN, down=RED, lo=None, hi=None, width_k=0.62, mono=None):
    x0, y0, x1, y1 = rect
    n = len(data)
    k = max(1, int(round(n * clamp(upto))))
    lo = lo if lo is not None else min(c[2] for c in data)
    hi = hi if hi is not None else max(c[1] for c in data)
    span = hi - lo or 1
    cw = (x1 - x0) / n

    def Y(v):
        return y1 - (v - lo) / span * (y1 - y0)

    for i in range(k):
        o, h_, l_, c = data[i]
        col = mono or (up if c >= o else down)
        cx = x0 + cw * (i + 0.5)
        d.line((cx, Y(h_), cx, Y(l_)), fill=col, width=max(1, int(cw * 0.12)))
        top, bot = Y(max(o, c)), Y(min(o, c))
        if bot - top < 2:
            bot = top + 2
        d.rectangle((cx - cw * width_k / 2, top, cx + cw * width_k / 2, bot), fill=col)
    if k:
        return x0 + cw * (k - 0.5), Y(data[k - 1][3])
    return x0, y1


# ---------------------------------------------------------------- character
class Character:
    """Stylised graphic-novel bust of the protagonist (no photo likeness)."""

    def __init__(self):
        S = 2
        Wc, Hc = 1000, 1300
        self.W, self.H = Wc, Hc

        def P(pts):
            return [(x * S, y * S) for x, y in pts]

        def new():
            return Image.new("L", (Wc * S, Hc * S), 0)

        def B(box):
            return [v * S for v in box]

        body = new(); d = ImageDraw.Draw(body)
        d.polygon(P([(30, 1300), (55, 1040), (110, 905), (240, 818), (395, 762), (432, 700),
                     (568, 700), (605, 762), (760, 818), (890, 905), (945, 1040), (970, 1300)]), fill=255)
        neck = new(); dn = ImageDraw.Draw(neck)
        dn.polygon(P([(428, 560), (572, 560), (580, 760), (500, 800), (420, 760)]), fill=255)
        head = new(); dh = ImageDraw.Draw(head)
        dh.ellipse(B((345, 205, 655, 630)), fill=255)
        dh.polygon(P([(350, 430), (362, 540), (398, 612), (455, 662), (500, 674), (545, 662),
                      (602, 612), (638, 540), (650, 430)]), fill=255)
        dh.ellipse(B((322, 398, 372, 505)), fill=255)
        dh.ellipse(B((628, 398, 678, 505)), fill=255)
        hair = new(); dha = ImageDraw.Draw(hair)
        dha.ellipse(B((330, 168, 670, 520)), fill=255)
        dha.ellipse(B((338, 150, 610, 320)), fill=255)
        dha.ellipse(B((420, 158, 668, 330)), fill=255)
        dha.polygon(P([(280, 445), (342, 440), (348, 372), (372, 336), (430, 326), (488, 300),
                       (560, 318), (620, 330), (648, 372), (658, 440), (720, 445), (720, 900), (280, 900)]), fill=0)
        shirt = new(); ds = ImageDraw.Draw(shirt)
        ds.polygon(P([(418, 712), (582, 712), (612, 790), (528, 1300), (472, 1300), (388, 790)]), fill=255)
        collar = new(); dc = ImageDraw.Draw(collar)
        dc.polygon(P([(425, 700), (497, 800), (420, 835), (385, 770)]), fill=255)
        dc.polygon(P([(575, 700), (503, 800), (580, 835), (615, 770)]), fill=255)
        tie = new(); dt = ImageDraw.Draw(tie)
        dt.polygon(P([(484, 790), (520, 790), (512, 828), (490, 828)]), fill=255)
        dt.polygon(P([(489, 826), (513, 826), (536, 1150), (503, 1205), (470, 1150)]), fill=255)

        def arr(m):
            return np.asarray(m.resize((Wc, Hc), Image.LANCZOS), np.float32) / 255.0

        body, neck, head, hair, shirt, collar, tie = map(arr, (body, neck, head, hair, shirt, collar, tie))
        alpha = np.clip(body + neck + head, 0, 1)
        face = np.clip(head - hair, 0, 1)
        neck_only = np.clip(neck - head, 0, 1) * (1 - np.clip(collar + shirt, 0, 1))

        col = np.zeros((Hc, Wc, 3), np.float32)
        col[:] = np.array([14, 17, 28], np.float32)  # jacket
        def lay(mask, c):
            nonlocal col
            col = col * (1 - mask[..., None]) + np.array(c, np.float32) * mask[..., None]
        lay(shirt, (205, 200, 192))
        lay(collar, (225, 221, 214))
        lay(tie, (66, 14, 18))
        lay(neck_only, (130, 94, 78))
        lay(face, (168, 126, 104))
        lay(hair, (12, 10, 10))

        feat = Image.new("RGBA", (Wc * S, Hc * S), (0, 0, 0, 0))
        df = ImageDraw.Draw(feat)
        sk = (40, 26, 22, 255)
        df.ellipse(B((398, 448, 480, 500)), fill=(70, 48, 40, 200))
        df.ellipse(B((520, 448, 602, 500)), fill=(70, 48, 40, 200))
        df.line(P([(398, 446), (440, 434), (478, 440)]), fill=(14, 10, 10, 255), width=14 * S, joint="curve")
        df.line(P([(522, 440), (560, 434), (602, 446)]), fill=(14, 10, 10, 255), width=14 * S, joint="curve")
        df.ellipse(B((422, 466, 460, 484)), fill=(16, 10, 10, 255))
        df.ellipse(B((540, 466, 578, 484)), fill=(16, 10, 10, 255))
        df.line(P([(500, 470), (494, 540), (484, 566), (500, 574), (516, 566)]), fill=(60, 40, 34, 230), width=7 * S, joint="curve")
        df.line(P([(462, 612), (500, 607), (538, 612)]), fill=sk, width=7 * S, joint="curve")
        df.line(P([(470, 632), (530, 632)]), fill=(70, 50, 42, 160), width=5 * S)
        # lapels
        df.line(P([(398, 778), (448, 1000), (470, 1300)]), fill=(4, 5, 9, 255), width=8 * S)
        df.line(P([(602, 778), (552, 1000), (530, 1300)]), fill=(4, 5, 9, 255), width=8 * S)
        df.line(P([(240, 830), (300, 1300)]), fill=(26, 30, 44, 200), width=4 * S)
        df.line(P([(760, 830), (700, 1300)]), fill=(26, 30, 44, 200), width=4 * S)
        feat = feat.resize((Wc, Hc), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))
        fa = np.asarray(feat, np.float32) / 255.0
        col = col * (1 - fa[..., 3:4]) + fa[..., :3] * 255 * fa[..., 3:4]

        # jaw / cheek shading
        yy, xx = np.mgrid[0:Hc, 0:Wc].astype(np.float32)
        side = np.abs(xx - 500) / 160.0
        shade_face = 1 - 0.55 * np.clip(side - 0.45, 0, 1) - 0.25 * np.clip((yy - 560) / 120, 0, 1)
        col = col * np.where(face[..., None] > 0, shade_face[..., None], 1)

        self.base = col
        self.alpha = alpha
        self.face = np.clip(face + neck_only, 0, 1)
        self.shirt = np.clip(shirt + collar, 0, 1)

        def blur(a, r):
            im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
            return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255.0

        def shift(a, dx, dy):
            out = np.zeros_like(a)
            hs, ws = a.shape
            out[max(0, dy):hs + min(0, dy), max(0, dx):ws + min(0, dx)] = a[max(0, -dy):hs - max(0, dy), max(0, -dx):ws - max(0, dx)]
            return out

        self.rimL = blur(np.clip(alpha - shift(alpha, 11, 3), 0, 1), 3) * alpha
        self.rimR = blur(np.clip(alpha - shift(alpha, -11, 3), 0, 1), 3) * alpha
        self.rimT = blur(np.clip(alpha - shift(alpha, 0, 18), 0, 1), 4) * alpha
        # light maps
        g_below = np.clip(1 - np.sqrt(((xx - 500) / 420) ** 2 + ((yy - 900) / 650) ** 2), 0, 1) ** 1.4
        g_above = np.clip(1 - np.sqrt(((xx - 500) / 380) ** 2 + ((yy - 250) / 600) ** 2), 0, 1) ** 1.3
        self.g_below = g_below
        self.g_above = g_above
        self.splitL = np.clip((520 - xx) / 60, 0, 1)
        eyes = Image.new("L", (Wc, Hc), 0)
        de = ImageDraw.Draw(eyes)
        for ex in (447, 565):
            de.ellipse((ex - 4, 471, ex + 4, 478), fill=255)
        self.eyes = blur(np.asarray(eyes, np.float32) / 255.0, 1.5) * 2.2
        self.cache = {}

    def render(self, light="below", key=(255, 190, 120), k=1.0, rimL=GOLD, rimR=None, rimT=None,
               eye=(255, 230, 160), ambient=0.28, split=None):
        ck = (light, key, round(k, 2), rimL, rimR, rimT, eye, round(ambient, 2), split)
        if ck in self.cache:
            return self.cache[ck]
        g = self.g_below if light == "below" else self.g_above
        keyc = np.array(key, np.float32) / 255.0
        if split:
            cl, cr = (np.array(split[0], np.float32) / 255, np.array(split[1], np.float32) / 255)
            keyc = cl[None, None, :] * self.splitL[..., None] + cr[None, None, :] * (1 - self.splitL[..., None])
            g = np.maximum(g, 0.6)
        light_map = ambient + k * g[..., None] * keyc
        light_map = light_map * (1 + 0.25 * self.shirt[..., None] * g[..., None])
        col = self.base * light_map
        for m, c in ((self.rimL, rimL), (self.rimR, rimR), (self.rimT, rimT)):
            if c is not None:
                col = col + m[..., None] * np.array(c, np.float32) * 0.95
        if eye is not None:
            col = col + self.eyes[..., None] * np.array(eye, np.float32)
        rgba = np.dstack([np.clip(col, 0, 255), self.alpha * 255]).astype(np.uint8)
        im = Image.fromarray(rgba, "RGBA")
        if len(self.cache) > 40:
            self.cache.clear()
        self.cache[ck] = im
        return im


# ---------------------------------------------------------------- timeline
LEAD = 0.35
GAP = 0.36
EXTRA_GAP = {"reveal": 0.45, "ambition": 0.4, "drop": 0.35, "loss": 0.45, "trial": 0.4,
             "debt": 0.3, "question": 0.5, "ghost": 0.25, "p2title": 0.25}
TAIL = {"p1": 2.6, "p2": 3.0}


class Seg:
    def __init__(self, d, start, s0, s1):
        self.scene = d["scene"]; self.text = d["text"]; self.file = d["file"]
        self.start = start            # global start of scene (= speech start)
        self.s0, self.s1 = s0, s1     # trim inside the mp3
        self.speech = s1 - s0
        self.words = [(w[0] - s0, w[1], w[2]) for w in d["words"]]
        self.dur = None

    def wt(self, key, default=None, nth=0):
        k = norm(key)
        hits = [w[0] for w in self.words if norm(w[2]).startswith(k)]
        if len(hits) > nth:
            return max(0.0, hits[nth])
        return default if default is not None else 0.0


def build_timeline(part):
    data = json.load(open("vo.json"))[part]
    segs, T = [], LEAD
    for d in data:
        if "cs0" in d:   # continuous narration: keep the natural flow, no added gaps
            sg = Seg(d, LEAD + d["cs0"], d["cs0"], d["cs1"])
            segs.append(sg)
            T = sg.start + sg.speech
            continue
        s0 = max(0.0, d["words"][0][0] - 0.04)
        s1 = min(d["dur"], d["words"][-1][0] + d["words"][-1][1] + 0.12)
        sg = Seg(d, T, s0, s1)
        segs.append(sg)
        T += sg.speech + GAP + EXTRA_GAP.get(sg.scene, 0)
    for i, sg in enumerate(segs):
        nxt = segs[i + 1].start if i + 1 < len(segs) else T + TAIL[part]
        if i == 0:
            sg.vstart = 0.0
        else:
            sg.vstart = sg.start - 0.08
        sg.vend = nxt - 0.08 if i + 1 < len(segs) else nxt
        sg.dur = sg.vend - sg.vstart
        sg.off = sg.start - sg.vstart   # speech offset inside the visual scene
    total = segs[-1].vend
    return segs, total
