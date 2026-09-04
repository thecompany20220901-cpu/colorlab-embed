// 実接続テスト。中継をモックせず、本物の Cloudflare Worker に繋いで確認する。
//   #1 実際の写真で1回生成し、カードに反映されるか      -> 課金1回
//   #2 同じ写真でもう一度押し、中継を叩かないか(キャッシュ) -> 課金0回
//   #3 /health の used / remaining が動いたか            -> 課金0回
// 課金は #1 の1回だけ。上限50回を使い切るテストはしない。
// 実行: node test/selfcard_live.mjs <写真のパス>
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PHOTO = process.argv[2];
if (!PHOTO || !existsSync(PHOTO)) {
  console.error("写真のパスを渡してください: node test/selfcard_live.mjs <path>");
  process.exit(2);
}
const WORKER = "https://colorlab-selfcard.the-company-20220901.workers.dev";

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

const health = async (label) => {
  const r = await fetch(WORKER + "/health");
  const j = await r.json();
  console.log(`  /health (${label}): ` + JSON.stringify(j));
  return j;
};

console.log("── 実行前の中継の状態 ──");
const h0 = await health("before");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

// 中継への実リクエスト数を数える（Origin も本番のものに偽装しないと 403 になる）
let hits = 0;
await page.route(WORKER + "/illustrate", async (route) => {
  hits++;
  const req = route.request();
  const r = await fetch(WORKER + "/illustrate", {
    method: "POST",
    headers: { Origin: "https://blubel.jp" },
    body: req.postDataBuffer(),
    // multipart の Content-Type は境界文字列込みでそのまま渡す必要がある
    ...(req.headers()["content-type"]
      ? { headers: { Origin: "https://blubel.jp", "Content-Type": req.headers()["content-type"] } }
      : {}),
  });
  const body = await r.text();
  await route.fulfill({ status: r.status, contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" }, body });
});

await page.goto(base + "/test/_card_harness.html");
await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
await page.evaluate(() => localStorage.setItem("colorlab-profile",
  JSON.stringify({ myType: "summer", mySecond: "winter", myFrame: null })));
await page.reload();
await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
await page.getByRole("button", { name: /あなたの個性色が分かる！/ }).first().click();
await page.getByRole("button", { name: /^考えて選ぶ/ }).click();
await page.getByRole("button", { name: /^聞き役になる/ }).click();
await page.waitForTimeout(500);

const photoBuf = readFileSync(PHOTO);
const pick = async () => {
  await page.getByRole("button", { name: /自分の顔で作る|別の写真で作り直す/ }).first().click();
  await page.waitForTimeout(300);
  await page.setInputFiles("#colorlab-root input[type=file]",
    { name: "photo.jpg", mimeType: "image/jpeg", buffer: photoBuf });
  // 生成は30秒前後かかる
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() =>
      !/イラストを作っています/.test(document.querySelector("#colorlab-root").textContent));
    if (done) break;
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(800);
};
const shown = () => page.evaluate(() => {
  const i = document.querySelector("#colorlab-root img");
  return { src: i ? i.src.slice(0, 32) : null, w: i ? i.naturalWidth : 0, h: i ? i.naturalHeight : 0,
           text: document.querySelector("#colorlab-root").textContent.slice(0, 0) };
});

console.log("\n── #1 実際の写真で1回生成（課金1回） ──");
const t1 = Date.now();
await pick();
const s1 = await shown();
console.log(`  中継への実リクエスト: ${hits} 回 / 所要 ${Math.round((Date.now() - t1) / 1000)}秒`);
console.log(`  カードの画像: ${s1.src} (${s1.w}x${s1.h})`);
console.log(`  判定: ${s1.src && s1.src.startsWith("data:image/png") && s1.w > 0 ? "成功・カードに反映された" : "失敗"}`);
await page.screenshot({ path: resolve(HERE, "_selfcard_live.png"), fullPage: false });

console.log("\n── #2 同じ写真でもう一度（キャッシュ・課金0回） ──");
const hitsBefore = hits;
await pick();
const s2 = await shown();
console.log(`  中継への実リクエスト: ${hits - hitsBefore} 回（0なら期待どおり）`);
console.log(`  カードの画像: ${s2.src} (${s2.w}x${s2.h})`);
console.log(`  判定: ${hits === hitsBefore && s2.src === s1.src ? "キャッシュが効いた" : "キャッシュが効いていない"}`);

await browser.close();
server.close();

console.log("\n── #3 実行後の中継の状態 ──");
const h1 = await health("after");
console.log(`\n  used     : ${h0.used} -> ${h1.used}`);
console.log(`  remaining: ${h0.remaining} -> ${h1.remaining}`);
console.log(`  課金が発生した生成回数: ${h1.used - h0.used}`);
