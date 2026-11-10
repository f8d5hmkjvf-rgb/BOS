from scenes import *
from puppet import *

KV = lambda s=0.6, f=1: Puppet("kerviel", f, s)


def shadow(c, x, y, w=120, a=120):
    ov = Image.new("RGBA", (int(w * 2 + 40), 60), (0, 0, 0, 0))
    ImageDraw.Draw(ov).ellipse((20, 15, 20 + w * 2, 45), fill=(0, 0, 0, a))
    ov = ov.filter(ImageFilter.GaussianBlur(8))
    safe_paste(c, ov, int(x - w - 20), int(y - 30))


def desk(c, x, y, w=330, face=1, monitors=2, glow=(120, 255, 180), t=0, mono=None):
    """side-view trading desk; x = front edge near the seated trader, y = desk top"""
    d = ImageDraw.Draw(c)
    x0, x1 = (x, x + w * face) if face == 1 else (x + w * face, x)
    d.rectangle((x0, y, x1, y + 16), fill=(30, 30, 36))
    d.rectangle((x0 + 20, y + 16, x0 + 34, y + 260), fill=(20, 20, 24))
    d.rectangle((x1 - 34, y + 16, x1 - 20, y + 260), fill=(20, 20, 24))
    # keyboard
    kx = x + 40 * face
    d.rectangle((min(kx, kx + 90 * face), y - 8, max(kx, kx + 90 * face), y), fill=(60, 60, 66))
    # monitors (seen from the side: thin, with glow towards the trader)
    for i in range(monitors):
        mx = x + (200 + i * 70) * face
        my = y - 210 + i * 10
        d.rectangle((mx - 7, my, mx + 7, my + 170), fill=(16, 16, 20))
        d.rectangle((mx - 3, my + 170, mx + 3, y), fill=(16, 16, 20))
        fl = 0.75 + 0.25 * math.sin(t * 9 + i * 2)
        col = mono or glow
        d.line((mx - 9 * face, my + 4, mx - 9 * face, my + 166), fill=col + (int(255 * fl),), width=4)
    gl = radial(W, H, int(x + 200 * face), int(y - 130), 260, mono or glow, 2.0)
    c.alpha_composite(gl)


def chair(c, x, y, face=1):
    d = ImageDraw.Draw(c)
    d.rectangle((x - 60, y, x + 60, y + 14), fill=(26, 26, 30))
    d.rectangle((x - 60 * face - 8, y - 180, x - 60 * face + 8, y + 10), fill=(26, 26, 30))
    d.rectangle((x - 4, y + 14, x + 4, y + 120), fill=(26, 26, 30))
    d.line((x - 50, y + 140, x + 50, y + 140), fill=(26, 26, 30), width=8)


