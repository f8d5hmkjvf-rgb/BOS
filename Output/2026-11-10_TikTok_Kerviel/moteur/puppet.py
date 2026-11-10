# Articulated 2D puppets (side view), noir graphic-novel style with rim light.
import math
from PIL import Image, ImageDraw, ImageFilter, ImageChops
from core import W, H, GOLD, GOLD_L, RED, CREAM, clamp, ease_out, ease_in_out, lerp

D2R = math.pi / 180

STYLES = {
    # body, limb(sleeve), skin, hair, pants, extra
    "kerviel": dict(body=(18, 22, 36), sleeve=(18, 22, 36), skin=(170, 128, 106), hair=(14, 11, 10), pants=(14, 16, 26),
                    shirt=(215, 210, 200), tie=(110, 18, 22), hairstyle="short", scale=1.0),
    "father": dict(body=(70, 46, 30), sleeve=(150, 112, 92), skin=(160, 116, 92), hair=(40, 34, 30), pants=(30, 28, 32),
                   apron=True, hairstyle="short", beard=True, scale=1.12, belly=16),
    "mother": dict(body=(96, 30, 44), sleeve=(96, 30, 44), skin=(186, 140, 118), hair=(60, 34, 22), pants=(96, 30, 44),
                   dress=True, hairstyle="bun", scale=0.95),
    "client": dict(body=(200, 196, 188), sleeve=(200, 196, 188), skin=(176, 132, 110), hair=(110, 80, 40), pants=(40, 40, 46),
                   hairstyle="long", scale=0.9, cape=True),
    "boss": dict(body=(58, 60, 66), sleeve=(58, 60, 66), skin=(166, 124, 104), hair=(150, 146, 140), pants=(40, 42, 48),
                 shirt=(220, 218, 214), tie=(20, 30, 70), hairstyle="bald", scale=1.05, belly=10),
    "cop": dict(body=(26, 28, 32), sleeve=(26, 28, 32), skin=(160, 118, 98), hair=(20, 18, 16), pants=(22, 24, 28),
                shirt=(170, 168, 160), hairstyle="short", scale=1.05),
    "judge": dict(body=(10, 10, 12), sleeve=(10, 10, 12), skin=(176, 134, 112), hair=(200, 196, 190), pants=(10, 10, 12),
                  dress=True, hairstyle="short", scale=1.05, jabot=True),
    "trader": dict(body=(200, 205, 214), sleeve=(200, 205, 214), skin=(168, 126, 104), hair=(30, 24, 20), pants=(30, 32, 40),
                   tie=(80, 20, 20), hairstyle="short", scale=1.0),
    "kid": dict(body=(40, 60, 90), sleeve=(40, 60, 90), skin=(176, 132, 110), hair=(30, 24, 20), pants=(30, 34, 46),
                hairstyle="short", scale=0.95),
}

BASE = dict(torso=0, neck=0, shL=10, elL=10, shR=-10, elR=10, hipL=4, knL=-4, hipR=-4, knR=-4)


def pose(**kw):
    p = dict(BASE); p.update(kw); return p


def blend(a, b, t):
    return {k: lerp(a[k], b[k], t) for k in a}


