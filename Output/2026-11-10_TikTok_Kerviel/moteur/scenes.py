from core import *

CHAR = Character()
R = random.Random


def WT(seg, key, default=None, nth=0):
    return seg.off + seg.wt(key, default, nth)


def impact(t, t0, amp=18, k=9.0):
    if t < t0:
        return 0.0
    return amp * math.exp(-(t - t0) * k)


def appear(t, t0, dur=0.35):
    return ease_out((t - t0) / dur) if t >= t0 else 0.0


def slam(t, t0, dur=0.28, s0=1.8):
    """scale & alpha for slam-in text"""
    if t < t0:
        return 0.0, s0
    p = clamp((t - t0) / dur)
    return min(1, p * 3), lerp(s0, 1.0, ease_out(p))


def glow_layer(layer, r=18, k=1.0):
    small = layer.resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(r / 4))
    g = small.resize((W, H), Image.BILINEAR)
    if k != 1.0:
        a = g.getchannel("A").point(lambda v: min(255, int(v * k)))
        g.putalpha(a)
    return g


def boxed(c, s, cx, cy, size=40, fg=NOIR, bg=GOLD, path=FONT_MONO, alpha=1.0, padx=24, pady=12, tracking=2):
    if alpha <= 0:
        return
    w = text_width(s, path, size, tracking) + padx * 2
    h = size + pady * 2
    ov = Image.new("RGBA", (int(w), int(h + 10)), (0, 0, 0, 0))
    ImageDraw.Draw(ov).rectangle((0, 0, w - 1, h), fill=bg + (255,))
    lay = text_layer(s, path, size, fg + (255,), tracking, 0, (0, 0, 0))
    ov.alpha_composite(lay, (int((w - lay.width) / 2), int((h - lay.height) / 2) + 2))
    put(c, ov, cx, cy, alpha)