# ============================================================ PART 1
def s_forge(c, t, seg):
    c.alpha_composite(vgrad((5, 4, 4), (12, 8, 6)))
    tf = WT(seg, "forgeron")
    tc = WT(seg, "coiffeuse")
    tr = WT(seg, "rien")
    gy = 1200
    # LEFT: forge
    aL = appear(t, max(0.0, tf - 0.5), 0.4)
    hits = [tf, tf + 0.9, tf + 1.8, tf + 2.7, tf + 3.6, tf + 4.5]
    left = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow_k = sum(math.exp(-max(0, t - h) * 3) for h in hits if t >= h)
    put(left, radial(W, H, 300, 1050, 380, (255, 110, 30), 1.6), W / 2, H / 2, clamp(0.4 + 0.6 * glow_k))
    anvil(left, 330, 1080, 0.55, col=(14, 10, 10), edge=(255, 170, 80))
    sparks(left, t, hits, (360, 1035), n=40)
    Puppet("father", 1, 0.55).draw(left, 150, gy - 185, hammer_pose(t, hits), prop="hammer", rim=(255, 150, 70))
    left = left.crop((0, 0, W // 2, H))
    if aL > 0:
        left.putalpha(left.getchannel("A").point(lambda v: int(v * aL)))
        c.alpha_composite(left, (0, 0))
    # RIGHT: salon
    aR = appear(t, max(0.0, tc - 0.5), 0.4)
    right = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(right)
    dr.rectangle((W // 2, 650, W, gy), fill=(16, 18, 24, 255))
    dr.rounded_rectangle((W - 170, 720, W - 40, 980), 14, outline=(200, 200, 210, 200), width=6, fill=(40, 46, 60, 255))
    right.alpha_composite(radial(W, H, 830, 720, 300, (200, 210, 255), 2.0))
    chair(right, 930, 1030, -1)
    Puppet("client", -1, 0.5).draw(right, 930, 1020, sit_pose(neck=6 + 4 * math.sin(t)), seated=True, rim=(170, 190, 255))
    Puppet("mother", 1, 0.55).draw(right, 700, gy - 182, snip_pose(t), prop="scissors", prop_state=t * 14, rim=(170, 190, 255))
    # falling hair bits
    for i in range(10):
        ph = (t * 0.9 + i * 0.37) % 1
        x = 870 + 30 * math.sin(i * 3)
        y = 900 + ph * 280
        dr.line((x, y, x + 6, y + 10), fill=(110, 80, 40, int(255 * (1 - ph))), width=3)
    right = right.crop((W // 2, 0, W, H))
    if aR > 0:
        right.putalpha(right.getchannel("A").point(lambda v: int(v * aR)))
        c.alpha_composite(right, (W // 2, 0))
    d = ImageDraw.Draw(c)
    if max(aL, aR) > 0.02:
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(ov).line((W / 2, 620, W / 2, gy), fill=GOLD + (int(200 * max(aL, aR)),), width=3)
        c.alpha_composite(ov)
    d.rectangle((0, gy, W, gy + 6), fill=(40, 30, 24))
    text(c, "BRETAGNE", W / 2, 360, FONT_SERIF, 110, CREAM, tracking=24, glow=10, glow_alpha=0.4, alpha=appear(t, 0.1))
    text(c, "1977", W / 2, 465, FONT_MONO, 44, GOLD, tracking=14, alpha=appear(t, 0.4))
    text(c, "PÈRE FORGERON", W / 4, 560, FONT_XB, 40, GOLD_L, alpha=aL)
    text(c, "MÈRE COIFFEUSE", 3 * W / 4, 560, FONT_XB, 40, (200, 210, 255), alpha=aR)
    # little Jérôme walks in between them
    if t > tr - 0.3:
        u = clamp((t - tr + 0.3) / 1.2)
        kx = lerp(-80, W / 2, ease_out(u))
        p = walk_pose(t, 1.1) if u < 1 else stand_pose(t, neck=-22)
        shadow(c, kx + 10, gy + 4, 50)
        Puppet("kid", 1, 0.36).draw(c, kx, gy - 120 + (walk_bob(t) if u < 1 else 0), p, rim=GOLD_L)
        if u >= 1:
            a = appear(t, tr + 0.9)
            text(c, "€ ?", W / 2 + 30, gy - 330 - 10 * math.sin(t * 3), FONT_SERIF, 70, GOLD_L, glow=12, alpha=a)
    return dict(shake=sum(impact(t, h, 5) for h in hits if aL > 0.5))


def s_ambition(c, t, seg):
    c.alpha_composite(vgrad((4, 4, 8), (10, 8, 6)))
    tr = WT(seg, "réussir")
    light_beams(c, t, W / 2, H + 100, GOLD, 9, int(30 * appear(t, tr)))
    # night study desk
    dy = 1150
    c.alpha_composite(radial(W, H, 640, 950, 360, (255, 200, 120), 1.6))
    d = ImageDraw.Draw(c)
    d.rectangle((470, dy, 900, dy + 16), fill=(40, 30, 24))
    d.rectangle((490, dy + 16, 504, dy + 240), fill=(30, 22, 18)); d.rectangle((866, dy + 16, 880, dy + 240), fill=(30, 22, 18))
    # lamp
    d.line((820, dy, 780, dy - 160), fill=(60, 60, 60), width=8); d.line((780, dy - 160, 700, dy - 190), fill=(60, 60, 60), width=8)
    d.polygon([(660, dy - 210), (730, dy - 210), (740, dy - 160), (650, dy - 160)], fill=(50, 50, 54))
    d.ellipse((680, dy - 168, 712, dy - 152), fill=(255, 236, 190))
    # books stack
    for i, col in enumerate([(120, 30, 30), (30, 60, 110), (150, 120, 40)]):
        d.rectangle((830 - i * 6, dy - 30 - i * 26, 900 - i * 6, dy - 6 - i * 26), fill=col)
    chair(c, 420, dy + 60, 1)
    write = sit_pose(torso=22, neck=18 + 4 * math.sin(t * 0.8), shL=62 + 4 * math.sin(t * 9), elL=55 + 6 * math.sin(t * 11),
                     shR=50, elR=60)
    KV(0.58).draw(c, 420, dy + 50, write, seated=True, prop="paper", rim=(255, 200, 120))
    tg = WT(seg, "grande")
    text(c, "PAS DE GRANDE ÉCOLE", W / 2, 380, FONT_BLACK, 66, CREAM, alpha=appear(t, 0.0))
    p = ease_out((t - tg - 0.3) / 0.3)
    if p > 0:
        w_ = text_width("PAS DE GRANDE ÉCOLE", FONT_BLACK, 66) / 2 + 20
        d.line((W / 2 - w_, 390, W / 2 - w_ + 2 * w_ * p, 376), fill=RED, width=10)
    tre = WT(seg, "réseau")
    text(c, "PAS DE RÉSEAU", W / 2, 470, FONT_BLACK, 56, CREAM, alpha=appear(t, tre - 0.1))
    p2 = ease_out((t - tre - 0.25) / 0.3)
    if p2 > 0:
        w_ = text_width("PAS DE RÉSEAU", FONT_BLACK, 56) / 2 + 20
        d.line((W / 2 - w_, 478, W / 2 - w_ + 2 * w_ * p2, 466), fill=RED, width=9)
    a, s = slam(t, tr, 0.3, 2.2)
    text(c, "RÉUSSIR", W / 2, 640, FONT_SERIF, 190, GOLD_L, tracking=10, glow=26, alpha=a, scale=s)
    return dict(shake=impact(t, tr + 0.2, 20), flash=(GOLD_L, 0.3 * math.exp(-max(0, t - tr - 0.2) * 7) if t > tr + 0.2 else 0))


def s_tower(c, t, seg):
    tl = tower_layer()
    p = ease_in_out(t / seg.dur)
    y0 = int(lerp(tl.height - H, tl.height - H - 500, p))
    c.alpha_composite(tl.crop((0, y0, W, y0 + H)))
    c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 70)))
    gy = 1300
    d = ImageDraw.Draw(c)
    d.rectangle((0, gy, W, H), fill=(8, 8, 10))
    d.line((0, gy, W, gy), fill=GOLD + (120,), width=2)
    # entrance doors glow
    c.alpha_composite(radial(W, H, 760, gy - 150, 260, (255, 210, 140), 1.8))
    d.rectangle((680, gy - 300, 840, gy), fill=(255, 220, 160, 200))
    d.line((760, gy - 300, 760, gy), fill=(80, 60, 30), width=4)
    # Jérôme walks to the door, then pauses & looks up, then goes in
    tm = WT(seg, "middle")
    u = clamp(t / max(1.0, tm - 0.4))
    x = lerp(-60, 600, ease_in_out(u))
    if u < 1:
        pz, bob = walk_pose(t, 1.0), walk_bob(t)
    elif t < tm + 0.7:
        pz, bob = stand_pose(t, neck=-28, shL=4), 0
    else:
        v = clamp((t - tm - 0.7) / 1.4)
        x = lerp(600, 760, v); pz, bob = walk_pose(t, 1.0), walk_bob(t)
    alpha = int(255 * (1 - clamp((x - 700) / 60)))
    if alpha > 4:
        shadow(c, x + 10, gy + 4, 70)
        KV(0.5).draw(c, x, gy - 168 + bob, pz, rim=GOLD_L, alpha=alpha)
    text(c, "2000", W / 2, 360, FONT_SERIF, 130, GOLD_L, tracking=12, glow=14, alpha=appear(t, 0.1))
    text(c, "SOCIÉTÉ GÉNÉRALE", W / 2, 490, FONT_BLACK, 76, CREAM, tracking=4, alpha=appear(t, WT(seg, "société")), stroke=3)
    boxed(c, "MIDDLE OFFICE", W / 2, 620, 48, alpha=appear(t, tm, 0.2))
    text(c, "ceux qui contrôlent les traders", W / 2, 710, FONT_SERIF_I, 46, CREAM, alpha=appear(t, WT(seg, "contrôle")))
    return dict(shake=impact(t, tm, 8))


def _trading_room(c, t, tint="mix", dim=150):
    wall = monitor_wall(tint, 12)
    c.alpha_composite(wall)
    c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, dim)))


def _kerviel_desk(c, t, frantic=1.0, glow=(120, 255, 180), mono=None, gy=1320):
    dy = gy - 230
    chair(c, 330, dy + 70, 1)
    KV(0.62).draw(c, 330, dy + 60, type_pose(t, frantic), seated=True, rim=glow)
    desk(c, 400, dy, 420, 1, 3, glow, t, mono)
    d = ImageDraw.Draw(c)
    d.rectangle((0, gy + 30, W, H), fill=(6, 6, 8))


def s_desk(c, t, seg):
    _trading_room(c, t)
    # background traders
    bg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for i, x in enumerate((140, 900)):
        Puppet("trader", 1 if i == 0 else -1, 0.38).draw(bg, x, 1000, type_pose(t + i, 1.3), seated=True, rim=(80, 120, 100))
    bg = bg.filter(ImageFilter.GaussianBlur(3))
    bg.putalpha(bg.getchannel("A").point(lambda v: int(v * 0.6)))
    c.alpha_composite(bg)
    _kerviel_desk(c, t, 1.0)
    ticker(c, t, 300, ["EURO STOXX 50 ▲", "DAX ▲", "CAC 40 ▲", "FTSE 100 ▲", "FUTURES ▲"], speed=160, size=30)
    text(c, "2005", W / 2, 440, FONT_SERIF, 120, GOLD_L, tracking=12, glow=12, alpha=appear(t, 0.1))
    boxed(c, "DESK DELTA ONE", W / 2, 560, 46, alpha=appear(t, WT(seg, "delta"), 0.2))
    text(c, "« COUVERTS »", W / 2, 660, FONT_SERIF_I, 58, CREAM, alpha=appear(t, WT(seg, "couverts")), glow=8)
    return dict(shake=impact(t, WT(seg, "delta"), 8))


def s_fake(c, t, seg):
    c.alpha_composite(vgrad((6, 4, 4), (2, 2, 3)))
    rows = trade_rows(9)
    draw_rows(c, rows, 280, t * 160, color=(90, 95, 90), size=30, alpha=120)
    c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 120)))
    te = WT(seg, "énormes")
    tv = WT(seg, "vacances")
    _kerviel_desk(c, t, 2.2 if t < tv else 1.2, glow=(255, 120, 90))
    p = ease_out((t - te + 0.2) / 1.2)
    if p > 0:
        d = ImageDraw.Draw(c)
        d.rectangle((90, 400, 90 + 900 * p, 460), fill=GOLD)
        text(c, "POSITIONS", 100, 362, FONT_MONO, 34, GOLD_L, anchor="l", tracking=6)
    tf = WT(seg, "fictives")
    sh = 0
    for i, (dx, dy, ang) in enumerate([(-200, 600, -12), (180, 700, 8), (-20, 820, -5)]):
        sh += stamp(c, "FICTIF", W / 2 + dx, dy, t, tf - 0.35 + i * 0.28, 90, RED, ang)
    # vacation calendar: crossed-out days
    if t > tv - 0.2:
        a = appear(t, tv - 0.2)
        cx, cy = W / 2, 620
        d = ImageDraw.Draw(c)
        d.rectangle((cx - 230, cy - 160, cx + 230, cy + 170), fill=(236, 230, 216, int(250 * a)))
        d.rectangle((cx - 230, cy - 160, cx + 230, cy - 100), fill=(150, 20, 20, int(255 * a)))
        text(c, "CONGÉS", cx, cy - 130, FONT_BLACK, 40, CREAM, alpha=a)
        for i in range(20):
            gx, gy_ = i % 5, i // 5
            x, y = cx - 190 + gx * 95, cy - 60 + gy_ * 56
            d.rectangle((x - 30, y - 18, x + 30, y + 18), outline=(120, 110, 100, int(255 * a)), width=2)
            if t > tv + i * 0.06:
                d.line((x - 24, y - 14, x + 24, y + 14), fill=RED + (int(255 * a),), width=6)
                d.line((x - 24, y + 14, x + 24, y - 14), fill=RED + (int(255 * a),), width=6)
    return dict(shake=sh + impact(t, te, 6))


