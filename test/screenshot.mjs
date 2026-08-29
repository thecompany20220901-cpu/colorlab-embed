// §5 検証: Playwright で local_article.html を開き、両アプリの表示・画面遷移・
// localStorage再訪(おかえり)・375px レイアウトを確認し、test/screenshots/ にSSを出力。
//
// v1.4.0 (colorlab v23 / ngpolice v2) で確認する要点:
//   - ホームの AI機能2つ（コーデ提案 / コーデ採点）が「グレートーン」+「近日公開」バッジ
//   - 「顔写真で診断」は実測方式(白基準補正+CIELab)で解禁済み → 近日公開にならない
//   - 「コーデ提案」はシーン別記事22本のデータ参照方式で解禁済み → 近日公開にならない
//   - 「今日のコーデ採点」は色照合方式(CIELabのΔE)で解禁済み → 近日公開にならない
//   - v1.8.0 で3機能とも解禁されたため、ホームに「近日公開」バッジは1つも無い
//   - 近日公開モーダルがグローバル化（ホーム/結果ページの両方から開く）
//   - 12タイプ結果ページ: 苦手色ブロックが1箇所に統合 / 勝ち色10選 / コスメ
//   - コスメ一覧ページ: 上部の「似合うカラー」パレット
//   - 骨格結果ページ: 得意/注意が1行リスト（DesignIcon付き）
//   - シェア画像PNG（canvas → download）が生成される
//   - NG警察の結果ページ（ボタン2つ / 本家リンク）
//   - Liteモード実測: api.anthropic.com へのリクエストが0件
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, mkdirSync } from "fs";
import zlib from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, "screenshots");
mkdirSync(SHOTS, { recursive: true });
const ART = "file://" + join(__dirname, "local_article.html").replace(/\\/g, "/");

// ── 単色RGBのPNGバッファを自作（外部ライブラリ不要・判定を決定論的にするため） ──
function crc32(buf) {
  let c, table = crc32.t || (crc32.t = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function solidPng(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8bit, truecolor RGB
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) { raw[o++] = 0; for (let x = 0; x < size; x++) { raw[o++] = r; raw[o++] = g; raw[o++] = b; } }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// 領域ごとに色を塗り分けたPNG（顔写真診断の合成フィクスチャ用）
// rects: [x0, y0, x1, y1, [r,g,b]]（相対座標・後勝ち）
function regionPng(W, H, base, rects) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const box = rects.map(([x0, y0, x1, y1, c]) => [Math.floor(x0 * W), Math.floor(y0 * H), Math.floor(x1 * W), Math.floor(y1 * H), c]);
  const raw = Buffer.alloc(H * (W * 3 + 1));
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
    for (let x = 0; x < W; x++) {
      let c = base;
      for (const [x0, y0, x1, y1, col] of box) if (x >= x0 && x < x1 && y >= y0 && y < y1) c = col;
      raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2];
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// 顔写真診断のサンプリング領域(PH_REGION)に合わせた「良い写真」
// 白紙(235,232,228)=色かぶり3.0% / 頬(233,194,168) / 髪(62,46,38)
// → 補正後 skin L*81.9 a*9.5 b*16.5 / 髪との明度差61.1 → イエベ春(2nd ブルベ夏)・信頼度high
const PHOTO_OK = regionPng(600, 800, [190, 190, 195], [
  [0.40, 0.06, 0.60, 0.16, [62, 46, 38]],
  [0.24, 0.46, 0.36, 0.58, [233, 194, 168]],
  [0.64, 0.46, 0.76, 0.58, [233, 194, 168]],
  [0.34, 0.76, 0.66, 0.92, [235, 232, 228]],
]);
// コーデ採点のサンプリング領域(SC_REGION)に合わせたフィクスチャ（判定対象はイエベ春）
// 得意色: トップス=コーラルピンク #F4A582 / ボトムス=キャメル #C89B5A
const SCORE_GOOD = regionPng(600, 800, [216, 216, 220], [
  [0.34, 0.30, 0.66, 0.50, [244, 165, 130]],
  [0.36, 0.60, 0.64, 0.80, [200, 155, 90]],
]);
// NG色: トップス=真っ黒 #141414 / ボトムス=グレー #8C8C93
const SCORE_NG = regionPng(600, 800, [216, 216, 220], [
  [0.34, 0.30, 0.66, 0.50, [20, 20, 20]],
  [0.36, 0.60, 0.64, 0.80, [140, 140, 147]],
]);
// 全体が暗すぎる → 品質ゲートで却下されるべき写真
const SCORE_DARK = regionPng(600, 800, [16, 16, 18], [
  [0.34, 0.30, 0.66, 0.50, [26, 24, 24]],
  [0.36, 0.60, 0.64, 0.80, [22, 22, 26]],
]);

// 白紙が暗すぎる（wMax < 120）→ 品質ゲートで却下されるべき写真
const PHOTO_DARK = regionPng(600, 800, [30, 28, 26], [
  [0.24, 0.46, 0.36, 0.58, [70, 58, 50]],
  [0.34, 0.76, 0.66, 0.92, [64, 63, 62]],
]);

const results = [];
const log = (m) => { console.log(m); results.push(m); };
let failures = 0;
const check = (label, ok) => { log(`  [${ok ? "OK" : "NG"}] ${label}`); if (!ok) failures++; };

// AI機能が誤ってネットワークを叩いていないかを実測する（Liteモードの本丸）
const aiCalls = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  [page error]", m.text()); });
page.on("request", (r) => { if (/anthropic\.com/.test(r.url())) aiCalls.push(r.url()); });

async function shotEl(sel, name) { await page.locator(sel).screenshot({ path: join(SHOTS, name) }); log("  SS: " + name); }
async function shotView(name) { await page.screenshot({ path: join(SHOTS, name) }); log("  SS: " + name); }
const modal = () => page.locator("#colorlab-root >> text=新機能は、近日公開").first();
// mens版(#mens-root)が同じページに同居しており「骨格診断」「メニューへ戻る」等は
// 両アプリにヒットする。colorlab の操作は必ずこのスコープ経由で行う。
const cl = () => page.locator("#colorlab-root");
const countOf = (hay, needle) => hay.split(needle).length - 1;

// 12タイプ診断を最後まで進める（A/先頭の選択肢を押し続ける）
async function runQuiz() {
  for (let i = 0; i < 30; i++) {
    const savedType = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem("colorlab-profile") || "{}").myType || null; } catch (e) { return null; }
    });
    if (savedType) return savedType;
    const btns = page.locator("#colorlab-root button");
    const n = await btns.count();
    let clicked = false;
    for (let b = 0; b < n; b++) {
      const t = (await btns.nth(b).innerText().catch(() => "")).trim();
      if (t === "A" || /^A\b/.test(t) || (t.length <= 3 && /[A-DＡ-Ｄ]/.test(t))) { await btns.nth(b).click().catch(() => {}); clicked = true; break; }
    }
    if (!clicked && n > 0) await btns.first().click().catch(() => {});
    await page.waitForTimeout(200);
  }
  return null;
}

