// 保存ボタンが作る 1080x1920 のPNGを実際に取り出して目視確認用に書き出す。
// アバターは crossOrigin="anonymous" で読むため file:// では必ず失敗する。
// 本番(https + CORS)と同じ経路を通すために、ローカルHTTPサーバを立てて検証する。
// 実行: node test/_card_export_check.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { createServer } from "http";
import { extname, join } from "path";

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
  // jsDelivr と同じく全オリジンに許可を出す（canvas を汚染させないため）
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream",
                       "Access-Control-Allow-Origin": "*" });
  res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, ok));
const base = "http://127.0.0.1:" + server.address().port;

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 420, height: 900 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(base + "/test/_card_harness.html");
await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
await page.evaluate(() => localStorage.setItem("colorlab-profile",
  JSON.stringify({ myType: "summer", mySecond: "winter", myFrame: null })));
await page.reload();
await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
await page.getByRole("button", { name: /あなたの個性色が分かる！/ }).first().click();
await page.getByRole("button", { name: /アバターで見る/ }).first().click();   // v1.20.4: 診断前の選択
await page.getByRole("button", { name: /^考えて選ぶ/ }).click();
await page.getByRole("button", { name: /^聞き役になる/ }).click();
await page.waitForTimeout(800);

const avatarSrc = await page.evaluate(() => document.querySelector("#colorlab-root img").src);
console.log("アバターURL:", avatarSrc);

const dataUrl = await page.evaluate(async () => {
  return await new Promise((ok) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      fetch(this.href).then((r) => r.blob()).then((bl) => {
        const fr = new FileReader();
        fr.onload = () => { HTMLAnchorElement.prototype.click = orig; ok(fr.result); };
        fr.readAsDataURL(bl);
      });
    };
    const btns = [...document.querySelectorAll("#colorlab-root button")];
    btns.find((x) => x.textContent.includes("カードを画像で保存")).click();
  });
});
const out = resolve(HERE, "_card_export_1080x1920.png");
writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
console.log("保存PNG:", out);
await b.close();
server.close();
