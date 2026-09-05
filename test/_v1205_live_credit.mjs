// v1.20.5 本番実測の追試。_v1205_live.mjs で2点はっきりしなかったところだけを詰める。
//
//   ③ 監修表記は「閲覧中サイト」ではなく「1位タイプの担当サイト」で決まる。
//      前回は両サイトとも診断結果がイエベ春になり、ブルベ側の表記を本番で見られていない。
//      プロフィールを仕込んで 1位=ブルベ夏 / 1位=イエベ秋 の両方を実際に出す。
//   ⑤ requestfailed の中身。理由まで見ないと「本当に壊れているのか」が分からない。
//
// 生成は叩かない（アバタールートだけを通す）。課金ゼロ。
// 実行: node test/_v1205_live_credit.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "_v1205");
mkdirSync(OUT, { recursive: true });
const BAND_TOP = 1920 - 220;

// 1位タイプ -> 出るべき監修表記（TYPES[].site / .sns から決まる）
const WANT = {
  summer: { name: "ブルベ夏", text: "ブルベ研究所監修  @blube_lab" },
  autumn: { name: "イエベ秋", text: "イエベ研究所監修  @iebe_lab" },
};
const SITES = [
  { key: "BLUBEL", url: "https://www.blubel.jp/pages/personalcolor" },
  { key: "IEBEL", url: "https://www.iebel.jp/pages/personalcolor" },
];

const grabCard = (page) => page.evaluate(async () => await new Promise((ok, ng) => {
  const t = setTimeout(() => ng(new Error("save timeout")), 30000);
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    fetch(this.href).then((r) => r.blob()).then((bl) => {
      const fr = new FileReader();
      fr.onload = () => { clearTimeout(t); HTMLAnchorElement.prototype.click = orig; ok(fr.result); };
      fr.readAsDataURL(bl);
    });
  };
  [...document.querySelectorAll("#colorlab-root button")]
    .find((x) => /カードを画像で保存/.test(x.textContent)).click();
}));

const measureCredit = (page, dataUrl, text) => page.evaluate(async (v) => {
  const im = new Image();
  await new Promise((ok, ng) => { im.onload = ok; im.onerror = ng; im.src = v.dataUrl; });
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
      if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) { if (lo < 0) lo = x; hi = x; }
    }
    rows.push(lo < 0 ? null : [lo, hi]);
  }
  let bottom = -1;
  for (let y = rows.length - 1; y >= 0; y--) if (rows[y]) { bottom = y; break; }
  let top = bottom;
  while (top > 0 && rows[top - 1]) top--;
  let lo = 1e9, hi = -1;
  for (let y = top; y <= bottom; y++) if (rows[y]) { lo = Math.min(lo, rows[y][0]); hi = Math.max(hi, rows[y][1]); }
  const FAM = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif";
  const s = document.createElement("canvas").getContext("2d");
  s.font = "500 30px " + FAM;
  return { w: cv.width, h: cv.height, bottom, gap: v.bandTop - bottom,
           inkW: hi - lo + 1, wantW: Math.round(s.measureText(v.text).width) };
}, { dataUrl, bandTop: BAND_TOP, text });

let bad = 0;
const check = (c, l) => { if (!c) bad++; console.log((c ? "  ok  " : "  NG  ") + l); };

const browser = await chromium.launch();
for (const site of SITES) {
  console.log(`\n===== ${site.key} =====`);
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" });
  const page = await ctx.newPage();
  const errs = [];
  const failed = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("requestfailed", (r) => failed.push({
    url: r.url().slice(0, 90), reason: (r.failure() || {}).errorText || "?",
    type: r.resourceType(), nav: r.isNavigationRequest() }));

  for (const first of ["summer", "autumn"]) {
    const second = first === "summer" ? "winter" : "spring";
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("#colorlab-root button", { timeout: 60000 });
    // 12タイプ診断済みの人と同じ状態にする（カードは myType/mySecond をそのまま使う）
    await page.evaluate((v) => localStorage.setItem("colorlab-profile",
      JSON.stringify({ myType: v.first, mySecond: v.second, myFrame: null })), { first, second });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 60000 });

    await page.getByRole("button", { name: /あなたの個性色が分かる！/ }).first().click();
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: /アバターで見る/ }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /^考えて選ぶ/ }).click(); await page.waitForTimeout(300);
    await page.getByRole("button", { name: /^聞き役になる/ }).click(); await page.waitForTimeout(1500);

    const body = await page.textContent("#colorlab-root");
    const w = WANT[first];
    check(new RegExp("1st\\s*" + w.name).test(body), `[${first}] 1位が ${w.name} になっている`);

    const du = await grabCard(page);
    const f = `${OUT}/${site.key}_credit_${first}.png`;
    writeFileSync(f, Buffer.from(du.split(",")[1], "base64"));
    const m = await measureCredit(page, du, w.text);
    check(m.w === 1080 && m.h === 1920, `[${first}] 保存PNGは 1080x1920 (実測 ${m.w}x${m.h})`);
    check(m.gap >= 20, `[${first}] 下部帯とのすき間 ${m.gap}px (最下端 y=${m.bottom})`);
    check(Math.abs(m.inkW - m.wantW) <= 14,
      `[${first}] 監修表記「${w.text}」 (幅 実測${m.inkW}px / 期待${m.wantW}px / 差${Math.abs(m.inkW - m.wantW)}px)`);
    console.log(`      -> ${f}`);
  }

  check(errs.length === 0, "JSエラー0件" + (errs.length ? " → " + errs.slice(0, 3).join(" / ") : ""));
  // requestfailed は理由まで出す。SPA のプリフェッチ中断 (ERR_ABORTED) は壊れていない。
  console.log(`  -- requestfailed ${failed.length}件`);
  for (const f of failed.slice(0, 10)) console.log(`     ${f.reason}  ${f.type}${f.nav ? " (navigation)" : ""}  ${f.url}`);
  const real = failed.filter((f) => !/ERR_ABORTED/.test(f.reason));
  check(real.length === 0, `中断以外の読み込み失敗0件 (実測 ${real.length}件)`);

  await ctx.close();
}
await browser.close();
console.log(bad ? `\n=== NG ${bad}件 ===` : "\n=== すべて合格 ===");
process.exit(bad ? 1 : 0);