class Puppet:
    def __init__(self, style, face=1, size=1.0):
        self.s = dict(STYLES[style]); self.face = face
        self.k = size * self.s.get("scale", 1.0)

    # direction (from straight down), positive = forward
    def _dir(self, ang):
        a = ang * D2R
        return math.sin(a) * self.face, math.cos(a)

    def draw(self, layer, x, y, p, prop=None, prop_state=0.0, rim=GOLD, rim_w=4, seated=False, mouth=0.0, alpha=255):
        """x,y = hip position. draws into an RGBA layer."""
        k = self.k
        target = layer
        layer = Image.new("RGBA", target.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        rim_col, rim = rim, None
        L = dict(torso=230 * k, up=140 * k, fore=130 * k, thigh=170 * k, shin=165 * k, neck=36 * k, head=64 * k)
        hip = (x, y)
        ta = p["torso"] * D2R
        tdir = (math.sin(ta) * self.face, -math.cos(ta))
        shoulder = (hip[0] + tdir[0] * L["torso"] * 0.92, hip[1] + tdir[1] * L["torso"] * 0.92)
        neck_top = (hip[0] + tdir[0] * (L["torso"] + L["neck"]), hip[1] + tdir[1] * (L["torso"] + L["neck"]))
        na = (p["torso"] + p["neck"]) * D2R
        hdir = (math.sin(na) * self.face, -math.cos(na))
        head = (neck_top[0] + hdir[0] * L["head"] * 0.85, neck_top[1] + hdir[1] * L["head"] * 0.85)

        def limb(root, a1, a2, l1, l2):
            d1 = self._dir(a1); j = (root[0] + d1[0] * l1, root[1] + d1[1] * l1)
            d2 = self._dir(a1 + a2); e = (j[0] + d2[0] * l2, j[1] + d2[1] * l2)
            return j, e

        legs = {}
        for side in "LR":
            legs[side] = limb(hip, p["hip" + side], p["kn" + side], L["thigh"], L["shin"])
        arms = {}
        for side in "LR":
            arms[side] = limb(shoulder, p["sh" + side], p["el" + side], L["up"], L["fore"])

        S = self.s
        dark = lambda c, f=0.6: tuple(int(v * f) for v in c)

        def capsule(a, b, w, col, outline=None):
            if outline:
                d.line((a, b), fill=outline + (alpha,), width=int(w + rim_w * 2))
                for q in (a, b):
                    r = w / 2 + rim_w
                    d.ellipse((q[0] - r, q[1] - r, q[0] + r, q[1] + r), fill=outline + (alpha,))
            d.line((a, b), fill=col + (alpha,), width=int(w))
            for q in (a, b):
                r = w / 2
                d.ellipse((q[0] - r, q[1] - r, q[0] + r, q[1] + r), fill=col + (alpha,))

        def foot(knee, end, col, outline=None):
            fx = self.face
            pts = [(end[0] - 14 * k * fx, end[1] - 12 * k), (end[0] + 46 * k * fx, end[1] - 4 * k),
                   (end[0] + 48 * k * fx, end[1] + 12 * k), (end[0] - 16 * k * fx, end[1] + 12 * k)]
            if outline:
                d.polygon(pts, fill=outline + (alpha,), outline=outline + (alpha,), width=rim_w * 2)
            d.polygon(pts, fill=col + (alpha,))

        def leg(side, col, outline):
            kn, ft = legs[side]
            capsule(hip, kn, 46 * k, col, outline); capsule(kn, ft, 38 * k, col, outline)
            foot(kn, ft, (12, 10, 10), outline)

        def arm(side, col, outline, near):
            el, hd = arms[side]
            capsule(shoulder, el, 36 * k, col, outline)
            fcol = S["skin"] if style_rolled else col
            capsule(el, hd, 30 * k, fcol if not near or not style_rolled else S["sleeve"], outline)
            r = 16 * k
            if outline:
                d.ellipse((hd[0] - r - rim_w, hd[1] - r - rim_w, hd[0] + r + rim_w, hd[1] + r + rim_w), fill=outline + (alpha,))
            d.ellipse((hd[0] - r, hd[1] - r, hd[0] + r, hd[1] + r), fill=S["skin"] + (alpha,))
            return hd, el

        style_rolled = "apron" in S
        far_col = dark(S["sleeve"], 0.55)
        # ---- far side
        leg("R", dark(S["pants"], 0.6), None)
        hdR, elR = arm("R", far_col, None, False)
        # ---- torso
        bw = 92 * k + S.get("belly", 0) * k
        perp = (-tdir[1], tdir[0])
        def tp(f, off):  # point along torso f (0 hip -> 1 shoulder), off across (+ = front)
            return (hip[0] + tdir[0] * L["torso"] * f + perp[0] * off * self.face * -1,
                    hip[1] + tdir[1] * L["torso"] * f + perp[1] * off * self.face * -1)
        torso_poly = [tp(-0.05, -bw * 0.48), tp(-0.05, bw * 0.52), tp(0.5, bw * 0.55 + S.get("belly", 0) * k),
                      tp(1.02, bw * 0.45), tp(1.05, -bw * 0.45), tp(0.5, -bw * 0.5)]
        if S.get("dress"):
            # long garment down to the knees / ankles
            kn = legs["L"][0]
            low = (hip[0], hip[1] + (L["thigh"] + L["shin"] * 0.6) * (0.55 if seated else 1.0))
            skirt = [tp(0.25, -bw * 0.5), tp(0.25, bw * 0.55), (low[0] + 80 * k * self.face, low[1]), (low[0] - 70 * k * self.face, low[1])]
            d.polygon(skirt, fill=S["body"] + (alpha,))
        if not S.get("dress") or True:
            leg("L", S["pants"], rim) if not S.get("dress") else None
        d.polygon(torso_poly, fill=S["body"] + (alpha,))
        if S.get("dress"):
            skirt2 = [tp(0.25, -bw * 0.5), tp(0.25, bw * 0.55), (low[0] + 80 * k * self.face, low[1]), (low[0] - 70 * k * self.face, low[1])]
            d.polygon(skirt2, fill=S["body"] + (alpha,))
            ft = legs["L"][1]
            foot(None, ft, (12, 10, 10), rim)
        if S.get("apron"):
            ap = [tp(0.85, bw * 0.48), tp(0.85, bw * 0.1), tp(-0.35, bw * 0.15), tp(-0.35, bw * 0.62)]
            d.polygon(ap, fill=(52, 34, 22, alpha))
            d.line((tp(0.85, bw * 0.3), tp(1.02, -bw * 0.1)), fill=(52, 34, 22, alpha), width=int(8 * k))
        if S.get("shirt"):
            d.polygon([tp(1.02, bw * 0.45), tp(0.72, bw * 0.4), tp(1.0, bw * 0.15)], fill=S["shirt"] + (alpha,))
        if S.get("tie"):
            d.line((tp(0.98, bw * 0.4), tp(0.55, bw * 0.47)), fill=S["tie"] + (alpha,), width=int(12 * k))
        if S.get("jabot"):
            d.polygon([tp(1.02, bw * 0.45), tp(0.8, bw * 0.5), tp(0.8, bw * 0.25)], fill=(235, 232, 225, alpha))
        # ---- head
        hr = L["head"]
        nk0, nk1 = shoulder, neck_top
        capsule(nk0, nk1, 34 * k, S["skin"], rim)
        hx, hy = head
        d.ellipse((hx - hr * 0.82, hy - hr, hx + hr * 0.82, hy + hr), fill=S["skin"] + (alpha,))
        fx = self.face
        # nose + chin profile
        nose = [(hx + hr * 0.72 * fx, hy - hr * 0.15), (hx + hr * 1.0 * fx, hy + hr * 0.18), (hx + hr * 0.72 * fx, hy + hr * 0.28)]
        d.polygon(nose, fill=S["skin"] + (alpha,))
        # hair
        hs = S.get("hairstyle")
        hc = S["hair"] + (alpha,)
        if hs == "short":
            d.chord((hx - hr * 0.88, hy - hr * 1.08, hx + hr * 0.88, hy + hr * 0.5), 180, 360, fill=hc)
            d.polygon([(hx - hr * 0.86 * fx, hy - hr * 0.2), (hx - hr * 0.2 * fx, hy - hr * 0.3), (hx - hr * 0.86 * fx, hy + hr * 0.35)], fill=hc)
        elif hs == "bun":
            d.chord((hx - hr * 0.9, hy - hr * 1.1, hx + hr * 0.88, hy + hr * 0.6), 180, 360, fill=hc)
            d.ellipse((hx - hr * 1.25 * fx - hr * 0.38, hy - hr * 0.95, hx - hr * 1.25 * fx + hr * 0.38, hy - hr * 0.2), fill=hc)
            d.polygon([(hx - hr * 0.88 * fx, hy - hr * 0.3), (hx - hr * 0.1 * fx, hy - hr * 0.5), (hx - hr * 0.8 * fx, hy + hr * 0.5)], fill=hc)
        elif hs == "long":
            d.chord((hx - hr * 0.95, hy - hr * 1.1, hx + hr * 0.9, hy + hr * 0.6), 180, 360, fill=hc)
            d.polygon([(hx - hr * 0.95 * fx, hy - hr * 0.3), (hx + hr * 0.1 * fx, hy - hr * 0.6), (hx - hr * 0.2 * fx, hy + hr * 1.4), (hx - hr * 1.05 * fx, hy + hr * 1.3)], fill=hc)
        elif hs == "bald":
            d.chord((hx - hr * 0.86, hy - hr * 0.6, hx + hr * 0.3, hy + hr * 0.5), 150, 260, fill=hc)
        if S.get("beard"):
            d.chord((hx - hr * 0.6, hy - hr * 0.2, hx + hr * 0.85, hy + hr * 1.05), 0, 180, fill=S["hair"] + (alpha,))
        # eye + brow + mouth
        ex, ey = hx + hr * 0.45 * fx, hy - hr * 0.12
        d.ellipse((ex - 6 * k, ey - 6 * k, ex + 6 * k, ey + 6 * k), fill=(12, 8, 8, alpha))
        d.line((ex - 14 * k * fx, ey - 18 * k, ex + 12 * k * fx, ey - 16 * k), fill=(20, 14, 12, alpha), width=int(6 * k))
        mx, my = hx + hr * 0.55 * fx, hy + hr * 0.5
        mo = 4 + 14 * mouth
        d.ellipse((mx - 10 * k, my - mo * k / 2, mx + 10 * k, my + mo * k / 2), fill=(50, 20, 18, alpha))
        # ---- near side
        hdL, elL = arm("L", S["sleeve"], rim, True)
        if prop:
            self._prop(d, prop, hdL, elL, prop_state, alpha)
        bb = layer.getchannel("A").getbbox()
        if bb:
            pad = 14
            bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(layer.width, bb[2] + pad), min(layer.height, bb[3] + pad))
            crop = layer.crop(bb)
            a = crop.getchannel("A")
            dil = a.filter(ImageFilter.MaxFilter(rim_w * 2 + 1))
            ring = ImageChops.subtract(dil, a)
            # stronger on the side facing the light (back side of the figure)
            if rim_col is not None:
                rl = Image.new("RGBA", crop.size, rim_col + (0,))
                rl.putalpha(ring)
                glow = rl.filter(ImageFilter.GaussianBlur(6))
                target.alpha_composite(glow, (bb[0], bb[1]))
                target.alpha_composite(rl, (bb[0], bb[1]))
            target.alpha_composite(crop, (bb[0], bb[1]))
        return dict(hand=hdL, hand2=hdR, head=head, hip=hip, feet=(legs["L"][1], legs["R"][1]), shoulder=shoulder)

    def _prop(self, d, prop, hand, elbow, st, alpha):
        k = self.k; fx = self.face
        vx, vy = hand[0] - elbow[0], hand[1] - elbow[1]
        n = math.hypot(vx, vy) or 1; vx, vy = vx / n, vy / n
        px, py = -vy, vx
        if prop == "hammer":
            end = (hand[0] + vx * 120 * k, hand[1] + vy * 120 * k)
            d.line((hand, end), fill=(90, 60, 30, alpha), width=int(14 * k))
            hw = 46 * k
            d.polygon([(end[0] + px * hw - vx * 20 * k, end[1] + py * hw - vy * 20 * k), (end[0] - px * hw - vx * 20 * k, end[1] - py * hw - vy * 20 * k),
                       (end[0] - px * hw + vx * 22 * k, end[1] - py * hw + vy * 22 * k), (end[0] + px * hw + vx * 22 * k, end[1] + py * hw + vy * 22 * k)],
                      fill=(70, 70, 76, alpha), outline=(200, 200, 210, alpha))
        elif prop == "scissors":
            op = 0.35 * abs(math.sin(st))
            for sgn in (1, -1):
                a = math.atan2(vy, vx) + sgn * op
                e = (hand[0] + math.cos(a) * 70 * k, hand[1] + math.sin(a) * 70 * k)
                d.line((hand, e), fill=(220, 220, 230, alpha), width=int(7 * k))
            d.ellipse((hand[0] - 12 * k, hand[1] - 12 * k, hand[0] + 12 * k, hand[1] + 12 * k), outline=(220, 220, 230, alpha), width=4)
        elif prop == "phone":
            d.rounded_rectangle((hand[0] - 14 * k, hand[1] - 40 * k, hand[0] + 14 * k, hand[1] + 10 * k), 6, fill=(20, 20, 24, alpha), outline=(150, 150, 160, alpha))
        elif prop == "gavel":
            end = (hand[0] + vx * 70 * k, hand[1] + vy * 70 * k)
            d.line((hand, end), fill=(110, 70, 34, alpha), width=int(12 * k))
            hw = 34 * k
            d.polygon([(end[0] + px * hw, end[1] + py * hw), (end[0] - px * hw, end[1] - py * hw),
                       (end[0] - px * hw + vx * 30 * k, end[1] - py * hw + vy * 30 * k), (end[0] + px * hw + vx * 30 * k, end[1] + py * hw + vy * 30 * k)],
                      fill=(120, 76, 36, alpha))
        elif prop == "paper":
            d.polygon([(hand[0], hand[1]), (hand[0] + 60 * k * fx, hand[1] - 30 * k), (hand[0] + 80 * k * fx, hand[1] + 40 * k), (hand[0] + 18 * k * fx, hand[1] + 66 * k)], fill=(235, 230, 218, alpha))


