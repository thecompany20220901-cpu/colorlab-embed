// 12タイプ結果画面のシーズン代表アバターを実測する。
// 本番と同じ経路（12タイプ診断を最後まで回答）で結果画面を出し、
//   (1) 1位シーズンに対して正しい絵が出るか
//   (2) 画像が実際に読み込まれているか（naturalWidth が 0 でない）
//   (3) 既存の見出し・タイプ別イラスト・2nd表示が残っているか
// を見る。回答パターンを変えて複数のシーズンが1位になるケースを作る。
// 実行: node test/season_avatar_check.mjs
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
writeFileSync(resolve(HERE, "_card_harness.html"), `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="colorlab-root"></div>
<script>window.dataLayer=[];</script>
<script src="/dist/colorlab.iife.js"></script></body></html>`, "utf-8");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  const f = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream",
                       "Access-Control-Allow-Origin": "*" });
  res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, ok));
const base = "http://127.0.0.1:" + server.address().port;

const EXPECT = { spring: "sensibility", summer: "intellect", autumn: "action", winter: "passion" };
const JA = { spring: "イエベ春", summer: "ブルベ夏", autumn: "イエベ秋", winter: "ブルベ冬" };

// 13問の回答パターン。黄み/青み軸と明度軸の押し分けで1位のシーズンが変わる。
const PATTERNS = [
  { name: "全A", pick: () => "A" },
  { name: "全B", pick: () => "B" },
  { name: "前半A/後半B", pick: (i) => (i < 6 ? "A" : "B") },
  { name: "前半B/後半A", pick: (i) => (i < 6 ? "B" : "A") },
];

const ok = [], ng = [];
const check = (c, l) => (c ? ok : ng).push(l);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
page.on("pageerror", (e) => ng.push("pageerror: " + e.message));

const seen = {};
for (const pat of PATTERNS) {
  await page.goto(base + "/test/_card_harness.html");
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
  await page.reload();
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.getByRole("button", { name: /質問で診断/ }).first().click();

  for (let i = 0; i < 15; i++) {
    const done = await page.evaluate(() =>
      /タイプです/.test(document.querySelector("#colorlab-root").textContent));
    if (done) break;
    const btns = page.locator("#colorlab-root button");
    // 先頭は戻るボタン。選択肢はその次から2つ（同点解消の設問だけ4択）。
    await btns.nth(pat.pick(i) === "A" ? 1 : 2).click();
    await page.waitForTimeout(110);
  }
  await page.waitForTimeout(700);

  const info = await page.evaluate(() => {
    const root = document.querySelector("#colorlab-root");
    const img = root.querySelector("img[src*='/avatars/']");
    const m = root.textContent.match(/あなたは【(.+?)】タイプです/);
    return {
      first: m ? m[1] : null,
      has2nd: /2nd/.test(root.textContent),
      avatar: img ? img.getAttribute("src").split("/").pop() : null,
      natural: img ? img.naturalWidth + "x" + img.naturalHeight : null,
      // TypeFaceHero を外したので、結果画面の先頭に来る img は CDN のアバターであること
      firstImgIsAvatar: (root.querySelector("img") || {}).src ? /\/avatars\//.test(root.querySelector("img").src) : false,
    };
  });

  const key = Object.keys(JA).find((k) => JA[k] === info.first);
  const want = key ? `avatar_${key}_${EXPECT[key]}.webp` : null;
  check(!!info.first, `${pat.name}: 既存の見出し「あなたは【…】タイプです！」が残っている`);
  check(info.has2nd, `${pat.name}: 既存の2nd表示が残っている`);
  check(info.firstImgIsAvatar, `${pat.name}: 結果画面の最初の画像がシーズン代表アバターになっている`);
  check(!!info.avatar, `${pat.name}: シーズン代表アバターが表示される (1位=${info.first})`);
  check(info.avatar === want, `${pat.name}: 1位${info.first} → ${want}（実際 ${info.avatar}）`);
  check(info.natural && info.natural !== "0x0", `${pat.name}: 画像が実際に読み込まれた (${info.natural})`);
  if (key) seen[key] = info.avatar;
  if (pat.name === "全A") await page.screenshot({ path: resolve(HERE, "_season_avatar.png"), fullPage: false });
}

check(Object.keys(seen).length >= 2, `複数シーズンを実測できた: ${Object.keys(seen).join(", ")}`);
for (const k of Object.keys(seen)) {
  check(seen[k] === `avatar_${k}_${EXPECT[k]}.webp`, `${JA[k]} の割当が固定されている`);
}

await browser.close();
server.close();
console.log("PASS " + ok.length + " / FAIL " + ng.length);
ok.forEach((l) => console.log("  [OK] " + l));
ng.forEach((l) => console.log("  [NG] " + l));
process.exit(ng.length ? 1 : 0);
