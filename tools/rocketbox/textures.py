"""Förbereder Rocketbox-texturerna: skalar ner, sparar som JPEG/PNG och färgar om.

Källa: https://github.com/microsoft/Microsoft-Rocketbox (MIT-licens).
Kör:  python3 tools/rocketbox/textures.py <mapp med nedladdade figurer> <arbetsmapp>
"""
import sys
import numpy as np
from PIL import Image

SRC, WORK = sys.argv[1], sys.argv[2]

FIGS = {
    "smoker": ("Business_Male_02", "m008"),
    "loner": ("Male_Adult_03", "m004"),
    "waiter": ("Medical_Male_01", "m152"),
    "woman": ("Female_Adult_11", "f011"),
}


def grid(h, w):
    y, x = np.mgrid[0:h, 0:w]
    return x / w, y / h


def smooth(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def tint(rgb, mask, target, gain=1.0, gamma=1.0):
    """Byter färgton men behåller texturens ljushet (veck, stickning, hårstrån)."""
    lum = rgb.mean(axis=2, keepdims=True) / 255.0
    ref = float(lum[mask > 0.5].mean()) if (mask > 0.5).any() else 0.3
    new = np.clip((lum / ref) ** gamma * gain, 0, 2.2) * np.array(target, dtype=np.float32)
    m = mask[..., None]
    return np.clip(rgb * (1 - m) + new * m, 0, 255)


def woman_body(a):
    # brun stickad klänning → Hoppers röda; hud, skärp och stövlar lämnas
    x, y = grid(*a.shape[:2])
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    v = a.max(axis=2)
    sat = (v - a.min(axis=2)) / np.maximum(v, 1)
    cloth = smooth(175, 135, v) * smooth(22, 38, v) * smooth(0.12, 0.22, sat) * (r > b)
    legs = ((x < 0.33) | (x > 0.67)) & (y > 0.58)  # lår och stövlar
    cloth = cloth * (~legs)
    return tint(a, cloth, (196, 50, 38), gain=1.0, gamma=0.8)


def hair_mask(a, lo=70, hi=135):
    return smooth(hi, lo, a.max(axis=2))


def woman_head(a):
    x, y = grid(*a.shape[:2])
    face = (((x - 0.5) / 0.13) ** 2 + ((y - 0.335) / 0.165) ** 2) < 1
    ears = ((((x - 0.24) / 0.05) ** 2 + ((y - 0.35) / 0.08) ** 2) < 1) | ((((x - 0.745) / 0.05) ** 2 + ((y - 0.35) / 0.08) ** 2) < 1)
    inner = (x < 0.36) & (y > 0.6)  # ögon och munhåla
    # runt öronen räknas bara det riktigt mörka som hår (inte hörselgångens skugga)
    m = hair_mask(a) * (~face) * (~inner) * np.where(ears, smooth(95, 60, a.max(axis=2)), 1.0)
    return tint(a, m, (168, 60, 26), gain=1.0, gamma=0.9)


def woman_hair(a):
    x, y = grid(*a.shape[:2])
    lashes = (x > 0.38) & (x < 0.66) & (y > 0.58) & (y < 0.92)
    m = np.ones(a.shape[:2], dtype=np.float32) * (~lashes)
    out = a.copy()
    out[..., :3] = tint(a[..., :3], m, (168, 60, 26), gain=1.0, gamma=0.9)
    return out


def waiter_body(a):
    # namnskylt och pennor på rocken hör inte hemma 1942
    x, y = grid(*a.shape[:2])
    badge = (x > 0.42) & (x < 0.63) & (y > 0.885) & (y < 0.965)
    out = a.copy()
    out[badge] = (214, 214, 208)
    return out


def waiter_head(a):
    # mörkt hår → sandblont, skäggstubben tonas ner mot hudfärgen
    x, y = grid(*a.shape[:2])
    face = (((x - 0.5) / 0.125) ** 2 + ((y - 0.33) / 0.15) ** 2) < 1
    beard = (((x - 0.5) / 0.14) ** 2 + ((y - 0.47) / 0.085) ** 2) < 1
    ears = ((((x - 0.25) / 0.05) ** 2 + ((y - 0.36) / 0.08) ** 2) < 1) | ((((x - 0.75) / 0.05) ** 2 + ((y - 0.36) / 0.08) ** 2) < 1)
    inner = (x < 0.36) & (y > 0.6)
    m = hair_mask(a, 80, 140) * (~face) * (~beard) * (~inner) * np.where(ears, smooth(95, 60, a.max(axis=2)), 1.0)
    out = tint(a, m, (158, 130, 88), gain=1.0, gamma=1.0)
    stub = smooth(170, 110, out.max(axis=2)) * beard
    skin = np.array((196, 146, 118), dtype=np.float32)
    return out * (1 - 0.7 * stub[..., None]) + skin * 0.7 * stub[..., None]


def waiter_hair(a):
    out = a.copy()
    out[..., :3] = tint(a[..., :3], np.ones(a.shape[:2], dtype=np.float32), (158, 130, 88), gain=1.0, gamma=1.0)
    return out


EDIT = {
    ("woman", "body_color"): woman_body,
    ("woman", "head_color"): woman_head,
    ("woman", "opacity_color"): woman_hair,
    ("waiter", "body_color"): waiter_body,
    ("waiter", "head_color"): waiter_head,
    ("waiter", "opacity_color"): waiter_hair,
}
SIZE = {"body_color": 2048, "body_normal": 1024, "head_color": 1024, "opacity_color": 1024}

import os

for fig, (name, tid) in FIGS.items():
    os.makedirs(f"{WORK}/{fig}", exist_ok=True)
    for kind, size in SIZE.items():
        im = Image.open(f"{SRC}/{name}/{tid}_{kind}.tga")
        im = im.convert("RGBA" if kind == "opacity_color" else "RGB")
        a = np.asarray(im).astype(np.float32)
        if (fig, kind) in EDIT:
            a = EDIT[(fig, kind)](a)
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        if im.size[0] != size:
            im = im.resize((size, size), Image.LANCZOS)
        if kind == "opacity_color":
            im.save(f"{WORK}/{fig}/{kind}.png", optimize=True)
        else:
            im.save(f"{WORK}/{fig}/{kind}.jpg", quality=92 if kind == "body_normal" else 88)
    print("ok", fig)
