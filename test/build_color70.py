# -*- coding: utf-8 -*-
"""勝ち色70色シリーズ(4タイプ x 70色)を、既存データと既存の命名規則だけから機械生成する。

2026-09-06 方針確定(B案)。ライセンス配慮のため、外部のカラーチャート画像
(ラピス/ICPA/MARROW 等)からは色を1つも取らない。出所は次の3層だけ:

  S1 既存確定30色  … src/color_data.js の COLOR_FAMILIES(公開済み。並び順ごと固定)
  S2 既存データ由来 … build_color_data.py と同じ抽出
                      (TYPES[].palette10 / COLOR_CHECK / NG_COLORS[].alt /
                       STYLING_DATA の勝ち色チップ)。30色の上限で溢れていた分。
  S3 機械生成      … build_color_data.py の resolve() と同じ「基準色 + 修飾語」の
                      合成規則で作る。語彙は BASE / MOD のみ。新語は足さない。

S3 には次のゲートを全部通す(1つでも落ちたら不採用):
  G1 同系   … そのタイプの S1+S2 集合への最小ΔE <= CEIL。タイプの色域から出ない
  G2 識別   … 採用済み集合への最小ΔE >= 10。見分けがつかない色は入れない
  G3 undertone … L*a*b* 色相角が、そのタイプ自身の S1+S2 分布から出した窓に入る
  G4 トーン … L* と C* が、そのタイプ自身の S1+S2 分布から出した窓に入る
  G5 命名   … 修飾語と基準色の組み合わせが日本語として自然(NAMEABLE の許可表)。
              造語防止のため S3 は修飾語1語まで。

効果語は STYLING_DATA の勝ち色チップが実際に使っている語だけを、
トーン分類(明清色/純色/濁色/暗清色/無彩)ごとに割り当てる。新しい語は作らない。

出力: src/color70_data.js  /  test/_color70_review.csv
使い方: python test/build_color70.py
"""
import csv, io, json, os, re, colorsys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_JSX = os.path.join(REPO, "src", "color_lab_stylist_v23.jsx")
SRC_30 = os.path.join(REPO, "src", "color_data.js")
OUT_JS = os.path.join(REPO, "src", "color70_data.js")
OUT_CSV = os.path.join(REPO, "test", "_color70_review.csv")

TYPES = ["spring", "summer", "autumn", "winter"]
TYPE_JA = {"spring": "イエベ春", "summer": "ブルベ夏", "autumn": "イエベ秋", "winter": "ブルベ冬"}
TARGET = 70
DE_MIN = 10.0          # G2 識別しきい値(ユーザー確定: ΔE>=10 を維持)
CEIL = 26.0            # G1 同系しきい値
ORDER = ["ピンク系", "レッド系", "オレンジ・コーラル系", "イエロー系",
         "グリーン系", "ブルー系", "パープル系", "ベーシック"]

src = io.open(SRC_JSX, encoding="utf-8").read()


def block(marker, end="\n};"):
    i = src.find(marker)
    assert i > 0, marker
    return src[i:src.find(end, i)]


# ════════════════════════════════════════════
# 0. 色空間ユーティリティ(ΔE は CIE76)
# ════════════════════════════════════════════
def hex2rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def rgb2hex(r):
    return "#%02X%02X%02X" % tuple(max(0, min(255, int(round(v)))) for v in r)


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


def lch(h):
    L, a, b = hex2lab(h)
    import math
    C = (a * a + b * b) ** 0.5
    H = math.degrees(math.atan2(b, a)) % 360
    return L, C, H


# ════════════════════════════════════════════
# 1. 既存データの取り出し(build_color_data.py と同じ)
# ════════════════════════════════════════════
tblock = block("const TYPES = {")
palette = {}
for t in TYPES:
    m = re.search(r"\n  " + t + r":\s*\{.*?palette10:\s*\[(.*?)\]\s*,\s*ng:", tblock, re.S)
    assert m, "palette10 が引けない: " + t
    palette[t] = re.findall(r'\["([^"]+)","(#[0-9A-Fa-f]{6})"\]', m.group(1))

cc = []
for m in re.finditer(r'\{ name: "([^"]+)", hex: "(#[0-9A-Fa-f]{6})", r: \{ ([^}]+) \} \}',
                     block("const COLOR_CHECK = [", "\n];")):
    cc.append((m.group(1), m.group(2), dict(re.findall(r'(\w+): "(.)"', m.group(3)))))

ngb = block("const NG_COLORS = {")
ngalt, ngbad = {t: [] for t in TYPES}, {t: [] for t in TYPES}
for t in TYPES:
    i = ngb.find("\n  " + t + ": [")
    if i < 0:
        continue
    j = ngb.find("\n  ],", i)
    for m in re.finditer(r'\{ name: "([^"]+)", hex: "(#[0-9A-Fa-f]{6})", why: "([^"]+)", '
                         r'alt: \{ name: "([^"]+)", hex: "(#[0-9A-Fa-f]{6})" \} \}', ngb[i:j]):
        ngbad[t].append(m.group(1, 2, 3))
        ngalt[t].append((m.group(4), m.group(5)))

sblock = block("const STYLING_DATA = {")
freq = {t: {} for t in TYPES}
eff_vocab = {t: {} for t in TYPES}     # 効果語 -> 出現数(勝ち色のみ)
chip_names = set()
for m in re.finditer(r"\b([wg]):\s*\{", sblock):
    is_win = m.group(1) == "w"
    p = m.end() - 1
    d = 0
    for q in range(p, len(sblock)):
        if sblock[q] == "{":
            d += 1
        elif sblock[q] == "}":
            d -= 1
            if d == 0:
                break
    inner = sblock[p:q]
    for t in TYPES:
        mm = re.search(t + r":\s*\[(.*?)\]\s*(?:,\s*\w+:|\s*$)", inner, re.S)
        if not mm:
            continue
        for name, ef in re.findall(r'\["([^"]+)",\s*"([^"]+)"\]', mm.group(1)):
            if is_win:
                freq[t][name] = freq[t].get(name, 0) + 1
                eff_vocab[t][ef] = eff_vocab[t].get(ef, 0) + 1
            chip_names.add(name)

