// 答え合わせキャンペーン（MINE v1）の検収。
//   node test/kotaeawase_check.mjs [バンドルのパス]   （省略時は dist/colorlab.iife.js）
// アプリから workers.dev への通信は page.route で横取りし、本物の worker コード
// （worker/selfcard-worker.js → mine.js）に node:sqlite の D1 をつないで返す。外部通信ゼロ。
import { chromium } from "playwright";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join, resolve } from "path";
import { tmpdir } from "os";
import zlib from "zlib";
import worker from "../worker/selfcard-worker.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "screenshots", "mine");
mkdirSync(SHOTS, { recursive: true });
const BUNDLE = resolve(process.argv[2] || join(HERE, "../dist/colorlab.iife.js"));
const ENDPOINT = "https://colorlab-selfcard.the-company-20220901.workers.dev";
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? "  OK  " : "  NG  ") + n); };

// ── test/screenshot.mjs と同じ合成写真（イエベ春・2nd ブルベ夏・信頼度high）──
function crc32(buf) { let c, t = crc32.t || (crc32.t = (() => { const t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })()); let crc = 0xffffffff; for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, "ascii"); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }
function regionPng(W, H, base, rects) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const box = rects.map(([x0, y0, x1, y1, c]) => [Math.floor(x0 * W), Math.floor(y0 * H), Math.floor(x1 * W), Math.floor(y1 * H), c]);
  const raw = Buffer.alloc(H * (W * 3 + 1)); let o = 0;
  for (let y = 0; y < H; y++) { raw[o++] = 0; for (let x = 0; x < W; x++) { let c = base; for (const [x0, y0, x1, y1, col] of box) if (x >= x0 && x < x1 && y >= y0 && y < y1) c = col; raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PHOTO_OK = regionPng(600, 800, [190, 190, 195], [
  [0.40, 0.06, 0.60, 0.16, [62, 46, 38]], [0.24, 0.46, 0.36, 0.58, [233, 194, 168]],
  [0.64, 0.46, 0.76, 0.58, [233, 194, 168]], [0.34, 0.76, 0.66, 0.92, [235, 232, 228]],
]);

// ── 本物の worker を D1 代用でつなぐ ──
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(HERE, "../worker/schema.sql"), "utf8"));
const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, b), first: async () => db.prepare(sql).get(...a) ?? null, all: async () => ({ results: db.prepare(sql).all(...a) }), run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...a).changes) } }) });
const kvm = new Map();
const env = { DB: { prepare: (s) => stmt(s) }, SELFCARD_KV: { get: async (k) => kvm.get(k) ?? null, put: async (k, v) => { kvm.set(k, v); } }, KOTAE_CAMPAIGN: "kotae2026b", KOTAE_STATS_PUBLIC: "1" };   // v1.22.4: 第2弾の ID
const posted = [];
async function routeWorker(route) {
  const r = route.request();
  const u = new URL(r.url());
  if (u.pathname.startsWith("/campaign/answer")) posted.push(JSON.parse(r.postData() || "{}"));
  const h = new Headers({ Origin: "https://www.blubel.jp", "CF-Connecting-IP": "203.0.113.7" });
  if (r.method() === "POST") h.set("Content-Type", "application/json");
  const res = await worker.fetch(new Request(u.toString(), { method: r.method(), headers: h, body: r.method() === "POST" ? r.postData() : undefined }), env);
  await route.fulfill({ status: res.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: await res.text() });
}

// ── ハーネス（本番と同じく、先にスクリプト → 本文の div を自動マウント）──
// 入口は /pages/personalcolor?campaign=kotaeawase（2026-09-19 決定: GTM は変えない）
const LPS = Object.fromEntries(["blubel", "iebel"].map((site) => [site, readFileSync(join(HERE, `../lp/kotaeawase_lp_${site}.html`), "utf8")]));
const PRIZES = JSON.parse(readFileSync(join(HERE, "../lp/kotaeawase_prizes.json"), "utf8"));
const harness = (name, body) => {
  const p = join(tmpdir(), `_kotae_${name}.html`);
  writeFileSync(p, `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="${pathToFileURL(BUNDLE).href}" defer></script></head><body style="margin:0;background:#fff">${body}</body></html>`);
  return pathToFileURL(p).href;
};
const PLAIN = harness("plain", `<div id="colorlab-root">アプリを読み込み中…</div>`);
const CAMP = PLAIN + "?campaign=kotaeawase";

