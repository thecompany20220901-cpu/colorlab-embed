// デパコスAFF（A8.net 経由・Qoo10）の検証。
//   ・4タイプそれぞれで、コスメ一覧の末尾にデパコス1件が出る
//   ・A8 の商品リンク（px.a8.net の計測URL + 商品画像 + 1x1計測gif）が描画される
//   ・ad.js を落とした状態ではフォールバックの直リンクに切り替わる
//   ・price:null でクラッシュしない / 既存のプチプラ表示と リップ先頭3件 が変わらない
// 実行: node test/depacosme_check.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, "screenshots");
mkdirSync(SHOTS, { recursive: true });
const ART = "file://" + join(__dirname, "local_article.html").replace(/\\/g, "/");

const MAT = "4B3VR9+GAG5TE+4QYG+BWGDT";
const IMU_DIOR = "https://gd.image-qoo10.jp/li/869/756/8244756869.g_400-w_g.jpg";
const IMU_SUQQU = "https://gd.image-qoo10.jp/li/623/166/6134166623.g_400-w_g.jpg";
const EXPECT = {
  spring: { label: "イエベ春", name: "Dior アディクト リップグロウバター 106 Pomelo", qoo10: "https://www.qoo10.jp/g/1166428287", imu: IMU_DIOR, adId: "4An06KR-g7-vkg5yTm" },
  autumn: { label: "イエベ秋", name: "SUQQU シアーマット リップスティック 112 芳実（レフィル）", qoo10: "https://www.qoo10.jp/g/1117415069", imu: IMU_SUQQU, adId: "4An06KR-g7-vkg5h7u" },
  summer: { label: "ブルベ夏", name: "SUQQU シアーマット リップスティック 111 熟葡萄（レフィル）", qoo10: "https://www.qoo10.jp/g/1117415069", imu: IMU_SUQQU, adId: "4An06KR-g7-vkg5h7u" },
  winter: { label: "ブルベ冬", name: "SUQQU シアーマット リップスティック 111 熟葡萄（レフィル）", qoo10: "https://www.qoo10.jp/g/1117415069", imu: IMU_SUQQU, adId: "4An06KR-g7-vkg5h7u" },
};
// 既存表示が動いていないことの固定値（プチプラ側・リップの先頭3件）
const LIP_TOP3 = {
  spring: ["KATE リップモンスター 02 Pink banana", "オペラ リップティント N 05 コーラルピンク", "セザンヌ ラスティンググロスリップ CR1"],
  autumn: ["KATE リップモンスター 03 ちょっと不機嫌なピンク", "KATE リップモンスター 11 5時の黄昏", "メイベリン スーパーステイ ヴィニルインク 100"],
  summer: ["KATE リップモンスター 04 パンプキンワイン", "rom&nd ジューシーラスティングティント 06 フィグフィグ", "オペラ リップティント N 03 シフォンピンク"],
  winter: ["KATE リップモンスター 06 2:00AM"],
};

let ng = 0;
const ok = (c, m) => { console.log((c ? "  [PASS] " : "  [FAIL] ") + m); if (!c) ng++; };