known = {}
for t in TYPES:
    for n, h in palette[t]:
        known.setdefault(n, h)
    for n, h in ngalt[t]:
        known.setdefault(n, h)
    for n, h, _w in ngbad[t]:
        known.setdefault(n, h)
for n, h, _r in cc:
    known.setdefault(n, h)
for n, h in re.findall(r'\{ name: "([^"]+)", hex: "(#[0-9A-Fa-f]{6})" \}', block("const TRYON_LIPS = {")):
    known.setdefault(n, h)


# ════════════════════════════════════════════
# 2. 命名規則(build_color_data.py から丸ごと引き写し。1文字も変えない)
# ════════════════════════════════════════════
BASE = {
    "ホワイト": "#FFFFFF", "白": "#FFFFFF", "黒": "#1A1A1A", "ブラック": "#1A1A1A",
    "グレー": "#9A9A9A", "グレイ": "#9A9A9A", "チャコール": "#4A4A50", "ネイビー": "#2A3A5C", "紺": "#2A3A5C",
    "ピンク": "#E58AA8", "レッド": "#C8283C", "赤": "#C8283C", "オレンジ": "#E8802E", "茶": "#8A5A3C", "ブラウン": "#8A5A3C",
    "ベージュ": "#D8C0A4", "イエロー": "#E8C63C", "黄": "#E8C63C", "グリーン": "#4E9E6A", "緑": "#4E9E6A",
    "ブルー": "#3E7FC1", "青": "#3E7FC1", "パープル": "#8A5AA8", "紫": "#8A5AA8", "ラベンダー": "#B9A6D8",
    "ローズ": "#C46A82", "モーヴ": "#A06A88", "プラム": "#8C4A66", "ボルドー": "#6E1F30", "ワイン": "#7A2038",
    "コーラル": "#F08878", "サーモン": "#F0937E", "ピーチ": "#F6B99E", "アプリコット": "#F0A868",
    "キャメル": "#C08A4E", "カーキ": "#8A8A52", "オリーブ": "#6E7040", "マスタード": "#D6A62E", "テラコッタ": "#B45A3C",
    "エメラルド": "#1F9E7E", "ミント": "#9FD8C4", "ターコイズ": "#3EB6BE", "アイボリー": "#F4EBD8",
    "クリーム": "#F6EFD8", "生成り": "#EFE6D2", "オークル": "#D8B48C", "グレージュ": "#C7BAB0",
    "スカイ": "#8FC4E8", "ペリウィンクル": "#8E9BD8", "ラズベリー": "#B32B55", "マゼンタ": "#C6247E",
    "シルバー": "#C6C8CC", "ゴールド": "#C9A227", "ブロンズ": "#9C6B3C", "カカオ": "#6B4A3A", "キャラメル": "#B07A46",
    "モス": "#5E6E44", "ティール": "#2E7A72", "エクリュ": "#E3D9C6", "ヘーゼル": "#A67C52",
    "チョコレート": "#4A2C20", "パンプキン": "#D2731E", "フューシャ": "#CE3D8E",
    "マロン": "#7A4A32", "ミルクティー": "#C4A484", "アッシュ": "#9A9AA0",
}
# 修飾語: (明度差, 彩度倍率, 色相シフト) 色相は +で黄み寄り / -で青み寄り
MOD = {
    "アイス": (+0.16, 0.45, -0.010), "ペール": (+0.16, 0.50, 0.0), "淡い": (+0.14, 0.55, 0.0), "淡": (+0.14, 0.55, 0.0),
    "ライト": (+0.12, 0.85, 0.0), "明るい": (+0.12, 1.0, 0.0), "ソフト": (+0.05, 0.62, 0.0),
    "グレイッシュ": (-0.02, 0.42, 0.0), "くすみ": (-0.05, 0.50, 0.0), "スモーキー": (-0.04, 0.45, 0.0),
    "ミディアム": (0.0, 1.0, 0.0), "ディープ": (-0.16, 1.05, 0.0), "ダーク": (-0.20, 0.95, 0.0), "暗い": (-0.20, 0.90, 0.0),
    "暗": (-0.18, 0.90, 0.0), "濃": (-0.14, 1.05, 0.0), "真っ": (-0.06, 1.0, 0.0), "純": (+0.04, 1.0, -0.006),
    "ビビッド": (-0.02, 1.55, 0.0), "ショッキング": (-0.02, 1.7, -0.010), "クリア": (+0.02, 1.35, 0.0),
    "ロイヤル": (-0.10, 1.35, 0.0), "ウォーム": (0.0, 1.0, +0.020), "クール": (0.0, 1.0, -0.020),
    "青み": (0.0, 1.0, -0.022), "黄み": (0.0, 1.0, +0.022), "オフ": (-0.03, 0.35, 0.0), "アッシュ": (-0.02, 0.35, -0.012),
    "深み": (-0.16, 1.05, 0.0),
}
NOISE = ["(控えめ)", "(冷)", "(暖)", "単体", "全般", "パステル", "トップス", "タートル", "リップ", "チーク", "髪", "系"]


