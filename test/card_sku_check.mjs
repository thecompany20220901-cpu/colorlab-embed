// 「自分の顔で作る」結果画面のおすすめ商品欄を実測する（v1.20.5）。
//   (1) 自分の顔ルートの結果画面に、閲覧中サイトの商品が 4〜6 点出る
//   (2) 商品リンクが「閲覧中サイト」の /items/{id} を指す（他サイトが混ざらない）
//   (3) 出ている商品が SKUS[site]（在庫あり）の実データと一致する
//   (4) アバタールートの結果画面は従来どおり（商品欄が出ない）
//   (5) 保存・シェア用PNGは 1080x1920 のカードのままで、商品欄が入っていない
// 閲覧中サイトは #colorlab-root[data-site] で blubel / iebel を切り替えて両方見る。
// 実行: node test/card_sku_check.mjs
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SHOTS = join(HERE, "screenshots");
mkdirSync(SHOTS, { recursive: true });

const harness = (site) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0"><div id="colorlab-root" data-site="${site}"></div>
<script>window.dataLayer=[];</script>
<script src="/dist/colorlab.iife.js"></script></body></html>`;
writeFileSync(resolve(HERE, "_sku_harness_blubel.html"), harness("blubel"), "utf-8");
writeFileSync(resolve(HERE, "_sku_harness_iebel.html"), harness("iebel"), "utf-8");

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

// ソースの SKUS をそのまま読み、画面に出た商品が在庫データと一致するか突き合わせる。
const SRC = readFileSync(join(ROOT, "src/color_lab_stylist_v23.jsx"), "utf-8");
const skuIds = (site) => {
  const head = SRC.indexOf("const SKUS = {");
  const start = SRC.indexOf("\n  " + site + ": [", head);
  const end = SRC.indexOf("\n  ],", start);
  return [...SRC.slice(start, end).matchAll(/\{ id: (\d+),/g)].map((m) => Number(m[1]));
};
const STOCK = { blubel: skuIds("blubel"), iebel: skuIds("iebel") };
// 商品画像は color_data.js の SKU_IMG（商品マスタ images1・25SKU全件）。
// 検証環境は外向き通信ができず画像そのものは読めないので、src が SKU_IMG の値と
// 一致するかで「正しい商品画像を指しているか」を見る。
const IMGSRC = readFileSync(join(ROOT, "src/color_data.js"), "utf-8");
const SKU_IMG = JSON.parse(IMGSRC.slice(IMGSRC.indexOf("{", IMGSRC.indexOf("export const SKU_IMG")),
  IMGSRC.indexOf("\n};", IMGSRC.indexOf("export const SKU_IMG")) + 2).replace(/;$/, ""));

const ok = [], ng = [];
const check = (c, l) => { (c ? ok : ng).push(l); return c; };

// 1x1 の透明PNG。中継を叩かずに「イラストが返ってきた」状態を作るために使う。
const PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
// 商品画像の代わりに置くダミー（薄いグレーの正方形）
const PNGBOX = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mP8//8/AzZgYsAFRiUpkwQATc0FBiVfvBAAAAAASUVORK5CYII=";

const browser = await chromium.launch();

// カードの結果画面まで進める。medium = "avatar" | "self"
async function toCardResult(site, medium, myType = "summer", mySecond = "winter") {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", (e) => ng.push(`[${site}/${medium}] pageerror: ` + e.message));
  // 中継は叩かない。自分の顔ルートは必ずここで打ち返す。
  await page.route("**/illustrate", (r) =>
    r.fulfill({ status: 200, contentType: "application/json",
                body: JSON.stringify({ image: PNG1, remaining: 10 }) }));
  // 商品画像(fulmo-img-server.com)はこの検証環境から取得できないため、レイアウトが
  // 分かるようダミー画像で埋める。src が本物を指しているかは SKU_IMG との突き合わせで見る。
  await page.route("https://fulmo-img-server.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(PNGBOX, "base64") }));
  await page.goto(base + "/test/_sku_harness_" + site + ".html");
  await page.waitForSelector("#colorlab-root button", { timeout: 20000 });
  // 端末に診断結果がある状態にする（カードは個性2問だけで終わる）。
  // 既定はブルベ夏（= BLUBEL 担当）。iebel で見たときに他サイトが混ざらないかを見るため、
  // 両サイトで同じタイプを通す。
  await page.evaluate((prof) => localStorage.setItem("colorlab-profile", prof),
    JSON.stringify({ myType: myType, mySecond: mySecond, myFrame: null }));
  await page.reload();
  await page.waitForSelector("#colorlab-root button", { timeout: 20000 });
  await page.getByRole("button", { name: /あなたの個性色が分かる！/ }).first().click();
  await page.getByRole("button", { name: medium === "self" ? /自分の顔で作る/ : /アバターで見る/ }).first().click();
  await page.getByRole("button", { name: /^考えて選ぶ/ }).click();
  await page.getByRole("button", { name: /^聞き役になる/ }).click();
  if (medium === "self") {
    await page.waitForSelector("#colorlab-root input[type=file]", { state: "attached", timeout: 20000 });
    await page.setInputFiles("#colorlab-root input[type=file]",
      { name: "p.png", mimeType: "image/png", buffer: Buffer.from(PNG1, "base64") });
  }
  await page.waitForTimeout(1200);
  return page;
}

// 画面に出ている商品リンク（/items/{id}）を拾う
const readItems = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#colorlab-root a[href*="/items/"]')].map((a) => ({
    href: a.href,
    name: (a.textContent || "").trim(),
    hasImg: !!a.querySelector("img"),
    imgSrc: (a.querySelector("img") || {}).src || "",
    price: /¥[\d,]+/.test(a.textContent || ""),
  })));

for (const site of ["blubel", "iebel"]) {
  const page = await toCardResult(site, "self");
  const shownSelf = await page.evaluate(() => !!document.querySelector('#colorlab-root img[src^="data:image/png"]'));
  check(shownSelf, `[${site}] 自分の顔で作ったイラストが結果画面に出ている`);
  check(await page.locator("#colorlab-root", { hasText: "RECOMMENDED ITEMS" }).count() > 0,
    `[${site}] おすすめ商品の見出しが出ている`);

  const items = await readItems(page);
  check(items.length >= 4 && items.length <= 6, `[${site}] 表示件数が4〜6点 (実測 ${items.length})`);
  check(items.every((i) => i.hasImg), `[${site}] 全商品に商品画像がある`);
  check(items.every((i) => {
    const id = i.href.match(/\/items\/(\d+)/)[1];
    return i.imgSrc === SKU_IMG[site][id];
  }), `[${site}] 商品画像が SKU_IMG[${site}][id] と一致する`);
  check(items.every((i) => i.name.length > 0), `[${site}] 全商品に商品名がある`);
  check(items.every((i) => i.price), `[${site}] 全商品に価格がある`);

  const other = site === "blubel" ? "iebel" : "blubel";
  check(items.every((i) => i.href.includes(site + ".jp/items/")),
    `[${site}] 商品リンクが閲覧中サイト(${site}.jp)を指す`);
  check(!items.some((i) => i.href.includes(other + ".jp/")),
    `[${site}] 他サイト(${other}.jp)の商品が混ざらない`);

  const ids = items.map((i) => Number(i.href.match(/\/items\/(\d+)/)[1]));
  check(ids.every((id) => STOCK[site].includes(id)),
    `[${site}] 出ている商品がすべて在庫データ SKUS.${site} に実在する`);
  check(new Set(ids).size === ids.length, `[${site}] 商品の重複が無い`);

  // 遷移先URLの組み立て。既存の ITEM_URL(site, id) と同じ形（UTM 付き）であること。
  // ※ 実サイトへの HTTP 到達確認は、この検証環境が外向き通信を許可していないため行えない。
  const shape = new RegExp("^https://" + site
    + "\\.jp/items/\\d+\\?utm_source=colorlab&utm_medium=app&utm_campaign=ai_stylist$");
  check(items.every((i) => shape.test(i.href)), `[${site}] 商品リンクが ITEM_URL と同じ形(UTM付き)`);
  ok.push(`[${site}] 先頭商品のリンク先: ${items[0].href}`);

  // 保存PNGを実際に取り出す（商品欄がカード画像に入っていないことを見る）
  const dataUrl = await page.evaluate(async () => await new Promise((done) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (!/^blob:/.test(this.href)) return orig.call(this);
      fetch(this.href).then((r) => r.blob()).then((bl) => {
        const fr = new FileReader();
        fr.onload = () => { HTMLAnchorElement.prototype.click = orig; done(fr.result); };
        fr.readAsDataURL(bl);
      });
    };
    [...document.querySelectorAll("#colorlab-root button")]
      .find((x) => x.textContent.includes("カードを画像で保存")).click();
  }));
  const png = Buffer.from(dataUrl.split(",")[1], "base64");
  const W = png.readUInt32BE(16), H = png.readUInt32BE(20);
  check(W === 1080 && H === 1920, `[${site}] 保存PNGは従来どおり 1080x1920 (実測 ${W}x${H})`);
  writeFileSync(join(SHOTS, `45_card_export_${site}.png`), png);

  // 商品ストリップは全幅に広げている（-mx-6 px-6）ので、ページ自体が横に伸びていないかを見る。
  // スマホ幅375pxでも崩れないこと（§5 の検証条件）。
  for (const w of [375, 420]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(over <= 0, `[${site}] 幅${w}px でページが横に伸びない (はみ出し ${over}px)`);
  }
  await page.locator("#colorlab-root").screenshot({ path: join(SHOTS, `45_card_self_${site}.png`) });
  // 横スクロールの右端（残りの商品）も撮る
  await page.evaluate(() => {
    const st = [...document.querySelectorAll("#colorlab-root div")]
      .find((d) => /auto|scroll/.test(getComputedStyle(d).overflowX)
        && d.scrollWidth > d.clientWidth + 10 && d.querySelector('a[href*="/items/"]'));
    if (st) st.scrollLeft = st.scrollWidth;
  });
  await page.waitForTimeout(300);
  await page.locator("#colorlab-root").screenshot({ path: join(SHOTS, `45_card_self_${site}_scrolled.png`) });
  await page.close();
}

// タイプの担当サイト（イエベ=IEBEL / ブルベ=BLUBEL）と閲覧中サイトが一致する場合と
// しない場合で、文言が出し分けられているか。どちらの場合も商品は閲覧中サイトのものだけ。
for (const [site, myType, second, own] of [["iebel", "spring", "autumn", true],
                                           ["iebel", "summer", "winter", false],
                                           ["blubel", "summer", "winter", true],
                                           ["blubel", "spring", "autumn", false]]) {
  const page = await toCardResult(site, "self", myType, second);
  const txt = await page.evaluate(() => document.querySelector("#colorlab-root").innerText);
  const label = `[${site}/${myType}]`;
  if (own) {
    check(/のあなたに似合うアイテム/.test(txt), `${label} 担当サイト一致 → 「…のあなたに似合うアイテム」`);
  } else {
    check(/のおすすめアイテム/.test(txt) && /にそろっています/.test(txt),
      `${label} 担当サイト不一致 → 言い切らない文言に切り替わる`);
  }
  const items = await readItems(page);
  const other = site === "blubel" ? "iebel" : "blubel";
  check(items.length >= 4 && items.every((i) => i.href.includes(site + ".jp/items/"))
        && !items.some((i) => i.href.includes(other + ".jp/")),
    `${label} 商品は閲覧中サイト(${site})のみ (${items.length}点)`);
  if (!own) await page.locator("#colorlab-root").screenshot({ path: join(SHOTS, `45_card_self_${site}_${myType}_cross.png`) });
  await page.close();
}

// アバタールートは従来どおり（商品欄が出ない）
for (const site of ["blubel", "iebel"]) {
  const page = await toCardResult(site, "avatar");
  const items = await readItems(page);
  check(items.length === 0, `[${site}] アバタールートは従来どおり商品欄が出ない (実測 ${items.length})`);
  check(await page.locator("#colorlab-root", { hasText: "カードを画像で保存" }).count() > 0,
    `[${site}] アバタールートの保存ボタンは従来どおり出ている`);
  await page.locator("#colorlab-root").screenshot({ path: join(SHOTS, `45_card_avatar_${site}.png`) });
  await page.close();
}

await browser.close();
server.close();
console.log("OK");
ok.forEach((l) => console.log("  ✓ " + l));
if (ng.length) { console.log("NG"); ng.forEach((l) => console.log("  ✗ " + l)); process.exit(1); }
console.log("\nすべて通過");