def s_alerts(c, t, seg):
    c.alpha_composite(vgrad((10, 3, 3), (2, 2, 3)))
    d = ImageDraw.Draw(c)
    te = WT(seg, "explication")
    for i in range(16):
        gx, gy_ = i % 4, i // 4
        x, y = 190 + gx * 233, 400 + gy_ * 120
        ta = 0.05 + i * 0.12
        if t < ta:
            continue
        silenced = t > te + i * 0.03
        pulse = 0.6 + 0.4 * math.sin((t - ta) * 14)
        col = (80, 80, 84) if silenced else RED
        tri_alert(d, x, y, 38, col, int((255 if not silenced else 140) * (pulse if not silenced else 1)))
        if silenced:
            d.line((x - 26, y + 2, x - 6, y + 22, x + 30, y - 22), fill=GOLD_L, width=8, joint="curve")
    text(c, "ALERTE", W / 2, 300, FONT_MONO, 44, RED if (t * 3) % 1 < 0.6 or t > te else (60, 10, 10), tracking=16)
    # Kerviel at desk (left) + boss coming in from the right
    gy = 1320
    dy = gy - 230
    chair(c, 260, dy + 70, 1)
    talking = te - 0.2 < t < te + 1.4
    kp = gesture_pose(t, 1.0, seated=True) if talking else type_pose(t, 1.0)
    if talking:
        kp["neck"] = -6
    KV(0.58).draw(c, 260, dy + 60, kp, seated=True, rim=(255, 120, 90), mouth=abs(math.sin(t * 14)) if talking else 0)
    desk(c, 330, dy, 300, 1, 2, (255, 90, 70), t, None)
    t_in, t_out = 0.3, te + 1.3
    if t < t_in + 1.2:
        u = clamp((t - t_in) / 1.2); bx = lerp(W + 120, 820, ease_out(u)); bp, bob, f = walk_pose(t), walk_bob(t), -1
    elif t < t_out:
        bx = 820; f = -1; bob = 0
        bp = gesture_pose(t * 0.8, 0.8) if t < te - 0.2 else stand_pose(t, neck=10 * abs(math.sin(t * 4)) if t > te + 0.6 else 0, shL=40, elL=80)
    else:
        u = clamp((t - t_out) / 1.4); bx = lerp(820, W + 160, ease_in_out(u)); bp, bob, f = walk_pose(t), walk_bob(t), 1
    shadow(c, bx, gy + 4, 80)
    Puppet("boss", f, 0.58).draw(c, bx, gy - 195 + bob, bp, rim=(200, 200, 220),
                                 mouth=abs(math.sin(t * 12)) if (t_in + 1.2 < t < te - 0.2) else 0)
    d.rectangle((0, gy + 30, W, H), fill=(6, 6, 8))
    a, s = slam(t, te, 0.3, 1.5)
    text(c, "« J'AI UNE EXPLICATION »", W / 2, 950, FONT_SERIF_I, 60, GOLD_L, alpha=a, scale=s, glow=10)
    return dict(shake=impact(t, te, 8), chroma=2 if t < te and (t * 6) % 1 < 0.15 else 0)