console.log("■ 名前・色が本体の TYPES と一致");
{
  const src = readFileSync(join(HERE, "../src/color_lab_stylist_v23.jsx"), "utf8");
  const ksrc = readFileSync(join(HERE, "../src/kotaeawase.jsx"), "utf8");
  const SEASON = Object.fromEntries([...ksrc.matchAll(/\n  (spring|summer|autumn|winter): \{ name: "([^"]+)", accent: "(#[0-9A-Fa-f]+)" \}/g)].map((m) => [m[1], { name: m[2], accent: m[3] }]));
  check("kotaeawase.jsx の SEASON が4つ読める", Object.keys(SEASON).length === 4);
  for (const k of Object.keys(SEASON)) {
    const m = src.match(new RegExp(`\\n  ${k}: \\{ key: "${k}", num: \\d, name: "([^"]+)"[^\\n]*?accent: "(#[0-9A-Fa-f]+)"`));
    check(`${k}: 名前 ${SEASON[k].name} / accent ${SEASON[k].accent} が TYPES と同じ`, !!m && m[1] === SEASON[k].name && m[2] === SEASON[k].accent);
  }
}

console.log("■ LP（Fulmo 貼り付け用 HTML・BLUBEL / IEBEL）の機械ゲート");
for (const [site, lpBody] of Object.entries(LPS)) {
  const L = site.toUpperCase();
  const lpText = lpBody.replace(/<!--[\s\S]*?-->/, "");
  check(`${L}: script タグが無い`, !/<script/i.test(lpBody));
  const ext = [...lpText.matchAll(/(src|href)\s*=\s*"(https?:[^"]+)"/gi)].map((m) => m[2]);
  check(`${L}: 外部URLは商品画像（fulmo-img-server.com の img）だけ`, ext.length === 10 && ext.every((u) => u.startsWith("https://fulmo-img-server.com/")) && !/@import|url\(\s*["']?https?:/i.test(lpText));
  const css = lpText.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, "");
  const sels = [...css.matchAll(/([^{}]+)\{/g)].flatMap((m) => m[1].split(",").map((x) => x.trim())).filter(Boolean);
  check(`${L}: CSS のセレクタ ${sels.length} 個がすべて .kt 配下`, sels.every((x) => x.startsWith(".kt")));
  check(`${L}: リンクは相対パス・target なし（参加ボタン2つ・商品10点・トップ）`,
    (lpText.match(/href="\/pages\/personalcolor\?campaign=kotaeawase"/g) || []).length === 2 && (lpText.match(/href="\/item\/\d+"/g) || []).length === 10 && /href="\/pages\/personalcolor"/.test(lpText) && !/target=/.test(lpText));
  check(`${L}: 見出し・サブ文言・本文が指示どおり`,
    lpText.includes("研究所監修12タイプ別パーソナルカラー診断！") && lpText.includes("プロ診断実証キャンペーン！") &&
    lpText.includes("プロのパーソナルカラー診断を受けたことがある方へ") &&
    lpText.includes("プロに診断されたあなたの色を、研究所監修の12タイプ診断でも同じように導き出せるか。その場で確かめられます。"));
  check(`${L}: 景品「2名様に、${L}商品1点をプレゼント！」・候補10点から選べる`, lpText.includes(`2名様に、${L}商品1点をプレゼント！`) && /候補10点から/.test(lpText));
  const items = PRIZES[site];
  const okItems = items.every((it) => lpText.includes(`href="/item/${it.item_id}"`) && lpText.includes(`src="${it.image}"`) && lpText.includes(`¥${it.price.toLocaleString("en-US")}`));
  check(`${L}: 候補10点（item_id・画像URL・価格）が JSON どおり`, items.length === 10 && okItems);
  check(`${L}: 参加ステップ4枚（①〜④の文言どおり）`, (lpText.match(/class="kt-step"/g) || []).length === 4 &&
    ["プロ診断の結果を選ぶ", "下のボタンから進み、プロに言われたあなたのタイプを選択", "そのままアプリで診断", "「写真で診断」を実行（写真は端末内だけで解析、外部には送信されません）",
     "その場で結果が分かる", "プロの診断とアプリの診断が「同じタイプ」だったかどうか、その場で表示されます", "結果画像をSNSに投稿", "保存した画像をストーリーに投稿し、指定ハッシュタグと指定アカウントをメンション"].every((x) => lpText.includes(x)));
  check(`${L}: 「みんなの結果」セクションが無い`, !/みんなの|一致率|リアルタイム/.test(lpText));
  check(`${L}: ハッシュタグ・メンション・当選発表`, /#答え合わせキャンペーン #ColorLabMINE/.test(lpText) && /ブルベの方は @blube_lab、イエベの方は @iebe_lab/.test(lpText) && /両アカウントのストーリーで当選者にDMでご連絡します/.test(lpText));
  // 2026-09-21 keisuke 変更: 2026-09-26〜10-04（Worker の KOTAE_START / KOTAE_END と同じ）・当選 3名様 → 2名様
  check(`${L}: 「未定」「在庫」が無い・期間は 2026年9月26日（土）〜10月4日（日）（記入欄が残っていない）`, !/未定|在庫|開始日確定後に記入/.test(lpText) && lpText.includes("<dt>期間</dt><dd>2026年9月26日（土）〜10月4日（日）（9日間）</dd>"));
}
check("IEBEL の候補は BLUBEL と同じ商品・同じ価格の IEBEL 版", PRIZES.iebel.every((it, i) => it.price === PRIZES.blubel[i].price && it.name === PRIZES.blubel[i].name && it.item_id !== PRIZES.blubel[i].item_id));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
await ctx.route(ENDPOINT + "/**", routeWorker);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

console.log("■ LP（静的ページ）の表示");
for (const site of ["blubel", "iebel"]) {
  await page.goto(harness("lp_" + site, LPS[site]), { waitUntil: "load" });
  await page.evaluate(() => Promise.all([...document.images].map((i) => { i.loading = "eager"; return i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }); })));
  const imgs = await page.evaluate(() => [...document.querySelectorAll(".kt-item img")].map((i) => i.naturalWidth));
  check(`LP ${site}: 商品画像10枚が読み込める`, imgs.length === 10 && imgs.every((w) => w > 0));
  check(`LP ${site}: 390px 幅で横スクロールが出ない`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: join(SHOTS, `k00_lp_${site}.png`), fullPage: true });
}

console.log("■ 通常ページは今までどおり（キャンペーン画面を出さない）");
{
  await page.goto(PLAIN, { waitUntil: "load" });
  await page.waitForSelector("#colorlab-root >> text=写真で診断", { timeout: 15000 });
  const t = await page.locator("#colorlab-root").innerText();
  check("ホーム画面（写真で診断タイル）が出る", /写真＋質問で12タイプ診断/.test(t));
  check("答え合わせの入力画面は出ない", !/答え合わせ/.test(t));
}

// v1.22.3: 通常ページ（IG のプロフィールのリンクの行き先）に、実施期間中だけキャンペーンの入口を出す
console.log("■ 通常ページのキャンペーン入口（実施期間中だけ）");
{
  const iso = (d) => new Date(Date.now() + d * 86400000 + 9 * 3600000).toISOString().slice(0, 10);   // JST の日付
  const cases = [["期間中", iso(-1), iso(1), true], ["開始前", iso(1), iso(3), false], ["終了後", iso(-3), iso(-1), false], ["未設定", null, null, false]];
  for (const [name, s, e, want] of cases) {
    if (s) { env.KOTAE_START = s; env.KOTAE_END = e; } else { delete env.KOTAE_START; delete env.KOTAE_END; }
    await page.goto(PLAIN, { waitUntil: "load" });
    await page.waitForSelector("#colorlab-root >> text=写真で診断", { timeout: 15000 });
    await page.waitForTimeout(600);
    const n = await page.locator("[data-kotae-banner]").count();
    check(`${name}: 入口を${want ? "出す" : "出さない"}`, (n === 1) === want);
    if (want) {
      const b = page.locator("[data-kotae-banner]");
      const bt = await b.innerText();
      check("入口の文言（プロ診断を受けた方へ・実施中・期間・ボタン「答え合わせをはじめる」）",
        /プロのパーソナルカラー診断を受けた方へ/.test(bt) && /答え合わせキャンペーン実施中/.test(bt) && /月\d+日（.）〜\d+月\d+日（.）/.test(bt) && /答え合わせをはじめる/.test(bt));
      check("入口の当選人数: Worker が人数を返さないときは既定の2名様（v1.22.4）", /参加した方の中から2名様に商品をプレゼント/.test(bt));
      check("入口の見出しは1行（折り返さない）", await b.locator("div").nth(1).evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getClientRects().length === 1 && e.scrollWidth <= e.clientWidth + 1; }));
      const box = await b.boundingBox();
      check(`入口は最初の画面内（上端 ${Math.round(box.y)}px・下端 ${Math.round(box.y + box.height)}px < 844px）`, box.y + box.height < 844);
      await page.screenshot({ path: join(SHOTS, "k00b_home_banner.png") });
      await b.getByRole("button", { name: "答え合わせをはじめる" }).click();
      await page.waitForSelector("#colorlab-root >> text=プロ診断の結果（1st）", { timeout: 10000 });
      check("ボタンで ?campaign=kotaeawase の答え合わせ入力へ（LP のボタンと同じ行き先）", new URL(page.url()).searchParams.get("campaign") === "kotaeawase");
      check("答え合わせ入力画面には入口を重ねて出さない", (await page.locator("[data-kotae-banner]").count()) === 0);
    }
  }
  delete env.KOTAE_START; delete env.KOTAE_END;
  // v1.22.4: 9/25 の夜に GTM を先に切り替えても、第1弾の最終日は第1弾の人数・期間を出す（Worker の KOTAE_ROUNDS）
  env.KOTAE_ROUNDS = `kotae2026:${iso(-2)}:${iso(0)}:3,kotae2026b:${iso(1)}:${iso(9)}:2`;
  for (const [name, want] of [["第1弾の最終日", 3], ["第2弾の初日", 2]]) {
    if (want === 2) env.KOTAE_ROUNDS = `kotae2026:${iso(-3)}:${iso(-1)}:3,kotae2026b:${iso(0)}:${iso(8)}:2`;
    await page.goto(PLAIN, { waitUntil: "load" });
    await page.waitForSelector("#colorlab-root >> text=写真で診断", { timeout: 15000 });
    await page.waitForTimeout(600);
    const bt = (await page.locator("[data-kotae-banner]").count()) ? await page.locator("[data-kotae-banner]").innerText() : "";
    const [, m, d] = (want === 2 ? iso(0) : iso(-2)).split("-").map(Number);
    check(`${name}: 入口は ${want}名様・期間は ${m}月${d}日〜`, bt.includes(`${want}名様に商品をプレゼント`) && bt.includes(`${m}月${d}日（`));
    if (want === 2) await page.screenshot({ path: join(SHOTS, "k00c_home_banner_round2.png") });
  }
  delete env.KOTAE_ROUNDS;
}

async function runPhoto() {
  const boxes = page.locator("#colorlab-root input[type=checkbox]");
  await page.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
  await page.getByRole("button", { name: /^地毛に近い$/ }).click();
  await page.getByRole("button", { name: /撮影にすすむ/ }).click();
  await page.waitForSelector("#colorlab-root >> text=カメラを起動する", { timeout: 5000 });
  await page.getByRole("button", { name: /カメラを起動する/ }).click();
  await page.waitForSelector("#colorlab-root >> text=写真を選ぶ", { timeout: 10000 });
  await page.locator("#colorlab-root input[type=file]").setInputFiles({ name: "ok.png", mimeType: "image/png", buffer: PHOTO_OK });
}

console.log("■ ?campaign=kotaeawase：入力 → 写真で診断 → 一致");
{
  await page.goto(CAMP, { waitUntil: "load" });
  await page.waitForSelector("#colorlab-root >> text=プロ診断の結果（1st）", { timeout: 15000 });
  await page.waitForSelector("#colorlab-root >> text=まだ回答がありません", { timeout: 10000 });
  check("入力画面の下にリアルタイム集計が出る（0件表示）", true);
  check("390px 幅で横スクロールが出ない", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, "k01_campaign_input.png"), fullPage: true });

  const start = page.getByRole("button", { name: /結果の選択と確認をしてください/ });
  check("未入力のうちは開始ボタンが無効", await start.isDisabled());
  await page.locator("#colorlab-root").getByRole("button", { name: "イエベ春", exact: true }).first().click();
  check("1st だけ選んでも確認チェック前は無効", await page.getByRole("button", { name: /結果の選択と確認をしてください/ }).isDisabled());
  // 2nd の並びは「言われていない / 1st 以外の3つ」。ブルベ夏は 2nd 側の1つ目
  const secondBtns = page.locator("#colorlab-root button[aria-pressed]");
  const labels = await secondBtns.allInnerTexts();
  check("2nd の選択肢から 1st（イエベ春）が外れる", labels.filter((l) => l === "イエベ春").length === 1 && labels.includes("言われていない"));
  await secondBtns.nth(5).click(); // 1st の4つ + 言われていない の次 = ブルベ夏
  await page.locator("#colorlab-root input[type=checkbox]").check();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, "k02_input_filled.png"), fullPage: true });
  await page.getByRole("button", { name: /写真で診断して答え合わせする/ }).click();

  await runPhoto();
  await page.waitForSelector("#colorlab-root >> text=プロと同じ診断結果でした！", { timeout: 15000 });
  await page.waitForSelector("#colorlab-root >> text=みんなの答え合わせ", { timeout: 10000 });
  const t = await page.locator("#colorlab-root").innerText();
  check("アプリの結果は既存エンジンの判定（イエベ春 / 2nd ブルベ夏）", /アプリ（写真で診断）\s*イエベ春\s*2nd：ブルベ夏/.test(t));
  check("一致の文言「プロと同じ診断結果でした！」", /プロと同じ診断結果でした！/.test(t) && /1st（いちばん似合うシーズン）が一致しました/.test(t));
  check("通常の結果ページ（タイプです！）には行かない", !/タイプです！/.test(t));
  check("送信内容はタイプ名だけ（写真なし）", posted.length === 1 && Object.keys(posted[0]).sort().join() === "app_first,app_second,campaign,device_id,pro_first,pro_second,site" && posted[0].pro_first === "spring" && posted[0].pro_second === "summer" && posted[0].app_first === "spring");
  check("集計は 1件・1st 一致率 100%", /100%/.test(t) && /1 \/ 1 人/.test(t));
  check("応募方法: ハッシュタグ2つ・メンションはアプリの結果（イエベ春）→ @iebe_lab", /#答え合わせキャンペーン #ColorLabMINE を付けて\s*@iebe_lab をメンションしてください/.test(t));
  check("実施期間（Worker 未設定）は「近日お知らせします」", /実施期間：近日お知らせします/.test(t));
  check("当選発表の文言が出る", /当選発表：期間終了後、@blube_lab・@iebe_lab 両アカウントのストーリーで当選者にDMでご連絡します。/.test(t));
  check("画面に「未定」が出ない", !/未定/.test(t));
  const cells = await page.locator("#colorlab-root table tbody td").count();
  check("集計表は 4行 x (見出し+4列) = 20セル", cells === 20);
  await page.waitForTimeout(800); // fade-up（0.5秒）が終わってから撮る
  await page.screenshot({ path: join(SHOTS, "k03_result_match.png"), fullPage: true });

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /ストーリー用の画像を保存/ }).click()]);
  const png = join(SHOTS, "k04_story_match.png");
  await dl.saveAs(png);
  const buf = readFileSync(png);
  check("ストーリー画像は 1080x1920 の PNG", buf.readUInt32BE(16) === 1080 && buf.readUInt32BE(20) === 1920);
}

