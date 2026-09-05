// 保存・SNS共有用カード (1080x1920 PNG) のフッターまわりを実測する。
//
// 見るのは 2026-09-05 に足した「研究所監修 @xxx_lab」の行。
//   1. 監修行が本当に描かれているか（描いた文字の幅を、期待文字列の実測幅と突き合わせる）
//   2. 本文の下端が下部帯 (H-220 から下) に食い込んでいないか
//   3. サイトごとに表記が出し分いているか（BLUBEL=ブルベ研究所監修 @blube_lab /
//      IEBEL=イエベ研究所監修 @iebe_lab）
//
// 座標を直書きして目視で合わせるのではなく、毎回ピクセルを数えて確かめる。
// 行を足すと下部帯に当たるのが、この作りでいちばん起きやすい壊れ方のため。
//
// 実行: node test/card_footer_check.mjs   (先に npm run build:colorlab しておくこと)
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const W = 1080, H = 1920, BAND_TOP = H - 220;
const MIN_GAP = 20;          // 本文の下端と下部帯のすき間はこれ以上あること
const WIDTH_TOL = 14;        // 描いた文字幅と期待文字列の幅の許容差(px)

// 1st タイプごとに出るはずの表記。TYPES[].site / .sns から決まる。
const CASES = [
  { type: "summer", second: "winter", site: "blubel", text: "ブルベ研究所監修  @blube_lab" },
  { type: "autumn", second: "spring", site: "iebel", text: "イエベ研究所監修  @iebe_lab" },
];

writeFileSync(resolve(HERE, "_card_harness.html"), `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="colorlab-root"></div>
<script>window.dataLayer=[];</script>
<script src="/dist/colorlab.iife.js"></script></body></html>`, "utf-8");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  const f = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
  // jsDelivr と同じく全オリジンに許可を出す（canvas を汚染させないため）
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream",
                       "Access-Control-Allow-Origin": "*" });
  res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, ok));
const base = "http://127.0.0.1:" + server.address().port;

let ng = 0, n = 0;
const check = (cond, label) => {
  n++;
  if (!cond) { ng++; console.log("  NG  " + label); } else console.log("  ok  " + label);
};

const b = await chromium.launch();
for (const c of CASES) {
  console.log(`\n[${c.site}] 1st=${c.type} / 2nd=${c.second}`);
  const page = await b.newPage({ viewport: { width: 420, height: 900 } });
  await page.goto(base + "/test/_card_harness.html");
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.evaluate((v) => localStorage.setItem("colorlab-profile",
    JSON.stringify({ myType: v.type, mySecond: v.second, myFrame: null })), c);
  await page.reload();
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.getByRole("button", { name: /あなたの個性色が分かる！/ }).first().click();
  await page.getByRole("button", { name: /アバターで見る/ }).first().click();
  await page.getByRole("button", { name: /^考えて選ぶ/ }).click();
  await page.getByRole("button", { name: /^聞き役になる/ }).click();
  await page.waitForTimeout(800);

  // 保存ボタンが作る本物の PNG を取り出す（canvas を直に読まず、本番と同じ経路を通す）
  const dataUrl = await page.evaluate(async () => await new Promise((ok) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      fetch(this.href).then((r) => r.blob()).then((bl) => {
        const fr = new FileReader();
        fr.onload = () => { HTMLAnchorElement.prototype.click = orig; ok(fr.result); };
        fr.readAsDataURL(bl);
      });
    };
    [...document.querySelectorAll("#colorlab-root button")]
      .find((x) => x.textContent.includes("カードを画像で保存")).click();
  }));
  const out = resolve(HERE, `_card_footer_${c.site}.png`);
  writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));

  // PNG を読み直して、行ごとに「インクのある x の範囲」を数える
  const m = await page.evaluate(async (v) => {
    const im = new Image();
    await new Promise((ok, ng2) => { im.onload = ok; im.onerror = ng2; im.src = v.dataUrl; });
    const cv = document.createElement("canvas");
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const cx = cv.getContext("2d");
    cx.drawImage(im, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    const rows = [];
    for (let y = 0; y < v.bandTop; y++) {
      let lo = -1, hi = -1;
      for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        // 白地に描いた文字なので、白から外れた画素をインクとする
        if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) { if (lo < 0) lo = x; hi = x; }
      }
      rows.push(lo < 0 ? null : [lo, hi]);
    }
    // いちばん下のインク行 = 監修行の下端
    let bottom = -1;
    for (let y = rows.length - 1; y >= 0; y--) if (rows[y]) { bottom = y; break; }
    // その行から上へ、空白行に当たるまでを1行分とみなす
    let top = bottom;
    while (top > 0 && rows[top - 1]) top--;
    let lo = 1e9, hi = -1;
    for (let y = top; y <= bottom; y++) if (rows[y]) { lo = Math.min(lo, rows[y][0]); hi = Math.max(hi, rows[y][1]); }

    // 同じフォント指定で期待文字列を測る
    const FAM = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif";
    const s = document.createElement("canvas").getContext("2d");
    s.font = "500 30px " + FAM;
    return { bottom, top, inkW: hi - lo + 1, wantW: Math.round(s.measureText(v.text).width),
             w: cv.width, h: cv.height };
  }, { dataUrl, bandTop: BAND_TOP, text: c.text });

  const gap = BAND_TOP - m.bottom;
  check(m.w === W && m.h === H, `保存PNGは ${W}x${H} のまま (実測 ${m.w}x${m.h})`);
  check(m.bottom < BAND_TOP, `本文が下部帯 (y=${BAND_TOP}) に食い込んでいない (最下端 y=${m.bottom})`);
  check(gap >= MIN_GAP, `本文の下端と下部帯のすき間 ${gap}px >= ${MIN_GAP}px`);
  check(Math.abs(m.inkW - m.wantW) <= WIDTH_TOL,
    `最下行の文字幅が「${c.text}」と一致 (実測 ${m.inkW}px / 期待 ${m.wantW}px / 差 ${Math.abs(m.inkW - m.wantW)}px)`);
  console.log(`      -> ${out}`);
  await page.close();
}
await b.close();
server.close();

// 2サイトで別の文字列が出ていること（同じ幅なら出し分けが効いていない疑い）
console.log(`\n=== ${n - ng}/${n} 合格 ===`);
process.exit(ng ? 1 : 0);