# ============================================================ PART 2
def s_interro(c, t, seg):
    c.alpha_composite(vgrad((4, 4, 6), (1, 1, 2)))
    gy = 1320
    # pacing cop in the background
    bg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ph = (t * 0.25) % 2
    f = 1 if ph < 1 else -1
    bx = lerp(150, 930, ease_in_out(ph if ph < 1 else 2 - ph))
    Puppet("cop", f, 0.42).draw(bg, bx, 1060 + walk_bob(t, 0.9), walk_pose(t, 0.9), rim=(120, 110, 90))
    bg = bg.filter(ImageFilter.GaussianBlur(2.5))
    bg.putalpha(bg.getchannel("A").point(lambda v: int(v * 0.55)))
    c.alpha_composite(bg)
    ang = 0.06 * math.sin(t * 1.4)
    lx, ly = W / 2 + 520 * math.sin(ang), 640
    ov = Image.new("RGBA", (W // 2, H // 2), (0, 0, 0, 0))
    ImageDraw.Draw(ov).polygon([(lx / 2 - 30, ly / 2), (lx / 2 + 30, ly / 2), (lx / 2 + 330 + ang * 900, gy / 2), (lx / 2 - 330 + ang * 900, gy / 2)],
                               fill=(255, 220, 160, 50))
    c.alpha_composite(ov.filter(ImageFilter.GaussianBlur(18)).resize((W, H), Image.BILINEAR))
    dy = gy - 230
    d = ImageDraw.Draw(c)
    chair(c, 330, dy + 70, 1)
    tc = WT(seg, "cinquante")
    slump = clamp((t - tc) / 1.0)
    kp = sit_pose(torso=lerp(4, 24, slump), neck=lerp(0, 30, slump), shL=lerp(50, 70, slump), elL=lerp(40, 80, slump), shR=48, elR=50)
    KV(0.6).draw(c, 330, dy + 60, kp, seated=True, rim=(255, 210, 150))
    d.rectangle((430, dy, 760, dy + 16), fill=(40, 36, 32))
    d.rectangle((450, dy + 16, 464, gy + 30), fill=(30, 26, 24)); d.rectangle((726, dy + 16, 740, gy + 30), fill=(30, 26, 24))
    # papers on the table
    d.polygon([(520, dy - 2), (640, dy - 8), (650, dy + 2), (530, dy + 6)], fill=(230, 224, 210))
    # standing cop leaning on table, slamming it
    hits = [tc - 0.05]
    lean = 18 + 10 * math.exp(-max(0, t - hits[0]) * 4) * (t > hits[0])
    talking = t < seg.off + seg.speech
    cp = pose(torso=lean, neck=-4, shL=55 + 25 * math.sin(t * 3.1), elL=40 + 20 * math.sin(t * 4), shR=40, elR=40, hipL=6, knL=-4, hipR=-8)
    if abs(t - hits[0]) < 0.25:
        cp["shL"] = 80; cp["elL"] = 10
    shadow(c, 860, gy + 4, 80)
    Puppet("cop", -1, 0.62).draw(c, 860, gy - 210, cp, rim=(255, 210, 150), mouth=abs(math.sin(t * 13)) * 0.8)
    d = ImageDraw.Draw(c)
    d.rectangle((0, gy + 30, W, H), fill=(5, 5, 6))
    d.line((W / 2, 0, lx, ly - 40), fill=(30, 30, 30), width=6)
    d.chord((lx - 100, ly - 70, lx + 100, ly + 55), 180, 360, fill=(26, 24, 22))
    d.ellipse((lx - 36, ly - 12, lx + 36, ly + 12), fill=(255, 236, 190))
    c.alpha_composite(radial(W, H, int(lx), ly, 200, (255, 220, 160), 2.0))
    a, s = slam(t, tc, 0.3, 1.6)
    text(c, "50 000 000 000 €", W / 2, 400, FONT_MONO, 78, RED, glow=16, alpha=a, scale=s)
    text(c, "INTERROGÉ PENDANT DES HEURES", W / 2, 400, FONT_MONO, 34, CREAM, tracking=4, alpha=appear(t, 0.2) * (1 - appear(t, tc - 0.2)))
    return dict(shake=impact(t, hits[0], 12))


def s_sell(c, t, seg):
    _trading_room(c, t, "red", 170)
    d = ImageDraw.Draw(c)
    cx, cy, r = W / 2, 430, 130
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=GOLD, width=6, fill=(8, 8, 10))
    for i in range(12):
        a = i / 12 * 2 * math.pi
        d.line((cx + (r - 24) * math.sin(a), cy - (r - 24) * math.cos(a), cx + (r - 8) * math.sin(a), cy - (r - 8) * math.cos(a)), fill=GOLD, width=5)
    sec = math.floor(t * 4) / 4 * 2 * math.pi * 1.5
    d.line((cx, cy, cx + (r - 20) * math.sin(sec), cy - (r - 20) * math.cos(sec)), fill=RED, width=5)
    d.line((cx, cy, cx + 80 * math.sin(t * 0.4), cy - 80 * math.cos(t * 0.4)), fill=CREAM, width=8)
    gy = 1320
    # three frantic traders + one shouting on the phone
    for i, x in enumerate((120, 470)):
        dy = gy - 200
        chair(c, x, dy + 60, 1)
        Puppet("trader", 1, 0.52).draw(c, x, dy + 50, type_pose(t + i * 0.7, 2.5), seated=True, rim=(255, 90, 70))
        desk(c, x + 60, dy, 230, 1, 2, (255, 70, 50), t + i, RED)
    pp = pose(torso=-6, neck=-12, shL=150 + 10 * math.sin(t * 6), elL=60, shR=60 + 20 * math.sin(t * 7), elR=100, hipL=8, hipR=-8)
    shadow(c, 930, gy + 4, 70)
    Puppet("boss", -1, 0.55).draw(c, 930, gy - 185, pp, prop=None, rim=(255, 90, 70), mouth=abs(math.sin(t * 16)))
    ph = Puppet("boss", -1, 0.55)
    d.rectangle((0, gy + 30, W, H), fill=(6, 6, 8))
    sh = 0
    for i, (k_, s_, col) in enumerate([("vendre", "VENDRE.", CREAM), ("vite", "VITE.", GOLD_L), ("secret", "EN SECRET.", RED)]):
        tt = WT(seg, k_)
        a, sc = slam(t, tt, 0.2, 2.0)
        text(c, s_, W / 2, 660 + i * 115, FONT_BLACK, 110, col, alpha=a, scale=sc, glow=8 if col != CREAM else 0, stroke=4)
        sh += impact(t, tt, 14)
    return dict(shake=sh)


def s_trial(c, t, seg):
    c.alpha_composite(court_bg())
    c.alpha_composite(radial(W, H, 760, 900, 520, (200, 150, 60), 2.0))
    gy = 1320
    tc = WT(seg, "coupable")
    hits = [tc - 0.02, tc + 0.5]
    # judge behind the bench
    jp = hammer_pose(t, hits); jp.update(hipL=88, knL=-88, hipR=84, knR=-84, torso=6)
    Puppet("judge", -1, 0.6).draw(c, 860, 1080, jp, prop="gavel", seated=True, rim=(255, 220, 150))
    d = ImageDraw.Draw(c)
    d.rectangle((600, 1080, W, gy + 30), fill=(40, 28, 20))
    d.rectangle((600, 1072, W, 1088), fill=(80, 58, 36))
    d.line((640, 1130, W, 1130), fill=(60, 44, 30), width=4)
    # Jérôme standing, head drops at the verdict
    drop = clamp((t - tc) / 0.8)
    kp = stand_pose(t, neck=lerp(-2, 32, ease_out(drop)), torso=lerp(0, 8, drop), shL=4, elL=6, shR=-4, elR=6)
    shadow(c, 300, gy + 4, 80)
    KV(0.62).draw(c, 300, gy - 210, kp, rim=GOLD_L)
    d.rectangle((0, gy + 30, W, H), fill=(6, 6, 8))
    scales(c, 200, 560, t, 0.35)
    text(c, "OCTOBRE 2010", W / 2, 320, FONT_MONO, 42, GOLD, tracking=6, alpha=appear(t, 0.0))
    s1 = stamp(c, "COUPABLE", W / 2 + 60, 460, t, tc, 110, RED, -6)
    t5, t3 = WT(seg, "cinq"), WT(seg, "trois")
    a, s = slam(t, t5, 0.25, 1.6)
    text(c, "5 ANS DE PRISON", W / 2, 650, FONT_BLACK, 76, CREAM, alpha=a, scale=s, stroke=3)
    a, s = slam(t, t3, 0.25, 1.6)
    text(c, "DONT 3 FERME", W / 2, 745, FONT_BLACK, 62, GOLD_L, alpha=a, scale=s, glow=10, stroke=3)
    return dict(shake=s1 + impact(t, hits[1], 10) + impact(t, t5, 6) + impact(t, t3, 6),
                flash=((255, 255, 255), 0.3 * math.exp(-max(0, t - tc - 0.1) * 8) if t > tc + 0.1 else 0))


def s_walk(c, t, seg):
    c.alpha_composite(sunset())
    d = ImageDraw.Draw(c)
    for i in range(30):
        x = (i * 80 - t * 230) % (W + 80) - 40
        d.line((x, 1395, x + 30, 1395), fill=(80, 40, 30), width=4)
    tp = WT(seg, "police")
    tm, tb = WT(seg, "moins"), WT(seg, "bracelet")
    arrived = t > tp + 0.3
    kp = walk_pose(t, 0.9) if not arrived else stand_pose(t, neck=12, shL=-10, shR=10)
    k = Puppet("kerviel", 1, 0.85)
    k.draw(c, W / 2 - 60, 1385 - 285 + (walk_bob(t, 0.9) if not arrived else 0), kp, rim=(255, 230, 170))
    # backpack
    text(c, "2014", W / 2, 330, FONT_SERIF, 120, GOLD_L, tracking=12, alpha=appear(t, 0.0))
    p = clamp(t / (tp + 0.2))
    x0, x1, y = 170, 910, 470
    for i in range(37):
        xx = lerp(x0, x1, i / 36)
        if i / 36 <= p:
            d.ellipse((xx - 5, y - 5, xx + 5, y + 5), fill=CREAM)
    d.ellipse((lerp(x0, x1, p) - 16, y - 16, lerp(x0, x1, p) + 16, y + 16), fill=RED)
    text(c, "ROME", x0, y + 50, FONT_MONO, 34, CREAM, tracking=4)
    text(c, "FRONTIÈRE", x1 - 20, y + 50, FONT_MONO, 34, CREAM, tracking=4)
    text(c, "le pape François", x0 + 40, y - 50, FONT_SERIF_I, 34, CREAM, alpha=appear(t, WT(seg, "pape")) * (1 - appear(t, WT(seg, "rentre"))))
    boxed(c, "< 4 MOIS DE PRISON", W / 2, 640, 46, fg=CREAM, bg=(30, 12, 10), alpha=appear(t, tm, 0.2))
    boxed(c, "BRACELET ÉLECTRONIQUE", W / 2, 730, 46, fg=(30, 12, 10), bg=CREAM, alpha=appear(t, tb, 0.2))
    return dict(shake=impact(t, tm, 6) + impact(t, tb, 6))


for _n in ("forge", "ambition", "tower", "desk", "fake", "alerts", "interro", "sell", "trial", "walk"):
    SCENES[_n] = globals()["s_" + _n]


# ============================================================ HOOKS
def s_cold(c, t, seg):
    c.alpha_composite(monitor_wall("red", 14))
    c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 165)))
    c.alpha_composite(radial(W, H, W // 2, 900, 700, (170, 20, 10), 1.6))
    ch = CHAR.render(key=(255, 90, 70), k=1.1, rimL=(255, 60, 40), rimR=GOLD, eye=(255, 80, 60), ambient=0.22)
    sc = 1.35 + 0.05 * t / seg.dur
    char_paste(c, ch, y=int(900 - 580 * sc / 1.35 * 1.0), scale=sc)
    tm = WT(seg, "milliards")
    p = ease_out(t / max(0.6, tm + 0.25))
    sz = fit_size("−4 900 000 000 €", FONT_MONO, 104, 1000)
    text(c, "−" + fmt_int(lerp(1.37e9, 4.9e9, p)) + " €", W / 2, 400, FONT_MONO, sz, RED, glow=24, stroke=3,
         scale=1 + 0.08 * math.exp(-max(0, t - tm - 0.25) * 6) * (t > tm + 0.25))
    text(c, "PERDUS PAR UN SEUL HOMME", W / 2, 500, FONT_MONO, 34, CREAM, tracking=6, alpha=appear(t, tm + 0.2))
    ts, tp = WT(seg, "seul"), WT(seg, "personne")
    a, s = slam(t, ts, 0.22, 2.2)
    text(c, "SEUL.", W / 2, 1190, FONT_BLACK, 170, CREAM, stroke=8, alpha=a * (1 - appear(t, tp - 0.1, 0.15)), scale=s)
    a2, s2 = slam(t, tp, 0.22, 2.2)
    text(c, "INVISIBLE.", W / 2, 1190, FONT_BLACK, 150, GOLD_L, stroke=8, glow=16, alpha=a2, scale=s2)
    glitch = 8 if t < 0.25 or abs(t - ts) < 0.1 or abs(t - tp) < 0.1 else 0
    return dict(shake=impact(t, 0.0, 22) + impact(t, tm + 0.25, 14) + impact(t, ts, 12) + impact(t, tp, 12), chroma=glitch,
                flash=(RED, 0.35 * math.exp(-t * 6)))


def s_p2title(c, t, seg):
    c.alpha_composite(monitor_wall("red", 16))
    c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 185)))
    dust(c, t, color=RED, alpha=0.4)
    a, s = slam(t, -0.2, 0.25, 1.8)
    sz = fit_size("50 000 000 000 €", FONT_MONO, 104, 1000)
    text(c, "50 000 000 000 €", W / 2, 520, FONT_MONO, sz, RED, glow=22, alpha=a, scale=s)
    text(c, "CACHÉS", W / 2, 630, FONT_BLACK, 80, CREAM, alpha=appear(t, WT(seg, "cachés")))
    td = WT(seg, "découvrir")
    sh = stamp(c, "DÉCOUVERTS", W / 2, 800, t, td, 100, RED, -6)
    tp = WT(seg, "pire")
    text(c, "le pire reste à venir…", W / 2, 960, FONT_SERIF_I, 58, GOLD_L, glow=10, alpha=appear(t, tp))
    tpa = WT(seg, "partie")
    a3, s3 = slam(t, tpa, 0.3, 2.0)
    text(c, "PARTIE 2", W / 2, 1150, FONT_BLACK, 150, GOLD_L, glow=20, alpha=a3, scale=s3)
    return dict(shake=impact(t, 0.0, 18) + sh + impact(t, tpa, 16), chroma=6 if t < 0.2 else 0)


SCENES["cold"] = s_cold
SCENES["p2title"] = s_p2title
