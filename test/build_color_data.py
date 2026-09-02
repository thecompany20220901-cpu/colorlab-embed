# -*- coding: utf-8 -*-
"""結果画面(対象2)とコーデ提案(対象3)が使う色データを、既存データだけから機械生成する。

出所は3つとも color_lab_stylist_v23.jsx の中にある(新しい色は1つも作らない):
  (1) TYPES[t].palette10          … そのタイプの基本パレット(名前+HEX)
  (2) COLOR_CHECK[].r[t] が ◎/○  … 24色×4タイプの相性表(名前+HEX)
  (3) NG_COLORS[t][].alt          … 苦手色の置き換え先(=そのタイプの勝ち色)
  (4) STYLING_DATA の勝ち色チップ … 名前だけで HEX を持たないので、
                                    「基準色 + 修飾語」の規則で機械的に解く

英名はプロ資料「120 personal color LIST」(629514330358415396.jpg)の表記に準拠する。
資料に無い色名だけ、一般的なカラーネームの慣用表記を当てる(EN_SRC の "std" 印)。

出力: src/color_data.js
使い方: python test/build_color_data.py
"""
import csv, io, json, os, re, colorsys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_JSX = os.path.join(REPO, "src", "color_lab_stylist_v23.jsx")
OUT_JS = os.path.join(REPO, "src", "color_data.js")
ITEM_CSV = {"blubel": r"C:\Users\newfa\Downloads\item_blubel (5).csv",
            "iebel": r"C:\Users\newfa\Downloads\item_iebel (2).csv"}
TYPES = ["spring", "summer", "autumn", "winter"]
TARGET = 30            # プロ資料の1シーズン30色に合わせた上限
ORDER = ["ピンク系", "レッド系", "オレンジ・コーラル系", "イエロー系",
         "グリーン系", "ブルー系", "パープル系", "ベーシック"]

src = io.open(SRC_JSX, encoding="utf-8").read()


# ════════════════════════════════════════════
# 1. 既存データの取り出し
# ════════════════════════════════════════════
def block(marker, end="\n};"):
    i = src.find(marker)
    assert i > 0, marker
    return src[i:src.find(end, i)]


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

# STYLING_DATA のチップ(名前だけ)。勝ち色(w)は出現回数も数え、避けたい色(g)は名前だけ集める
# (g も結果画面に色チップで出すため、HEX の解決対象に含める)
sblock = block("const STYLING_DATA = {")
freq = {t: {} for t in TYPES}
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
        for name, _eff in re.findall(r'\["([^"]+)",\s*"([^"]+)"\]', mm.group(1)):
            if is_win:
                freq[t][name] = freq[t].get(name, 0) + 1
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
# 口紅色マスター(TRYON_LIPS)にも名前つきの既存 HEX がある
for n, h in re.findall(r'\{ name: "([^"]+)", hex: "(#[0-9A-Fa-f]{6})" \}', block("const TRYON_LIPS = {")):
    known.setdefault(n, h)


# ════════════════════════════════════════════
# 2. 色名 → HEX の解決器(基準色 + 修飾語)
# ════════════════════════════════════════════
def hex2rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def rgb2hex(r):
    return "#%02X%02X%02X" % tuple(max(0, min(255, int(round(v)))) for v in r)


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


chip_hex, unresolved = {}, []
for n in sorted(chip_names):
    h, _how = resolve(n)
    if h:
        chip_hex[n] = h
    else:
        unresolved.append(n)


# ════════════════════════════════════════════
# 3. 8つの色相ファミリーへの振り分け
# ════════════════════════════════════════════
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