console.log("■ 同じ端末の2回目（不一致）は集計に入れない");
{
  await page.getByRole("button", { name: /プロ診断の入力に戻る/ }).click();
  await page.waitForSelector("#colorlab-root >> text=1 / 1 人", { timeout: 10000 });
  check("入力画面に戻ると集計（1 / 1 人）が見える", true);
  await page.locator("#colorlab-root").getByRole("button", { name: "ブルベ冬", exact: true }).first().click();
  await page.locator("#colorlab-root input[type=checkbox]").check();
  await page.getByRole("button", { name: /写真で診断して答え合わせする/ }).click();
  await runPhoto();
  await page.waitForSelector("#colorlab-root >> text=プロとは異なる結果でした", { timeout: 15000 });
  await page.waitForSelector("#colorlab-root >> text=記録済み", { timeout: 10000 });
  const t = await page.locator("#colorlab-root").innerText();
  check("不一致の文言「プロとは異なる結果でした（診断結果：イエベ春タイプ）」", /プロとは異なる結果でした\s*（診断結果：イエベ春タイプ）/.test(t));
  check("不一致の表示（プロ ブルベ冬 / アプリ イエベ春）", /プロ診断\s*ブルベ冬/.test(t) && /1st（いちばん似合うシーズン）が違いました/.test(t));
  check("「記録済み」の注記が出て、集計は 1件のまま", /記録済み/.test(t) && /1 \/ 1 人/.test(t));
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, "k05_result_mismatch_second_try.png"), fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /ストーリー用の画像を保存/ }).click()]);
  await dl.saveAs(join(SHOTS, "k06_story_mismatch.png"));
}

