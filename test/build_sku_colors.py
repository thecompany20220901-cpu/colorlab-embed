# -*- coding: utf-8 -*-
"""SKU の色展開を商品マスタから取り出して src/sku_color_data.js を生成する。

なぜ必要か:
  SKUS[] は id/name/price/cat/tpo/frame しか持たず、色の情報がどこにも無い
  （商品名にも色語は0件）。「ベストカラーTOP6 の色の服だけ出す」には色が要る。

なぜ商品写真の実測ではなくマスタの color 列なのか:
  最初は SKU_IMG の写真から服の帯を測ろうとしたが、モデル写真は背景・肌・羽織り・影が
  混ざるうえ、そもそも**これらの商品は1点1色ではなく色展開を複数持つ**（例: 2129 は
  ホワイト/グリーン/ピンク/ボルドー/グレーの5色展開）。写真から測れるのは「撮影に使った
  1色」だけで、商品の色展開とは別物だった。商品マスタ item_{site}.csv の color 列が
  色展開そのものなので、そちらを唯一の出所にする。

出力は色名の配列。HEX は作らない（新しい色を1つも作らないため）。アプリ側は
FAMILY_ORDER の色相ファミリー単位で TOP6 と突き合わせる。

実行: python test/build_sku_colors.py
"""
import csv
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_JSX = os.path.join(ROOT, "src", "color_lab_stylist_v23.jsx")
OUT_JS = os.path.join(ROOT, "src", "sku_color_data.js")
# build_color_data.py と同じ商品マスタを見る
ITEM_CSV = {"blubel": r"C:\Users\newfa\Downloads\item_blubel (5).csv",
            "iebel": r"C:\Users\newfa\Downloads\item_iebel (2).csv"}


def read_skus():
    s = io.open(SRC_JSX, encoding="utf-8").read()
    body = re.search(r"const SKUS = \{(.*?)\n\};", s, re.S).group(1)
    out, site = {}, None
    for line in body.split("\n"):
        m = re.match(r"\s*(blubel|iebel):\s*\[", line)
        if m:
            site = m.group(1)
            out[site] = []
            continue
        g = re.search(r'\{ id: (\d+), name: "([^"]+)", price: \d+, cat: "([^"]+)"', line)
        if g:
            out[site].append((g.group(1), g.group(2), g.group(3)))
    return out


def main():
    skus = read_skus()
    result, seen = {}, set()
    for site, items in skus.items():
        with io.open(ITEM_CSV[site], encoding="utf-8-sig", newline="") as f:
            master = {r["item_id"]: r for r in csv.DictReader(f)}
        result[site] = {}
        for sid, name, cat in items:
            row = master.get(sid)
            if not row:
                print("マスタに無い:", site, sid, name)
                continue
            colors = [c.strip() for c in (row.get("color") or "").split(",") if c.strip()]
            if not colors:
                print("color 列が空:", site, sid, name)
                continue
            result[site][sid] = colors
            seen.update(colors)

    head = (
        "// 【自動生成】test/build_sku_colors.py が商品マスタ item_{site}.csv の color 列から作る。\n"
        "// 手で編集しない。SKUS[] に色の情報が無いため、色展開だけをここに持たせている。\n"
        "// HEX は作らない（新しい色を1つも作らないため）。アプリ側は色相ファミリーで突き合わせる。\n"
        "// これらの商品は1点1色ではなく色展開を複数持つので、商品写真から測った1色では代用できない。\n\n"
    )
    io.open(OUT_JS, "w", encoding="utf-8", newline="\n").write(
        head + "export const SKU_COLORS = " + json.dumps(result, ensure_ascii=False, indent=1) + ";\n"
    )
    n = sum(len(v) for v in result.values())
    print("wrote", OUT_JS, "(", n, "SKU )")
    print("出現した色名:", "、".join(sorted(seen)))


if __name__ == "__main__":
    main()
