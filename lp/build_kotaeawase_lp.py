"""答え合わせキャンペーン（プロ診断実証キャンペーン）の LP を BLUBEL / IEBEL 別に作る。

    python lp/build_kotaeawase_lp.py [--period "9月21日（月）〜9月27日（日）"] [--paste-dir <dir>]

- 入力: lp/kotaeawase_prizes.json（景品候補10点 × 2サイト）
- 出力: lp/kotaeawase_lp_blubel.html / lp/kotaeawase_lp_iebel.html（先頭に開発用コメント付き）
        --paste-dir を渡すと、コメントを外した Fulmo 貼り付け用も書き出す
- Fulmo「ページ一覧 → HTML要素」に貼る自己完結 HTML。JS なし・CSS は .kt 配下だけ・
  サイト内リンクは相対パス。画像だけは例外で、商品ページと同じ fulmo-img-server の商品画像を
  そのまま参照する（2026-09-19 keisuke 指定の URL。新しい画像はアップロードできないので base64 にしない）
- 文言は 2026-09-19 keisuke 指示のまま。実施期間は --period を渡すまで【開始日確定後に記入】
"""
import argparse
import html
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PERIOD_TODO = '<span class="kt-todo">【開始日確定後に記入】</span>'

BRAND = {
    "blubel": {"name": "BLUBEL"},
    "iebel": {"name": "IEBEL"},
}

STEPS = [
    ("プロ診断の結果を選ぶ", "下のボタンから進み、プロに言われたあなたのタイプを選択"),
    ("そのままアプリで診断", "「写真で診断」を実行（写真は端末内だけで解析、外部には送信されません）"),
    ("その場で結果が分かる", "プロの診断とアプリの診断が「同じタイプ」だったかどうか、その場で表示されます"),
    ("結果画像をSNSに投稿", "保存した画像をストーリーに投稿し、指定ハッシュタグと指定アカウントをメンション"),
]

CSS = """
/* リセットは LP の文面（.kt-s）の中だけ。サイト側の要素には掛けない */
.kt .kt-s,.kt .kt-s *,.kt .kt-s *::before,.kt .kt-s *::after{box-sizing:border-box;margin:0;padding:0}
.kt{box-sizing:border-box}
.kt{max-width:640px;margin:0 auto;padding:0 16px 40px;color:#3a3340;font-family:'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif;line-height:1.75}
.kt .kt-band{box-sizing:border-box;display:grid;grid-template-columns:repeat(6,1fr);height:28px;margin:0 -16px}
.kt .kt-hero{text-align:center;padding:28px 0 8px}
.kt .kt-eyebrow{font-size:13px;letter-spacing:.06em;color:#7d7580}
.kt .kt-s h1{font-family:'Noto Serif JP','Hiragino Mincho ProN','Yu Mincho',serif;font-weight:500;line-height:1.4;margin-top:8px}
.kt .kt-h1a{display:block;font-size:16px;letter-spacing:-.02em}
.kt .kt-h1b{display:block;font-size:24px;color:#7D2E46;margin-top:4px;letter-spacing:.02em}
.kt .kt-lead{font-size:14px;color:#5b5360;margin-top:12px;text-align:left}
.kt .kt-prize{margin-top:22px;border-radius:20px;padding:18px 10px;text-align:center;background:#FFD6E0;border:2px solid #E8829A}
.kt .kt-prize b{display:block;font-size:16px;letter-spacing:-.01em;color:#7D2E46;line-height:1.5}
.kt .kt-prize span{display:block;font-size:13px;margin-top:4px}
.kt .kt-s h2{font-size:17px;margin:30px 0 12px;padding-left:10px;border-left:4px solid #7D2E46}
.kt .kt-steps{display:grid;grid-template-columns:1fr;gap:10px}
.kt .kt-step{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid #e7dfe6;border-radius:16px;padding:14px}
.kt .kt-no{flex:0 0 34px;height:34px;border-radius:50%;background:#7D2E46;color:#fff;font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:center}
.kt .kt-step b{display:block;font-size:15px}
.kt .kt-step p{font-size:13px;color:#5b5360;margin-top:2px}
.kt .kt-cta{display:block;margin:22px 0 6px;padding:17px 0;border-radius:999px;background:#7D2E46;color:#fff;text-align:center;font-size:17px;font-weight:700;text-decoration:none}
.kt .kt-items{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.kt .kt-item{display:block;background:#fff;border:1px solid #e7dfe6;border-radius:14px;overflow:hidden;text-decoration:none;color:#3a3340}
.kt .kt-item img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;background:#f3eef2}
.kt .kt-item span{display:block;padding:8px 10px 0;font-size:12px;line-height:1.5;min-height:3em}
.kt .kt-item em{display:block;padding:2px 10px 10px;font-style:normal;font-weight:700;font-size:14px;color:#7D2E46}
.kt .kt-note{font-size:12px;color:#7d7580}
.kt .kt-todo{color:#C0392B;font-weight:700}
.kt .kt-s dl{font-size:13px;display:grid;grid-template-columns:6em 1fr;gap:8px 10px}
.kt .kt-s dt{color:#7d7580}
""".strip()