console.log("■ 別の端末の不一致は集計に入り、外れも表に残る");
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx2.route(ENDPOINT + "/**", routeWorker);
  const p2 = await ctx2.newPage();
  await p2.goto(CAMP, { waitUntil: "load" });
  await p2.waitForSelector("#colorlab-root >> text=プロ診断の結果（1st）", { timeout: 15000 });
  await p2.locator("#colorlab-root").getByRole("button", { name: "ブルベ夏", exact: true }).first().click();
  await p2.locator("#colorlab-root input[type=checkbox]").check();
  await p2.getByRole("button", { name: /写真で診断して答え合わせする/ }).click();
  const boxes = p2.locator("#colorlab-root input[type=checkbox]");
  await p2.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
  await p2.getByRole("button", { name: /^地毛に近い$/ }).click();
  await p2.getByRole("button", { name: /撮影にすすむ/ }).click();
  await p2.getByRole("button", { name: /カメラを起動する/ }).click();
  await p2.waitForSelector("#colorlab-root >> text=写真を選ぶ", { timeout: 10000 });
  await p2.locator("#colorlab-root input[type=file]").setInputFiles({ name: "ok.png", mimeType: "image/png", buffer: PHOTO_OK });
  await p2.waitForSelector("#colorlab-root >> text=プロとは異なる結果でした", { timeout: 15000 });
  await p2.waitForSelector("#colorlab-root >> text=1 / 2 人", { timeout: 10000 });
  const cell = await p2.locator("#colorlab-root table tbody tr").nth(1).locator("td").nth(1).innerText();
  check("2件目で 1st 一致率 50%（1/2）", /50%/.test(await p2.locator("#colorlab-root").innerText()));
  check("外れ（プロ ブルベ夏 → アプリ イエベ春）のセルが 1", cell.trim() === "1");
  // 開き直した人にも同じ数字が見えること（入力画面の集計）
  await p2.reload({ waitUntil: "load" });
  await p2.waitForSelector("#colorlab-root >> text=1 / 2 人", { timeout: 10000 });
  check("開き直した入力画面の集計にも反映（1 / 2 人）", true);
  await p2.waitForTimeout(800);
  await p2.screenshot({ path: join(SHOTS, "k07_campaign_input_after_2.png"), fullPage: true });
  await ctx2.close();
}

