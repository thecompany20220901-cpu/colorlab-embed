# -*- coding: utf-8 -*-
"""12タイプ診断の設問イラストを、既存の顔イラスト素材の「色差し替え」だけで作る。

方針(2026-08-31 keisuke承認・引き継ぎ資料の転換1):
  - 新規に絵を描き起こさない。C:\\Users\\newfa\\instagram\\renderer\\assets\\faces\\ の
    4タイプ顔イラストを土台に、肌・頬・髪・服・唇・瞳の「色だけ」を差し替える。
  - 差し替える色は Q12[].illust.left/right が既に持っている HEX をそのまま使う
    (このスクリプトは色を1つも決めない。色の出所は color_lab_stylist_v23.jsx)。
  - 色の当て方は Lab 平行移動。L* の相対差(陰影・線)は保存されるので、
    A/B は「同一人物・同一構図で色だけが違う」ことが構造的に保証される。

出力: src/assets/cqNN_a.webp / cqNN_b.webp ほか(WebP)
使い方: python test/build_face_art.py
"""
import io, os, re

NL = chr(10)
import numpy as np
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACES = r"C:\Users\newfa\instagram\renderer\assets\faces"
OUT = os.path.join(REPO, "src", "assets")
SRC_JSX = os.path.join(REPO, "src", "color_lab_stylist_v23.jsx")

BASE_FACE = "blube_summer.jpg"          # 設問イラストの土台(全問これ1枚 = 同一人物)
TYPE_FACE = {"spring": "iebe_spring_w.png", "summer": "blube_summer.jpg",
             "autumn": "iebe_autumn_w.png", "winter": "blube_winter.jpg"}

# 出力サイズ(表示は幅140px前後・DPR2想定)
OUT_W_FACE, OUT_W_PART, QUALITY = 280, 300, 74
BG = (236, 236, 236)                     # 設問イラストの背景(無彩色グレー)

# 素材の実測値から決めた切り出し範囲(1080x1350 の元画像座標)
CROP_FACE = (55, 45, 1035, 1345)
CROP_EYE = (165, 425, 665, 665)
CROP_LIP = (270, 700, 570, 900)
CROP_NECK = (185, 780, 900, 1340)
IRIS = ((280, 553, 32), (527, 530, 32))  # (cx, cy, r) 左右の虹彩
CHEEK = ((252, 648, 132, 104), (588, 632, 132, 104))  # (cx, cy, rx, ry) 頬の赤みの範囲


# ───────── 色空間 ─────────
def srgb_to_lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    return np.where(c <= 0.0031308, c * 12.92,
                    1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055) * 255


def rgb2lab(arr):
    lin = srgb_to_lin(np.asarray(arr, dtype=float))
    R, G, B = lin[..., 0], lin[..., 1], lin[..., 2]
    X = (R * .4124 + G * .3576 + B * .1805) / .95047
    Y = R * .2126 + G * .7152 + B * .0722
    Z = (R * .0193 + G * .1192 + B * .9505) / 1.08883
    f = lambda t: np.where(t > 0.008856, np.cbrt(np.clip(t, 0, None)), 7.787 * t + 16 / 116)
    fx, fy, fz = f(X), f(Y), f(Z)
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], axis=-1)


def lab2rgb(lab):
    L, A, Bb = lab[..., 0], lab[..., 1], lab[..., 2]
    fy = (L + 16) / 116; fx = fy + A / 500; fz = fy - Bb / 200
    g = lambda t: np.where(t ** 3 > 0.008856, t ** 3, (t - 16 / 116) / 7.787)
    X, Y, Z = g(fx) * .95047, g(fy), g(fz) * 1.08883
    R = X * 3.2406 + Y * -1.5372 + Z * -0.4986
    G = X * -0.9689 + Y * 1.8758 + Z * 0.0415
    B = X * 0.0557 + Y * -0.2040 + Z * 1.0570
    return np.clip(lin_to_srgb(np.stack([R, G, B], -1)), 0, 255)


def hex2rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)