def stamp(c, s, cx, cy, t, t0, size=110, col=RED, angle=-10, border=True):
    if t < t0:
        return 0
    p = clamp((t - t0) / 0.18)
    sc = lerp(2.4, 1.0, ease_out(p))
    key = (s, size, col, angle)
    lay = _stamp_cache.get(key)
    if lay is None:
        f = F(FONT_BLACK, size)
        w = int(f.getlength(s)) + 60
        h = size + 50
        im = Image.new("RGBA", (w + 20, h + 20), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        if border:
            d.rectangle((10, 10, w + 10, h + 10), outline=col + (255,), width=10)
        d.text((40, 18), s, font=f, fill=col + (255,))
        # grunge
        rr = R(hash(s) & 0xffff)
        for _ in range(140):
            x, y = rr.randint(0, w + 20), rr.randint(0, h + 20)
            d.ellipse((x, y, x + rr.randint(2, 7), y + rr.randint(2, 5)), fill=(0, 0, 0, 0))
        lay = im.rotate(angle, expand=True, resample=Image.BICUBIC)
        _stamp_cache[key] = lay
    put(c, lay, cx, cy, min(1, p * 2) * 0.95, sc)
    return impact(t, t0 + 0.12, 22)


_stamp_cache = {}


# ------------------------------------------------------------ cached layers
@functools.lru_cache(maxsize=None)
def skyline():
    w, h = 1400, 2490
    im = vgrad((6, 8, 20), (34, 22, 14), w, h).copy()
    d = ImageDraw.Draw(im)
    r = R(11)
    for _ in range(140):
        x, y = r.randint(0, w), r.randint(0, 1100)
        a = r.randint(60, 200)
        d.point((x, y), fill=(255, 240, 210, a))
    haze = radial(w, h, w // 2, 1900, 900, (200, 120, 50), 2.2)
    im.alpha_composite(haze)
    # far towers
    def tower(x, wd, top, col, lit=0.10, edge=(60, 50, 40)):
        d.rectangle((x, top, x + wd, h), fill=col)
        d.line((x, top, x, h), fill=edge, width=2)
        for yy in range(top + 18, h - 40, 26):
            for xx in range(x + 10, x + wd - 12, 20):
                if r.random() < lit:
                    a = r.randint(120, 255)
                    d.rectangle((xx, yy, xx + 9, yy + 13), fill=(255, 196, 110, a))
    for i in range(16):
        tower(r.randint(-80, w), r.randint(90, 180), r.randint(1100, 1500), (14, 14, 22), 0.05, (30, 28, 36))
    # Grande Arche (hollow cube)
    ax, ay, s = 860, 1330, 420
    d.rectangle((ax, ay, ax + s, ay + s), fill=(18, 18, 26))
    d.rectangle((ax + 70, ay + 80, ax + s - 70, ay + s), fill=(40, 26, 18))
    d.line((ax, ay, ax + s, ay), fill=(120, 100, 70), width=3)
    for i in range(9):
        tower(r.randint(-60, w), r.randint(130, 230), r.randint(700, 1200), (10, 10, 16), 0.12, (70, 60, 48))
    # hero tower
    hx, hw, ht = 470, 270, 420
    d.rectangle((hx, ht, hx + hw, h), fill=(9, 9, 14))
    d.line((hx, ht, hx, h), fill=(150, 120, 70), width=3)
    d.line((hx + hw, ht, hx + hw, h), fill=(40, 34, 30), width=2)
    for yy in range(ht + 24, h - 40, 28):
        for xx in range(hx + 14, hx + hw - 16, 22):
            if r.random() < 0.06:
                d.rectangle((xx, yy, xx + 10, yy + 14), fill=(255, 196, 110, r.randint(80, 200)))
    fx, fy = hx + 14 + 22 * 6, ht + 24 + 28 * 9
    ground = vgrad((0, 0, 0), (0, 0, 0), w, 200)
    im.alpha_composite(vgrad((10, 8, 8), (2, 2, 3), w, 300), (0, h - 300))
    return im, (fx, fy)


@functools.lru_cache(maxsize=None)
def monitor_wall(tint="mix", blur=0):
    im = vgrad((6, 7, 12), (2, 2, 4)).copy()
    d = ImageDraw.Draw(im)
    r = R(5)
    cols, rows = 3, 5
    mw, mh = 340, 230
    gx, gy = 15, 40
    for j in range(rows):
        for i in range(cols):
            x = 20 + i * (mw + gx) + (j % 2) * 30 - 15
            y = 120 + j * (mh + gy)
            d.rounded_rectangle((x - 8, y - 8, x + mw + 8, y + mh + 8), 8, fill=(18, 18, 22))
            d.rectangle((x, y, x + mw, y + mh), fill=(4, 8, 10))
            data = candles(r.randint(0, 9999), 34, drift=r.choice([-0.4, 0.3, 0.5]), vol=1.0)
            mono = None
            if tint == "red":
                mono = RED
            elif tint == "gold":
                mono = GOLD
            draw_candles(d, (x + 12, y + 30, x + mw - 12, y + mh - 14), data, 1.0, mono=mono)
            d.text((x + 12, y + 6), r.choice(["EURO STOXX 50", "DAX", "CAC 40", "FTSE 100", "FUT. INDEX"]),
                   font=F(FONT_MONO, 16), fill=(180, 170, 150))
    g = glow_layer(im.copy(), 24, 1.0)
    out = Image.alpha_composite(im, g)
    if blur:
        out = out.filter(ImageFilter.GaussianBlur(blur))
    return out


@functools.lru_cache(maxsize=None)
def trade_rows(seed=3, n=40):
    r = R(seed)
    rows = []
    for i in range(n):
        rows.append("TRD-%05d  %-6s %-4s %8s  %s" % (
            r.randint(10000, 99999), r.choice(["FDAX", "FESX", "FCE", "FTSE"]), r.choice(["BUY", "SELL"]),
            "{:,}".format(r.randint(50, 9000)).replace(",", " "), r.choice(["OK", "OK", "OK", "VAL", "CHK"])))
    return rows


def draw_rows(c, rows, y0, scroll, color=(150, 160, 150), size=30, hl=None, hl_col=RED, alpha=255, x=90, step=44):
    d = ImageDraw.Draw(c)
    f = F(FONT_MONO, size)
    n = len(rows)
    start = int(scroll // step)
    for k in range(-1, 30):
        i = (start + k) % n
        y = y0 + k * step - (scroll % step)
        if y < y0 - step or y > y0 + 28 * step:
            continue
        col = color
        if hl and i in hl:
            d.rectangle((x - 14, y - 6, W - x + 14, y + size + 6), fill=hl_col + (90,))
            col = (255, 220, 210)
        d.text((x, y), rows[i], font=f, fill=col + (alpha,))


def ticker(c, t, y, items, speed=180, size=34, col=CREAM, bg=(0, 0, 0, 170), up_col=GREEN, down_col=RED):
    d = ImageDraw.Draw(c)
    d.rectangle((0, y - size // 2 - 14, W, y + size // 2 + 14), fill=bg)
    f = F(FONT_MONO, size)
    s = "   ".join(items) + "   "
    wtot = f.getlength(s)
    x = -(t * speed) % wtot
    xx = x - wtot
    while xx < W:
        cx = xx
        for it in items:
            colr = down_col if "▼" in it else (up_col if "▲" in it else col)
            d.text((cx, y - size // 2 - 2), it, font=f, fill=colr)
            cx += f.getlength(it + "   ")
        xx += wtot


def light_beams(c, t, cx, cy, color=GOLD, n=7, alpha=40, spread=1.0):
    ov = Image.new("RGBA", (W // 2, H // 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for i in range(n):
        a = -math.pi / 2 + (i - n / 2) * 0.22 * spread + 0.05 * math.sin(t * 0.7 + i)
        L = 1400
        w_ = 0.05
        p = [(cx / 2, cy / 2), (cx / 2 + L * math.cos(a - w_), cy / 2 + L * math.sin(a - w_)),
             (cx / 2 + L * math.cos(a + w_), cy / 2 + L * math.sin(a + w_))]
        d.polygon(p, fill=color + (alpha,))
    ov = ov.filter(ImageFilter.GaussianBlur(14)).resize((W, H), Image.BILINEAR)
    c.alpha_composite(ov)


def sparks(c, t, bursts, origin, n=70):
    d = ImageDraw.Draw(c)
    ox, oy = origin
    for bi, tb in enumerate(bursts):
        dt0 = t - tb
        if dt0 < 0 or dt0 > 1.6:
            continue
        r = R(100 + bi)
        for i in range(n):
            ang = -math.pi / 2 + r.uniform(-1.3, 1.3)
            sp = r.uniform(500, 1500)
            life = r.uniform(0.5, 1.5)
            if dt0 > life:
                continue
            vx, vy = sp * math.cos(ang), sp * math.sin(ang)
            x = ox + vx * dt0
            y = oy + vy * dt0 + 900 * dt0 * dt0
            x2 = x - vx * 0.025
            y2 = y - (vy + 1800 * dt0) * 0.025
            fade = 1 - dt0 / life
            col = mix((255, 120, 30), (255, 230, 150), r.random())
            d.line((x2, y2, x, y), fill=col + (int(255 * fade),), width=3)


def anvil(c, cx, cy, s=1.0, col=(4, 4, 6), edge=(255, 140, 60)):
    d = ImageDraw.Draw(c)
    P = lambda pts: [(cx + x * s, cy + y * s) for x, y in pts]
    body = [(-260, -80), (200, -80), (300, -60), (200, -20), (120, 0), (90, 80), (150, 140), (-150, 140),
            (-90, 80), (-120, 0), (-260, -40)]
    d.polygon(P(body), fill=col)
    d.line(P([(-260, -80), (200, -80), (300, -60)]), fill=edge, width=4)
    d.rectangle(P([(-200, 140), (200, 175)])[0] + P([(-200, 140), (200, 175)])[1], fill=col)


def tri_alert(d, x, y, s, col, alpha=255):
    d.polygon([(x, y - s), (x + s * 1.1, y + s * 0.85), (x - s * 1.1, y + s * 0.85)], fill=col + (alpha,))
    d.rectangle((x - s * 0.1, y - s * 0.45, x + s * 0.1, y + s * 0.3), fill=NOIR + (alpha,))
    d.ellipse((x - s * 0.12, y + s * 0.45, x + s * 0.12, y + s * 0.69), fill=NOIR + (alpha,))


def walker(c, cx, ground, t, s=1.0, col=(6, 4, 4)):
    d = ImageDraw.Draw(c)
    ph = t * 2 * math.pi * 0.9
    hip = (cx, ground - 300 * s + 6 * s * abs(math.sin(ph)))
    L = 150 * s

    def leg(a, k):
        knee = (hip[0] + L * math.sin(a), hip[1] + L * math.cos(a))
        b = a - abs(k)
        foot = (knee[0] + L * math.sin(b), knee[1] + L * math.cos(b))
        d.line((hip, knee), fill=col, width=int(38 * s)); d.line((knee, foot), fill=col, width=int(32 * s))
        d.ellipse((knee[0] - 17 * s, knee[1] - 17 * s, knee[0] + 17 * s, knee[1] + 17 * s), fill=col)
        d.polygon([(foot[0] - 14 * s, foot[1] - 10 * s), (foot[0] + 48 * s, foot[1] - 4 * s),
                   (foot[0] + 48 * s, foot[1] + 12 * s), (foot[0] - 16 * s, foot[1] + 12 * s)], fill=col)

    a1 = 0.45 * math.sin(ph); a2 = -a1
    leg(a2, 0.5 * max(0, math.sin(ph + 1.6)) + 0.1)
    shoulder = (hip[0] + 10 * s, hip[1] - 280 * s)
    d.polygon([(hip[0] - 40 * s, hip[1] + 10 * s), (hip[0] + 40 * s, hip[1] + 10 * s),
               (shoulder[0] + 48 * s, shoulder[1]), (shoulder[0] - 46 * s, shoulder[1] + 10 * s)], fill=col)
    leg(a1, 0.5 * max(0, math.sin(ph - 1.6)) + 0.1)
    # arms
    for sgn in (1, -1):
        a = 0.4 * math.sin(ph) * sgn
        el = (shoulder[0] + 140 * s * math.sin(a), shoulder[1] + 140 * s * math.cos(a))
        hd = (el[0] + 130 * s * math.sin(a + 0.25), el[1] + 130 * s * math.cos(a + 0.25))
        d.line((shoulder, el), fill=col, width=int(30 * s)); d.line((el, hd), fill=col, width=int(26 * s))
    # head + backpack
    hx, hy = shoulder[0] + 12 * s, shoulder[1] - 80 * s
    d.ellipse((hx - 58 * s, hy - 66 * s, hx + 58 * s, hy + 66 * s), fill=col)
    d.rectangle((hx - 22 * s, hy + 40 * s, hx + 22 * s, hy + 90 * s), fill=col)
    d.rounded_rectangle((shoulder[0] - 120 * s, shoulder[1] + 20 * s, shoulder[0] - 30 * s, shoulder[1] + 200 * s), 20, fill=col)


def scales(c, cx, cy, t, s=1.0, col=GOLD):
    d = ImageDraw.Draw(c)
    a = 0.08 * math.sin(t * 1.3)
    d.line((cx, cy, cx, cy + 520 * s), fill=col, width=int(10 * s))
    d.polygon([(cx - 120 * s, cy + 560 * s), (cx + 120 * s, cy + 560 * s), (cx + 60 * s, cy + 515 * s), (cx - 60 * s, cy + 515 * s)], fill=col)
    d.ellipse((cx - 20 * s, cy - 20 * s, cx + 20 * s, cy + 20 * s), fill=col)
    L = 300 * s
    lx, ly = cx - L * math.cos(a), cy - L * math.sin(a)
    rx, ry = cx + L * math.cos(a), cy + L * math.sin(a)
    d.line((lx, ly, rx, ry), fill=col, width=int(12 * s))
    for px, py in ((lx, ly), (rx, ry)):
        d.line((px, py, px - 90 * s, py + 230 * s), fill=col, width=int(3 * s))
        d.line((px, py, px + 90 * s, py + 230 * s), fill=col, width=int(3 * s))
        d.chord((px - 110 * s, py + 170 * s, px + 110 * s, py + 290 * s), 0, 180, fill=col)


def fmt_int(v):
    return "{:,}".format(int(v)).replace(",", " ")


def char_paste(c, im, y=640, x=None, scale=1.0):
    if scale != 1.0:
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.BILINEAR)
    x = (W - im.width) // 2 if x is None else x
    safe_paste(c, im, x, y)


# ============================================================ PART 1 SCENES
def s_hook(c, t, seg):
    sky, (fx, fy) = skyline()
    s = lerp(1.0, 1.55, ease_in_out(t / seg.dur))
    bg = zoom(sky, s * 1.0, fx / sky.width, fy / sky.height)
    c.alpha_composite(bg.convert("RGBA") if bg.mode != "RGBA" else bg)
    # the lit window pulse
    k = s * W / (sky.width / 1.0)
    dust(c, t, alpha=0.6)
    n = int(max(0, (t - 0.15) / 0.06))
    full = "JANVIER 2008"
    text(c, full[:n], W / 2, 440, FONT_SERIF, 104, GOLD_L, tracking=14, glow=14)
    a = appear(t, 1.0)
    d = ImageDraw.Draw(c)
    lw = 360 * a
    d.line((W / 2 - lw, 530, W / 2 + lw, 530), fill=GOLD + (200,), width=3)
    text(c, "LA DÉFENSE · PARIS", W / 2, 580, FONT_MONO, 32, CREAM, tracking=8, alpha=a)
    return dict(shake=impact(t, 0.05, 10))


def s_fifty(c, t, seg):
    c.alpha_composite(monitor_wall("red", 10))
    c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 150)))
    t1 = WT(seg, "milliards")
    v = 50e9 * ease_out((t - 0.1) / max(0.3, t1 - 0.1 + 0.3))
    text(c, "EXPOSITION CACHÉE", W / 2, 640, FONT_MONO, 36, RED, tracking=10, alpha=appear(t, 0.05))
    s_ = fmt_int(v) + " €"
    sz = fit_size("50 000 000 000 €", FONT_MONO, 100, 980)
    text(c, s_, W / 2, 800, FONT_MONO, sz, GOLD_L, glow=22, scale=1 + 0.06 * math.exp(-max(0, t - t1 - 0.3) * 6) * (t > t1 + 0.3))
    tp = WT(seg, "plus")
    a = appear(t, tp)
    text(c, "PLUS QUE LA VALEUR EN BOURSE", W / 2, 960 + 30 * (1 - a), FONT_XB, 50, CREAM, alpha=a)
    text(c, "DE TOUTE SA BANQUE", W / 2, 1030 + 30 * (1 - a), FONT_XB, 50, CREAM, alpha=a)
    return dict(shake=impact(t, t1 + 0.3, 16), chroma=3 if abs(t - t1 - 0.3) < 0.12 else 0)


def s_reveal(c, t, seg):
    c.alpha_composite(monitor_wall("mix", 14))
    c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 175)))
    c.alpha_composite(radial(W, H, W // 2, 1100, 700, (140, 60, 20), 2.0))
    ch = CHAR.render(key=(255, 175, 120), k=1.0, rimL=GOLD, rimR=(170, 30, 25))
    sc = lerp(1.0, 1.06, t / seg.dur)
    char_paste(c, ch, y=int(660 - 40 * (sc - 1) * 10), scale=sc)
    dust(c, t, alpha=0.5)
    tj = WT(seg, "jérôme")
    a1, s1 = slam(t, tj)
    text(c, "JÉRÔME", W / 2, 360, FONT_SERIF, 120, GOLD_L, tracking=22, glow=16, alpha=a1, scale=s1)
    a2, s2 = slam(t, tj + 0.3)
    text(c, "KERVIEL", W / 2, 490, FONT_SERIF, 150, GOLD_L, tracking=22, glow=20, alpha=a2, scale=s2)
    text(c, "31 ANS · TRADER", W / 2, 600, FONT_MONO, 34, CREAM, tracking=10, alpha=appear(t, tj + 0.8))
    return dict(shake=impact(t, tj + 0.3, 14), flash=(GOLD_L, 0.35 * math.exp(-max(0, t - tj - 0.3) * 8) if t > tj + 0.3 else 0))


def s_forge(c, t, seg):
    c.alpha_composite(vgrad((4, 3, 3), (20, 8, 4)))
    tf = WT(seg, "forgeron")
    hits = [0.25, tf, tf + 0.55]
    glow_k = sum(math.exp(-max(0, t - h) * 3) for h in hits if t >= h)
    put(c, radial(W, H, W // 2, 1150, 650, (255, 110, 30), 1.6), W / 2, H / 2, clamp(0.35 + 0.65 * glow_k))
    anvil(c, W / 2, 1180, 1.25, col=(14, 10, 10), edge=(255, 170, 80))
    sparks(c, t, hits, (W / 2, 1080))
    text(c, "BRETAGNE", W / 2, 400, FONT_SERIF, 120, CREAM, tracking=24, glow=10, glow_alpha=0.4, alpha=appear(t, 0.2))
    text(c, "1977", W / 2, 510, FONT_MONO, 46, GOLD, tracking=14, alpha=appear(t, 0.5))
    a = appear(t, tf)
    text(c, "PÈRE FORGERON", W / 2, 650, FONT_XB, 50, GOLD_L, alpha=a)
    a = appear(t, WT(seg, "coiffeuse"))
    text(c, "MÈRE COIFFEUSE", W / 2, 720, FONT_XB, 50, GOLD_L, alpha=a)
    return dict(shake=sum(impact(t, h, 9) for h in hits))


def s_ambition(c, t, seg):
    c.alpha_composite(vgrad((4, 4, 6), (18, 13, 6)))
    light_beams(c, t, W / 2, H + 100, GOLD, 9, 26 + int(30 * appear(t, WT(seg, "réussir"))))
    dust(c, t, alpha=0.6)
    tg = WT(seg, "grande")
    text(c, "PAS DE GRANDE ÉCOLE", W / 2, 560, FONT_BLACK, 72, CREAM, alpha=appear(t, 0.0))
    p = ease_out((t - tg - 0.3) / 0.3)
    if p > 0:
        d = ImageDraw.Draw(c)
        w_ = text_width("PAS DE GRANDE ÉCOLE", FONT_BLACK, 72) / 2 + 20
        d.line((W / 2 - w_, 570, W / 2 - w_ + 2 * w_ * p, 556), fill=RED, width=12)
    to = WT(seg, "obsession")
    text(c, "UNE SEULE OBSESSION", W / 2, 760, FONT_MONO, 40, GOLD, tracking=10, alpha=appear(t, to))
    tr = WT(seg, "réussir")
    a, s = slam(t, tr, 0.3, 2.2)
    text(c, "RÉUSSIR", W / 2, 920, FONT_SERIF, 200, GOLD_L, tracking=10, glow=26, alpha=a, scale=s)
    return dict(shake=impact(t, tr + 0.2, 22), flash=(GOLD_L, 0.3 * math.exp(-max(0, t - tr - 0.2) * 7) if t > tr + 0.2 else 0))


@functools.lru_cache(maxsize=None)
def tower_layer():
    w, h = 1080, 3000
    im = vgrad((10, 12, 24), (26, 18, 14), w, h).copy()
    d = ImageDraw.Draw(im)
    # perspective tower: wide bottom, narrow top
    bl, br, tl, tr_ = 40, 1040, 300, 780
    top = 300
    d.polygon([(bl, h), (br, h), (tr_, top), (tl, top)], fill=(8, 9, 14))
    rows = 70
    for i in range(rows):
        f = i / rows
        y = lerp(h, top, f ** 0.8)
        xl, xr = lerp(bl, tl, (h - y) / (h - top)), lerp(br, tr_, (h - y) / (h - top))
        d.line((xl, y, xr, y), fill=(40, 40, 52), width=2)
    for j in range(1, 12):
        f = j / 12
        d.line((lerp(bl, br, f), h, lerp(tl, tr_, f), top), fill=(34, 34, 44), width=2)
    d.line((bl, h, tl, top), fill=GOLD, width=5)
    d.line((br, h, tr_, top), fill=(120, 90, 50), width=3)
    d.line((tl, top, tr_, top), fill=GOLD, width=5)
    r = R(4)
    for _ in range(160):
        f = r.random() ** 0.8
        y = lerp(h, top, f)
        xl, xr = lerp(bl, tl, (h - y) / (h - top)), lerp(br, tr_, (h - y) / (h - top))
        x = r.uniform(xl + 10, xr - 30)
        d.rectangle((x, y, x + 14 * (1 - f * 0.6), y + 10 * (1 - f * 0.6)), fill=(255, 200, 120, r.randint(60, 200)))
    return im


def s_tower(c, t, seg):
    tl = tower_layer()
    p = ease_in_out(t / seg.dur)
    y0 = int(lerp(tl.height - H, 0, p * 0.75))
    c.alpha_composite(tl.crop((0, y0, W, y0 + H)))
    c.alpha_composite(vgrad((0, 0, 0), (0, 0, 0)).point(lambda v: v) if False else Image.new("RGBA", (W, H), (0, 0, 0, 60)))
    a = appear(t, 0.1)
    text(c, "2000", W / 2, 360, FONT_SERIF, 130, GOLD_L, tracking=12, glow=14, alpha=a)
    text(c, "SOCIÉTÉ GÉNÉRALE", W / 2, 490, FONT_BLACK, 76, CREAM, tracking=4, alpha=appear(t, WT(seg, "société")), stroke=3)
    tm = WT(seg, "middle")
    boxed(c, "MIDDLE OFFICE", W / 2, 620, 48, alpha=appear(t, tm, 0.2))
    text(c, "ceux qui contrôlent les traders", W / 2, 710, FONT_SERIF_I, 46, CREAM, alpha=appear(t, WT(seg, "contrôle")))
    return dict(shake=impact(t, tm, 8))


def s_scan(c, t, seg):
    c.alpha_composite(vgrad((4, 6, 8), (2, 3, 4)))
    rows = trade_rows(3)
    tf, ta = WT(seg, "failles"), WT(seg, "angles")
    hl = {6, 13, 19} if t > tf else None
    draw_rows(c, rows, 300, t * 40, hl=hl)
    # dead angles: black blocks
    if t > ta:
        d = ImageDraw.Draw(c)
        p = ease_out((t - ta) / 0.25)
        for yy in (300 + 3 * 44 - (t * 40) % 44, 300 + 10 * 44 - (t * 40) % 44, 300 + 16 * 44 - (t * 40) % 44):
            d.rectangle((70, yy - 8, 70 + 940 * p, yy + 40), fill=(0, 0, 0, 245))
    # scanning beam
    sy = 300 + ((t * 520) % 1250)
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(ov).rectangle((0, sy - 3, W, sy + 3), fill=GOLD + (230,))
    c.alpha_composite(glow_layer(ov, 30, 2.0)); c.alpha_composite(ov)
    labels = [("CONTRÔLES", WT(seg, "contrôles"), GREEN), ("FAILLES", tf, RED), ("ANGLES MORTS", ta, GOLD_L)]
    shake = 0
    for i, (s, tt, col) in enumerate(labels):
        a, sc = slam(t, tt, 0.22, 1.6)
        boxed(c, s, W / 2, 1000 + i * 0 if False else W / 2, 0, alpha=0) if False else None
        if a > 0:
            y = 1010 + i * 105
            boxed(c, s, W / 2, y, 64, fg=NOIR, bg=col, path=FONT_BLACK, alpha=a)
        shake += impact(t, tt, 8)
    return dict(shake=shake)


def s_desk(c, t, seg):
    wall = monitor_wall("mix", 0)
    c.alpha_composite(zoom(wall, lerp(1.08, 1.0, t / seg.dur)))
    c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 110)))
    ch = CHAR.render(key=(150, 255, 200), k=0.85, rimL=(120, 255, 180), rimR=(255, 80, 60), eye=(180, 255, 210))
    char_paste(c, ch, y=740)
    ticker(c, t, 300, ["EURO STOXX 50 ▲", "DAX ▲", "CAC 40 ▲", "FTSE 100 ▲", "FUTURES ▲"], speed=160, size=30)
    text(c, "2005", W / 2, 440, FONT_SERIF, 120, GOLD_L, tracking=12, glow=12, alpha=appear(t, 0.1))
    boxed(c, "DESK DELTA ONE", W / 2, 560, 46, alpha=appear(t, WT(seg, "delta"), 0.2))
    text(c, "« COUVERTS »", W / 2, 660, FONT_SERIF_I, 58, CREAM, alpha=appear(t, WT(seg, "couverts")), glow=8)
    return dict(shake=impact(t, WT(seg, "delta"), 8))


def s_fake(c, t, seg):
    c.alpha_composite(vgrad((6, 4, 4), (2, 2, 3)))
    rows = trade_rows(9)
    draw_rows(c, rows, 280, t * 160, color=(120, 125, 120), size=30, alpha=200)
    c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 90)))
    te = WT(seg, "énormes")
    # growing position bar
    p = ease_out((t - te + 0.2) / 1.2)
    if p > 0:
        d = ImageDraw.Draw(c)
        d.rectangle((90, 400, 90 + 900 * p, 470), fill=GOLD)
        text(c, "POSITIONS", 100, 360, FONT_MONO, 34, GOLD_L, anchor="l", tracking=6)
    tf = WT(seg, "fictives")
    sh = 0
    for i, (dx, dy, ang) in enumerate([(-170, 720, -12), (190, 880, 8), (-40, 1050, -5)]):
        sh += stamp(c, "FICTIF", W / 2 + dx, dy, t, tf - 0.35 + i * 0.28, 96, RED, ang)
    return dict(shake=sh + impact(t, te, 6))


