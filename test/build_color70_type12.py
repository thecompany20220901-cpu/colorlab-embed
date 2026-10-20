# -*- coding: utf-8 -*-
"""勝ち色70色の12タイプ版を作る。出力: src/color70_type12_data.js
（2026-10-19 keisuke 指示「12タイプ別化 第2段」）

新しい色は1つも作らない。各12タイプが属する4タイプの COLOR70 から、次の2つを決めるだけ:
  ・一覧に出す色 … 12タイプの palette10（TYPE12_PALETTE から TYPE12_PALETTE_EXCLUDE を外したもの）への
                    最小ΔE が CEIL 以内の色。CEIL は test/build_color70.py の G1 同系しきい値と同じ 26.0
  ・✓（いちばん得意な色）… test/build_color70.py の pick_top6()（案C）を、palette10 だけ12タイプ版に替えて動かした6色。
                    在庫の多い順を先に見るので、CEIL の外の色が ✓ になることがある。その色も一覧に残す（✓ が消えないように）
                    夏・冬の6タイプだけは、ファミリー「オレンジ・コーラル系」「イエロー系」の色を ✓ の候補から外す
                    （2026-10-19 第4段 keisuke 指示。第3段の b>+5 は赤系まで外れたので差し替え）。春・秋には掛けない
色・名前・HEX・ファミリー・トーンはすべて COLOR70 のまま。ここでは行の選び方と ✓ だけを書き出す。
build_color70.py はトップレベルで src を書き換えるので import しない（必要な関数だけ写した）。
実行: python test/build_color70_type12.py
"""
import io, os, re, json, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_JSX = os.path.join(REPO, "src", "color_lab_stylist_v23.jsx")
OUT_JS = os.path.join(REPO, "src", "color70_type12_data.js")
TYPES = ["spring", "summer", "autumn", "winter"]
NUM2KEY = {"1": "spring", "2": "summer", "3": "autumn", "4": "winter"}
DE_MIN = 10.0   # build_color70.py と同じ（G2 識別しきい値）
CEIL = 26.0     # build_color70.py と同じ（G1 同系しきい値）
TOP6_N = 6
COLD_TYPES = ("summer", "winter")   # ✓ 候補からファミリーを外す4タイプ（＝夏・冬の12タイプ6つ）
TOP6_COLD_EXCLUDE_FAM = ("オレンジ・コーラル系", "イエロー系")   # 夏・冬の ✓ 候補に入れないファミリー

src =io.open(SRC_JSX, encoding="utf-8").read()
c70 = io.open(os.path.join(REPO, "src", "color70_data.js"), encoding="utf-8").read()


def block(marker, end="\n};"):
    i = src.find(marker)
    assert i > 0, marker
    return src[i:src.find(end, i) + len(end)]