# ───────── 素材の読み込みとマスク ─────────
def load(name):
    im = Image.open(os.path.join(FACES, name))
    if im.mode == "RGBA":                       # 透過素材は白地に合成(_w版と同じ状態にする)
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        im = bg
    return np.asarray(im.convert("RGB")).astype(float)


def masks(a):
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(2), a.min(2)
    sat = mx - mn
    H, W, _ = a.shape
    Y, X = np.mgrid[0:H, 0:W]
    m = {}
    m["bg"] = mn >= 250
    m["line"] = mx < 130
    m["skin"] = (mx >= 205) & (R >= G) & (G >= B) & (sat <= 48) & (R - B >= 6)
    m["cloth"] = (G > R + 8) & (G > B + 4) & (sat > 20)
    m["hair"] = (sat <= 45) & (mx >= 120) & (mx < 215) & (R >= G) & (G >= B - 6) & ~m["cloth"]
    m["lips"] = (R >= 200) & (R - G >= 45) & (R - B >= 45) & (Y > 720)
    # 頬の赤み: 肌のうち R-G が浮いている分だけを、連続値の強さ(alpha)として扱う
    cheek = np.zeros((H, W), bool)
    for cx, cy, rx, ry in CHEEK:
        cheek |= (((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1.0)
    m["blush_a"] = np.clip((R - G - 10) / 16.0, 0, 1) * m["skin"] * cheek
    iris = np.zeros((H, W), bool)
    for cx, cy, r in IRIS:
        iris |= ((X - cx) ** 2 + (Y - cy) ** 2 <= r * r)
    m["iris"] = iris & (mx < 200)
    return m


def recolor(a, mask, target_hex, keep=1.0):
    """mask の平均色が target になるよう Lab を平行移動する。L* の相対差(陰影)は保つ。
    白・黒など端の色では L* が飽和するので、収まる範囲まで陰影の振幅だけを圧縮する。"""
    if mask.sum() == 0:
        return a
    lab = rgb2lab(a[mask])
    mean = lab.mean(axis=0)
    tgt = rgb2lab(hex2rgb(target_hex))
    dL = lab[:, 0] - mean[0]
    hi, lo = float(dL.max()), float(dL.min())
    s = keep
    if tgt[0] + hi > 99:
        s = min(s, (99 - tgt[0]) / max(hi, 1e-6))
    if tgt[0] + lo < 6:
        s = min(s, (tgt[0] - 6) / max(-lo, 1e-6))
    out = a.copy()
    new = np.stack([tgt[0] + dL * s,
                    lab[:, 1] + (tgt[1] - mean[1]),
                    lab[:, 2] + (tgt[2] - mean[2])], -1)
    out[mask] = lab2rgb(new)
    return out


def tint(a, alpha, target_hex, strength=1.0):
    """alpha(0..1) の強さで target 色を重ねる。頬の赤みのような柔らかい面に使う。"""
    t = hex2rgb(target_hex)
    w = (alpha * strength)[..., None]
    return a * (1 - w) + t * w


def mean_hex(a, mask):
    """マスク内の平均色。狙った色に寄っているかの実測に使う。"""
    v = a[mask].mean(axis=0)
    return "#%02X%02X%02X" % tuple(int(round(c)) for c in v), rgb2lab(v)


def flatten_bg(a, m):
    out = a.copy()
    out[m["bg"]] = BG
    return out


def content_box(a, m, ar=980.0 / 1300.0, pad=14):
    """素材ごとに構図が違うので、白背景でない範囲(=絵の中身)から 3:4 の切り出し枠を作る。"""
    H, W, _ = a.shape
    ys, xs = np.nonzero(~m["bg"])
    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad)
    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad)
    w, h = x1 - x0, y1 - y0
    if w / h > ar:                      # 横に広い → 高さを伸ばす(下方向は服なので下に寄せる)
        nh = w / ar
        y1 = min(H, y0 + nh); y0 = max(0, y1 - nh)
    else:                               # 縦に長い → 幅を中央合わせで広げる
        nw = h * ar
        cx = (x0 + x1) / 2
        x0, x1 = max(0, cx - nw / 2), min(W, cx + nw / 2)
    return (int(x0), int(y0), int(x1), int(y1))