def s_alerts(c, t, seg):
    c.alpha_composite(vgrad((10, 3, 3), (2, 2, 3)))
    d = ImageDraw.Draw(c)
    te = WT(seg, "explication")
    n = 24
    shake = 0
    for i in range(n):
        gx, gy = i % 4, i // 4
        x, y = 190 + gx * 233, 360 + gy * 150
        ta = 0.05 + i * 0.075
        if t < ta:
            continue
        silenced = t > te + i * 0.03
        pulse = 0.6 + 0.4 * math.sin((t - ta) * 14)
        col = (80, 80, 84) if silenced else RED
        al = 255 if not silenced else 140
        tri_alert(d, x, y, 46, col, int(al * (pulse if not silenced else 1)))
        if silenced:
            d.line((x - 30, y + 2, x - 8, y + 26, x + 36, y - 26), fill=GOLD_L, width=10, joint="curve")
    a = appear(t, 0.0)
    text(c, "ALERTE", W / 2, 260 + 0, FONT_MONO, 44, RED if (t * 3) % 1 < 0.6 or t > te else (60, 10, 10), tracking=16, alpha=a)
    a, s = slam(t, te, 0.3, 1.5)
    if a > 0:
        d.rectangle((0, 1170, W, 1290), fill=(0, 0, 0, 200))
    text(c, "« J'AI UNE EXPLICATION »", W / 2, 1230, FONT_SERIF_I, 64, GOLD_L, alpha=a, scale=s, glow=10)
    return dict(shake=impact(t, te, 10), chroma=2 if t < te and (t * 6) % 1 < 0.15 else 0)