BAND = (
    '<div class="kt-band">' + "".join(f'<i style="background:{c}"></i>' for c in ["#F7C9A0", "#F4A582", "#F6D65B", "#C89B3C", "#B5734A", "#A65A3A"]) + "</div>\n"
    '  <div class="kt-band">' + "".join(f'<i style="background:{c}"></i>' for c in ["#C9B8D8", "#E8A9C0", "#A9C4DE", "#3B5BA5", "#C2408B", "#111418"]) + "</div>"
)

CTA = '<a class="kt-cta" href="/pages/personalcolor?campaign=kotaeawase">答え合わせをはじめる</a>'


def yen(n):
    return "¥{:,}".format(n)


def build(site, prizes, period_html):
    b = BRAND[site]
    e = html.escape
    steps = "\n".join(
        f'    <div class="kt-step"><div class="kt-no">{i}</div><div><b>{e(t)}</b><p>{e(d)}</p></div></div>'
        for i, (t, d) in enumerate(STEPS, 1)
    )
    items = "\n".join(
        f'    <a class="kt-item" href="/item/{p["item_id"]}"><img src="{e(p["image"])}" alt="{e(p["name"])}" loading="lazy" width="300" height="300">'
        f'<span>{e(p["name"])}</span><em>{yen(p["price"])}</em></a>'
        for p in prizes
    )
    return f"""<style>
{CSS}
</style>
<div class="kt">
  {BAND}

  <div class="kt-s">
  <div class="kt-hero">
    <div class="kt-eyebrow">プロのパーソナルカラー診断を受けたことがある方へ</div>
    <h1><span class="kt-h1a">研究所監修12タイプ別パーソナルカラー診断！</span><span class="kt-h1b">プロ診断実証キャンペーン！</span></h1>
    <p class="kt-lead">プロに診断されたあなたの色を、研究所監修の12タイプ診断でも同じように導き出せるか。その場で確かめられます。</p>
    <div class="kt-prize"><b>3名様に、{b["name"]}商品1点をプレゼント！</b><span>下の候補10点から、当選した方がお好きな1点を選べます</span></div>
  </div>

  <h2>参加のしかた</h2>
  <div class="kt-steps">
{steps}
  </div>

  {CTA}

  <h2>プレゼント候補（10点）</h2>
  <div class="kt-items">
{items}
  </div>
  <p class="kt-note" style="margin-top:10px">当選した方に、この10点の中からお好きな1点を選んでいただきます。</p>

  <h2>応募要項</h2>
  <dl>
    <dt>期間</dt><dd>{period_html}（7日間）</dd>
    <dt>対象</dt><dd>プロのパーソナルカラー診断を受けたことがある方</dd>
    <dt>賞品</dt><dd>{b["name"]}商品1点（上のプレゼント候補10点から、当選した方が選べます）を抽選で3名様</dd>
    <dt>応募条件</dt><dd>答え合わせの結果画像をストーリーに投稿し、#答え合わせキャンペーン #ColorLabMINE を付けて、アプリの結果がブルベの方は @blube_lab、イエベの方は @iebe_lab をメンション</dd>
    <dt>当選発表</dt><dd>期間終了後、@blube_lab・@iebe_lab 両アカウントのストーリーで当選者にDMでご連絡します。あわせてアカウント上で当選人数・結果を告知します。</dd>
  </dl>
  <p class="kt-note" style="margin-top:14px">写真診断はこの端末の中だけで行い、写真は外部に送信されません。</p>
  {CTA}
  <p style="margin-top:18px;font-size:14px"><a href="/pages/personalcolor">パーソナルカラー診断のトップへ</a></p>
  </div>
</div>
"""


def header(site):
    return f"""<!-- ══════════════════════════════════════════════════════════
     プロ診断実証キャンペーン（答え合わせ）LP — {BRAND[site]["name"]}（Fulmo「ページ一覧 → HTML要素」に貼る）
     生成: lp/build_kotaeawase_lp.py（手で直さず、スクリプトか lp/kotaeawase_prizes.json を直して再生成）
     - JS なし（アプリは GTM が /pages/personalcolor にだけ読み込む → ボタンで ?campaign=kotaeawase へ送る）
     - CSS は .kt 配下だけ。画像は商品ページと同じ fulmo-img-server の商品画像を参照
     - 実施期間は日付確定後に --period を付けて再生成する
     ══════════════════════════════════════════════════════════ -->
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--period", help="例: 9月21日（月）〜9月27日（日）")
    ap.add_argument("--paste-dir", help="Fulmo 貼り付け用（コメントなし）の出力先")
    a = ap.parse_args()
    data = json.loads((HERE / "kotaeawase_prizes.json").read_text(encoding="utf-8"))
    period_html = html.escape(a.period) if a.period else PERIOD_TODO
    for site in ("blubel", "iebel"):
        body = build(site, data[site], period_html)
        assert "<script" not in body.lower() and not re.search(r'href="https?:', body)
        (HERE / f"kotaeawase_lp_{site}.html").write_text(header(site) + body, encoding="utf-8", newline="\n")
        if a.paste_dir:
            out = Path(a.paste_dir) / f"kotaeawase_lp_{site}_Fulmo貼り付け用.html"
            out.write_text(body, encoding="utf-8", newline="\n")
        print(site, len(body.encode("utf-8")), "bytes")


if __name__ == "__main__":
    main()