def hex2rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def hex2lab(h):
    r, g, b = [v / 255.0 for v in hex2rgb(h)]
    f = lambda u: u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    r, g, b = f(r), f(g), f(b)
    X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
    Y = (r * 0.2126 + g * 0.7152 + b * 0.0722)
    Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
    g_ = lambda t: t ** (1.0 / 3) if t > 0.008856 else 7.787 * t + 16.0 / 116
    fx, fy, fz = g_(X), g_(Y), g_(Z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def de(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


# ── 入力 ──
color70 = {}
for t in TYPES:
    i = c70.index('"%s": [' % t)
    j = c70.index("\n ],", i)
    color70[t] = [json.loads(m.group(0)) for m in re.finditer(r'\[("[^"]*",?){8}\]', c70[i:j])]
    assert len(color70[t]) == 70, (t, len(color70[t]))

name12 = {}
for m in re.finditer(r'"(\d)-(\d)": "([^"]+)"', block("const TYPE12_NAME = {")):
    name12[m.group(3)] = NUM2KEY[m.group(1)]
pal12 = {}
for line in block("const TYPE12_PALETTE = {").split("\n"):
    m = re.match(r'\s*"([^"]+)": (.*)$', line)
    if not m:
        continue
    if m.group(2).startswith("[["):
        pal12[m.group(1)] = re.findall(r'\["([^"]+)", "(#[0-9A-Fa-f]{6})"\]', m.group(2))
    else:
        pal12[m.group(1)] = [(None, h) for h in re.findall(r'"(#[0-9A-Fa-f]{6})"', m.group(2))]
assert len(pal12) == 12 and all(len(v) == 10 for v in pal12.values())
exclude = {}
for m in re.finditer(r'"([^"]+)": \[([^\]]*)\]', block("const TYPE12_PALETTE_EXCLUDE = {")):
    exclude[m.group(1)] = re.findall(r'"([^"]+)"', m.group(2))
for n12, ex in exclude.items():
    names = [n for n, _ in pal12[n12]]
    assert all(x in names for x in ex), ("除外する色名が palette10 に無い", n12, ex)


def calc_pal(n12):
    return [(n, h) for n, h in pal12[n12] if n not in exclude.get(n12, [])]


# pick_top6 の在庫判定（build_color70.py と同じ材料）
SITE_OF = {"spring": "iebel", "autumn": "iebel", "summer": "blubel", "winter": "blubel"}
_sku = block("const SKUS = {")
sku_ids = {}
for site in ("blubel", "iebel"):
    i = _sku.index("\n  " + site + ": [")
    j = _sku.index("\n  ],", i)
    sku_ids[site] = re.findall(r"\bid:\s*(\d+)", _sku[i:j])
_sc = io.open(os.path.join(REPO, "src", "sku_color_data.js"), encoding="utf-8").read()
_sc = _sc[_sc.index("export const SKU_COLORS ="):]
sku_colors = json.loads(re.sub(r",(\s*[}\]])", r"\1", _sc[_sc.index("{"):_sc.rindex("}") + 1]))
alias = {}
for m in re.finditer(r'"([^"]+)":\s*\[([^\]]*)\]', block("const MASTER_COLOR_ALIAS = {")):
    alias[m.group(1)] = re.findall(r'"([^"]+)"', m.group(2))


def sku_count(t, name):
    site = SITE_OF[t]
    return sum(1 for sid in sku_ids[site]
               if any(name in alias.get(c, []) for c in (sku_colors.get(site, {}) or {}).get(str(sid), [])))


def pick_top6(t, pal, ex_fam=()):
    """build_color70.py の pick_top6() と同じ手順。違うのは基準の palette10 と、
    ex_fam に挙げたファミリーの色を候補に入れないことだけ。"""
    rows = color70[t]
    ref = [hex2lab(h) for _, h in pal]
    info = []
    for i, r in enumerate(rows):
        if r[4] in ex_fam:
            continue
        d = min(de(hex2lab(r[1]), q) for q in ref)
        info.append({"i": i, "d": d, "fam": r[4], "n": sku_count(t, r[0])})
    by_stock = sorted(info, key=lambda x: (-x["n"], x["d"], x["i"]))
    by_de = sorted(info, key=lambda x: (x["d"], x["i"]))
    picked, used = [], set()

    def distinct(i):
        li = hex2lab(rows[i][1])
        return all(de(li, hex2lab(rows[j][1])) >= DE_MIN for j in picked)

    for x in by_stock:                          # ① 在庫の多い順・1ファミリー1色
        if len(picked) >= TOP6_N:
            break
        if x["n"] == 0 or x["fam"] in used or not distinct(x["i"]):
            continue
        picked.append(x["i"]); used.add(x["fam"])
    for x in by_de:                             # ② 残り枠は未使用ファミリーから
        if len(picked) >= TOP6_N:
            break
        if x["i"] in picked or x["fam"] in used or not distinct(x["i"]):
            continue
        picked.append(x["i"]); used.add(x["fam"])
    for x in by_de:                             # ③ それでも足りなければ ΔE順
        if len(picked) >= TOP6_N:
            break
        if x["i"] in picked or not distinct(x["i"]):
            continue
        picked.append(x["i"])
    return set(picked)


# 検算: 4タイプの palette10 で動かすと、いまの COLOR70 の ✓ がそのまま出ること（写し間違いの検出）
tblock = block("const TYPES = {")
for t in TYPES:
    m = re.search(r"\n  " + t + r":\s*\{.*?palette10:\s*\[(.*?)\]\s*,\s*ng:", tblock, re.S)
    p4 = re.findall(r'\["([^"]+)","(#[0-9A-Fa-f]{6})"\]', m.group(1))
    assert pick_top6(t, p4) == {i for i, r in enumerate(color70[t]) if r[7] == "✓"}, ("✓ が再現できない", t)

# ── 出力 ──
out = [
    "// 【自動生成】test/build_color70_type12.py が生成する。手で編集しない。",
    "// 勝ち色70色の12タイプ版（2026-10-19）。色は COLOR70 のものだけで、新しい色は作っていない。",
    "//   一覧 … 12タイプの palette10（TYPE12_PALETTE − TYPE12_PALETTE_EXCLUDE）への最小ΔE(CIE76) <= %s の色" % CEIL,
    "//          ＋ ✓ の色（✓ が一覧から消えないように残す）",
    "//   ✓   … build_color70.py の pick_top6()（案C）を palette10 だけ12タイプ版に替えて動かした6色",
    "//          夏・冬の6タイプは %s の色を ✓ の候補から外している（春・秋は外さない）" % "・".join(TOP6_COLD_EXCLUDE_FAM),
    "// [色名, ✓]。色名は 4タイプの COLOR70 の行を指す（HEX・英名・ファミリー等はそちらから引く）。並びは COLOR70 と同じ。",
    "export const COLOR70_TYPE12 = {",
]
report = []
for n12, t in name12.items():
    labs = [hex2lab(h) for _, h in calc_pal(n12)]
    mark = pick_top6(t, calc_pal(n12), TOP6_COLD_EXCLUDE_FAM if t in COLD_TYPES else ())
    rows = []
    for i, r in enumerate(color70[t]):
        d = min(de(hex2lab(r[1]), q) for q in labs)
        if d <= CEIL or i in mark:
            rows.append((r[0], "✓" if i in mark else "", d))
    assert sum(1 for r in rows if r[1]) == TOP6_N, n12
    out.append(' "%s": [' % n12)
    for n, mk, _ in rows:
        out.append('  ["%s","%s"],' % (n, mk))
    out.append(" ],")
    report.append("%s(%s): %d色 / ✓ %s / CEIL外の✓ %s" % (
        n12, t, len(rows), "・".join(n for n, mk, _ in rows if mk),
        "・".join("%s(ΔE%.1f)" % (n, d) for n, mk, d in rows if mk and d > CEIL) or "なし"))
out.append("};")
io.open(OUT_JS, "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
sys.stdout.reconfigure(encoding="utf-8")   # Windows の既定 cp932 では ✓ が出せない
print("\n".join(report))
print("wrote " + OUT_JS)