def s_gain(c, t, seg):
    c.alpha_composite(vgrad((6, 6, 8), (14, 10, 4)))
    dust(c, t, alpha=0.5)
    tm = WT(seg, "milliard")
    tc = WT(seg, "cent")
    d = ImageDraw.Draw(c)
    # left bar (hidden gain)
    p = ease_out((t - 0.2) / max(0.4, tm - 0.2))
    base = 1180
    hb = 700 * p
    d.rectangle((150, base - hb, 470, base), fill=GOLD)
    c.alpha_composite(glow_layer(_bar(150, base - hb, 470, base), 30, 1.2)) if hb > 2 else None
    text(c, "GAIN CACHÉ", 310, base + 50, FONT_MONO, 34, GOLD_L, tracking=4)
    v = 1.5 * p
    text(c, ("≈ %.1f Md€" % v).replace(".", ","), 310, base - hb - 60, FONT_BLACK, 66, GOLD_L, glow=10, alpha=appear(t, 0.2))
    # right bar (salary)
    a = appear(t, tc)
    d.rectangle((610, base - 3, 930, base), fill=(180, 180, 180, int(255 * a)))
    text(c, "SON SALAIRE", 770, base + 50, FONT_MONO, 34, GREY, tracking=4, alpha=a)
    text(c, "< 100 000 €/an", 770, base - 70, FONT_BLACK, 50, CREAM, alpha=a)
    text(c, "FIN 2007", W / 2, 330, FONT_SERIF, 100, GOLD_L, tracking=10, alpha=appear(t, 0.0), glow=10)
    return dict(shake=impact(t, tm, 10) + impact(t, tc, 6))