console.log("■ 実施期間の表示と期間外（Worker の KOTAE_START / KOTAE_END）");
{
  const jst = (off) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const jp = (s) => { const [y, m, d] = s.split("-").map(Number); return `${m}月${d}日（${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}）`; };
  const fresh = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await c.route(ENDPOINT + "/**", routeWorker);
    const pg = await c.newPage();
    pg.on("pageerror", (e) => errors.push(String(e)));
    return { c, pg };
  };
  // 期間中: 入力画面の集計に期間が出る
  env.KOTAE_START = jst(0); env.KOTAE_END = jst(6);
  let { c, pg } = await fresh();
  await pg.goto(CAMP, { waitUntil: "load" });
  await pg.waitForSelector("#colorlab-root >> text=みんなの答え合わせ", { timeout: 15000 });
  const want = `実施期間：${jp(jst(0))}〜${jp(jst(6))}`;
  check(`期間中: 入力画面に「${want}」`, (await pg.locator("#colorlab-root").innerText()).includes(want));
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: join(SHOTS, "k08_campaign_input_period.png"), fullPage: true });
  await c.close();

  // 開始前: 写真で診断まで進めても記録されず、理由と期間が出る
  env.KOTAE_START = jst(1); env.KOTAE_END = jst(7);
  ({ c, pg } = await fresh());
  const totalBefore = db.prepare("SELECT COUNT(*) n FROM kotae_answers").get().n;
  await pg.goto(CAMP, { waitUntil: "load" });
  await pg.waitForSelector("#colorlab-root >> text=プロ診断の結果（1st）", { timeout: 15000 });
  await pg.getByRole("button", { name: "ブルベ夏", exact: true }).first().click();
  await pg.locator("#colorlab-root input[type=checkbox]").check();
  await pg.getByRole("button", { name: /写真で診断して答え合わせする/ }).click();
  const bx = pg.locator("#colorlab-root input[type=checkbox]");
  await pg.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
  for (let i = 0; i < await bx.count(); i++) await bx.nth(i).check();
  await pg.getByRole("button", { name: /^地毛に近い$/ }).click();
  await pg.getByRole("button", { name: /撮影にすすむ/ }).click();
  await pg.getByRole("button", { name: /カメラを起動する/ }).click();
  await pg.waitForSelector("#colorlab-root >> text=写真を選ぶ", { timeout: 10000 });
  await pg.locator("#colorlab-root input[type=file]").setInputFiles({ name: "ok.png", mimeType: "image/png", buffer: PHOTO_OK });
  await pg.waitForSelector("#colorlab-root >> text=キャンペーンの開始前です", { timeout: 15000 });
  const tb = await pg.locator("#colorlab-root").innerText();
  check("開始前: 「開始前のため集計に入りません」と期間を出し、集計表は見せる", /この結果は集計に入りません（実施期間 /.test(tb) && /みんなの答え合わせ/.test(tb));
  check("開始前: D1 に記録されない", db.prepare("SELECT COUNT(*) n FROM kotae_answers").get().n === totalBefore);
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: join(SHOTS, "k09_result_before_start.png"), fullPage: true });
  await c.close();

  // 終了後: 入力画面の集計に「終了しました」
  env.KOTAE_START = jst(-7); env.KOTAE_END = jst(-1);
  ({ c, pg } = await fresh());
  await pg.goto(CAMP, { waitUntil: "load" });
  await pg.waitForSelector("#colorlab-root >> text=みんなの答え合わせ", { timeout: 15000 });
  check("終了後: 入力画面の集計に「（終了しました）」", /（終了しました）/.test(await pg.locator("#colorlab-root").innerText()));
  await c.close();
  env.KOTAE_START = ""; env.KOTAE_END = "";
}