# ---------------------------------------------------------------- motions
def walk_pose(t, speed=1.0, swing=28, lean=4):
    ph = t * 2 * math.pi * 0.95 * speed
    s = math.sin(ph)
    return pose(torso=lean, neck=-2, hipL=swing * s, knL=-35 * max(0, math.sin(ph - 1.4)) - 4,
                hipR=-swing * s, knR=-35 * max(0, math.sin(ph + math.pi - 1.4)) - 4,
                shL=-24 * s, elL=18, shR=24 * s, elR=18)


def walk_bob(t, speed=1.0):
    return -6 * abs(math.sin(t * 2 * math.pi * 0.95 * speed))


def sit_pose(**kw):
    p = pose(torso=-2, hipL=88, knL=-88, hipR=84, knR=-84, shL=40, elL=40, shR=40, elR=40)
    p.update(kw); return p


def type_pose(t, frantic=1.0):
    j = lambda f, o: 7 * frantic * math.sin(t * f + o)
    return sit_pose(torso=14 + 2 * math.sin(t * 3), neck=8 + 3 * math.sin(t * 5 * frantic),
                    shL=58 + j(23, 0), elL=48 + j(31, 1), shR=56 + j(27, 2), elR=50 + j(29, 3))


def hammer_pose(t, hits):
    # arm up slowly, then fast strike at each hit time
    nxt = min([h for h in hits if h >= t - 0.25] or [hits[-1] + 10])
    dt = nxt - t
    if dt < -0.0:   # just after impact: recoil
        u = clamp(-dt / 0.25)
        sh = lerp(70, 95, u)
    elif dt < 0.12:
        sh = lerp(70, 175, dt / 0.12)
    elif dt < 0.8:
        sh = lerp(175, 120, (dt - 0.12) / 0.68)
    else:
        sh = 120 + 6 * math.sin(t * 2)
    return pose(torso=14, neck=8, shL=sh, elL=20, shR=40, elR=50, hipL=10, knL=-10, hipR=-12, knR=-6)


def snip_pose(t):
    return pose(torso=10, neck=10 + 4 * math.sin(t * 1.2), shL=78 + 6 * math.sin(t * 2.4), elL=30,
                shR=60 + 5 * math.sin(t * 2.4 + 1), elR=60, hipL=6, knL=-6, hipR=-6, knR=-4)


def gesture_pose(t, energy=1.0, seated=False):
    base = sit_pose if seated else pose
    return base(torso=4 + 3 * math.sin(t * 2), neck=-4 + 4 * math.sin(t * 3),
                shL=60 + 30 * energy * math.sin(t * 4.2), elL=60 + 25 * math.sin(t * 5.1),
                shR=45 + 25 * energy * math.sin(t * 3.7 + 1), elR=70 + 20 * math.sin(t * 4.4))


def stand_pose(t, breathe=1.0, **kw):
    p = pose(torso=1 * math.sin(t * 1.5) * breathe, neck=2 * math.sin(t * 0.9), shL=6 + 2 * math.sin(t * 1.5), shR=-6 + 2 * math.sin(t * 1.5))
    p.update(kw); return p
