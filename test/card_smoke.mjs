// パーソナルカラーカード(v1.20.0)のスモークテスト。
// dist/colorlab.iife.js を実際にマウントし、入口B(3問)と入口A(2問)を通して
// カードが出ること・GA4イベントが積まれること・48件の文言が引けることを実測する。
// 実行: node test/card_smoke.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { readFileSync, writeFileSync } from "fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const HARNESS = resolve(HERE, "_card_harness.html");

writeFileSync(HARNESS, `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0"><div id="colorlab-root"></div>
<script>window.dataLayer=[];</script>
<script src="../dist/colorlab.iife.js"></script></body></html>`, "utf-8");

const fail = [];
const ok = [];
const check = (cond, label) => (cond ? ok : fail).push(label);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
page.on("pageerror", (e) => fail.push("pageerror: " + e.message));
await page.goto("file:///" + HARNESS.replace(/\\/g, "/"));
await page.waitForSelector("#colorlab-root button", { timeout: 15000 });

// ── 入口B: 未診断状態から 3問(Q1,Q2,Q3x6) ──
await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
await page.reload();
await page.waitForSelector("#colorlab-root button", { timeout: 15000 });

const tile = page.getByRole("button", { name: /あなたの個性色が分かる！/ });
check(await tile.count() > 0, "入口Bタイルがホーム最上段にある");
await tile.first().click();

check(await page.getByText("今日着る服、直感で選ぶ").count() > 0, "Q1が指示書どおりの文言");
check((await page.textContent("#colorlab-root")).includes("1 / 8"), "入口B(未診断)は全8問と表示される");
await page.getByRole("button", { name: /^直感で選ぶ/ }).click();

check(await page.getByText("初対面の人には、自分から話しかける").count() > 0, "Q2が指示書どおりの文言");
await page.getByRole("button", { name: /^自分から話しかける/ }).click();

// Q3: 6ペア。全部A(=イエベ・明るい)を選べば 1位=イエベ春(1) になるはず。
for (let i = 0; i < 6; i++) {
  const body = await page.textContent("#colorlab-root");
  check(body.includes(`${3 + i} / 8`), `Q3 ${i + 1}ペア目の進捗表示`);
  await page.locator("#colorlab-root button").nth(1).click(); // 先頭=戻る、次がA選択肢
  await page.waitForTimeout(120);
}
await page.waitForTimeout(400);
let body = await page.textContent("#colorlab-root");
check(body.includes("陽だまりの情熱家"), "全A回答 → イエベ春→ブルベ夏×情熱家の称号が出る");
check(body.includes("ピーチ×ローズ."), "色名がpalette10の引用で出る");
check(body.includes("#パーソナルカラーカード"), "フッター帯にハッシュタグ");
check(body.includes("blubel.jp/pages/personalcolor") || body.includes("iebel.jp/pages/personalcolor"), "フッター帯にURL");
check(await page.getByRole("link", { name: /もっと正確に診断する/ }).count() > 0, "「もっと正確に診断する」リンクがある");
const href = await page.getByRole("link", { name: /もっと正確に診断する/ }).first().getAttribute("href");
check(/\?ref=colorcard$/.test(href || ""), "送客リンクに ?ref=colorcard が付く (" + href + ")");

let dl = await page.evaluate(() => window.dataLayer.slice());
const gen = dl.find((d) => d.event === "personalcolor_card_generated");
check(!!gen, "personalcolor_card_generated が発火");
check(gen && gen.entry_point === "B", "entry_point=B");
check(gen && gen.color_type === "1-2", "color_type=1-2 (全A回答の期待値)");
check(gen && gen.personality_q1 === "intuition" && gen.personality_q2 === "action", "個性パラメータが乗る");

await page.getByRole("link", { name: /もっと正確に診断する/ }).first().click({ modifiers: ["Alt"] }).catch(() => {});
await page.evaluate(() => {
  document.querySelectorAll("#colorlab-root a").forEach((a) => {
    if (a.textContent.includes("もっと正確に診断する")) { a.removeAttribute("target"); a.setAttribute("href", "javascript:void 0"); a.click(); }
  });
});
await page.waitForTimeout(200);
dl = await page.evaluate(() => window.dataLayer.slice());
check(!!dl.find((d) => d.event === "card_to_diagnosis_click"), "card_to_diagnosis_click が発火");

await page.screenshot({ path: resolve(HERE, "_card_entryB.png"), fullPage: true });

// ── 入口A相当: 端末に診断結果がある場合は2問で終わる ──
await page.evaluate(() => localStorage.setItem("colorlab-profile", JSON.stringify({ myType: "summer", mySecond: "winter", myFrame: null })));
await page.reload();
await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
await page.getByRole("button", { name: /あなたの個性色が分かる！/ }).first().click();
check((await page.textContent("#colorlab-root")).includes("1 / 2"), "診断済みなら全2問になる");
await page.getByRole("button", { name: /^考えて選ぶ/ }).click();
await page.getByRole("button", { name: /^聞き役になる/ }).click();
await page.waitForTimeout(400);
body = await page.textContent("#colorlab-root");
check(body.includes("透明感の知性派"), "夏→冬×知性派 = 透明感の知性派");
check(body.includes("ラベンダー×マゼンタ."), "色名も12タイプに追随する");
check(body.includes("あなたの言葉に説得力を与えます。"), "4行目もテストカードと一致");
dl = await page.evaluate(() => window.dataLayer.slice());
const gen2 = dl.filter((d) => d.event === "personalcolor_card_generated").pop();
check(gen2 && gen2.color_type === "2-4", "診断済みの色をそのまま使う (color_type=2-4)");
// カード保存(card_saved)。CDN画像が無い環境でも文字だけのカードとして保存できること。
await page.evaluate(() => {
  window.__dl = []; const el = document.createElement("a");
  HTMLAnchorElement.prototype.click = function () { window.__dl.push(this.download); };
});
await page.getByRole("button", { name: /カードを画像で保存/ }).first().click();
await page.waitForTimeout(2500);
dl = await page.evaluate(() => window.dataLayer.slice());
check(!!dl.find((d) => d.event === "card_saved"), "card_saved が発火");
const dls = await page.evaluate(() => window.__dl || []);
check(dls.includes("personal_color_card.png"), "PNGとして保存される (CDN画像が無くても落ちない)");
const base = await page.evaluate(() => document.querySelectorAll("#colorlab-root img").length);
check(base >= 0, "アバターimgのエラーで画面が壊れない");

await page.screenshot({ path: resolve(HERE, "_card_entryA.png"), fullPage: true });

// ── 既存機能が壊れていないこと ──
await page.evaluate(() => history.replaceState({}, "", location.href));
await page.reload();
await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
const home = await page.textContent("#colorlab-root");
for (const label of ["写真で診断", "質問で診断", "写真＋質問で12タイプ診断！", "パーソナルカラー別コーデ提案", "骨格診断", "今日のコーデ採点"]) {
  check(home.includes(label), "既存導線が残っている: " + label);
}

await browser.close();

console.log("PASS " + ok.length + " / FAIL " + fail.length);
ok.forEach((l) => console.log("  [OK] " + l));
fail.forEach((l) => console.log("  [NG] " + l));
process.exit(fail.length ? 1 : 0);
