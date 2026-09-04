// 「自分の顔で作る」のクライアント側を、中継をモックして実測する。
// 見るのは (1)告知文が出るか (2)生成が反映されるか (3)同じ写真ならAPIを叩かない
// (4)写真を変えたら叩く (5)上限到達でグレーアウト＋フォールバック (6)写真を保持しない。
// 実行: node test/selfcard_check.mjs
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";
import { execSync } from "child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// SELFCARD_ENABLED=false は定数畳み込みで JSX ごと落とされるため、バンドルを
// 後から書き換えても有効化できない。テスト用にソースを一時的に true にして
// ビルドし直し、必ず元に戻す。
const SRC_JSX = resolve(ROOT, "src/color_lab_stylist_v23.jsx");
const TEST_DIST = resolve(HERE, "_selfcard_dist");
const original = readFileSync(SRC_JSX);
let built = false;
try {
  const flipped = original.toString("utf-8")
    .replace("const SELFCARD_ENABLED = false;", "const SELFCARD_ENABLED = true;");
  // 既に true (中継が開通済み) ならそのままビルドすればよい
  if (flipped === original.toString("utf-8") && !/const SELFCARD_ENABLED = true;/.test(flipped)) {
    console.error("SELFCARD_ENABLED を反転できませんでした");
    process.exit(2);
  }
  writeFileSync(SRC_JSX, flipped);
  execSync(`npx vite build --config vite.colorlab.config.mjs --outDir ${JSON.stringify(TEST_DIST)}`,
    { cwd: ROOT, stdio: "pipe" });
  built = true;
} finally {
  writeFileSync(SRC_JSX, original);   // 何があっても必ず戻す
}
if (!built) process.exit(2);

writeFileSync(resolve(HERE, "_card_harness.html"), `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="colorlab-root"></div>
<script>window.dataLayer=[];</script>
<script src="/test/_selfcard_dist/colorlab.iife.js"></script></body></html>`, "utf-8");

// 1x1 の赤/青 PNG。中身が違う2枚を用意して、キャッシュが写真で切り替わるか見る。
const PNG_A = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PNG_B = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const OUT_IMG = readFileSync(resolve(ROOT, "dist/avatars/avatar_summer_intellect.webp"));

let apiCalls = 0;
let forceLimit = false;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  const url = req.url.split("?")[0];
  const f = join(ROOT, decodeURIComponent(url));
  if (!existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream",
                       "Access-Control-Allow-Origin": "*" });
  res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, ok));
const base = "http://127.0.0.1:" + server.address().port;

const ok = [], ng = [];
const check = (c, l) => (c ? ok : ng).push(l);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
page.on("pageerror", (e) => ng.push("pageerror: " + e.message));
// 中継はここで差し替える。https -> http へは route.continue できないので fulfill で返す。
await page.route("https://colorlab-selfcard.the-company-20220901.workers.dev/illustrate", (route) => {
  if (forceLimit) {
    return route.fulfill({ status: 429, contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: false, reason: "daily_limit", remaining: 0 }) });
  }
  apiCalls++;
  return route.fulfill({ status: 200, contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true, image: OUT_IMG.toString("base64"), remaining: 49 }) });
});

const openCard = async () => {
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
};
const pickPhoto = async (buf, name) => {
  await page.getByRole("button", { name: /自分の顔で作る|別の写真で作り直す/ }).first().click();
  await page.waitForTimeout(200);
  await page.setInputFiles("#colorlab-root input[type=file]", { name, mimeType: "image/png", buffer: buf });
  await page.waitForTimeout(1500);
};
const avatarSrc = () => page.evaluate(() => {
  const i = document.querySelector("#colorlab-root img");
  return i ? i.src.slice(0, 30) : null;
});

await openCard();
check(await page.getByRole("button", { name: /自分の顔で作る/ }).count() > 0, "カード結果画面に「自分の顔で作る」ボタンが出る");

// 告知文
await page.getByRole("button", { name: /自分の顔で作る/ }).first().click();
await page.waitForTimeout(300);
const notice = await page.textContent("#colorlab-root");
check(/画像生成AI（OpenAI）に送信/.test(notice), "告知: OpenAIに送信する旨が出る");
check(/顔写真診断とは異なり、写真が端末の外に出ます/.test(notice), "告知: 既存の顔写真診断と違う点が出る");
check(/保存しません/.test(notice), "告知: 保存しない旨が出る");
check(await page.locator("#colorlab-root input[type=file]").count() > 0, "写真の選択UIがある");
await page.getByRole("button", { name: /戻る|←/ }).first().click().catch(() => {});
await page.waitForTimeout(200);

// 1回目: API を叩く
await openCard();
const before1 = apiCalls;
await pickPhoto(PNG_A, "a.png");
check(apiCalls === before1 + 1, `1回目は中継を叩く (calls=${apiCalls})`);
check((await avatarSrc() || "").startsWith("data:image/png;base64"), "生成イラストがカードに反映される");

// 2回目: 同じ写真 → キャッシュ、叩かない
const before2 = apiCalls;
await pickPhoto(PNG_A, "a.png");
check(apiCalls === before2, `同じ写真なら中継を叩かない (calls=${apiCalls})`);
check((await avatarSrc() || "").startsWith("data:image/png;base64"), "キャッシュから同じ絵が出る");

// 3回目: 別の写真 → 叩く
const before3 = apiCalls;
await pickPhoto(PNG_B, "b.png");
check(apiCalls === before3 + 1, `写真を変えたら中継を叩く (calls=${apiCalls})`);

// 写真を保持していないこと
const kept = await page.evaluate(() => {
  const inp = document.querySelector("#colorlab-root input[type=file]");
  const ss = sessionStorage.getItem("colorlab-selfcard");
  return { inputValue: inp ? inp.value : "", cacheKeys: ss ? Object.keys(JSON.parse(ss)) : [] };
});
check(kept.inputValue === "", "選択した写真をinputに残していない");
check(!kept.cacheKeys.includes("photo") && kept.cacheKeys.join(",") === "key,image,at",
  `キャッシュに写真そのものを持たない (${kept.cacheKeys.join(",")})`);

// 上限到達
forceLimit = true;
await openCard();
await pickPhoto(PNG_A, "c.png");
const soldOut = await page.textContent("#colorlab-root");
check(/本日の生成枠は終了しました/.test(soldOut), "上限到達で「本日の生成枠は終了しました」が出る");
const disabled = await page.evaluate(() => {
  const b = [...document.querySelectorAll("#colorlab-root button")]
    .find((x) => /自分の顔で作る|別の写真で作り直す/.test(x.textContent));
  return b ? b.disabled : null;
});
check(disabled === true, "上限到達でボタンがグレーアウト(disabled)される");
check(!(await avatarSrc() || "").startsWith("data:image/png"), "上限到達時は事前生成アバターにフォールバックする");
await page.screenshot({ path: resolve(HERE, "_selfcard.png"), fullPage: false });

await browser.close();
server.close();
console.log("PASS " + ok.length + " / FAIL " + ng.length);
ok.forEach((l) => console.log("  [OK] " + l));
ng.forEach((l) => console.log("  [NG] " + l));
process.exit(ng.length ? 1 : 0);