def _bar(x0, y0, x1, y1):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(ov).rectangle((x0, y0, x1, y1), fill=GOLD + (255,))
    return ov


BET_DATA = candles(42, 46, drift=1.0, vol=1.1)
DROP_DATA = candles(77, 26, drift=-3.4, vol=1.8, start=BET_DATA[-1][3])


def _chart(c, t, data, upto, rect, lo, hi, mono=None, glow_col=GOLD):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    x, y = draw_candles(d, rect, data, upto, up=GREEN, down=RED, lo=lo, hi=hi, mono=mono)
    c.alpha_composite(glow_layer(ov, 20, 1.3)); c.alpha_composite(ov)
    return x, y


def _grid(c):
    d = ImageDraw.Draw(c)
    for y in range(300, 1300, 100):
        d.line((60, y, W - 60, y), fill=(255, 255, 255, 18), width=1)
    for x in range(60, W, 120):
        d.line((x, 300, x, 1300), fill=(255, 255, 255, 12), width=1)


def s_bet(c, t, seg):
    c.alpha_composite(vgrad((4, 8, 6), (2, 3, 3)))
    _grid(c)
    allv = BET_DATA + DROP_DATA
    lo, hi = min(x[2] for x in allv), max(x[1] for x in allv)
    up = ease_in_out(t / seg.dur)
    x, y = _chart(c, t, BET_DATA, up, (60, 520, W - 260, 1250), lo, hi, mono=None)
    tc = WT(seg, "cinquante")
    a, s = slam(t, tc, 0.3, 2.0)
    text(c, "50 Md€", W / 2, 360, FONT_BLACK, 170, GOLD_L, glow=24, alpha=a, scale=s)
    text(c, "PARI : LES MARCHÉS VONT MONTER", W / 2, 480, FONT_MONO, 36, GREEN, tracking=4, alpha=appear(t, WT(seg, "hausse")))
    d = ImageDraw.Draw(c)
    d.ellipse((x - 12, y - 12, x + 12, y + 12), fill=GOLD_L)
    return dict(shake=impact(t, tc, 14))