def resolve(name):
    """既存 HEX があればそれを返す。無ければ基準色+修飾語で解く。解けなければ None。"""
    if name in known:
        return known[name], "既存HEX"
    t = name
    for n in NOISE:
        t = t.replace(n, "")
    mods, changed = [], True
    while changed:
        changed = False
        for k in sorted(MOD, key=len, reverse=True):
            if t.startswith(k) and len(t) > len(k):
                mods.append(k)
                t = t[len(k):]
                changed = True
                break

    def scan(text):
        f = []
        for k in sorted(BASE, key=len, reverse=True):
            p = text.find(k)
            if p >= 0 and not any(p < q + len(kk) and q < p + len(k) for kk, q in f):
                f.append((k, p))
        return f

    found = scan(t) or scan(name)
    if not found:
        return None, "解決不可"
    found.sort(key=lambda x: x[1])
    head = found[-1][0]
    if len(found) >= 2:                     # 複合名(プラムピンク)は最後が主役・前が色相の修飾
        a, b = hex2rgb(BASE[head]), hex2rgb(BASE[found[0][0]])
        rgb = [0.6 * x + 0.4 * y for x, y in zip(a, b)]
        base = "%s×%s" % (found[0][0], head)
    else:
        rgb = hex2rgb(BASE[head])
        base = head
    h, l, s = colorsys.rgb_to_hls(*[v / 255.0 for v in rgb])
    for m_ in mods:
        dl, ms, dh = MOD[m_]
        l += dl
        s *= ms
        h += dh
    out = [v * 255 for v in colorsys.hls_to_rgb(h % 1.0, max(0, min(1, l)), max(0, min(1, s)))]
    return rgb2hex(out), "基準色 %s + %s" % (base, "+".join(mods) if mods else "無修飾")


BY_NAME = [
    ("ベーシック", ("ホワイト", "白", "ブラック", "黒", "グレー", "グレイ", "ベージュ",
                    "アイボリー", "オフホワイト", "グレージュ", "ネイビー", "紺", "エクリュ",
                    "チャコール", "シルバー", "生成り", "クリーム")),
    ("ピンク系", ("ピンク", "ローズ", "モーヴ", "ラズベリー", "フューシャ", "マゼンタ")),
    ("レッド系", ("レッド", "赤", "ボルドー", "ワイン")),
    ("オレンジ・コーラル系", ("オレンジ", "コーラル", "サーモン", "アプリコット", "ピーチ",
                              "テラコッタ", "キャメル", "ブラウン", "茶", "ブロンズ", "カカオ",
                              "キャラメル", "パンプキン", "マロン", "オークル", "チョコレート",
                              "ミルクティー", "ヘーゼル")),
    ("イエロー系", ("イエロー", "黄", "マスタード", "ゴールド", "カーキ")),
    ("グリーン系", ("グリーン", "緑", "ミント", "オリーブ", "モス", "ターコイズ", "エメラルド", "ティール")),
    ("ブルー系", ("ブルー", "青", "水色", "スカイ", "ペリウィンクル")),
    ("パープル系", ("パープル", "紫", "ラベンダー", "ライラック", "バイオレット", "プラム")),
]


