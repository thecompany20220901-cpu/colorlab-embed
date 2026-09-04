// 入口Bタイルの表示崩れチェック。
// 「2行に折り返すこと」は許容。見てはいけないのは (1)横はみ出し (2)縦クリップ
// (3)アイコン/矢印とテキストの重なり (4)隣のタイルへのめり込み の4つ。
import { chromium } from "playwright";
import { writeFileSync } from "fs";

const H = "C:/Users/newfa/projects/colorlab-embed/test/_card_harness.html";
writeFileSync(H, `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="colorlab-root"></div>
<script>window.dataLayer=[];</script>
<script src="../dist/colorlab.iife.js"></script></body></html>`, "utf-8");

const b = await chromium.launch();
let ng = 0;
for (const w of [320, 360, 375, 390, 414, 420]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto("file:///" + H);
  await p.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await p.waitForTimeout(1200);
  const m = await p.evaluate(() => {
    const btns = [...document.querySelectorAll("#colorlab-root button")];
    const tile = btns.find((x) => x.textContent.includes("あなたの個性色"));
    if (!tile) return { err: "タイルが見つからない" };
    const spans = [...tile.querySelectorAll("span")];
    const label = spans.find((s) => s.textContent.trim() === "あなたの個性色が分かる！");
    // 外側のラッパー span も "2〜3問" を含むので、子要素を持たない末端の span を取る
    const sub = spans.filter((s) => s.children.length === 0 && s.textContent.includes("2〜3問")).pop();
    const icon = spans.find((s) => s.querySelector("svg") && s.className.includes("shrink-0"));
    const arrow = tile.querySelector(":scope > svg");
    const R = (n) => { const q = n.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom, w: q.width, h: q.height }; };
    const hit = (a, c) => a && c && a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.t < c.b - 0.5 && c.t < a.b - 0.5;
    const lb = label && R(label), sb = sub && R(sub), ic = icon && R(icon), ar = arrow && R(arrow);
    // 次のタイル（写真で診断）との縦の重なり
    const next = btns.find((x) => x.textContent.includes("写真で診断"));
    const nx = next && R(next);
    const tl = R(tile);
    return {
      tile: { w: Math.round(tl.w), h: Math.round(tl.h) },
      labelLines: lb ? Math.round(lb.h / 20.6) : null,
      subLines: sb ? Math.round(sb.h / 13.75) : null,
      overflowX: tile.scrollWidth - tile.clientWidth,
      overflowY: tile.scrollHeight - tile.clientHeight,
      docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hitIconLabel: hit(lb, ic), hitIconSub: hit(sb, ic),
      hitArrowLabel: hit(lb, ar), hitArrowSub: hit(sb, ar),
      hitNextTile: nx ? tl.b > nx.t + 0.5 : null,
      labelRight: lb ? Math.round(lb.r) : null, tileRight: Math.round(tl.r),
    };
  });
  const bad = [];
  if (m.err) bad.push(m.err);
  if (m.overflowX > 0) bad.push("横はみ出し " + m.overflowX + "px");
  if (m.overflowY > 0) bad.push("縦クリップ " + m.overflowY + "px");
  if (m.docOverflowX > 0) bad.push("ページ横スクロール " + m.docOverflowX + "px");
  if (m.hitIconLabel) bad.push("ラベルがアイコンに重なる");
  if (m.hitIconSub) bad.push("subがアイコンに重なる");
  if (m.hitArrowLabel) bad.push("ラベルが矢印に重なる");
  if (m.hitArrowSub) bad.push("subが矢印に重なる");
  if (m.hitNextTile) bad.push("次のタイルにめり込む");
  if (bad.length) ng++;
  console.log(`${w}px  tile=${m.tile.w}x${m.tile.h} label=${m.labelLines}行 sub=${m.subLines}行  ` +
              (bad.length ? "NG: " + bad.join(" / ") : "OK 崩れなし"));
  if (w === 375) await p.screenshot({ path: "C:/Users/newfa/projects/colorlab-embed/test/_card_tile.png", clip: { x: 0, y: 380, width: w, height: 200 } });
  await p.close();
}
await b.close();
console.log(ng ? "=== NG " + ng + " 件 ===" : "=== 全幅で崩れなし ===");
process.exit(ng ? 1 : 0);