def save(a, box, path, out_w, m=None):
    arr = flatten_bg(a, m) if m is not None else a
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).crop(box)
    w, h = im.size
    im = im.resize((out_w, max(1, round(h * out_w / w))), Image.LANCZOS)
    im.save(path, "WEBP", quality=QUALITY, method=6)
    return im.size, os.path.getsize(path)


# ───────── 設問データ(色の出所)を jsx から読む ─────────
def read_illust_colors():
    src = io.open(SRC_JSX, encoding="utf-8").read()
    i = src.find("const Q12 = [")
    block = src[i:src.find("\n];", i)]
    out = []
    for line in block.split("\n"):
        m = re.search(r"illust:\s*\{\s*kind:", line)
        if not m:
            continue
        raw = line[m.start():]
        kind = re.search(r'kind:\s*"([^"]+)"', raw).group(1)

        def side(tag):
            s = re.search(tag + r":\s*\{(.*?)\}", raw, re.S)
            body = s.group(1)
            d = dict(re.findall(r'(\w+):\s*"(#[0-9A-Fa-f]{6})"', body))
            cols = re.search(r"colors:\s*\[(.*?)\]", raw[raw.find(tag):])
            if cols and "colors" in body:
                d["colors"] = re.findall(r'"(#[0-9A-Fa-f]{6})"', cols.group(1))
            return d

        out.append({"kind": kind, "left": side("left"), "right": side("right")})
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    Q = read_illust_colors()
    assert len(Q) == 13, "Q12 の illust を13問ぶん読めていない: %d" % len(Q)
    base = load(BASE_FACE)
    m = masks(base)
    report, measure = [], []

    def check(name, arr, mask, target):
        """指定した色に実際どこまで寄ったかを記録する(申告ではなく実測で出す)。"""
        got, glab = mean_hex(arr, mask)
        tlab = rgb2lab(hex2rgb(target))
        d = float(((glab - tlab) ** 2).sum() ** 0.5)
        measure.append((name, target, got, d))

    def emit(name, arr, box, w=OUT_W_FACE):
        px, by = save(arr, box, os.path.join(OUT, name + ".webp"), w, m)
        report.append((name, "%dx%d" % px, by))

    def skin_face(hexv):
        return recolor(base, m["skin"], hexv)

    # Q1 肌の色み / Q6 日焼け ─ 肌だけ差し替え
    for q, keys in ((0, "cq01"), (5, "cq06")):
        for side, tag in (("left", "a"), ("right", "b")):
            arr = skin_face(Q[q][side]["skin"])
            check(keys + "_" + tag + " 肌", arr, m["skin"], Q[q][side]["skin"])
            emit(keys + "_" + tag, arr, CROP_FACE)

    # Q2 印象 / Q7 似合う色の傾向 ─ 服の色だけ差し替え(色はチップの1つ目/2つ目)
    for q, keys, idx in ((1, "cq02", 0), (6, "cq07", 1)):
        for side, tag in (("left", "a"), ("right", "b")):
            c = Q[q][side]["colors"][idx]
            arr = recolor(base, m["cloth"], c)
            check(keys + "_" + tag + " 服", arr, m["cloth"], c)
            emit(keys + "_" + tag, arr, CROP_FACE)

    # Q3 瞳 ─ 虹彩だけ差し替え(目元のアップ)
    for side, tag in (("left", "a"), ("right", "b")):
        c = Q[2][side]["iris"]
        arr = recolor(base, m["iris"], c)
        check("cq03_" + tag + " 瞳", arr, m["iris"], c)
        emit("cq03_" + tag, arr, CROP_EYE, OUT_W_PART)

    # Q4 すっぴんの唇 / Q12 リップ ─ 唇だけ差し替え(口元のアップ)
    for q, keys in ((3, "cq04"), (11, "cq12")):
        for side, tag in (("left", "a"), ("right", "b")):
            c = Q[q][side]["lip"]
            arr = recolor(base, m["lips"], c)
            check(keys + "_" + tag + " 唇", arr, m["lips"], c)
            emit(keys + "_" + tag, arr, CROP_LIP, OUT_W_PART)

    # Q8 黒を着たとき ─ 服は黒で固定し、肌の見え方の違いを出す
    for side, tag in (("left", "a"), ("right", "b")):
        v = Q[7][side]
        arr = recolor(skin_face(v["skin"]), m["cloth"], v["top"])
        check("cq08_" + tag + " 服", arr, m["cloth"], v["top"])
        check("cq08_" + tag + " 肌", arr, m["skin"], v["skin"])
        emit("cq08_" + tag, arr, CROP_FACE)
    # Q9 白の比較 ─ 白トップスの色みだけ差し替え
    for side, tag in (("left", "a"), ("right", "b")):
        c = Q[8][side]["color"]
        arr = recolor(base, m["cloth"], c)
        check("cq09_" + tag + " 服", arr, m["cloth"], c)
        emit("cq09_" + tag, arr, CROP_FACE)

    # Q10 金属 ─ 首元。金/銀のアクセは表示側で SVG を重ねるので、素材は1枚だけ
    emit("cq10_neck", base, CROP_NECK, OUT_W_PART)

    # Q11 頬の赤み ─ 肌を差し替えたうえで、頬の赤みだけ指定色に寄せる
    for side, tag in (("left", "a"), ("right", "b")):
        v = Q[10][side]
        arr = tint(skin_face(v["skin"]), m["blush_a"], v["cheek"], 0.75)
        check("cq11_" + tag + " 頬", arr, m["blush_a"] > 0.6, v["cheek"])
        emit("cq11_" + tag, arr, CROP_FACE)

    # Q13 ヘアカラー ─ 髪だけ差し替え
    for side, tag in (("left", "a"), ("right", "b")):
        c = Q[12][side]["hair"]
        arr = recolor(base, m["hair"], c)
        check("cq13_" + tag + " 髪", arr, m["hair"], c)
        emit("cq13_" + tag, arr, CROP_FACE)

    # 同点時の設問 + 結果画面のタイプ別イラスト ─ 4タイプの既存素材をそのまま(色は無加工)
    for t, f in TYPE_FACE.items():
        a2 = load(f)
        m2 = masks(a2)
        px, by = save(a2, content_box(a2, m2), os.path.join(OUT, "cface_%s.webp" % t), 320, m2)
        report.append(("cface_%s" % t, "%dx%d" % px, by))

    total = 0
    print("--- 出力 (%s) ---" % OUT)
    for n, px, by in report:
        print("  %-14s %-9s %6.1fKB" % (n + ".webp", px, by / 1024))
        total += by
    print("  合計 %d点 / %.1fKB" % (len(report), total / 1024))

    # ── 実測表: 設問データの色に、実際どこまで寄ったか(ΔEab)。申告ではなく測って出す ──
    lines = ["設問イラストの色の実測（目標=Q12[].illust の HEX / 実測=生成画像の該当領域の平均色）", ""]
    lines.append("%-18s %-9s %-9s %s" % ("対象", "目標", "実測", "ΔEab"))
    for n, t, g, d in measure:
        lines.append("%-18s %-9s %-9s %.1f" % (n, t, g, d))
    worst = max(measure, key=lambda r: r[3])
    lines += ["", "最大ΔEab = %.1f (%s)" % (worst[3], worst[0]),
              "※ ΔEab は CIE76。頬(cq11)は肌の上に半透明で重ねるため、他より大きくなる。"]
    out_txt = os.path.join(REPO, "test", "screenshots", "40_illust_measure.txt")
    os.makedirs(os.path.dirname(out_txt), exist_ok=True)
    io.open(out_txt, "w", encoding="utf-8").write(NL.join(lines) + NL)
    print(NL.join(lines))


if __name__ == "__main__":
    main()