def s_drop(c, t, seg):
    c.alpha_composite(vgrad((10, 2, 2), (2, 2, 3)))
    _grid(c)
    allv = BET_DATA + DROP_DATA
    lo, hi = min(x[2] for x in allv), max(x[1] for x in allv)
    p = ease_in_out(t / (seg.dur * 0.9))
    data = BET_DATA + DROP_DATA
    upto = (len(BET_DATA) + len(DROP_DATA) * p) / len(data)
    x, y = _chart(c, t, data, upto, (60, 520 - 0, W - 60 - 200 + 200 * 0, 1250), lo, hi)
    red = 0.25 + 0.2 * math.sin(t * 12)
    c.alpha_composite(radial(W, H, W // 2, H // 2, 1300, (200, 0, 0), 0.8).point(lambda v: v) if False else Image.new("RGBA", (W, H), (120, 0, 0, int(60 * red))))
    a, s = slam(t, 0.15, 0.25, 1.8)
    text(c, "▼", W / 2, 360, FONT_BLACK, 170, RED, glow=20, alpha=a, scale=s)
    text(c, "LES MARCHÉS CHUTENT", W / 2, 480, FONT_BLACK, 70, RED, alpha=a, glow=10)
    return dict(shake=impact(t, 0.2, 26, 4), chroma=6 * math.exp(-t * 3))


def s_ghost(c, t, seg):
    c.alpha_composite(vgrad((5, 5, 8), (2, 2, 3)))
    text(c, "VENDREDI 18 JANVIER 2008", W / 2, 340, FONT_MONO, 42, GOLD, tracking=6, alpha=appear(t, 0.0))
    # ticket
    d = ImageDraw.Draw(c)
    cx, cy = W / 2, 820
    tk = Image.new("RGBA", (860, 640), (0, 0, 0, 0))
    dt = ImageDraw.Draw(tk)
    dt.rectangle((0, 0, 859, 639), fill=(236, 228, 212, 255))
    dt.rectangle((0, 0, 859, 90), fill=(30, 28, 26, 255))
    dt.text((40, 22), "TICKET D'OPÉRATION", font=F(FONT_MONO, 40), fill=CREAM)
    lines = [("RÉF.", "DLT1-0118-447"), ("PRODUIT", "FUT. INDICES EUR"), ("SENS", "ACHAT"), ("STATUT", "EN ATTENTE")]
    for i, (k_, v) in enumerate(lines):
        dt.text((40, 130 + i * 70), k_, font=F(FONT_MONO, 34), fill=(110, 100, 90))
        dt.text((330, 130 + i * 70), v, font=F(FONT_MONO, 34), fill=(30, 28, 26))
    dt.text((40, 130 + 4 * 70 + 30), "CONTREPARTIE", font=F(FONT_MONO, 34), fill=(110, 100, 90))
    tn = WT(seg, "n'existe", WT(seg, "existe"))
    if t < tn:
        if (t * 2.5) % 1 < 0.6:
            dt.rectangle((330, 130 + 4 * 70 + 26, 380, 130 + 4 * 70 + 76), fill=(30, 28, 26))
        dt.text((400, 130 + 4 * 70 + 30), "???", font=F(FONT_MONO, 34), fill=(30, 28, 26))
    tk = tk.rotate(-3, expand=True, resample=Image.BICUBIC)
    sh = impact(t, tn, 18)
    put(c, tk, cx + (R(int(t * 30)).uniform(-14, 14) if tn - 0.25 < t < tn + 0.1 else 0), cy, appear(t, 0.1))
    s2 = stamp(c, "INEXISTANTE", W / 2, 1100, t, tn, 96, RED, -8)
    glitch = 9 if tn - 0.25 < t < tn + 0.15 else 0
    return dict(shake=sh + s2, chroma=glitch)


def s_bomb(c, t, seg):
    c.alpha_composite(vgrad((2, 1, 1), (8, 1, 1)))
    beat = (t * 72 / 60) % 1
    hb = math.exp(-beat * 9) + 0.6 * math.exp(-max(0, beat - 0.18) * 9) * (beat > 0.18)
    c.alpha_composite(Image.new("RGBA", (W, H), (140, 0, 0, int(55 * hb))))
    ch = CHAR.render(key=(40, 10, 10), k=0.4, rimL=(255, 40, 30), rimR=(255, 40, 30), eye=(255, 60, 40), ambient=0.08)
    tb = WT(seg, "bombe")
    ts = WT(seg, "suite")
    a_char = 1.0 if t < ts - 0.2 else max(0, 1 - (t - ts + 0.2) / 0.4)
    if a_char > 0:
        tmp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        char_paste(tmp, ch, y=720, scale=1.0 + 0.012 * hb)
        if a_char < 1:
            tmp.putalpha(tmp.getchannel("A").point(lambda v: int(v * a_char)))
        c.alpha_composite(tmp)
    a, s = slam(t, tb, 0.25, 1.8)
    text(c, "DÉCOUVERT.", W / 2, 400, FONT_BLACK, 120, RED, glow=22, alpha=a * a_char, scale=s)
    a2, s2 = slam(t, ts, 0.35, 1.6)
    text(c, "À SUIVRE", W / 2, 760, FONT_SERIF, 110, GOLD_L, tracking=20, glow=16, alpha=a2, scale=s2)
    a3, s3 = slam(t, ts + 0.5, 0.3, 2.0)
    text(c, "PARTIE 2", W / 2, 920, FONT_BLACK, 170, CREAM, glow=10, alpha=a3, scale=s3)
    text(c, "→ sur le profil", W / 2, 1060, FONT_SERIF_I, 52, GOLD, alpha=appear(t, ts + 1.0))
    return dict(shake=impact(t, tb, 22) + impact(t, ts + 0.5, 16),
                flash=(RED, 0.4 * math.exp(-max(0, t - tb) * 6) if t > tb else 0))


# ============================================================ PART 2 SCENES
def s_p2title(c, t, seg):
    c.alpha_composite(vgrad((6, 5, 4), (2, 2, 3)))
    light_beams(c, t, W / 2, -100, GOLD, 5, 22)
    dust(c, t, alpha=0.6)
    a, s = slam(t, 0.05, 0.3, 2.0)
    text(c, "PARTIE 2", W / 2, 640, FONT_BLACK, 180, GOLD_L, glow=24, alpha=a, scale=s)
    text(c, "L'AFFAIRE KERVIEL", W / 2, 780, FONT_SERIF, 68, CREAM, tracking=14, alpha=appear(t, 0.4))
    tw = WT(seg, "week")
    n = int(max(0, (t - tw) / 0.05))
    text(c, "WEEK-END DU 19 JANVIER 2008"[:n], W / 2, 920, FONT_MONO, 38, GOLD, tracking=4)
    return dict(shake=impact(t, 0.1, 18))


def s_interro(c, t, seg):
    c.alpha_composite(vgrad((3, 3, 4), (1, 1, 2)))
    ang = 0.07 * math.sin(t * 1.4)
    lx, ly = W / 2 + 520 * math.sin(ang), 560
    ov = Image.new("RGBA", (W // 2, H // 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    d.polygon([(lx / 2 - 30, ly / 2), (lx / 2 + 30, ly / 2), (lx / 2 + 360 + ang * 900, H / 2), (lx / 2 - 360 + ang * 900, H / 2)],
              fill=(255, 220, 160, 46))
    ov = ov.filter(ImageFilter.GaussianBlur(18)).resize((W, H), Image.BILINEAR)
    c.alpha_composite(ov)
    flick = 0.92 + 0.08 * math.sin(t * 37) * math.sin(t * 11)
    ch = CHAR.render(light="above", key=(255, 214, 160), k=round(1.1 * flick, 2), rimL=None, rimR=None,
                     rimT=(255, 210, 150), eye=(255, 220, 170), ambient=0.12)
    char_paste(c, ch, y=740)
    d = ImageDraw.Draw(c)
    d.line((W / 2, 0, lx, ly - 40), fill=(30, 30, 30), width=6)
    d.chord((lx - 110, ly - 80, lx + 110, ly + 60), 180, 360, fill=(26, 24, 22))
    d.ellipse((lx - 40, ly - 14, lx + 40, ly + 14), fill=(255, 236, 190))
    c.alpha_composite(radial(W, H, int(lx), ly, 220, (255, 220, 160), 2.0))
    tc = WT(seg, "cinquante")
    a, s = slam(t, tc, 0.3, 1.6)
    text(c, "50 000 000 000 €", W / 2, 330, FONT_MONO, 78, RED, glow=16, alpha=a, scale=s)
    text(c, "INTERROGÉ PENDANT DES HEURES", W / 2, 330, FONT_MONO, 34, CREAM, tracking=4, alpha=appear(t, 0.2) * (1 - appear(t, tc - 0.2)))
    return dict(shake=impact(t, tc, 10))


def s_sell(c, t, seg):
    c.alpha_composite(vgrad((4, 4, 6), (2, 2, 3)))
    d = ImageDraw.Draw(c)
    cx, cy, r = W / 2, 520, 210
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=GOLD, width=8)
    for i in range(12):
        a = i / 12 * 2 * math.pi
        d.line((cx + (r - 34) * math.sin(a), cy - (r - 34) * math.cos(a), cx + (r - 12) * math.sin(a), cy - (r - 12) * math.cos(a)), fill=GOLD, width=6)
    sec = math.floor(t * 4) / 4 * 2 * math.pi * 1.5
    d.line((cx, cy, cx + (r - 30) * math.sin(sec), cy - (r - 30) * math.cos(sec)), fill=RED, width=6)
    d.line((cx, cy, cx + 110 * math.sin(t * 0.4), cy - 110 * math.cos(t * 0.4)), fill=CREAM, width=10)
    d.ellipse((cx - 14, cy - 14, cx + 14, cy + 14), fill=RED)
    sh = 0
    for i, (k_, s_, col) in enumerate([("vendre", "VENDRE.", CREAM), ("vite", "VITE.", GOLD_L), ("secret", "EN SECRET.", RED)]):
        tt = WT(seg, k_)
        a, sc = slam(t, tt, 0.2, 2.0)
        text(c, s_, W / 2, 900 + i * 135, FONT_BLACK, 130, col, alpha=a, scale=sc, glow=8 if col != CREAM else 0)
        sh += impact(t, tt, 14)
    return dict(shake=sh)


KRACH = candles(13, 60, drift=-2.2, vol=2.2)


def s_krach(c, t, seg):
    c.alpha_composite(vgrad((16, 2, 2), (3, 1, 1)))
    _grid(c)
    p = ease_out(t / (seg.dur * 0.75))
    lo, hi = min(x[2] for x in KRACH), max(x[1] for x in KRACH)
    _chart(c, t, KRACH, p, (60, 620, W - 60, 1260), lo, hi)
    text(c, "LUNDI 21 JANVIER 2008", W / 2, 300, FONT_MONO, 40, GOLD, tracking=6, alpha=appear(t, 0.0))
    tp = WT(seg, "plongent")
    a, s = slam(t, tp, 0.25, 1.8)
    blink = 1 if (t * 3) % 1 < 0.7 else 0.4
    text(c, "CAC 40  ▼ −6,83 %", W / 2, 420, FONT_MONO, 64, RED, glow=12, alpha=a * blink, scale=s)
    a2, s2 = slam(t, tp + 0.35, 0.25, 1.8)
    text(c, "DAX  ▼ −7,16 %", W / 2, 510, FONT_MONO, 64, RED, glow=12, alpha=a2 * blink, scale=s2)
    tt = WT(seg, "trois")
    boxed(c, "3 JOURS POUR TOUT SOLDER", W / 2, 1150, 44, fg=NOIR, bg=GOLD, alpha=appear(t, tt, 0.2))
    return dict(shake=impact(t, tp, 22, 5) + 2.5, chroma=3 if t > tp else 0)


def s_loss(c, t, seg):
    c.alpha_composite(vgrad((3, 1, 1), (12, 2, 2)))
    text(c, "24 JANVIER 2008", W / 2, 330, FONT_MONO, 42, GOLD, tracking=6, alpha=appear(t, 0.0))
    tq = WT(seg, "quatre")
    tp = WT(seg, "perte")
    p = ease_out((t - tq) / max(0.5, tp - tq + 0.2))
    v = 4.9e9 * p
    if t >= tq:
        sz = fit_size("−4 900 000 000 €", FONT_MONO, 104, 1000)
        text(c, "−" + fmt_int(v) + " €", W / 2, 760, FONT_MONO, sz, RED, glow=26)
    a, s = slam(t, tp + 0.1, 0.3, 1.8)
    text(c, "PERTE HISTORIQUE", W / 2, 900, FONT_BLACK, 84, CREAM, alpha=a, scale=s)
    return dict(shake=impact(t, tp + 0.1, 20), flash=(RED, 0.3 * math.exp(-max(0, t - tp - 0.1) * 6) if t > tp + 0.1 else 0))


HEADLINES = [("FRAUDE HISTORIQUE", -7, (-120, 560)), ("ROGUE TRADER", 6, (140, 820)),
             ("4,9 MILLIARDS ENVOLÉS", -4, (-60, 1080)), ("QUI EST JÉRÔME KERVIEL ?", 3, (40, 760))]


@functools.lru_cache(maxsize=None)
def news_card(s, ang):
    w, h = 900, 300
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w - 1, h - 1), fill=(238, 232, 218, 255))
    d.rectangle((30, 30, w - 30, 40), fill=(20, 20, 20, 255))
    d.text((30, 52), "ÉDITION SPÉCIALE · JANVIER 2008", font=F(FONT_MONO, 24), fill=(80, 70, 60))
    sz = fit_size(s, FONT_SERIF, 92, w - 60)
    d.text((30, 110), s, font=F(FONT_SERIF, sz), fill=(16, 14, 12))
    for i in range(4):
        d.rectangle((30, 230 + i * 14, 30 + R(i).randint(300, 820), 236 + i * 14), fill=(150, 140, 130))
    return im.rotate(ang, expand=True, resample=Image.BICUBIC)