async function openCosme(page, label) {
  await page.goto(ART, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.getByRole("button", { name: /おすすめコスメ/ }).click();
  await page.getByRole("button", { name: new RegExp("^" + label + "$") }).first().click();
  await page.waitForSelector("#colorlab-root >> text=に似合うコスメはコレ", { timeout: 8000 });
}

// カード1枚ぶんの実測値を取る
const readCards = (root) => root.evaluate((el) => {
  const cards = [...el.querySelectorAll("div.rounded-2xl.p-4.mb-3")];
  return cards.map((c) => {
    const slot = c.querySelector(".a8ad-slot");
    const a8a = c.querySelector('a[href*="px.a8.net/svt/ejp"]');
    const px = [...c.querySelectorAll("img")].find((i) => /www17\.a8\.net\/0\.gif/.test(i.getAttribute("src") || ""));
    return {
      depacos: /DEPACOS/.test(c.innerText),
      name: c.querySelector(".text-sm.font-medium")?.textContent?.trim() || "",
      hasYen: /¥/.test(c.innerText),
      slotClass: slot ? slot.className : null,
      slotFilled: slot ? slot.childElementCount > 0 : null,
      a8href: a8a ? a8a.getAttribute("href") : null,
      a8img: a8a ? (a8a.querySelector("img")?.getAttribute("src") || null) : null,
      a8imgW: a8a ? Math.round(a8a.querySelector("img")?.getBoundingClientRect().width || 0) : 0,
      trackGif: !!px,
      links: [...c.querySelectorAll("a")].map((a) => a.textContent.trim()).filter(Boolean),
      ctaHref: [...c.querySelectorAll("a")].find((a) => a.textContent.trim() === "Qoo10で見る")?.getAttribute("href") || null,
    };
  });
});

const browser = await chromium.launch();

// ══ (1) ad.js 正常時（実ネットワーク） ══
console.log("\n== (1) ad.js 正常時 ==");
for (const [key, e] of Object.entries(EXPECT)) {
  console.log("\n-- " + e.label + " (" + key + ") --");
  const page = await browser.newPage({ viewport: { width: 420, height: 1400 } });
  const reqs = [];
  page.on("request", (r) => { if (/a8\.net/.test(r.url())) reqs.push(r.url()); });
  await openCosme(page, e.label);
  await page.waitForTimeout(4000);

  const root = page.locator("#colorlab-root");
  const cards = await readCards(root);
  const dep = cards.filter((c) => c.depacos);
  ok(dep.length === 1, "デパコスカードが1件 (実測 " + dep.length + "件 / 全カード " + cards.length + "枚)");
  ok(cards.length > 0 && cards[cards.length - 1].depacos, "デパコスカードが一覧の末尾にある");
  const d = dep[0] || {};
  ok(d.name === e.name, "商品名が一致: " + d.name);
  ok(d.hasYen === false, "価格(¥)を出していない");
  ok((d.slotClass || "").includes(e.adId), "span の class に a8adId (" + e.adId + ")");
  ok(d.slotFilled === true, "ad.js が span を埋めた");
  ok(!!d.a8href && d.a8href.includes("a8mat=" + MAT) && decodeURIComponent(d.a8href).includes(e.qoo10),
     "A8計測URL: " + (d.a8href || "").slice(0, 96));
  ok(d.a8img === e.imu, "商品画像が imu と一致: " + d.a8img);
  ok(d.a8imgW > 100, "商品画像がCSSで枠幅に収まっている (実測 " + d.a8imgW + "px)");
  ok(d.trackGif, "1x1 の計測gifが入っている");
  ok(d.links.includes("Qoo10で見る"), "ad.js 正常時も「Qoo10で見る」ボタンが出る");
  ok(!!d.ctaHref && d.ctaHref.startsWith("https://px.a8.net/svt/ejp?a8mat=" + MAT) && decodeURIComponent(d.ctaHref).includes(e.qoo10),
     "ボタンの遷移先がA8計測経由: " + (d.ctaHref || "").slice(0, 96));
  const adjs = reqs.filter((u) => /statics\.a8\.net\/ad\/ad\.js/.test(u));
  ok(adjs.length === 1, "ad.js の読み込みがちょうど1回 (実測 " + adjs.length + "回)");

  // 既存のプチプラカードが壊れていないこと
  const petit = cards.filter((c) => !c.depacos);
  ok(petit.length === 30, "既存のプチプラカードが30枚のまま (実測 " + petit.length + ")");
  ok(petit.every((c) => c.hasYen), "プチプラカードは全件で価格が出ている");
  ok(petit.every((c) => c.links.includes("楽天で見る") && c.links.includes("Amazonで見る")), "プチプラカードは全件で楽天/Amazonボタンが出ている");

  // リップ絞り込み: 先頭3件が既存のまま = リップ試着画面の slice(0,3) に影響なし
  await page.getByRole("button", { name: /^リップ$/ }).click();
  await page.waitForTimeout(300);
  const lips = (await readCards(root)).map((c) => c.name);
  ok(LIP_TOP3[key].every((n, i) => lips[i] === n), "リップ先頭が既存のまま: " + lips.slice(0, 3).join(" / "));
  ok(lips[lips.length - 1] === e.name, "リップ絞り込みでもデパコスは末尾");

  // 一式セット: price:null を巻き込まず合計が出る
  await page.getByRole("button", { name: /^一式セット$/ }).click();
  await page.waitForTimeout(300);
  const setText = await root.innerText();
  const total = setText.match(/合計 ¥([\d,]+)/);
  ok(!!total && !/NaN/.test(setText), "一式セット合計が壊れていない: " + (total ? "¥" + total[1] : "取得できず"));
  ok(!/DEPACOS/.test(setText), "一式セットにデパコスは入らない");

  // スクリーンショット（デパコスカードだけ）
  await page.getByRole("button", { name: /^すべて$/ }).click();
  await page.waitForTimeout(400);
  const card = root.locator("div.rounded-2xl.p-4.mb-3").filter({ hasText: "DEPACOS" }).first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await card.screenshot({ path: join(SHOTS, "depacosme_" + key + ".png") });
  await page.close();
}

// ══ (2) ad.js を落としたとき（フォールバック） ══
console.log("\n== (2) ad.js ロード失敗時（フォールバック） ==");
{
  const page = await browser.newPage({ viewport: { width: 420, height: 1400 } });
  await page.route("**statics.a8.net/**", (r) => r.abort());
  await openCosme(page, EXPECT.spring.label);
  await page.waitForTimeout(3000);
  const root = page.locator("#colorlab-root");
  const cards = await readCards(root);
  const d = cards.find((c) => c.depacos) || {};
  ok(!!d.name, "ad.js が落ちてもデパコスカードは出る（クラッシュしない）");
  ok(d.name === EXPECT.spring.name, "商品名が一致: " + d.name);
  ok(d.slotClass === null, "A8 の span は消えてフォールバック表示に切り替わった");
  ok(!!d.a8href && d.a8href.startsWith("https://px.a8.net/svt/ejp?a8mat=" + MAT) && decodeURIComponent(d.a8href).includes(EXPECT.spring.qoo10),
     "直リンク: " + (d.a8href || "").slice(0, 96));
  ok(d.a8img === EXPECT.spring.imu, "商品画像を自前で表示: " + d.a8img);
  ok(d.links.includes("Qoo10で見る"), "「Qoo10で見る」ボタンが出る (実測 " + JSON.stringify(d.links) + ")");
  ok(d.ctaHref === d.a8href, "ボタンの遷移先が画像リンクと同一のA8計測URL");
  const petit = cards.filter((c) => !c.depacos);
  ok(petit.length === 30 && petit.every((c) => c.hasYen), "プチプラ30枚は影響なし");
  const card = root.locator("div.rounded-2xl.p-4.mb-3").filter({ hasText: "DEPACOS" }).first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await card.screenshot({ path: join(SHOTS, "depacosme_fallback.png") });
  await page.close();
}

// ══ (3) ボタンを実際にクリックしたときの遷移先 ══
// A8 に本物のクリックを記録させたくないので、px.a8.net はコンテキストで abort して URL だけ実測する。
console.log("\n== (3) 「Qoo10で見る」ボタンの実クリック ==");
{
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1400 } });
  const hit = [];
  await ctx.route("**px.a8.net/svt/ejp**", (r) => { hit.push(r.request().url()); r.abort(); });
  const page = await ctx.newPage();
  await openCosme(page, EXPECT.summer.label);
  await page.waitForTimeout(4000);
  const card = page.locator("#colorlab-root div.rounded-2xl.p-4.mb-3").filter({ hasText: "DEPACOS" }).first();
  const [popup] = await Promise.all([
    page.waitForEvent("popup", { timeout: 15000 }),
    card.getByRole("link", { name: "Qoo10で見る" }).click(),
  ]);
  await page.waitForTimeout(1500);
  const dest = hit.find((u) => /a8ejpredirect/.test(u)) || popup.url();
  ok(dest.startsWith("https://px.a8.net/svt/ejp?a8mat=" + MAT), "クリック先が A8 の計測URL: " + dest.slice(0, 96));
  ok(decodeURIComponent(dest).includes(EXPECT.summer.qoo10), "a8ejpredirect が正しいQoo10商品ページ: " + EXPECT.summer.qoo10);
  ok(!!popup, "別タブ（target=_blank）で開く");
  await ctx.close();
}

await browser.close();
console.log(ng === 0 ? "\nALL PASS" : "\n" + ng + " 件 FAIL");
process.exit(ng === 0 ? 0 : 1);