console.log("■ 集計を非公開にしているとき（Worker の KOTAE_STATS_PUBLIC が \"1\" 以外）");
{
  env.KOTAE_STATS_PUBLIC = "";
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  await c.route(ENDPOINT + "/**", routeWorker);
  const pg = await c.newPage();
  pg.on("pageerror", (e) => errors.push(String(e)));
  const got = [];
  pg.on("response", async (r) => { if (/\/campaign\//.test(r.url())) { try { got.push(await r.json()); } catch (e) {} } });
  await pg.goto(CAMP, { waitUntil: "load" });
  await pg.waitForSelector("#colorlab-root >> text=実施期間：", { timeout: 15000 });
  const t0 = await pg.locator("#colorlab-root").innerText();
  check("非公開: 入力画面に集計（みんなの答え合わせ・件数）を出さず、期間だけ出す", !/みんなの答え合わせ|人）|一致率/.test(t0) && /実施期間：/.test(t0));
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: join(SHOTS, "k10_hidden_input.png"), fullPage: true });
  await pg.getByRole("button", { name: "イエベ春", exact: true }).first().click();
  await pg.locator("#colorlab-root input[type=checkbox]").check();
  await pg.getByRole("button", { name: /写真で診断して答え合わせする/ }).click();
  const bx = pg.locator("#colorlab-root input[type=checkbox]");
  await pg.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
  for (let i = 0; i < await bx.count(); i++) await bx.nth(i).check();
  await pg.getByRole("button", { name: /^地毛に近い$/ }).click();
  await pg.getByRole("button", { name: /撮影にすすむ/ }).click();
  await pg.getByRole("button", { name: /カメラを起動する/ }).click();
  await pg.waitForSelector("#colorlab-root >> text=写真を選ぶ", { timeout: 10000 });
  const before = db.prepare("SELECT COUNT(*) n FROM kotae_answers").get().n;
  await pg.locator("#colorlab-root input[type=file]").setInputFiles({ name: "ok.png", mimeType: "image/png", buffer: PHOTO_OK });
  await pg.waitForSelector("#colorlab-root >> text=プロと同じ診断結果でした！", { timeout: 15000 });
  await pg.waitForTimeout(800);
  const t1 = await pg.locator("#colorlab-root").innerText();
  check("非公開: 結果画面にも集計の数字を出さない", !/みんなの答え合わせ|一致率|人）/.test(t1));
  check("非公開: 回答は記録は続ける（D1 に1件増える）", db.prepare("SELECT COUNT(*) n FROM kotae_answers").get().n === before + 1);
  check("非公開: API の応答に件数・一致率・行列が入っていない", got.length >= 2 && got.every((j) => j.stats && j.stats.hidden === true && !("total" in j.stats) && !("matrix" in j.stats)));
  await pg.screenshot({ path: join(SHOTS, "k11_hidden_result.png"), fullPage: true });
  const [dl] = await Promise.all([pg.waitForEvent("download"), pg.getByRole("button", { name: /ストーリー用の画像を保存/ }).click()]);
  await dl.saveAs(join(SHOTS, "k12_hidden_story.png"));
  await c.close();
  env.KOTAE_STATS_PUBLIC = "1";
}

console.log("■ 写真画面の戻る");
{
  await page.goto(CAMP, { waitUntil: "load" });
  await page.waitForSelector("#colorlab-root >> text=プロ診断の結果（1st）", { timeout: 15000 });
  await page.getByRole("button", { name: "イエベ秋", exact: true }).first().click();
  await page.locator("#colorlab-root input[type=checkbox]").check();
  await page.getByRole("button", { name: /写真で診断して答え合わせする/ }).click();
  await page.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
  await page.locator("#colorlab-root button").first().click(); // ヘッダーの戻る
  await page.waitForSelector("#colorlab-root >> text=プロ診断の結果（1st）", { timeout: 5000 });
  check("写真画面の「戻る」はホームではなく答え合わせの入力へ戻る", true);
}

check("ページ内の JS エラー 0件", errors.length === 0);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