families, report = {}, []
for t in TYPES:
    got = {}                                   # name -> [hex, mark]
    for n, h, r in cc:
        if r.get(t) in ("◎", "○"):
            got[n] = [h, "✓" if r[t] == "◎" else ""]
    for n, h in palette[t]:
        got.setdefault(n, [h, ""])
    for n, h in ngalt[t]:
        got.setdefault(n, [h, ""])
    n_core = len(got)
    for n, _c in sorted(freq[t].items(), key=lambda kv: -kv[1]):
        if len(got) >= TARGET:
            break
        if n in got or n not in chip_hex:
            continue
        got[n] = [chip_hex[n], ""]
    fams = {k: [] for k in ORDER}
    for n, (h, mk) in got.items():
        fams[family(n, h)].append([n, h, mk])
    for k in fams:
        fams[k].sort(key=lambda x: (x[2] != "✓", x[0]))
    families[t] = fams
    report.append("%-7s 合計%2d色 (中核%d + STYLING補完%d / ✓%d)  %s"
                  % (t, len(got), n_core, len(got) - n_core,
                     sum(1 for v in got.values() if v[1] == "✓"),
                     " / ".join("%s%d" % (k, len(fams[k])) for k in ORDER if fams[k])))


# ════════════════════════════════════════════
# 4. 英名(プロ資料準拠)
# ════════════════════════════════════════════
# ref = プロ資料「120 personal color LIST」に同じ色名が載っているもの(その表記をそのまま使う)
# std = 資料に無いので、一般的なカラーネームの慣用表記を当てたもの
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


def en_of(name):
    if name in EN_SRC:
        return EN_SRC[name][0]
    return None


need = sorted({n for t in TYPES for k in ORDER for n, _h, _m in families[t][k]})
missing = [n for n in need if not en_of(n)]

# ════════════════════════════════════════════
# 5. 商品画像(商品マスタ CSV の images1)
# ════════════════════════════════════════════
sku_ids = {}
sblk = block("const SKUS = {")
cur = None
for line in sblk.split("\n"):
    if re.match(r"\s*blubel:", line): cur = "blubel"
    elif re.match(r"\s*iebel:", line): cur = "iebel"
    m = re.search(r"id:\s*(\d+),", line)
    if m and cur:
        sku_ids.setdefault(cur, []).append(m.group(1))

sku_img = {}
for site, path in ITEM_CSV.items():
    want = set(sku_ids.get(site, []))
    got = {}
    with io.open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            i = (row.get("item_id") or "").strip()
            if i in want and (row.get("images1") or "").strip():
                got[i] = row["images1"].strip()
    sku_img[site] = got

# ════════════════════════════════════════════
# 6. 出力
# ════════════════════════════════════════════
def js(obj):
    return json.dumps(obj, ensure_ascii=False, indent=1)


head = """// 【自動生成】test/build_color_data.py が color_lab_stylist_v23.jsx と商品マスタから生成する。
// 手で編集しない。色は1つも新規に作っておらず、出所は次の4つだけ:
//   TYPES[].palette10 / COLOR_CHECK / NG_COLORS[].alt / STYLING_DATA の勝ち色チップ
// 英名はプロ資料「120 personal color LIST」の表記に準拠(資料に無い色名のみ慣用表記)。
"""
out = [head]
out.append("export const FAMILY_ORDER = %s;\n" % js(ORDER))
out.append("// タイプ別の勝ち色。[日本語名, HEX, ✓(COLOR_CHECK で ◎ の最優先色)]\n"
           "export const COLOR_FAMILIES = %s;\n" % js(families))
out.append("// 色名 → 英名(プロ資料準拠)\nexport const COLOR_EN = %s;\n"
           % js({n: en_of(n) for n in need if en_of(n)}))
out.append("// STYLING_DATA の色名 → HEX(既存HEX優先・無いものは基準色+修飾語で機械解決)\n"
           "export const CHIP_HEX = %s;\n" % js(chip_hex))
out.append("// 商品マスタ(item_blubel/iebel.csv)の images1\nexport const SKU_IMG = %s;\n" % js(sku_img))
io.open(OUT_JS, "w", encoding="utf-8").write("\n".join(out))

print("\n".join(report))
print("色名の解決: %d / %d (%.0f%%)" % (len(chip_hex), len(chip_names), 100 * len(chip_hex) / len(chip_names)))
print("  解決不可(抽象的な括りなので色を作らずそのまま文字で残す): %s" % (unresolved or "なし"))
print("英名: %d色ぶん / 未対応: %s" % (len(need) - len(missing), missing or "なし"))
for site in sku_img:
    print("商品画像 %s: %d / %d 件" % (site, len(sku_img[site]), len(sku_ids[site])))
print("→ %s" % OUT_JS)
