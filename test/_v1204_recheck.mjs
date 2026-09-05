// BLUBEL のカードアバターだけ、読み込み完了を待って再実測する。
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 420, height: 900 },
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" });
const failed = [];
p.on("requestfailed", (r) => { if (/avatar_/.test(r.url())) failed.push(r.url() + " :: " + (r.failure() || {}).errorText); });
p.on("response", async (r) => { if (/avatar_.*\.webp/.test(r.url())) console.log("resp", r.status(), r.url().split("/").pop()); });
await p.goto("https://www.blubel.jp/pages/personalcolor", { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForSelector("#colorlab-root button", { timeout: 60000 });
await p.getByRole("button", { name: /あなたの個性色が分かる！/ }).first().click(); await p.waitForTimeout(600);
await p.getByRole("button", { name: /アバターで見る/ }).first().click(); await p.waitForTimeout(400);
await p.getByRole("button", { name: /^直感で選ぶ/ }).click(); await p.waitForTimeout(300);
await p.getByRole("button", { name: /^自分から話しかける/ }).click(); await p.waitForTimeout(400);
for (let i = 0; i < 6; i++) { await p.locator("#colorlab-root button").nth(1).click(); await p.waitForTimeout(250); }
// 画像の load を明示的に待つ
await p.waitForFunction(() => {
  const i = document.querySelector("#colorlab-root img");
  return i && i.complete && i.naturalWidth > 0;
}, { timeout: 20000 }).catch(() => {});
const info = await p.evaluate(() => {
  const i = document.querySelector("#colorlab-root img");
  return i ? { src: i.src, w: i.naturalWidth, h: i.naturalHeight, complete: i.complete, vis: i.style.visibility } : null;
});
console.log("BLUBEL card avatar:", JSON.stringify(info));
console.log("requestfailed:", failed);
await p.screenshot({ path: "test/_v1204_BLUBEL_card.png", fullPage: true });
await b.close();