def s_news(c, t, seg):
    c.alpha_composite(vgrad((10, 9, 8), (3, 3, 3)))
    dust(c, t, color=CREAM, alpha=0.3)
    sh = 0
    for i, (s, ang, (dx, y)) in enumerate(HEADLINES):
        t0 = 0.05 + i * 0.4
        if t < t0:
            continue
        p = ease_out((t - t0) / 0.22)
        put(c, news_card(s, ang), W / 2 + dx * 0.4, y, min(1, p * 2), lerp(1.9, 1.0, p))
        sh += impact(t, t0 + 0.2, 10)
    return dict(shake=sh)


def s_versions(c, t, seg):
    left = vgrad((30, 22, 8), (6, 5, 3))
    right = vgrad((34, 6, 6), (6, 2, 2))
    c.alpha_composite(left)
    c.alpha_composite(right.crop((W // 2, 0, W, H)), (W // 2, 0))
    tl = WT(seg, "lui")
    ch = CHAR.render(key=(255, 255, 255), k=0.9, rimL=GOLD, rimR=RED, split=(GOLD_L, (255, 90, 70)), eye=(255, 230, 200))
    char_paste(c, ch, y=760)
    d = ImageDraw.Draw(c)
    d.line((W / 2, 280, W / 2, 1300), fill=(255, 255, 255, 60), width=2)
    a = appear(t, 0.0)
    text(c, "LA BANQUE", W / 4, 330, FONT_BLACK, 62, GOLD_L, alpha=a)
    text(c, "« Il a agi seul »", W / 4, 420, FONT_SERIF_I, 50, CREAM, alpha=appear(t, WT(seg, "seul")))
    a = appear(t, tl)
    text(c, "LUI", 3 * W / 4, 330, FONT_BLACK, 62, (255, 90, 70), alpha=a)
    text(c, "« Ils fermaient", 3 * W / 4, 420, FONT_SERIF_I, 50, CREAM, alpha=appear(t, WT(seg, "fermait")))
    text(c, "les yeux »", 3 * W / 4, 485, FONT_SERIF_I, 50, CREAM, alpha=appear(t, WT(seg, "fermait")))
    return dict(shake=impact(t, tl, 8))


@functools.lru_cache(maxsize=None)
def court_bg():
    im = vgrad((8, 8, 10), (2, 2, 3)).copy()
    d = ImageDraw.Draw(im)
    for i in range(6):
        x = 80 + i * 190
        d.rectangle((x, 700, x + 80, 1700), fill=(20, 20, 24))
        d.rectangle((x - 12, 680, x + 92, 710), fill=(26, 26, 30))
        d.rectangle((x - 12, 1690, x + 92, 1720), fill=(26, 26, 30))
    d.polygon([(40, 680), (W / 2, 520), (W - 40, 680)], fill=(22, 22, 26))
    return im.filter(ImageFilter.GaussianBlur(3))


def s_trial(c, t, seg):
    c.alpha_composite(court_bg())
    c.alpha_composite(radial(W, H, W // 2, 700, 700, (200, 150, 60), 2.2))
    scales(c, W / 2, 470, t, 0.95)
    text(c, "OCTOBRE 2010", W / 2, 330, FONT_MONO, 42, GOLD, tracking=6, alpha=appear(t, 0.0))
    tc = WT(seg, "coupable")
    s1 = stamp(c, "COUPABLE", W / 2, 900, t, tc, 120, RED, -6)
    t5 = WT(seg, "cinq")
    t3 = WT(seg, "trois")
    a, s = slam(t, t5, 0.25, 1.6)
    text(c, "5 ANS DE PRISON", W / 2, 1100, FONT_BLACK, 80, CREAM, alpha=a, scale=s)
    a, s = slam(t, t3, 0.25, 1.6)
    text(c, "DONT 3 FERME", W / 2, 1200, FONT_BLACK, 64, GOLD_L, alpha=a, scale=s, glow=10)
    return dict(shake=s1 + impact(t, t5, 8) + impact(t, t3, 8),
                flash=((255, 255, 255), 0.35 * math.exp(-max(0, t - tc - 0.1) * 8) if t > tc + 0.1 else 0))


def s_debt(c, t, seg):
    c.alpha_composite(vgrad((6, 3, 3), (2, 2, 2)))
    dust(c, t, color=RED, alpha=0.3)
    tq = WT(seg, "quatre")
    p = ease_out((t - tq) / 1.2)
    sz = fit_size("4 900 000 000 €", FONT_MONO, 110, 1000)
    text(c, "À REMBOURSER", W / 2, 520, FONT_MONO, 40, RED, tracking=10, alpha=appear(t, 0.1))
    text(c, fmt_int(4.9e9 * p) + " €", W / 2, 640, FONT_MONO, sz, RED, glow=22, alpha=appear(t, 0.0))
    tc = WT(seg, "cinquante")
    a, s = slam(t, tc, 0.3, 2.0)
    text(c, "= 49 000 ANS", W / 2, 860, FONT_BLACK, 150, GOLD_L, glow=24, alpha=a, scale=s)
    text(c, "DE SON SALAIRE", W / 2, 990, FONT_MONO, 48, CREAM, tracking=10, alpha=appear(t, tc + 0.4))
    return dict(shake=impact(t, tc, 18))


@functools.lru_cache(maxsize=None)
def sunset():
    im = vgrad((30, 12, 18), (255, 150, 60)).copy()
    sun = radial(W, H, W // 2, 1180, 520, (255, 210, 120), 1.3)
    im.alpha_composite(sun)
    d = ImageDraw.Draw(im)
    d.ellipse((W / 2 - 230, 950, W / 2 + 230, 1410), fill=(255, 214, 140))
    # hills
    pts = [(0, 1250)] + [(x, 1250 - 40 * math.sin(x / 140) - 30 * math.sin(x / 61)) for x in range(0, W + 20, 20)] + [(W, H), (0, H)]
    d.polygon(pts, fill=(60, 26, 22))
    d.rectangle((0, 1380, W, H), fill=(18, 8, 8))
    return im


def s_walk(c, t, seg):
    c.alpha_composite(sunset())
    d = ImageDraw.Draw(c)
    for i in range(30):
        x = (i * 80 - t * 260) % (W + 80) - 40
        d.line((x, 1395, x + 30, 1395), fill=(80, 40, 30), width=4)
    walker(c, W / 2 - 40, 1385, t, 0.95)
    text(c, "2014", W / 2, 330, FONT_SERIF, 120, (30, 12, 10), tracking=12, alpha=appear(t, 0.0))
    # route
    p = clamp(t / (WT(seg, "police") + 0.2))
    x0, x1, y = 170, 910, 470
    for i in range(0, 37):
        xx = lerp(x0, x1, i / 36)
        if i / 36 <= p:
            d.ellipse((xx - 5, y - 5, xx + 5, y + 5), fill=(30, 12, 10))
    d.ellipse((lerp(x0, x1, p) - 16, y - 16, lerp(x0, x1, p) + 16, y + 16), fill=RED)
    text(c, "ROME", x0, y + 50, FONT_MONO, 34, (30, 12, 10), tracking=4)
    text(c, "FRONTIÈRE", x1 - 20, y + 50, FONT_MONO, 34, (30, 12, 10), tracking=4)
    tm = WT(seg, "moins")
    tb = WT(seg, "bracelet")
    boxed(c, "< 4 MOIS DE PRISON", W / 2, 640, 46, fg=CREAM, bg=(30, 12, 10), alpha=appear(t, tm, 0.2))
    boxed(c, "BRACELET ÉLECTRONIQUE", W / 2, 730, 46, fg=(30, 12, 10), bg=CREAM, alpha=appear(t, tb, 0.2))
    return dict(shake=impact(t, tm, 6) + impact(t, tb, 6))


def s_twist(c, t, seg):
    c.alpha_composite(vgrad((6, 5, 3), (2, 2, 2)))
    tr = WT(seg, "ramène")
    tm = WT(seg, "million")
    tf = WT(seg, "failles")
    text(c, "2016", W / 2, 330, FONT_SERIF, 120, GOLD_L, tracking=12, glow=12, alpha=appear(t, 0.0))
    text(c, "COUR D'APPEL DE VERSAILLES", W / 2, 440, FONT_MONO, 38, CREAM, tracking=4, alpha=appear(t, WT(seg, "cour")))
    p = ease_in_out((t - tr) / max(0.4, tm - tr + 0.2))
    v = lerp(4.9e9, 1e6, p)
    col = mix(RED, GOLD_L, p)
    sz = fit_size("4 900 000 000 €", FONT_MONO, 110, 1000)
    text(c, fmt_int(v) + " €", W / 2, 720, FONT_MONO, sz, col, glow=22, alpha=1 - appear(t, tm, 0.25))
    if 0 < p < 1:
        d = ImageDraw.Draw(c)
        r = R(int(t * 30))
        for _ in range(10):
            y = r.randint(300, 1300)
            d.rectangle((0, y, W, y + r.randint(2, 8)), fill=(255, 255, 255, 40))
    a, s = slam(t, tm, 0.3, 1.8)
    text(c, "1 000 000 €", W / 2, 880, FONT_BLACK, 120, GOLD_L, glow=20, alpha=a, scale=s)
    boxed(c, "FAILLES DE CONTRÔLE DE LA BANQUE", W / 2, 1060, 38, fg=CREAM, bg=RED_D, alpha=appear(t, tf, 0.2))
    return dict(shake=impact(t, tm, 16), chroma=4 if 0 < p < 1 else 0)


def s_question(c, t, seg):
    left = vgrad((34, 24, 6), (4, 3, 2)); right = vgrad((40, 6, 6), (4, 2, 2))
    c.alpha_composite(left); c.alpha_composite(right.crop((W // 2, 0, W, H)), (W // 2, 0))
    beat = (t * 66 / 60) % 1
    hb = math.exp(-beat * 9)
    ch = CHAR.render(key=(255, 255, 255), k=1.0, rimL=GOLD, rimR=RED, split=(GOLD_L, (255, 80, 60)), eye=(255, 240, 210))
    char_paste(c, ch, y=640, scale=1.08 + 0.008 * hb)
    te = WT(seg, "escroc")
    tb = WT(seg, "bouc")
    a, s = slam(t, te, 0.25, 1.8)
    text(c, "ESCROC ?", W / 2, 360, FONT_BLACK, 120, GOLD_L, glow=18, alpha=a, scale=s, stroke=4)
    a, s = slam(t, tb, 0.25, 1.8)
    text(c, "BOUC ÉMISSAIRE ?", W / 2, 500, FONT_BLACK, 96, (255, 80, 60), glow=18, alpha=a, scale=s, stroke=4)
    return dict(shake=impact(t, te, 12) + impact(t, tb, 12))


def s_cta(c, t, seg):
    c.alpha_composite(vgrad((6, 5, 4), (2, 2, 3)))
    light_beams(c, t, W / 2, H + 100, GOLD, 7, 24)
    dust(c, t, alpha=0.6)
    a, s = slam(t, 0.05, 0.3, 1.6)
    text(c, "TON VERDICT ?", W / 2, 420, FONT_SERIF, 120, GOLD_L, glow=18, alpha=a, scale=s)
    boxed(c, "ESCROC", W / 2, 580, 56, fg=NOIR, bg=GOLD, path=FONT_BLACK, alpha=appear(t, 0.4))
    boxed(c, "BOUC ÉMISSAIRE", W / 2, 680, 56, fg=CREAM, bg=RED_D, path=FONT_BLACK, alpha=appear(t, 0.6))
    text(c, "écris-le en commentaire ↓", W / 2, 780, FONT_SERIF_I, 54, CREAM, alpha=appear(t, 0.9))
    ta = WT(seg, "abonne")
    pulse = 1 + 0.05 * math.sin(max(0, t - ta) * 8)
    a, s = slam(t, ta, 0.3, 1.6)
    boxed(c, "ABONNE-TOI", W / 2, 900, 80, fg=NOIR, bg=GOLD_L, path=FONT_BLACK, alpha=a)
    text(c, "PROCHAIN DOSSIER BIENTÔT", W / 2, 1010, FONT_MONO, 36, GOLD, tracking=6, alpha=appear(t, ta + 0.5))
    tend = seg.off + seg.speech + 0.4
    s2 = stamp(c, "DOSSIER CLASSÉ", W / 2, 1180, t, tend, 84, RED, -7)
    return dict(shake=impact(t, ta, 8) + s2)


SCENES = {k[2:]: v for k, v in globals().items() if k.startswith("s_") and callable(v)}
