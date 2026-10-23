"""NGカラー診断の「置き換えカラーの服はコレ」を12タイプ別に選ぶ。出力: src/ng_products12_data.js

v1.22.13（2026-10-23 keisuke 指定）
  候補   … 12タイプのタグ（{site}_pc12_tags_v1.csv の pc12_types）にそのタイプが付いた商品で、
           商品マスタ（item_{site}.csv）の stock == true かつ hide != true のもの
  服の種類 … 顔まわりの服だけ（category_id の先頭が 1=ワンピース / 3=ニット/カーディガン / 4=シャツ/ブラウス / 9=Tシャツ/スウェット）
  NG色   … そのタイプの NG_COLORS_12 の4色に当たる色の商品は外す。判定は下の NG_WORDS（NG色名 → 商品の色名に含まれる語）。
           商品の色が複数あるときは、1色でも当たれば外す
  並び順  … 商品マスタの display（1=売れ筋 2=好調 3=新作 4=その他・空や9999は最後）の小さい順 → 同じなら item_id の大きい順
  割り当て … 同じ商品を2つのタイプで使わない。候補が少ないタイプから先に3点ずつ決める
  3点に満たないタイプは足りない分を埋めない（件数を出力して報告する）

タグの呼び名とアプリの12タイプ名が違うものは TYPE_ALIAS で読み替える（ライトサマー→ブライトサマー / クリアウィンター→ブライトウィンター）。
実行: python test/build_ng_products12.py
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DL = Path(r"C:\Users\newfa\Downloads")
TAG_CSV = {"blubel": DL / "blubel_pc12_tags_v1.csv", "iebel": DL / "iebel_pc12_tags_v1.csv"}
ITEM_CSV = {"blubel": DL / "item_blubel (8).csv", "iebel": DL / "item_iebel (7).csv"}
CATEGORY_CSV = {"blubel": DL / "category_blubel (5).csv", "iebel": DL / "category_iebel (1).csv"}
OUT = ROOT / "src" / "ng_products12_data.js"

TYPE_ALIAS = {"ライトサマー": "ブライトサマー", "クリアウィンター": "ブライトウィンター"}
SITE_OF = {
    "ブライトサマー": "blubel", "ソフトサマー": "blubel", "クールサマー": "blubel",
    "ディープウィンター": "blubel", "クールウィンター": "blubel", "ブライトウィンター": "blubel",
    "ライトスプリング": "iebel", "ブライトスプリング": "iebel", "ウォームスプリング": "iebel",
    "ウォームオータム": "iebel", "ソフトオータム": "iebel", "ディープオータム": "iebel",
}
FACE_CATS = {"1", "3", "4", "9"}
PICK = 3
# NG色名 → 商品の色名にこの語（正規表現）が含まれていたら外す（2026-10-23 keisuke 承認の表）
NG_WORDS = {
    "真っ黒": ["ブラック", "黒", "グラック"],
    "マスタード": ["マスタード"],
    "ダークブラウン": ["ダークブラウン", "ブラウン", "モカ", "あずき"],
    "カーキ": ["カーキ", "オリーブ"],
    "ビビッドオレンジ": ["オレンジ"],
    "オレンジ": ["オレンジ"],
    "ビビッドレッド": ["^レッド", "赤"],
    "ブライトイエロー": ["^イエロー"],
    "テラコッタ": ["テラコッタ"],
    "パステルピンク": ["ライトピンク", "^ピンク"],
    "ベビーブルー": ["ライトブルー", "淡いブルー"],
    "ミントグリーン": ["ミントグリーン", "ライトグリーン", "パステルグリーン"],
    "くすみベージュ": ["ベージュ"],
    "オレンジブラウン": ["キャメル", "キャラメル"],
    "モスグリーン": ["カーキ", "オリーブ", "ダークグリーン"],
    "ベージュ": ["ベージュ"],
    "ダスティピンク": ["ダスティピンク", "ダースティピンク"],
    "グレージュ": ["グレージュ"],
    "ダークネイビー": ["ネイビー"],
    "ネイビー": ["ネイビー"],
    "ボルドー": ["ボルドー", "ワインレッド"],
    "チャコールグレー": ["チャコールグレー", "ダークグレー"],
    "くすみグレー": ["グレー"],
    "ダスティローズ": ["ダスティピンク", "ダースティピンク"],
    "青みピンク": ["^ピンク", "ホットピンク", "ショッキングピンク"],
    "ライトグレー": ["ライトグレー"],
    "ビビッドブルー": ["^ブルー"],
    "純白": ["ホワイト"],
    "ビビッドピンク": ["ホットピンク", "ショッキングピンク"],
    "ラベンダー": ["ラベンダー"],
}


def read_csv(p):
    with open(p, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def ng_names_from_src():
    """NG_COLORS_12 の各タイプの NG色名（正本は src。ここでは名前だけ読む）"""
    src = (ROOT / "src" / "color_lab_stylist_v23.jsx").read_text(encoding="utf-8")
    i = src.index("export const NG_COLORS_12 = {")
    block = src[i:src.index("\n};", i)]
    out = {}
    for m in re.finditer(r'^  "([^"]+)": \[\n(.*?)^  \],', block, re.S | re.M):
        out[m.group(1)] = re.findall(r'^    \{ name: "([^"]+)", hex:', m.group(2), re.M)
    return out


def clean_name(name):
    # 先頭の「ブルベ夏/ブルベ冬服　」等（〜服＋空白）を外す（既存 SKUS の表示名と同じ形）
    return re.sub(r"^\S*服[\s\u3000]+", "", name).strip()


def ng_hits(colors, ngs):
    return [f"{n}<{c}" for n in ngs for w in NG_WORDS[n] for c in colors if re.search(w, c)]


def main():
    ng = ng_names_from_src()
    assert sorted(ng) == sorted(SITE_OF), sorted(ng)
    missing = sorted({n for v in ng.values() for n in v} - set(NG_WORDS))
    assert not missing, "NG_WORDS に無い NG色名: " + " ".join(missing)

    cand = {t: [] for t in SITE_OF}
    stats = {t: {"tagged": 0, "live": 0, "face": 0, "ng_out": 0} for t in SITE_OF}
    for site in ("blubel", "iebel"):
        master = {r["item_id"]: r for r in read_csv(ITEM_CSV[site])}
        cat_name = {r["category_id"]: r["name"] for r in read_csv(CATEGORY_CSV[site])}
        for t in read_csv(TAG_CSV[site]):
            types = [TYPE_ALIAS.get(x, x) for x in t["pc12_types"].split("・") if x]
            m = master.get(t["item_id"])
            colors = [c.strip() for c in t["color"].split(",") if c.strip()]
            for ty in types:
                if SITE_OF.get(ty) != site:
                    continue
                st = stats[ty]
                st["tagged"] += 1
                if not m or m["stock"].strip().lower() != "true" or m["hide"].strip().lower() == "true":
                    continue
                st["live"] += 1
                first_cat = m["category_id"].split(",")[0].strip()
                if first_cat not in FACE_CATS:
                    continue
                st["face"] += 1
                if ng_hits(colors, ng[ty]):
                    st["ng_out"] += 1
                    continue
                disp = m["display"].strip()
                cand[ty].append({
                    "id": int(t["item_id"]),
                    "name": clean_name(m["name"]),
                    "price": int(m["price"]),
                    "cat": cat_name.get(first_cat, ""),
                    "img": m["images1"].strip(),
                    "colors": colors,
                    "display": int(disp) if disp.isdigit() else 9999,
                })

    for ty in cand:
        cand[ty].sort(key=lambda c: (c["display"], -c["id"]))
    used = set()
    picked = {}
    for ty in sorted(SITE_OF, key=lambda t: (len(cand[t]), list(SITE_OF).index(t))):
        site = SITE_OF[ty]
        got = [c for c in cand[ty] if (site, c["id"]) not in used][:PICK]
        for c in got:
            used.add((site, c["id"]))
        picked[ty] = got

    data = {ty: [{k: c[k] for k in ("id", "name", "price", "cat", "img")} for c in picked[ty]] for ty in SITE_OF}
    lines = [
        "// 自動生成: test/build_ng_products12.py（手で直さない）",
        "// NGカラー診断「置き換えカラーの服はコレ」の12タイプ別3点（v1.22.13）。選び方は build_ng_products12.py の先頭に書いた",
        "export const NG_PRODUCTS_12 = " + json.dumps(data, ensure_ascii=False, indent=1) + ";",
        "",
    ]
    OUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print("wrote", OUT)
    for ty in SITE_OF:
        s = stats[ty]
        print(f"{ty}: タグ{s['tagged']} → 在庫あり{s['live']} → 顔まわり{s['face']} → NG色で除外{s['ng_out']} → 候補{len(cand[ty])} / 採用{len(picked[ty])}")
        for c in picked[ty]:
            print(f"    {c['id']} display={c['display']} {c['cat']} {c['name'][:28]} [{','.join(c['colors'])}]")


if __name__ == "__main__":
    main()