try {
  // ── 1. ホーム: AI3機能がグレートーン + 近日公開バッジ ──
  await page.goto(ART, { waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.waitForSelector("#ngpolice-root button", { timeout: 15000 });
  const homeText = await page.locator("#colorlab-root").innerText();
  check("両アプリがマウントされ日本語が表示された", /診断/.test(homeText));
  check("ホームに「近日公開」バッジが1つも無い（3機能とも解禁済み）", countOf(homeText, "近日公開") === 0);
  await shotEl("#colorlab-root", "01_home.png");

  // ── 2. 旧「近日公開」だった3機能が、すべて実画面へ進むこと ──
  const setProfile = async (v) => {
    await page.evaluate((val) => {
      try { val ? localStorage.setItem("colorlab-profile", val) : localStorage.removeItem("colorlab-profile"); } catch (e) {}
    }, v);
  };
  for (const [label, marker] of [
    ["今日のコーデ採点", "服の色とタイプの相性"],
    ["顔写真で診断", "撮影条件（すべて必要です）"],
    ["パーソナルカラー別コーデ提案", "今日のシーン"],
  ]) {
    await page.goto(ART, { waitUntil: "networkidle" });
    // タイプ未診断だとタイプ選択が先に出る画面があるため、この節だけ一時的に診断済みにする
    await setProfile(JSON.stringify({ myType: "spring", mySecond: "autumn", myFrame: null }));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#colorlab-root button", { timeout: 10000 });
    await cl().getByRole("button", { name: new RegExp(label) }).first().click();
    const ok = await page.locator(`#colorlab-root >> text=${marker}`).first().isVisible({ timeout: 5000 }).catch(() => false);
    check(`「${label}」が近日公開モーダルを出さず実画面へ進む`, ok && (await modal().count()) === 0);
  }
  await page.goto(ART, { waitUntil: "networkidle" });
  await setProfile(null); // 次の12タイプ診断を素通りさせないため必ず消す
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 10000 });
  // アプリはマウント時に {myType:null,...} を書き戻すため、キーの有無ではなく myType を見る
  const cleared = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("colorlab-profile") || "{}").myType || null; } catch (e) { return "err"; }
  });
  check("次の12タイプ診断のため保存タイプがクリアされている", cleared === null);
  await shotEl("#colorlab-root", "02_home_all_enabled.png");

  // ── 3. 12タイプ診断 → 結果ページ（苦手色1箇所 + 勝ち色10選 + コスメ） ──
  await page.getByRole("button", { name: /パーソナルカラー診断（12タイプ）/ }).click();
  const myType = await runQuiz();
  check("12タイプ診断が完了し localStorage に保存された", !!myType);
  await page.waitForTimeout(400);
  const resText = await page.locator("#colorlab-root").innerText();
  check("結果ページに「似合う色（勝ち色10選）」がある", /似合う色（勝ち色10選）/.test(resText));
  check("苦手色ブロックが1箇所に統合されている（出現1回）", countOf(resText, "苦手な色") === 1);
  check("苦手色の見出しが「苦手な色（顔まわりでは注意）」", /苦手な色（顔まわりでは注意）/.test(resText));
  check("結果ページに「仕上げのコスメはコレ！」がある", /仕上げのコスメはコレ/.test(resText));
  await shotEl("#colorlab-root", "03_quiz_result_ng1_and_cosme.png");

  // ── 3b. シェア画像PNG（canvas → download） ──
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: /結果を画像で保存|保存・シェア|画像/ }).first().click(),
  ]);
  const sharePath = join(SHOTS, "06_share_image.png");
  await download.saveAs(sharePath);
  check("シェア画像のファイル名が my_personal_color.png", download.suggestedFilename() === "my_personal_color.png");
  const { statSync } = await import("fs");
  const shareSize = statSync(sharePath).size;
  check("シェア画像PNGが生成された (" + shareSize.toLocaleString() + " bytes)", shareSize > 10000);
  log("  SS: 06_share_image.png (ダウンロード実物)");

  // ── 3c. 結果ページCTA → コーデ提案へ遷移（解禁済みなので近日公開モーダルは出ない） ──
  await page.getByRole("button", { name: /このタイプで「今日なに着る？」/ }).click();
  await page.waitForSelector("#colorlab-root >> text=今日のシーン", { timeout: 5000 });
  check("結果ページCTA → コーデ提案へ遷移する（近日公開モーダルが出ない）", (await modal().count()) === 0);

  // ── 4. コスメ一覧ページ: 上部の「似合うカラー」パレット ──
  await page.goto(ART, { waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 10000 });
  await page.getByRole("button", { name: /おすすめコスメ/ }).click();
  await page.waitForSelector("#colorlab-root >> text=に似合うコスメはコレ", { timeout: 5000 });
  const cosmeText = await page.locator("#colorlab-root").innerText();
  check("コスメ一覧に上部パレットの説明文がある", /似合うカラー/.test(cosmeText));
  const swatches = await page.locator("#colorlab-root span.w-8.h-8.rounded-full").count();
  check("コスメ一覧 上部パレットの色丸が5個: " + swatches, swatches === 5);
  await shotEl("#colorlab-root", "04_cosme_list_full.png");
  // 一覧が縦に長く上部パレットが潰れるため、上部だけを別に撮る
  await page.locator("#colorlab-root").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shotView("04b_cosme_top_palette.png");

  // ── 5. 骨格診断 → 結果ページ（得意/注意が1行リスト） ──
  await cl().getByRole("button", { name: /メニューへ戻る|ホーム/ }).first().click().catch(() => {});
  await page.goto(ART, { waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 10000 });
  await cl().getByRole("button", { name: /骨格診断/ }).click();
  for (let i = 0; i < 12; i++) {
    if ((await page.locator("#colorlab-root >> text=あなたのタイプ").count()) > 0) break;
    const opts = page.locator("#colorlab-root button");
    if ((await opts.count()) >= 2) await opts.nth(1).click().catch(() => {});
    await page.waitForTimeout(200);
  }
  await page.waitForSelector("#colorlab-root >> text=得意なデザイン", { timeout: 5000 });
  const frameText = await page.locator("#colorlab-root").innerText();
  check("骨格結果に「得意なデザイン」がある", /得意なデザイン/.test(frameText));
  check("骨格結果に「注意したいデザイン」がある", /注意したいデザイン/.test(frameText));
  // 1行リスト化: space-y-2 の直下に縦積みの行が並ぶ
  const rows = await page.locator("#colorlab-root div.space-y-2 > div").count();
  check("得意/注意が1行リストで縦積み (行数 " + rows + ")", rows >= 4);
  const icons = await page.locator("#colorlab-root div.space-y-2 > div svg").count();
  check("各行にデザインアイコン(SVG)がある (" + icons + "個)", icons === rows);
  await shotEl("#colorlab-root", "05_frame_result_single_column_list.png");

  // ── 6. NG色警察: 出頭→タイプ選択→写真提出→判決（ルールベース判定） ──
  await page.getByRole("button", { name: /出頭する/ }).click();
  await page.waitForSelector("text=あなたのパーソナルカラーは", { timeout: 5000 });
  await page.locator("#ngpolice-root button", { hasText: "イエベ春" }).click();
  await page.waitForSelector("text=本日のコーデ写真を提出せよ", { timeout: 5000 });
  await page.locator("#ngpolice-root input[type=file]").setInputFiles({ name: "coord.png", mimeType: "image/png", buffer: solidPng(48, 20, 20, 22) });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /取り調べを受ける/ }).click();
  await page.waitForSelector("text=/違 反 切 符|無罪放免証/", { timeout: 8000 });
  const verdict = await page.locator("#ngpolice-root").innerText();
  check("NG警察 ルールベース判定が完走(検挙=" + /違 反 切 符/.test(verdict) + ")", /違 反 切 符|無罪放免証/.test(verdict));
  check("結果ページ ボタン1: 本家診断アプリで本格診断する", /本家診断アプリで本格診断する/.test(verdict));
  check("結果ページ ボタン2: LINEで「…の勝ち色」を受け取る", /LINEで「.+の勝ち色」を受け取る/.test(verdict));
  const mainHref = await page.locator("#ngpolice-root a", { hasText: "本家診断アプリで本格診断する" }).getAttribute("href");
  check("本家リンクが blubel.jp/pages/personalcolor", mainHref === "https://www.blubel.jp/pages/personalcolor");
  await shotEl("#ngpolice-root", "07_ngpolice_result.png");

  // ── 6b. 顔写真で診断（実測方式・外部通信なし）──
  await page.goto(ART, { waitUntil: "networkidle" });
  await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 10000 });
  await page.getByRole("button", { name: /顔写真で診断/ }).click();
  await page.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
  check("顔写真タイル → 近日公開モーダルが出ず撮影条件画面へ進む", (await modal().count()) === 0);
  const boxes = page.locator("#colorlab-root input[type=checkbox]");
  const nBox = await boxes.count();
  check("撮影条件のチェックボックスが5個", nBox === 5);
  const beforeAll = await page.getByRole("button", { name: /すべての項目に答えてください/ }).count();
  check("未チェックのうちは撮影へ進めない（ボタンが無効表示）", beforeAll === 1);
  await shotEl("#colorlab-root", "08_photo_intro_conditions.png");
  for (let i = 0; i < nBox; i++) await boxes.nth(i).check();
  await page.getByRole("button", { name: /^地毛に近い$/ }).click();
  await page.getByRole("button", { name: /撮影にすすむ/ }).click();

  // ヘッドレスにはカメラが無いので、起動失敗 → 写真選択フォールバックに落ちる
  await page.waitForSelector("#colorlab-root >> text=カメラを起動する", { timeout: 5000 });
  await page.getByRole("button", { name: /カメラを起動する/ }).click();
  await page.waitForSelector("#colorlab-root >> text=写真を選ぶ", { timeout: 10000 });
  check("カメラ不可の環境で写真選択フォールバックに落ちる", true);
  await shotEl("#colorlab-root", "09_photo_camera_fallback.png");

  // (a) 品質ゲート: 白紙が暗すぎる写真は判定せず却下する
  await page.locator("#colorlab-root input[type=file]").setInputFiles({ name: "dark.png", mimeType: "image/png", buffer: PHOTO_DARK });
  await page.waitForSelector("#colorlab-root >> text=白い紙が写っていないか", { timeout: 10000 });
  const rejText = await page.locator("#colorlab-root").innerText();
  check("品質ゲート: 暗すぎる写真が却下される", /白い紙が写っていないか、暗すぎます/.test(rejText));
  check("却下画面に撮り直し導線（撮り直す / 条件を見直す）がある", /撮り直す/.test(rejText) && /条件を見直す/.test(rejText));
  await shotEl("#colorlab-root", "10_photo_rejected_dark.png");
  await page.getByRole("button", { name: /^撮り直す$/ }).click();

  // (b) 条件を満たす写真 → 実測 → 12タイプ結果ページへ合流
  // file input は display:none のため visible ではなく attached を待つ
  await page.waitForSelector("#colorlab-root input[type=file]", { state: "attached", timeout: 5000 });
  await page.locator("#colorlab-root input[type=file]").setInputFiles({ name: "ok.png", mimeType: "image/png", buffer: PHOTO_OK });
  await page.waitForSelector("#colorlab-root >> text=タイプです！", { timeout: 15000 });
  const photoRes = await page.locator("#colorlab-root").innerText();
  const prof = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("colorlab-profile") || "{}"); } catch (e) { return {}; } });
  check("実測結果が localStorage に保存された (1st=" + prof.myType + " / 2nd=" + prof.mySecond + ")", prof.myType === "spring" && prof.mySecond === "summer");
  check("結果ページに 1st / 2nd が表示される", /【イエベ春】/.test(photoRes) && /2nd：ブルベ夏/.test(photoRes));
  check("注記が実測ベースの文言になっている", /実測して判定しました/.test(photoRes) && /信頼度：高/.test(photoRes));
  check("結果ページに勝ち色10選 / コスメ / LINE導線が通常どおり出る",
    /似合う色（勝ち色10選）/.test(photoRes) && /仕上げのコスメはコレ/.test(photoRes) && /LINEに結果を保存する/.test(photoRes));
  const skuLinks = await page.locator('#colorlab-root a[href*="/items/"]').count();
  check("結果ページにSKUカードが3点以上ある (" + skuLinks + "件)", skuLinks >= 3);
  const detailHref = await page.locator("#colorlab-root a", { hasText: "あなたの詳しい診断結果ページへ" }).getAttribute("href");
  check("詳細リンクが RESULT_MAP のURL (" + detailHref + ")", detailHref === "https://www.iebel.jp/pages/diagnosis3");
  await shotEl("#colorlab-root", "11_photo_result_page.png");

  // ── 6c. 撮影ガイド（丸型グラデ + 下部固定シャッター）: フェイクカメラで実描画 ──
  const camBrowser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  try {
    const camCtx = await camBrowser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, permissions: ["camera"] });
    const camPage = await camCtx.newPage();
    camPage.on("request", (r) => { if (/anthropic\.com/.test(r.url())) aiCalls.push(r.url()); });
    await camPage.goto(ART, { waitUntil: "networkidle" });
    await camPage.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await camPage.getByRole("button", { name: /顔写真で診断/ }).click();
    await camPage.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
    const cb = camPage.locator("#colorlab-root input[type=checkbox]");
    const ncb = await cb.count();
    for (let i = 0; i < ncb; i++) await cb.nth(i).check();
    await camPage.getByRole("button", { name: /^地毛に近い$/ }).click();
    await camPage.getByRole("button", { name: /撮影にすすむ/ }).click();
    await camPage.getByRole("button", { name: /カメラを起動する/ }).click();
    await camPage.waitForSelector("#colorlab-root video", { state: "visible", timeout: 15000 });
    await camPage.waitForTimeout(800);

    const grads = await camPage.locator("#colorlab-root svg linearGradient").count();
    check("ガイドのグラデーション定義が4本（顔/頬/髪/白紙）", grads === 4);
    const cheeks = await camPage.locator('#colorlab-root svg circle[stroke="url(#gCheek)"]').count();
    const hairC = await camPage.locator('#colorlab-root svg circle[stroke="url(#gHair)"]').count();
    check("頬ガイドが丸型で2個・髪ガイドが丸型で1個", cheeks === 2 && hairC === 1);
    const paperE = await camPage.locator('#colorlab-root svg ellipse[stroke="url(#gPaper)"]').count();
    const faceE = await camPage.locator('#colorlab-root svg ellipse[stroke="url(#gFace)"]').count();
    check("白紙ガイド(角丸楕円)と顔ガイド(点線楕円)がある", paperE === 1 && faceE === 1);

    const shutter = camPage.locator('#colorlab-root button[aria-label="撮影する"]');
    check("撮影ボタン（シャッター型）が表示されている", await shutter.isVisible());
    const sb = await shutter.boundingBox();
    const vb = await camPage.locator("#colorlab-root video").boundingBox();
    const pb = await camPage.locator("#colorlab-root video").evaluate((v) => {
      const b = v.parentElement.parentElement.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    });
    const centered = Math.abs((sb.x + sb.width / 2) - (pb.x + pb.width / 2)) < 6;
    const inStrip = sb.y >= vb.y + vb.height - 1;                     // 映像より下＝黒帯の中
    const fromBottom = (pb.y + pb.height) - (sb.y + sb.height);       // パネル下端からの距離
    check("撮影ボタンがパネル下端18px・中央固定で黒帯の中にある (中央ズレ" + Math.round(Math.abs((sb.x + sb.width / 2) - (pb.x + pb.width / 2))) + "px / 下端から" + Math.round(fromBottom) + "px)",
      centered && inStrip && Math.abs(fromBottom - 18) < 2);

    // 重なりゼロと「ガイド＝測定範囲」を恒久ゲート化する
    const rectOf = (sel) => camPage.locator(sel).evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; });
    const paperRect = await rectOf('#colorlab-root svg ellipse[stroke="url(#gPaper)"]');
    const labelRect = await camPage.locator("#colorlab-root svg text", { hasText: "白い紙をここに" }).evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; });
    const shRect = { x: sb.x, y: sb.y, right: sb.x + sb.width, bottom: sb.y + sb.height };
    const hits = (a, b) => Math.min(a.right, b.right) - Math.max(a.x, b.x) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 0;
    check("シャッターが白紙ガイド楕円に重なっていない (クリアランス" + Math.round(shRect.y - paperRect.bottom) + "px)", !hits(shRect, paperRect));
    check("シャッターが「白い紙をここに」ラベルに重なっていない (クリアランス" + Math.round(shRect.y - labelRect.bottom) + "px)", !hits(shRect, labelRect));
    // PH_REGION.white = [0.34, 0.76, 0.66, 0.92] を映像ボックスへ写した帯とガイドの中心が一致するか
    const sampMidY = vb.y + ((0.76 + 0.92) / 2) * vb.height;
    const guideMidY = (paperRect.y + paperRect.bottom) / 2;
    check("白紙ガイドが測定範囲(0.76〜0.92)と一致している (中心Yズレ" + Math.abs(guideMidY - sampMidY).toFixed(1) + "px)", Math.abs(guideMidY - sampMidY) < 5);
    // 黒帯を足してもパネルが極端に伸びていないこと（映像高さ + 96px 前後）
    check("カメラパネルの高さが 映像+黒帯96px の範囲に収まっている (" + Math.round(pb.height) + "px = 映像" + Math.round(vb.height) + "px + " + Math.round(pb.height - vb.height) + "px)", Math.abs((pb.height - vb.height) - 96) < 2);
    await camPage.locator("#colorlab-root").screenshot({ path: join(SHOTS, "12_photo_camera_guide.png") });
    log("  SS: 12_photo_camera_guide.png");

    // 実カメラからの撮影 → 解析まで通ることも確認（フェイク映像なので品質ゲートで却下される想定）
    await shutter.click();
    await camPage.waitForSelector("#colorlab-root >> text=/色を測っています|撮り直す/", { timeout: 15000 });
    const afterShot = await camPage.locator("#colorlab-root").innerText();
    check("シャッター → 解析が起動する（フェイク映像は品質ゲートで却下される）", /色を測っています|撮り直す/.test(afterShot));
    await camPage.waitForTimeout(600);
    await camPage.locator("#colorlab-root").screenshot({ path: join(SHOTS, "13_photo_capture_gate.png") });
    log("  SS: 13_photo_capture_gate.png");
    const tracks = await camPage.evaluate(() => document.querySelector("#colorlab-root video")?.srcObject?.getTracks?.().length ?? 0);
    check("撮影後にカメラのトラックが解放されている", tracks === 0);
  } finally {
    await camBrowser.close();
  }

  // ── 6d. コーデ提案（シーン別記事のデータ参照方式・外部通信なし）──
  await page.goto(ART, { waitUntil: "networkidle" });
  await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 10000 });
  await cl().getByRole("button", { name: /パーソナルカラー別コーデ提案/ }).click();
  await page.waitForSelector("#colorlab-root >> text=あなたのタイプは？", { timeout: 5000 });
  check("コーデ提案タイル → 近日公開モーダルが出ず入力画面へ進む", (await modal().count()) === 0);
  await cl().getByRole("button", { name: /イエベ春/ }).first().click();
  await page.waitForSelector("#colorlab-root >> text=今日のシーン", { timeout: 5000 });

  // 結果ブロックから title / styling / makeup_hint / SKU を読む
  const readStylist = async () => {
    const title = (await cl().locator("h3.text-2xl").last().innerText()).trim();
    const styling = (await cl().locator("p.leading-relaxed.text-sm").first().innerText()).trim();
    const makeup = (await cl().locator("p.mt-3.pt-3").count()) ? (await cl().locator("p.mt-3.pt-3").first().innerText()).replace(/^💄\s*/, "").trim() : "";
    const skus = await cl().locator('a[href*="/items/"]').count();
    return { title, styling, makeup, skus };
  };
  const runScene = async (label, setup) => {
    await setup();
    await cl().getByRole("button", { name: /にコーデを提案してもらう/ }).click();
    await page.waitForSelector("#colorlab-root >> text=Today's Styling", { timeout: 10000 });
    await page.waitForTimeout(250);
    const r = await readStylist();
    log(`  [${label}] title="${r.title}" (${r.title.length}字) / styling ${r.styling.length}字 / makeup ${r.makeup.length}字 / SKU ${r.skus}件`);
    check(`${label}: title が15字以内 (${r.title.length}字)`, r.title.length > 0 && r.title.length <= 15);
    check(`${label}: styling が180字以内 (${r.styling.length}字)`, r.styling.length > 20 && r.styling.length <= 180);
    check(`${label}: makeup_hint が40字以内 (${r.makeup.length}字)`, r.makeup.length > 0 && r.makeup.length <= 40);
    check(`${label}: 在庫に実在するSKUカードが2〜3点 (${r.skus}件)`, r.skus >= 2 && r.skus <= 3);
    return r;
  };

  // (a) 就活（シーン=通勤 + 気分「面接」）
  const rJob = await runScene("就活", async () => {
    await cl().getByRole("button", { name: /^通勤$/ }).click();
    await cl().locator('input[placeholder*="きちんと見せたい"]').fill("面接");
  });
  check("就活: 記事(就活)の内容が反映されている", /面接|襟元|スーツ|第一印象/.test(rJob.styling));
  await shotEl("#colorlab-root", "15_stylist_jobhunt.png");

  // (b) デート（シーン=デート + ディナー）
  const rDate = await runScene("デート", async () => {
    await cl().getByRole("button", { name: /^デート$/ }).click();
    await cl().getByRole("button", { name: /^ディナー$/ }).click();
    await cl().locator('input[placeholder*="きちんと見せたい"]').fill("");
  });
  check("デート: 記事(夜ディナー)の内容が反映されている", /ディナー|照明|夜|艶/.test(rDate.styling));
  check("デート: 就活と別の提案になっている", rDate.styling !== rJob.styling);
  await shotEl("#colorlab-root", "16_stylist_date_dinner.png");

  // (c) 婚活（気分「婚活」で上書き）
  const rKon = await runScene("婚活", async () => {
    await cl().locator('input[placeholder*="きちんと見せたい"]').fill("婚活");
  });
  check("婚活: 記事(お見合い・初対面)の内容が反映されている", /見合い|初対面|信頼|安心|誠実|清潔/.test(rKon.styling));
  check("婚活: デートと別の提案になっている", rKon.styling !== rDate.styling);
  await shotEl("#colorlab-root", "17_stylist_konkatsu.png");

  // 同じ入力なら同じ結果（決定論であること＝AI生成でないことの確認）
  const rKon2 = await runScene("婚活(再実行)", async () => {});
  check("同じ入力なら毎回同じ提案になる（決定論）", rKon2.styling === rKon.styling && rKon2.title === rKon.title);

  // ── 6e. 今日のコーデ採点（色照合方式・外部通信なし）──
  await page.goto(ART, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    try { localStorage.setItem("colorlab-profile", JSON.stringify({ myType: "spring", mySecond: "autumn", myFrame: null })); } catch (e) {}
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 10000 });
  await cl().getByRole("button", { name: /今日のコーデ採点/ }).click();
  await page.waitForSelector("#colorlab-root >> text=服の色とタイプの相性", { timeout: 5000 });
  check("採点タイル → 近日公開モーダルが出ず案内画面へ進む", (await modal().count()) === 0);
  const introText = await cl().innerText();
  check("案内画面に「シルエット・素材感は採点に含まれない」旨がある", /シルエット・素材感.*採点に含まれません/.test(introText));
  await shotEl("#colorlab-root", "18_score_intro.png");

  const readScore = async () => {
    const t = await cl().innerText();
    const m = t.match(/(\d+)\s*\/\s*100/);
    const good = (await cl().locator("p.text-xs.leading-relaxed").nth(0).innerText()).trim();
    return { score: m ? parseInt(m[1], 10) : null, text: t, good };
  };
  const scoreShot = async (buf, name) => {
    await cl().locator('input[type=file]').first().setInputFiles({ name, mimeType: "image/png", buffer: buf });
    await page.waitForSelector("#colorlab-root >> text=/\\/ 100|撮り直す/", { timeout: 15000 });
    await page.waitForTimeout(250);
    return readScore();
  };

  // (a) 明確に得意色のコーデ
  const rGood = await scoreShot(SCORE_GOOD, "good.png");
  log(`  [採点/得意色] score=${rGood.score}`);
  check(`得意色のコーデでスコアが高い (${rGood.score}点)`, rGood.score !== null && rGood.score >= 80);
  check("得意色: good に得意色である旨が出る", /得意色|勝ち色/.test(rGood.text));
  check("結果画面に限界の注記がある", /服の色とタイプの相性のみを判定しています（シルエット・素材感は含みません）/.test(rGood.text));
  await shotEl("#colorlab-root", "19_score_good.png");
  await cl().getByRole("button", { name: /別のコーデを採点する/ }).click();

  // (b) 明確にNG色のコーデ
  await page.waitForSelector("#colorlab-root >> text=服の色とタイプの相性", { timeout: 5000 });
  const rNg = await scoreShot(SCORE_NG, "ng.png");
  log(`  [採点/NG色] score=${rNg.score}`);
  check(`NG色のコーデでスコアが下がる (${rNg.score}点)`, rNg.score !== null && rNg.score <= 25);
  check("NG色: improve にNG色名(真っ黒)と理由が出る", /真っ黒/.test(rNg.text) && /苦手な色/.test(rNg.text));
  check("NG色: one_item に置換色(キャメル)が出る", /キャメル/.test(rNg.text));
  check("得意色コーデより低いスコアになっている", rNg.score < rGood.score);
  await shotEl("#colorlab-root", "20_score_ng.png");
  await cl().getByRole("button", { name: /別のコーデを採点する/ }).click();

  // (c) 品質ゲート（暗すぎ）
  await page.waitForSelector("#colorlab-root >> text=服の色とタイプの相性", { timeout: 5000 });
  await cl().locator('input[type=file]').first().setInputFiles({ name: "dark.png", mimeType: "image/png", buffer: SCORE_DARK });
  await page.waitForSelector("#colorlab-root >> text=写真が暗すぎます", { timeout: 15000 });
  const scRejText = await cl().innerText();
  check("品質ゲート: 暗すぎる写真が却下される", /写真が暗すぎます/.test(scRejText));
  check("却下画面に撮り直し導線がある", /撮り直す/.test(scRejText) && /最初から/.test(scRejText));
  await shotEl("#colorlab-root", "21_score_rejected_dark.png");

  // (d) 撮影ガイド（フェイクカメラで実描画・枠とサンプリング座標の一致を確認）
  const scBrowser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  try {
    const c2 = await scBrowser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, permissions: ["camera"] });
    const p2 = await c2.newPage();
    p2.on("request", (r) => { if (/anthropic\.com/.test(r.url())) aiCalls.push(r.url()); });
    await p2.goto(ART, { waitUntil: "networkidle" });
    await p2.evaluate(() => { try { localStorage.setItem("colorlab-profile", JSON.stringify({ myType: "spring", mySecond: "autumn", myFrame: null })); } catch (e) {} });
    await p2.reload({ waitUntil: "networkidle" });
    await p2.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await p2.locator("#colorlab-root").getByRole("button", { name: /今日のコーデ採点/ }).click();
    await p2.getByRole("button", { name: /カメラで撮る/ }).click();
    await p2.getByRole("button", { name: /カメラを起動する/ }).click();
    await p2.waitForSelector("#colorlab-root video", { state: "visible", timeout: 15000 });
    await p2.waitForTimeout(800);
    const boxOf = async (sel) => p2.locator(sel).evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; });
    const vb2 = await p2.locator("#colorlab-root video").boundingBox();
    const topsBox = await boxOf('#colorlab-root svg rect[stroke="url(#gTops)"]');
    const botsBox = await boxOf('#colorlab-root svg rect[stroke="url(#gBottoms)"]');
    const sh2 = await p2.locator('#colorlab-root button[aria-label="撮影する"]').boundingBox();
    const mid = (a, b) => (a + b) / 2;
    const dTops = Math.abs(mid(topsBox.y, topsBox.bottom) - (vb2.y + 0.40 * vb2.height));
    const dBots = Math.abs(mid(botsBox.y, botsBox.bottom) - (vb2.y + 0.70 * vb2.height));
    check(`トップス枠が SC_REGION(0.30〜0.50) と一致 (中心Yズレ${dTops.toFixed(1)}px)`, dTops < 5);
    check(`ボトムス枠が SC_REGION(0.60〜0.80) と一致 (中心Yズレ${dBots.toFixed(1)}px)`, dBots < 5);
    check("撮影ボタンがガイド枠に重なっていない", sh2.y >= botsBox.bottom);
    await p2.locator("#colorlab-root").screenshot({ path: join(SHOTS, "22_score_camera_guide.png") });
    log("  SS: 22_score_camera_guide.png");
    const tr = await p2.evaluate(() => document.querySelector("#colorlab-root video")?.srcObject?.getTracks?.().length ?? 0);
    check("採点のカメラが起動している（撮影ガイドが実映像に重なる）", tr > 0);
  } finally {
    await scBrowser.close();
  }

  // ── 7. Liteモードの実測 ──
  check("api.anthropic.com へのリクエストが0件 (実測 " + aiCalls.length + " 件)", aiCalls.length === 0);

  log(failures === 0 ? "=== 検証完了: 全チェック合格 ===" : `=== 検証完了: ${failures} 件のNG ===`);
} catch (e) {
  log("!! 検証中にエラー: " + e.message);
  failures++;
  await shotView("99_error_state.png");
} finally {
  writeFileSync(join(SHOTS, "verify_log.txt"), results.join("\n") + "\n", "utf8");
  await browser.close();
  if (failures > 0) process.exitCode = 1;
}
