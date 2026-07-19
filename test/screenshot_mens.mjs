import { chromium } from "playwright";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import fs from "fs";

const REPO = "C:/Users/newfa/projects/colorlab-embed";
const OUT = "C:/Users/newfa/projects/colorlab-embed/test/screenshots";
const url = pathToFileURL(path.join(REPO, "test/local_article.html")).href;

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? "  OK  " : " FAIL "} ${label}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 900 }, deviceScaleFactor: 2 });

const netHits = [];
page.on("request", (r) => { if (/api\.anthropic\.com/.test(r.url())) netHits.push(r.url()); });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(url);
await page.waitForSelector("#mens-root button", { timeout: 15000 });

const root = page.locator("#mens-root");
const shot = async (name) => {
  await page.waitForTimeout(300);
  await root.screenshot({ path: path.join(OUT, name) });
};

// 1. ホーム
check("ホームがマウントされる", await root.locator("text=清潔感カラー診断").first().isVisible());
check("商品/アフィリ語がホームに無い",
  !(await root.innerText()).match(/楽天|Amazon|商品を見る|LINE|PR /));
await shot("mens_01_home.png");

// 2. 12タイプ診断を通す
await root.locator("text=清潔感カラー診断（12タイプ）").click();
await page.waitForTimeout(300);
await shot("mens_02_quiz_q1.png");

for (let i = 0; i < 14; i++) {
  const done = await root.locator("text=あなたは").count();
  if (done > 0) break;
  const btns = root.locator("button").filter({ hasNot: page.locator("svg.lucide-arrow-left") });
  // 選択肢ボタン(イラスト付き or ラベル)の最初を押す
  const opts = await root.locator("button").all();
  // 先頭は戻るボタンなので2番目以降
  await opts[1].click();
  await page.waitForTimeout(160);
}
const resultText = await root.innerText();
check("診断結果が出る", /あなたは/.test(resultText));
check("結果に正式名称が併記される", /(イエベ春|ブルベ夏|イエベ秋|ブルベ冬)/.test(resultText));
check("結果に中立名が出る", /(黄みタイプ|青みタイプ)/.test(resultText));
check("結果画面に商品/アフィリが無い", !/楽天|Amazon|商品を見る|LINEに結果/.test(resultText));
check("IG導線がある", /seiketsu_lab/.test(resultText));
check("スクショ導線がある", /スクリーンショット/.test(resultText));
await shot("mens_03_quiz_result.png");

// 3. コーデ提案 3シーン
await root.locator("text=3シーン分のコーデを見る").click();
await page.waitForTimeout(400);
check("コーデ提案が開く", /ベース/.test(await root.innerText()));
await shot("mens_04_coord_business.png");
await root.locator("button", { hasText: "カジュアル" }).first().click();
await page.waitForTimeout(300);
await shot("mens_05_coord_casual.png");
await root.locator("button", { hasText: "デート" }).first().click();
await page.waitForTimeout(300);
check("デートタブが切り替わる", (await root.innerText()).includes("ポイント"));
await shot("mens_06_coord_date.png");

const backHome = async () => {
  await root.locator("button").first().click();
  await page.waitForTimeout(350);
};
await backHome();

// 4. NGカラー
await root.locator("text=NGカラー診断").click();
await page.waitForTimeout(400);
check("NGカラーが出る", /老けて見える色/.test(await root.innerText()));
await shot("mens_07_ngcolor.png");
await backHome();

// 5. この色似合う?
await root.locator("text=この色、似合う？").click();
await page.waitForTimeout(400);
const swatches = root.locator("button[aria-label]");
await swatches.nth(4).click();
await page.waitForTimeout(300);
check("色の相性判定が返る", /(かなり似合う|似合う|使い方次第|苦手な色)/.test(await root.innerText()));
await shot("mens_08_checker.png");
await backHome();

// 6. 髪色シミュレーション
await root.locator("text=髪色シミュレーション").click();
await page.waitForTimeout(400);
const hairText = await root.innerText();
check("おすすめ髪色が出る", /おすすめの髪色/.test(hairText));
check("試し塗りUIがある", /写真を選ぶ/.test(hairText));
check("canvas が存在する", await page.locator("#mens-tryon-canvas").count() === 1);
await shot("mens_09_hair.png");
await backHome();

// 7. 骨格診断
await root.locator("text=骨格診断").click();
await page.waitForTimeout(300);
for (let i = 0; i < 7; i++) {
  if (/骨格(ストレート|ウェーブ|ナチュラル)/.test(await root.innerText())) break;
  const opts = await root.locator("button").all();
  await opts[1].click();
  await page.waitForTimeout(160);
}
check("骨格結果が出る", /骨格(ストレート|ウェーブ|ナチュラル)/.test(await root.innerText()));
await shot("mens_10_frame.png");
await backHome();

// 8. ふたりの相性配色
await root.locator("text=ふたりの相性配色").click();
await page.waitForTimeout(300);
const picks = root.locator("button", { hasText: "黄みタイプ・明るめ" });
await picks.nth(0).click();
await page.waitForTimeout(200);
await root.locator("button", { hasText: "青みタイプ・くっきり" }).nth(1).click();
await page.waitForTimeout(350);
check("ペア結果が出る", /ふたりの配色/.test(await root.innerText()));
await shot("mens_11_pair.png");

// 9. 女性版に影響が無いこと
const colorlabText = await page.locator("#colorlab-root").innerText();
check("女性版が従来どおり動く", /パーソナルカラー/.test(colorlabText));

// 10. Lite 判定
check("api.anthropic.com へのリクエスト 0件", netHits.length === 0);
const realErrors = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
check("JSエラーなし", realErrors.length === 0);
if (realErrors.length) console.log(realErrors.slice(0, 5));

// 横幅チェック
const overflow = await page.evaluate(() => {
  const el = document.querySelector("#mens-root");
  return el.scrollWidth > el.clientWidth + 2;
});
check("375px で横スクロールが出ない", !overflow);

await browser.close();
console.log(failures === 0 ? "\n=== ALL PASS ===" : `\n=== ${failures} FAILURES ===`);
process.exitCode = failures ? 1 : 0;