def family(name, hexv):
    for fam_, keys in BY_NAME:
        hit = [k for k in keys if k in name]
        if hit:
            # 末尾に近いキーほど主役の色相(例: ブルーグレー→グレー=ベーシック)
            if max(name.rfind(k) for k in hit) >= \
               max((name.rfind(k) for f2, ks in BY_NAME if f2 != fam_ for k in ks if k in name), default=-1):
                return fam_
    r, g, b = [int(hexv[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if s < 0.12 or l > 0.93 or l < 0.10:
        return "ベーシック"
    deg = h * 360
    if deg < 12 or deg >= 340: return "レッド系"
    if deg < 45: return "オレンジ・コーラル系"
    if deg < 70: return "イエロー系"
    if deg < 165: return "グリーン系"
    if deg < 255: return "ブルー系"
    if deg < 290: return "パープル系"
    return "ピンク系"


# ════════════════════════════════════════════
# 3. 英名(プロ資料準拠。build_color_data.py から丸ごと引き写し)
# ════════════════════════════════════════════
EN_SRC = {
    # ─ ベーシック ─
    "ホワイト": ("White", "std"), "ピュアホワイト": ("Pure White", "ref"), "純白": ("Pure White", "ref"),
    "青みオフ白": ("Cool Off White", "std"), "オフホワイト": ("Off White", "ref"),
    "アイボリー": ("Ivory", "ref"), "エクリュ": ("Ecru", "std"), "生成り": ("Natural White", "std"),
    "ベージュ": ("Beige", "std"), "ライトベージュ": ("Light Beige", "std"), "サンドベージュ": ("Sand Beige", "ref"),
    "グレージュ": ("Grayish Beige", "ref"), "ソフトグレー": ("Soft Gray", "std"), "グレー": ("Gray", "std"),
    "ミディアムグレー": ("Medium Gray", "std"), "ダークグレー": ("Dark Gray", "ref"),
    "クールグレー": ("Cool Gray", "std"), "アイシーグレー": ("Icy Gray", "std"),
    "ブルーグレー": ("Blue Gray", "std"), "チャコール": ("Charcoal Gray", "ref"),
    "チャコールグレー": ("Charcoal Gray", "ref"), "ネイビー": ("Navy Blue", "ref"),
    "ダークネイビー": ("Dark Navy", "std"), "ソフトネイビー": ("Soft Navy", "std"), "濃紺": ("Clear Navy", "ref"),
    "ブラック": ("Black", "ref"), "黒": ("Black", "ref"), "シルバー": ("Silver Gray", "ref"),
    "スモーキーグレー": ("Smoke Gray", "ref"), "ライトグレー": ("Light Gray", "std"),
    # ─ ピンク ─
    "ピンク": ("Pink", "std"), "ベビーピンク": ("Baby Pink", "std"), "アイスピンク": ("Icy Pink", "ref"),
    "パウダーピンク": ("Powder Pink", "ref"), "シェルピンク": ("Shell Pink", "ref"),
    "コーラルピンク": ("Coral Pink", "ref"), "サーモンピンク": ("Salmon Pink", "std"),
    "ローズピンク": ("Rose Pink", "ref"), "ローズ": ("Rose", "std"), "ローズミスト": ("Rose Mist", "std"),
    "ローズベージュ": ("Rose Beige", "ref"), "プラムピンク": ("Plum Pink", "std"),
    "モーヴ": ("Mauve", "std"), "ラズベリー": ("Raspberry", "std"), "ビビッドピンク": ("Vivid Pink", "std"),
    "ショッキングピンク": ("Shocking Pink", "ref"), "フューシャ": ("Fuchsia", "ref"),
    "マゼンタ": ("Magenta", "std"), "ピンクベージュ": ("Pink Beige", "ref"), "ディープローズ": ("Deep Rose", "ref"),
    # ─ レッド ─
    "レッド": ("Red", "std"), "深みレッド": ("Deep Red", "std"), "クリアレッド": ("Clear Red", "std"),
    "ソフトレッド": ("Soft Red", "std"), "ローズレッド": ("Rose Red", "std"), "チェリー": ("Cherry Red", "std"),
    "ワイン": ("Wine Red", "ref"), "ワインレッド": ("Wine Red", "ref"), "ボルドー": ("Bordeaux", "std"),
    "ブラウンレッド": ("Brown Red", "std"), "レンガ": ("Bake Brick", "ref"),
    # ─ オレンジ・ブラウン ─
    "オレンジ": ("Orange", "std"), "サンオレンジ": ("Sun Orange", "ref"), "アプリコット": ("Apricot", "std"),
    "ピーチ": ("Peach", "std"), "サーモン": ("Salmon", "ref"), "コーラル": ("Coral", "std"),
    "テラコッタ": ("Terracotta", "std"), "キャメル": ("Camel", "ref"), "キャラメル": ("Caramel", "ref"),
    "ブラウン": ("Brown", "std"), "ダークブラウン": ("Dark Brown", "ref"), "ブロンズ": ("Bronze", "std"),
    "カカオ": ("Cocoa", "ref"), "チョコレート": ("Chocolate Brown", "ref"), "ミルクティー": ("Milk Tea", "std"),
    "オークル": ("Ocher", "std"), "パンプキン": ("Pumpkin", "std"), "バーントオレンジ": ("Burn Orange", "ref"),
    # ─ イエロー ─
    "イエロー": ("Yellow", "std"), "ゴールデンイエロー": ("Golden Yellow", "std"),
    "マスタード": ("Mustard", "std"), "ゴールド": ("Gold", "ref"), "カーキ": ("Khaki", "std"),
    "レモンイエロー": ("Lemon Yellow", "ref"), "サフランイエロー": ("Saffron Yellow", "ref"),
    # ─ グリーン ─
    "グリーン": ("Green", "std"), "ライトグリーン": ("Light Green", "std"), "ミントグリーン": ("Mint Green", "ref"),
    "ミントホワイト": ("Mint White", "std"), "クリアグリーン": ("Clear Green", "std"),
    "オリーブ": ("Olive Green", "ref"), "モスグリーン": ("Moss Green", "ref"),
    "エメラルド": ("Emerald Green", "ref"), "明るいターコイズ": ("Turquoise", "std"),
    "ターコイズ": ("Turquoise", "std"), "ティールグリーン": ("Teal Green", "ref"),
    "ジェイドグリーン": ("Jade Green", "ref"),
    # ─ ブルー ─
    "水色": ("Aqua Blue", "ref"), "スカイブルー": ("Sky Blue", "ref"), "パウダーブルー": ("Powder Blue", "ref"),
    "ペールブルー": ("Pale Blue", "std"), "アイスブルー": ("Icy Blue", "ref"),
    "グレイッシュブルー": ("Grayish Blue", "std"), "ロイヤルブルー": ("Royal Blue", "ref"),
    "ペリウィンクル": ("Periwinkle", "std"), "ブルーホワイト": ("Blue White", "std"),
    "ミディアムブルー": ("Medium Blue", "ref"), "ダスクブルー": ("Dusk Blue", "ref"),
    "マリンネイビー": ("Marin Navy", "ref"), "インクブルー": ("Ink Blue", "ref"),
    # ─ パープル ─
    "パープル": ("Purple", "std"), "ラベンダー": ("Lavender", "ref"), "アイスラベンダー": ("Icy Lavender", "std"),
    "ワインパープル": ("Wine Purple", "std"), "アメジスト": ("Amethyst", "ref"),
    "スイートバイオレット": ("Sweet Violet", "ref"), "ロイヤルパープル": ("Royal Purple", "ref"),
    "プラム": ("Plum", "std"),
    # ─ 資料に無い複合色名(慣用表記) ─
    "ウォームグレー": ("Warm Gray", "ref"), "ウォームベージュ": ("Warm Beige", "std"),
    "ウォームホワイト": ("Warm White", "std"), "クリームアイボリー": ("Cream Ivory", "std"),
    "リッチアイボリー": ("Rich Ivory", "std"), "カーキブラウン": ("Khaki Brown", "std"),
    "キャメルブラウン": ("Camel Brown", "std"), "キャメルベージュ": ("Camel Beige", "std"),
    "ミディアムブラウン": ("Medium Brown", "std"), "ピーチピンク": ("Peach Pink", "std"),
    "ピーチ白": ("Peach White", "std"), "青みピンク": ("Blue Pink", "std"),
    "ブライトネイビー": ("Bright Navy", "std"), "ブリックレッド": ("Brick Red", "std"),
    "レンガ": ("Bake Brick", "ref"), "ボルドー(黄)": ("Warm Bordeaux", "std"),
    "ダークグレー(冷)": ("Cool Dark Gray", "std"), "チャコール(冷)": ("Cool Charcoal Gray", "std"),
}


# ════════════════════════════════════════════
# 4. S3 の候補空間(造語防止の許可表)
# ════════════════════════════════════════════
# 修飾語ごとに「その修飾語を頭に付けても日本語の色名として自然な基準色」を列挙する。
# ここに無い組み合わせは作らない。これが G5(命名ゲート)。
# 除外した修飾語: 淡い/淡/明るい/暗い/暗/濃/真っ/純/深み
#   … 形容詞そのままか、既存色名でしか使われない接頭辞。合成すると造語になる。
NAMEABLE = {
    "アイス":       ["ピンク", "ブルー", "グリーン", "ラベンダー", "グレー", "パープル", "ミント", "イエロー"],
    "ペール":       ["ピンク", "ブルー", "グリーン", "イエロー", "パープル", "ラベンダー", "オレンジ",
                     "ミント", "ローズ", "アプリコット"],
    "ライト":       ["ベージュ", "グレー", "ブルー", "グリーン", "ピンク", "ブラウン", "カーキ",
                     "オリーブ", "ターコイズ", "ラベンダー", "キャメル", "モーヴ", "ローズ"],
    "ソフト":       ["グレー", "ピンク", "ブルー", "グリーン", "ベージュ", "ネイビー", "パープル",
                     "レッド", "モーヴ", "ローズ", "イエロー"],
    "グレイッシュ": ["ブルー", "ピンク", "グリーン", "パープル", "ベージュ", "ラベンダー", "ローズ", "イエロー"],
    "くすみ":       ["ピンク", "ブルー", "グリーン", "パープル", "ベージュ", "オレンジ", "イエロー", "ローズ"],
    "スモーキー":   ["ピンク", "ブルー", "グレー", "グリーン", "パープル", "ベージュ", "ローズ"],
    "ミディアム":   ["ブルー", "グレー", "ブラウン", "ネイビー", "グリーン"],
    "ディープ":     ["ローズ", "グリーン", "ブルー", "レッド", "パープル", "ピンク", "ネイビー",
                     "ブラウン", "ティール", "オレンジ"],
    "ダーク":       ["ブラウン", "グレー", "グリーン", "ネイビー", "ブルー", "パープル", "レッド"],
    "ビビッド":     ["ピンク", "レッド", "ブルー", "グリーン", "オレンジ", "イエロー", "パープル"],
    "ショッキング": ["ピンク"],
    "クリア":       ["レッド", "グリーン", "ブルー", "ピンク", "イエロー", "オレンジ"],
    "ロイヤル":     ["ブルー", "パープル"],
    "ウォーム":     ["グレー", "ベージュ", "ピンク", "ブラウン"],
    "クール":       ["グレー", "ピンク", "ベージュ", "ブルー"],
    "青み":         ["ピンク", "レッド", "パープル", "グレー", "ベージュ"],
    "黄み":         ["グリーン", "ベージュ", "ピンク", "ホワイト"],
    "オフ":         ["ホワイト"],
    "アッシュ":     ["ブラウン", "グレー", "ピンク", "ベージュ", "ブルー", "グリーン", "パープル"],
}

# 複合色名(A+B)。resolve() が「最後が主役・前が色相の修飾」として解釈する。
# 日本語の色名として実在する並びだけを列挙する。
COMPOUND = [
    ("ローズ", "ベージュ"), ("ローズ", "ブラウン"), ("ローズ", "グレー"),
    ("ピンク", "ベージュ"), ("ピンク", "ブラウン"), ("ピンク", "グレー"),
    ("ブルー", "グレー"), ("ブルー", "グリーン"), ("グリーン", "グレー"),
    ("モーヴ", "ピンク"), ("モーヴ", "グレー"),
    ("ワイン", "レッド"), ("ワイン", "パープル"), ("ワイン", "ブラウン"),
    ("オリーブ", "グリーン"), ("モス", "グリーン"),
    ("カーキ", "ベージュ"), ("カーキ", "グリーン"), ("カーキ", "ブラウン"),
    ("サーモン", "ピンク"), ("コーラル", "ピンク"), ("ピーチ", "ピンク"),
    ("プラム", "パープル"), ("プラム", "ピンク"),
    ("ラベンダー", "グレー"), ("ラベンダー", "ピンク"),
    ("キャメル", "ベージュ"), ("キャメル", "ブラウン"),
    ("チョコレート", "ブラウン"), ("カカオ", "ブラウン"),
    ("ミント", "グリーン"), ("ターコイズ", "ブルー"), ("ターコイズ", "グリーン"),
    ("マスタード", "イエロー"), ("アプリコット", "オレンジ"),
    ("ゴールド", "ベージュ"), ("ゴールド", "ブラウン"), ("シルバー", "グレー"),
    ("テラコッタ", "ブラウン"), ("オークル", "ベージュ"), ("マロン", "ブラウン"),
    ("スカイ", "ブルー"), ("ペリウィンクル", "ブルー"), ("エメラルド", "グリーン"),
    ("ティール", "ブルー"), ("ティール", "グリーン"), ("アメジスト", "パープル"),
]
COMPOUND = [(a, b) for a, b in COMPOUND if a in BASE and b in BASE]

EN_MOD = {
    "アイス": "Icy", "ペール": "Pale", "ライト": "Light", "ソフト": "Soft",
    "グレイッシュ": "Grayish", "くすみ": "Dusty", "スモーキー": "Smoky",
    "ミディアム": "Medium", "ディープ": "Deep", "ダーク": "Dark", "ビビッド": "Vivid",
    "ショッキング": "Shocking", "クリア": "Clear", "ロイヤル": "Royal",
    "ウォーム": "Warm", "クール": "Cool", "青み": "Blue", "黄み": "Yellow",
    "オフ": "Off", "アッシュ": "Ash",
}
EN_BASE = {
    "ホワイト": "White", "白": "White", "黒": "Black", "ブラック": "Black",
    "グレー": "Gray", "グレイ": "Gray", "チャコール": "Charcoal Gray", "ネイビー": "Navy",
    "紺": "Navy", "ピンク": "Pink", "レッド": "Red", "赤": "Red", "オレンジ": "Orange",
    "茶": "Brown", "ブラウン": "Brown", "ベージュ": "Beige", "イエロー": "Yellow",
    "黄": "Yellow", "グリーン": "Green", "緑": "Green", "ブルー": "Blue", "青": "Blue",
    "パープル": "Purple", "紫": "Purple", "ラベンダー": "Lavender", "ローズ": "Rose",
    "モーヴ": "Mauve", "プラム": "Plum", "ボルドー": "Bordeaux", "ワイン": "Wine",
    "コーラル": "Coral", "サーモン": "Salmon", "ピーチ": "Peach", "アプリコット": "Apricot",
    "キャメル": "Camel", "カーキ": "Khaki", "オリーブ": "Olive", "マスタード": "Mustard",
    "テラコッタ": "Terracotta", "エメラルド": "Emerald", "ミント": "Mint",
    "ターコイズ": "Turquoise", "アイボリー": "Ivory", "クリーム": "Cream",
    "生成り": "Natural White", "オークル": "Ocher", "グレージュ": "Grayish Beige",
    "スカイ": "Sky", "ペリウィンクル": "Periwinkle", "ラズベリー": "Raspberry",
    "マゼンタ": "Magenta", "シルバー": "Silver", "ゴールド": "Gold", "ブロンズ": "Bronze",
    "カカオ": "Cocoa", "キャラメル": "Caramel", "モス": "Moss", "ティール": "Teal",
    "エクリュ": "Ecru", "ヘーゼル": "Hazel", "チョコレート": "Chocolate",
    "パンプキン": "Pumpkin", "フューシャ": "Fuchsia", "マロン": "Marron",
    "ミルクティー": "Milk Tea", "アッシュ": "Ash", "アメジスト": "Amethyst",
}


def parse_name(name):
    """resolve() と同じ手順で 色名 を (修飾語list, 基準色list) に分解する。"""
    t = name
    for n in NOISE:
        t = t.replace(n, "")
    mods, changed = [], True
    while changed:
        changed = False
        for k in sorted(MOD, key=len, reverse=True):
            if t.startswith(k) and len(t) > len(k):
                mods.append(k)
                t = t[len(k):]
                changed = True
                break
    f = []
    for text in (t, name):
        f = []
        for k in sorted(BASE, key=len, reverse=True):
            p_ = text.find(k)
            if p_ >= 0 and not any(p_ < q + len(kk) and q < p_ + len(k) for kk, q in f):
                f.append((k, p_))
        if f:
            break
    f.sort(key=lambda x: x[1])
    return mods, [k for k, _p in f]


def en_name(ja, mod=None, head=None, pre=None):
    """既存の EN_SRC に載っていればそれを最優先。無ければ英名を合成する。"""
    if ja in EN_SRC:
        return EN_SRC[ja][0], EN_SRC[ja][1]
    if head is None:
        mods, bases = parse_name(ja)
        if not bases:
            return "", "missing"
        parts = [EN_MOD[m] for m in mods if m in EN_MOD]
        parts += [EN_BASE[b] for b in bases if b in EN_BASE]
        if not parts:
            return "", "missing"
        return " ".join(parts), "gen"
    parts = []
    if mod:
        parts.append(EN_MOD[mod])
    if pre:
        parts.append(EN_BASE[pre])
    parts.append(EN_BASE[head])
    return " ".join(parts), "gen"


# ════════════════════════════════════════════
# 5. トーン分類と効果語(語彙は STYLING_DATA の勝ち色チップが実際に使う語だけ)
# ════════════════════════════════════════════
def tone_class(hexv):
    r, g, b = [v / 255.0 for v in hex2rgb(hexv)]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if s < 0.12:
        return "無彩"
    if l >= 0.72:
        return "明清色"
    if l <= 0.32:
        return "暗清色"
    if s >= 0.62:
        return "純色"
    return "濁色"


EFFECT = {
    "spring": {"明清色": ["明るい", "フレッシュ", "清潔感", "優しい"],
               "純色":   ["華やか", "元気", "血色", "可愛い"],
               "濁色":   ["なじむ", "柔らか", "穏やか", "落ち着き"],
               "暗清色": ["品格", "洗練", "誠実", "安定"],
               "無彩":   ["清潔", "調和", "堅実", "マナー"]},
    "summer": {"明清色": ["透明感", "清潔感", "涼しげ", "明るい"],
               "純色":   ["華やか", "血色", "可愛い", "自信"],
               "濁色":   ["上品", "柔らか", "穏やか", "大人可愛い"],
               "暗清色": ["品格", "知的", "洗練", "誠実"],
               "無彩":   ["清潔", "冷静", "控えめ", "マナー"]},
    "autumn": {"明清色": ["あたたかい", "なじむ", "血色", "安心"],
               "純色":   ["華やか", "元気", "印象的", "はっきり"],
               "濁色":   ["こなれ", "落ち着き", "上品", "大人"],
               "暗清色": ["深み", "高貴", "貫禄", "品格"],
               "無彩":   ["誠実", "安定", "清潔", "信頼"]},
    "winter": {"明清色": ["涼しげ", "清楚", "明るい", "爽やか"],
               "純色":   ["華やか", "目力", "個性", "印象的"],
               "濁色":   ["上品", "柔らか", "洗練", "落ち着き"],
               "暗清色": ["高貴", "冴える", "品格", "記憶に残る"],
               "無彩":   ["シャープ", "締まる", "誠実", "冷静"]},
}
# QAゲート: 効果語は必ず「そのタイプ自身の記事」が使っている語であること
for t in TYPES:
    for tc, words in EFFECT[t].items():
        for w in words:
            assert w in eff_vocab[t], "効果語が %s の実データに無い: %s" % (t, w)


# ════════════════════════════════════════════
# 6. S1(既存確定30色)の読み込み
# ════════════════════════════════════════════
s30 = io.open(SRC_30, encoding="utf-8").read()
i = s30.index("export const COLOR_FAMILIES")
j = s30.index("{", i)
d = 0
for e in range(j, len(s30)):
    if s30[e] == "{":
        d += 1
    elif s30[e] == "}":
        d -= 1
        if d == 0:
            break
CF30 = json.loads(s30[j:e + 1])

S1 = {t: [] for t in TYPES}
for t in TYPES:
    for fam in ORDER:
        for n, h, mk in CF30[t].get(fam, []):
            S1[t].append((n, h, mk))
for t in TYPES:
    assert len(S1[t]) == 30, "%s の既存色数が30ではない: %d" % (t, len(S1[t]))


# ════════════════════════════════════════════
# 7. S2(既存データ由来。30色の上限で溢れていた分)
# ════════════════════════════════════════════
chip_hex = {}
for n in sorted(chip_names):
    h, _how = resolve(n)
    if h:
        chip_hex[n] = h

S2 = {t: [] for t in TYPES}
for t in TYPES:
    have = {n for n, _h, _m in S1[t]}
    labs = [hex2lab(h) for _n, h, _m in S1[t]]
    pool = []
    for n, h, r in cc:
        if r.get(t) in ("◎", "○"):
            pool.append((n, h, "✓" if r[t] == "◎" else ""))
    for n, h in palette[t]:
        pool.append((n, h, ""))
    for n, h in ngalt[t]:
        pool.append((n, h, ""))
    for n, _c in sorted(freq[t].items(), key=lambda kv: -kv[1]):
        if n in chip_hex:
            pool.append((n, chip_hex[n], ""))
    for n, h, mk in pool:
        if n in have:
            continue
        L = hex2lab(h)
        if min(de(L, x) for x in labs) < DE_MIN:      # G2 識別ゲート
            continue
        have.add(n)
        labs.append(L)
        S2[t].append((n, h, mk))


# ════════════════════════════════════════════
# 8. S3(機械生成)
# ════════════════════════════════════════════
def compose(mod, head, pre=None):
    """resolve() と同じ経路で HEX を出す。名前は mod+pre+head の連結。"""
    ja = (mod or "") + (pre or "") + head
    h, how = resolve(ja)
    return ja, h, how


cands = {}                                   # 日本語名 -> (hex, mod, head, pre)
for mod, heads in NAMEABLE.items():
    for head in heads:
        ja, h, _how = compose(mod, head)
        if h:
            cands.setdefault(ja, (h, mod, head, None))
for pre, head in COMPOUND:
    ja, h, _how = compose(None, head, pre)
    if h:
        cands.setdefault(ja, (h, None, head, pre))

# 生成色は「そのタイプの勝ち色に最も近い」タイプにだけ配属する(G3)。
win_lab = {}
ng_lab = {}
for t in TYPES:
    win_lab[t] = [hex2lab(h) for _n, h, _m in S1[t] + S2[t]]
    ng_lab[t] = [hex2lab(h) for _n, h, _w in ngbad[t]] or None

S3 = {t: [] for t in TYPES}
stats = {t: {"cand": 0, "g1": 0, "g3": 0, "g3b": 0, "g2": 0} for t in TYPES}
taken_names = set()
for t in TYPES:
    taken_names |= {n for n, _h, _m in S1[t] + S2[t]}

scored = {t: [] for t in TYPES}
for ja, (h, mod, head, pre) in cands.items():
    if ja in taken_names:
        continue
    L = hex2lab(h)
    dmin = {t: min(de(L, x) for x in win_lab[t]) for t in TYPES}
    owner = min(TYPES, key=lambda t: dmin[t])
    stats[owner]["cand"] += 1
    if dmin[owner] > CEIL:                                   # G1 同系
        continue
    stats[owner]["g1"] += 1
    if sorted(dmin.values())[1] - dmin[owner] < 1.0:          # G3 帰属が曖昧なものは捨てる
        continue
    stats[owner]["g3"] += 1
    if ng_lab[owner] and min(de(L, x) for x in ng_lab[owner]) <= dmin[owner]:   # G3b 苦手色寄り
        continue
    stats[owner]["g3b"] += 1
    scored[owner].append((dmin[owner], ja, h, mod, head, pre))

for t in TYPES:
    labs = [hex2lab(h) for _n, h, _m in S1[t] + S2[t]]
    need = TARGET - len(S1[t]) - len(S2[t])
    for dm, ja, h, mod, head, pre in sorted(scored[t]):
        if len(S3[t]) >= need:
            break
        L = hex2lab(h)
        if min(de(L, x) for x in labs) < DE_MIN:              # G2 識別
            continue
        labs.append(L)
        stats[t]["g2"] += 1
        S3[t].append((ja, h, mod, head, pre))


# ════════════════════════════════════════════
# 9. 組み立て(色名 / HEX / 英名 / 効果語 / ファミリー / トーン / 出所)
# ════════════════════════════════════════════
rows = {t: [] for t in TYPES}
for t in TYPES:
    seq = ([(n, h, mk, "S1", None, None, None) for n, h, mk in S1[t]] +
           [(n, h, mk, "S2", None, None, None) for n, h, mk in S2[t]] +
           [(n, h, "", "S3", m, hd, pr) for n, h, m, hd, pr in S3[t]])
    for n, h, mk, tier, mod, head, pre in seq:
        fam = family(n, h)
        tc = tone_class(h)
        en, ensrc = en_name(n, mod, head, pre)
        rows[t].append({"name": n, "hex": h, "en": en, "en_src": ensrc,
                        "family": fam, "tone": tc, "mark": mk, "tier": tier,
                        "L": round(lch(h)[0], 1)})

# 効果語は (タイプ, トーン) ごとの定型リストを順番に割り当てる
for t in TYPES:
    cnt = {}
    for r in sorted(rows[t], key=lambda r: (ORDER.index(r["family"]), -r["L"], r["name"])):
        lst = EFFECT[t][r["tone"]]
        k = r["tone"]
        r["effect"] = lst[cnt.get(k, 0) % len(lst)]
        cnt[k] = cnt.get(k, 0) + 1

for t in TYPES:
    rows[t].sort(key=lambda r: (ORDER.index(r["family"]), -r["L"], r["name"]))


# ════════════════════════════════════════════
# 10. 検収(ここで落ちたら出力しない)
# ════════════════════════════════════════════
errs = []
for t in TYPES:
    if len(rows[t]) != TARGET:
        errs.append("%s: %d色(目標%d)" % (t, len(rows[t]), TARGET))
    labs = [(r["name"], hex2lab(r["hex"])) for r in rows[t]]
    for a in range(len(labs)):
        for b in range(a + 1, len(labs)):
            dd = de(labs[a][1], labs[b][1])
            if dd < DE_MIN:
                errs.append("%s: ΔE%.1f < %s  %s / %s" % (t, dd, DE_MIN, labs[a][0], labs[b][0]))
    names = [r["name"] for r in rows[t]]
    if len(set(names)) != len(names):
        errs.append("%s: 色名が重複" % t)
    for r in rows[t]:
        if r["effect"] not in eff_vocab[t]:
            errs.append("%s: 効果語が実データに無い %s" % (t, r["effect"]))

print("=" * 78)
for t in TYPES:
    c = {"S1": 0, "S2": 0, "S3": 0}
    for r in rows[t]:
        c[r["tier"]] += 1
    print("%-7s(%s)  計%2d  = 既存確定%2d + 既存データ由来%2d + 機械生成%2d   [候補%d→G1 %d→G3 %d→G3b %d→採用 %d]"
          % (t, TYPE_JA[t], len(rows[t]), c["S1"], c["S2"], c["S3"],
             stats[t]["cand"], stats[t]["g1"], stats[t]["g3"], stats[t]["g3b"], stats[t]["g2"]))
print("=" * 78)
if errs:
    print("!! 検収NG !!")
    for e_ in errs[:40]:
        print("   " + e_)
    raise SystemExit(1)
print("検収OK: 各70色 / 同一タイプ内の最小ΔE >= %s / 効果語は全て実データ由来" % DE_MIN)


# ════════════════════════════════════════════
# 11. 出力
# ════════════════════════════════════════════
out = [
    "// 【自動生成】test/build_color70.py が生成する。手で編集しない。",
    "// 勝ち色70色シリーズ(4タイプ x 70色)。2026-09-06 確定のB案。",
    "// 外部のカラーチャート画像からは色を1つも取っていない。出所は3層:",
    "//   S1 既存確定30色(src/color_data.js)",
    "//   S2 既存データ由来(TYPES[].palette10 / COLOR_CHECK / NG_COLORS[].alt / STYLING_DATA)",
    "//   S3 機械生成(既存の resolve() と同じ 基準色+修飾語 の合成規則。語彙は BASE/MOD のみ)",
    "// 同一タイプ内の任意の2色は ΔE(CIE76) >= %s。見分けがつかない色は入れていない。" % DE_MIN,
    "// 効果語は STYLING_DATA の勝ち色チップが実際に使う語だけを、トーン分類ごとに割り当てたもの。",
    "",
    "export const COLOR70_FAMILY_ORDER = " + json.dumps(ORDER, ensure_ascii=False, indent=1) + ";",
    "",
    "// [色名, HEX, 英名, 効果語, 色相ファミリー, トーン, 出所]",
    "export const COLOR70 = {",
]
for t in TYPES:
    out.append(' "%s": [' % t)
    for r in rows[t]:
        out.append('  ["%s","%s","%s","%s","%s","%s","%s"],'
                   % (r["name"], r["hex"], r["en"], r["effect"], r["family"], r["tone"], r["tier"]))
    out.append(" ],")
out.append("};")
io.open(OUT_JS, "w", encoding="utf-8").write("\n".join(out) + "\n")

with io.open(OUT_CSV, "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["type", "type_ja", "no", "tier", "family", "tone", "name", "hex", "en", "en_src", "effect", "L"])
    for t in TYPES:
        for k, r in enumerate(rows[t], 1):
            w.writerow([t, TYPE_JA[t], k, r["tier"], r["family"], r["tone"],
                        r["name"], r["hex"], r["en"], r["en_src"], r["effect"], r["L"]])
print("→ %s" % OUT_JS)
print("→ %s" % OUT_CSV)
