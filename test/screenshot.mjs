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
//   - 12タイプ結果ページ: 苦手色ブロックが1箇所に統合 / 勝ち色を色相ファミリー別に体系化 / コスメ
//   - 12タイプ結果ページ: タイプ別の顔イラスト + ベース/明度/彩度/清濁の専門表記（2026-09-02〜）
//   - コスメ一覧ページ: 上部の「似合うカラー」パレット
//   - 骨格結果ページ: 得意/注意が1行リスト（DesignIcon付き）
//   - シェア画像PNG（canvas → download）が生成される
//   - NG警察の結果ページ（ボタン2つ / 本家リンク）
//   - Liteモード実測: api.anthropic.com へのリクエストが0件
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import zlib from "zlib";
// 動的 import だと後段で宣言されるため、先に使う節（アスペクト比の検証）で TDZ になる。静的 import にする。
import { tmpdir } from "os";
const wfs = writeFileSync;

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

// フレームごとに頬の赤みが a* の上限(26)をまたいで揺れる映像。
// 実機ではカメラのAWBが±2%揺れるだけで a* が±1.8ほど振れ、余裕1.6の判定が✓と○を往復する
// （2026-08-31 実測）。その状況を再現して、表示がチラつかないことを確認するためのもの。
function y4mFlicker(W, H) {
  const frames = [];
  // 頬の赤みをフレームごとに変えて、a* の上限26をまたがせる。
  // ★色は「フェイクカメラを通したあとに実際に届く a*」で選ぶこと。YUV変換を挟むため、
  //   塗った色そのままの a* にはならない（実測で約3.5低く出る）。test/_probe_calib.mjs で較正した:
  //     RGB(248,176,156) → 届く a*=20.0 厳密(上限26)の内側
  //     RGB(252,160,142) → 届く a*=27.1 厳密の外・余裕(+3=29)の内側 … ヒステリシスで✓を保つべき対象
  // ★フレーム数と再生レートにも注意。ライブ判定は400ms間隔で拾うので、映像のループ周期が
  //   400msの約数だと毎回同じフレームだけを拾い、境界をまたがなくなる。
  //   5フレーム×5fps=1000ms にすると、400ms間隔のサンプリングが全フレームを順に拾う。
  // 安定化が無ければ、この2色が交互に来るだけで表示は400msごとに✓と○を往復する。
  for (const cheek of [[248, 176, 156], [252, 160, 142], [248, 176, 156], [252, 160, 142], [248, 176, 156]]) {
    frames.push(y4mFromRegions(W, H, [190, 190, 195], [
      [0.40, 0.06, 0.60, 0.16, [62, 46, 38]],
      // 塗る範囲は、アプリが実際にサンプリングする範囲を必ず覆うこと。
      // ずれていると背景が混ざって中央値が変わり、境界をまたがなくなる（ゲートが素通りする）。
      [0.24, 0.46, 0.36, 0.58, cheek],
      [0.64, 0.46, 0.76, 0.58, cheek],
      [0.34, 0.76, 0.66, 0.92, [235, 232, 228]],
    ], 1));
  }
  // ヘッダは先頭のものだけ残して連結する
  // 再生レートを 5fps に落として、ループ周期を 1000ms にする（400ms間隔のサンプリングが全フレームを拾う）
  const head = Buffer.from(frames[0].slice(0, frames[0].indexOf("FRAME\n")).toString("ascii").replace("F15:1", "F5:1"), "ascii");
  const bodies = frames.map((f) => f.slice(f.indexOf("FRAME\n")));
  return Buffer.concat([Buffer.from(head), ...bodies]);
}

// 白い紙のかわりに「明るいが色づいた面」（木の机・ベージュの壁など）が写っている映像。
// 明るさは足りるが色かぶり33%で白紙は未検出。頬は正しい肌色なので、
// 「顔の位置」を ○ズレ と出してはいけない（位置は合っているため）状態を再現する。
const LIVE_NOPAPER = [190, 190, 195];

// 白紙が暗すぎる（wMax < 120）→ 品質ゲートで却下されるべき写真
const PHOTO_DARK = regionPng(600, 800, [30, 28, 26], [
  [0.24, 0.46, 0.36, 0.58, [70, 58, 50]],
  [0.34, 0.76, 0.66, 0.92, [64, 63, 62]],
]);

// 領域を塗り分けた映像を Y4M(I420) で作る。Chromium の
// --use-file-for-fake-video-capture に渡すと、その映像がカメラとして流れる。
function y4mFromRegions(W, H, base, rects, frames = 2) {
  const box = rects.map(([x0, y0, x1, y1, c]) => [Math.floor(x0 * W), Math.floor(y0 * H), Math.floor(x1 * W), Math.floor(y1 * H), c]);
  const at = (x, y) => {
    let c = base;
    for (const [x0, y0, x1, y1, col] of box) if (x >= x0 && x < x1 && y >= y0 && y < y1) c = col;
    return c;
  };
  const ySize = W * H, cSize = (W / 2) * (H / 2);
  const Y = Buffer.alloc(ySize), U = Buffer.alloc(cSize), V = Buffer.alloc(cSize);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = at(x, y);
      Y[y * W + x] = cl(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      let r = 0, g = 0, b = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const c = at(Math.min(W - 1, x + dx), Math.min(H - 1, y + dy));
        r += c[0]; g += c[1]; b += c[2];
      }
      r /= 4; g /= 4; b /= 4;
      const i = (y / 2) * (W / 2) + x / 2;
      U[i] = cl(-0.169 * r - 0.331 * g + 0.5 * b + 128);
      V[i] = cl(0.5 * r - 0.419 * g - 0.081 * b + 128);
    }
  }
  const head = Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420mpeg2\n`, "ascii");
  const parts = [head];
  for (let f = 0; f < frames; f++) parts.push(Buffer.from("FRAME\n", "ascii"), Y, U, V);
  return Buffer.concat(parts);
}

// 撮影ガイドの比率定数(PH_FACE)は src から読む。テスト側に数値を写経しないことで、
// 「アプリだけ直してテストが古い値のまま」という食い違いを構造的に防ぐ。
const PH_FACE = (() => {
  const src = readFileSync(join(__dirname, "..", "src", "color_lab_stylist_v23.jsx"), "utf8");
  const body = src.slice(src.indexOf("const PH_FACE = {"), src.indexOf("};", src.indexOf("const PH_FACE = {")));
  const o = {};
  for (const [, k, v] of body.matchAll(/(\w+):\s*([0-9.]+)/g)) o[k] = parseFloat(v);
  return o;
})();

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

  // ── 3. 12タイプ診断 → 結果ページ（苦手色1箇所 + 勝ち色の体系化 + 専門表記 + コスメ） ──
  await page.getByRole("button", { name: /パーソナルカラー診断（12タイプ）/ }).click();
  const myType = await runQuiz();
  check("12タイプ診断が完了し localStorage に保存された", !!myType);
  await page.waitForTimeout(400);
  const resText = await page.locator("#colorlab-root").innerText();
  check("結果ページに「似合う色（勝ち色 N色）」がある", /似合う色（勝ち色 \d+色）/.test(resText));
  check("結果ページに色相ファミリーの8行がある",
    ["ピンク系", "レッド系", "オレンジ・コーラル系", "イエロー系", "グリーン系", "ブルー系", "パープル系", "ベーシック"]
      .every((k) => resText.includes(k)));
  check("結果ページにプロ資料と同じ専門表記（ベース/明度/彩度/清濁）がある",
    /(イエローベース|ブルーベース|ニュートラル)/.test(resText) && /(高|中|低)明度/.test(resText) &&
    /(高|中|低)彩度/.test(resText) && /(清色|濁色)/.test(resText));
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
  check("結果ページに勝ち色の体系化 / コスメ / LINE導線が通常どおり出る",
    /似合う色（勝ち色 \d+色）/.test(photoRes) && /仕上げのコスメはコレ/.test(photoRes) && /LINEに結果を保存する/.test(photoRes));
  const skuLinks = await page.locator('#colorlab-root a[href*="/items/"]').count();
  check("結果ページにSKUカードが3点以上ある (" + skuLinks + "件)", skuLinks >= 3);
  const detailHref = await page.locator("#colorlab-root a", { hasText: "あなたの詳しい診断結果ページへ" }).getAttribute("href");
  check("詳細リンクが RESULT_MAP のURL (" + detailHref + ")", detailHref === "https://www.iebel.jp/pages/diagnosis3");
  await shotEl("#colorlab-root", "11_photo_result_page.png");

  // ── 6c. 撮影ガイド（全画面オーバーレイ + 丸型グラデ + 下部シャッター）: フェイクカメラで実描画 ──
  const camBrowser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  try {
    const camCtx = await camBrowser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, permissions: ["camera"] });
    const camPage = await camCtx.newPage();
    camPage.on("request", (r) => { if (/anthropic\.com/.test(r.url())) aiCalls.push(r.url()); });
    await camPage.goto(ART, { waitUntil: "networkidle" });
    // 記事ページ側に固定ヘッダーがある想定（他要素に隠れないかを試すため差し込む）
    await camPage.evaluate(() => {
      const h = document.createElement("div");
      h.id = "fake-site-header";
      h.textContent = "サイト固定ヘッダー";
      h.setAttribute("style", "position:fixed;top:0;left:0;right:0;height:56px;background:#d33;color:#fff;z-index:9999;display:flex;align-items:center;justify-content:center");
      document.body.appendChild(h);
    });
    await camPage.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await camPage.getByRole("button", { name: /顔写真で診断/ }).click();
    await camPage.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
    const cb = camPage.locator("#colorlab-root input[type=checkbox]");
    const ncb = await cb.count();
    for (let i = 0; i < ncb; i++) await cb.nth(i).check();
    await camPage.getByRole("button", { name: /^地毛に近い$/ }).click();
    await camPage.getByRole("button", { name: /撮影にすすむ/ }).click();
    await camPage.getByRole("button", { name: /カメラを起動する/ }).click();
    await camPage.waitForSelector("video", { state: "visible", timeout: 15000 });
    await camPage.waitForTimeout(800);

    // オーバーレイは body 直下（ポータル）に出るので、#colorlab-root 配下では探さない
    const portalOk = await camPage.evaluate(() => {
      const v = document.querySelector("video");
      if (!v) return "video なし";
      return v.closest("#colorlab-root") ? "colorlab-root の中" : (v.parentElement && document.body.contains(v) ? "body 直下" : "不明");
    });
    check("撮影オーバーレイが body 直下（ポータル）に描画されている", portalOk === "body 直下");
    const grads = await camPage.locator("svg linearGradient").count();
    check("ガイドのグラデーション定義が4本（顔/頬/髪/白紙）", grads === 4);
    // v1.13.0〜: マーカーは測定範囲そのものを描くため ellipse（映像が4:3だと横長になる）
    const cheeks = await camPage.locator('svg ellipse[stroke="url(#gCheek)"]').count();
    const hairC = await camPage.locator('svg ellipse[stroke="url(#gHair)"]').count();
    check("頬ガイドが2個・髪ガイドが1個ある", cheeks === 2 && hairC === 1);
    const paperE = await camPage.locator('svg ellipse[stroke="url(#gPaper)"]').count();
    const faceE = await camPage.locator('svg ellipse[stroke="url(#gFace)"]').count();
    check("白紙ガイド(角丸楕円)と顔ガイド(点線楕円)がある", paperE === 1 && faceE === 1);

    // ── 全画面オーバーレイであること ──
    const ov = await camPage.locator("video").evaluate((v) => {
      let el = v;
      while (el && getComputedStyle(el).position !== "fixed") el = el.parentElement;
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { x: b.x, y: b.y, w: b.width, h: b.height, z: +cs.zIndex, bg: cs.backgroundColor };
    });
    const vp = camPage.viewportSize();
    check("撮影中はビューポート全体を覆う全画面表示になっている (" + (ov ? `${Math.round(ov.w)}x${Math.round(ov.h)}` : "なし") + ")",
      !!ov && ov.x === 0 && ov.y === 0 && Math.abs(ov.w - vp.width) < 1 && Math.abs(ov.h - vp.height) < 1);
    check("オーバーレイの z-index が十分高い (" + (ov ? ov.z : "-") + ")", !!ov && ov.z >= 9999);
    // 記事側の固定ヘッダー(z-index:9999)より手前に出ているか、実際に当たり判定で確かめる
    const topEl = await camPage.evaluate(() => {
      const e = document.elementFromPoint(window.innerWidth / 2, 28);
      return e ? (e.closest("#fake-site-header") ? "site-header" : "colorlab") : "none";
    });
    check("記事側の固定ヘッダーより手前に表示されている", topEl === "colorlab");
    const bodyOv = await camPage.evaluate(() => getComputedStyle(document.body).overflow);
    check("オーバーレイ表示中は背景がスクロールしない (body overflow=" + bodyOv + ")", bodyOv === "hidden");

    // 映像が引き伸ばされていないこと＝ガイドと測定範囲の対応が崩れていないことの前提
    const vb = await camPage.locator("video").boundingBox();
    const intr = await camPage.locator("video").evaluate((v) => ({ w: v.videoWidth, h: v.videoHeight }));
    const arDiff = Math.abs(vb.width / vb.height - intr.w / intr.h);
    check("映像が元の縦横比のまま表示されている (ズレ" + arDiff.toFixed(4) + ")", arDiff < 0.01);

    const shutter = camPage.locator('button[aria-label="撮影する"]');
    check("撮影ボタン（シャッター型）が表示されている", await shutter.isVisible());
    const sb = await shutter.boundingBox();
    const stripBox = await shutter.evaluate((el) => { const b = el.parentElement.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
    const centered = Math.abs((sb.x + sb.width / 2) - vp.width / 2) < 6;
    const inStrip = sb.y >= vb.y + vb.height - 1;                            // 映像より下＝黒帯の中
    const fromBottom = (stripBox.y + stripBox.height) - (sb.y + sb.height);  // 黒帯下端からの距離
    check("撮影ボタンが黒帯の下端18px・画面中央にある (中央ズレ" + Math.round(Math.abs((sb.x + sb.width / 2) - vp.width / 2)) + "px / 下端から" + Math.round(fromBottom) + "px)",
      centered && inStrip && Math.abs(fromBottom - 18) < 2);
    check("黒帯が画面幅いっぱいにある (" + Math.round(stripBox.width) + "px)", Math.abs(stripBox.width - vp.width) < 1);

    // 重なりゼロと「ガイド＝測定範囲」を恒久ゲート化する
    const rectOf = (sel) => camPage.locator(sel).evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; });
    const paperRect = await rectOf('svg ellipse[stroke="url(#gPaper)"]');
    const labelRect = await camPage.locator("svg text", { hasText: "白い紙をここに" }).evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; });
    const shRect = { x: sb.x, y: sb.y, right: sb.x + sb.width, bottom: sb.y + sb.height };
    const hits = (a, b) => Math.min(a.right, b.right) - Math.max(a.x, b.x) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 0;
    check("シャッターが白紙ガイド楕円に重なっていない (クリアランス" + Math.round(shRect.y - paperRect.bottom) + "px)", !hits(shRect, paperRect));
    check("シャッターが「白い紙をここに」ラベルに重なっていない (クリアランス" + Math.round(shRect.y - labelRect.bottom) + "px)", !hits(shRect, labelRect));
    // PH_REGION.white = [0.34, 0.76, 0.66, 0.92] を映像ボックスへ写した帯とガイドの中心が一致するか
    const sampMidY = vb.y + ((0.76 + 0.92) / 2) * vb.height;
    const guideMidY = (paperRect.y + paperRect.bottom) / 2;
    check("白紙ガイドが測定範囲(0.76〜0.92)と一致している (中心Yズレ" + Math.abs(guideMidY - sampMidY).toFixed(1) + "px)", Math.abs(guideMidY - sampMidY) < 5);
    // 全画面化で、映像が記事カード幅の制約から解放されていること
    check("映像が画面幅いっぱいまで使えている (" + Math.round(vb.width) + "px / 画面幅" + vp.width + "px)", vb.width >= vp.width - 1);
    check("映像がカード制約時(311px)より大きくなっている (" + Math.round(vb.width) + "x" + Math.round(vb.height) + ")", vb.width > 311);
    await camPage.screenshot({ path: join(SHOTS, "12_photo_camera_guide.png") }); // 全画面なのでビューポートを撮る
    log("  SS: 12_photo_camera_guide.png");

    // 閉じるボタン → 記事へ戻る / カメラ停止 / 背景スクロール復帰
    await camPage.locator('button[aria-label="撮影をやめる"]').click();
    await camPage.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
    const afterClose = await camPage.evaluate(() => ({
      overlay: !!document.querySelector('video'),
      overflow: getComputedStyle(document.body).overflow,
    }));
    check("閉じるボタンで撮影画面を抜け、元の記事の位置に戻る", !afterClose.overlay);
    check("閉じたあと背景のスクロールが元に戻る (body overflow=" + afterClose.overflow + ")", afterClose.overflow !== "hidden");
    const tracksAfterClose = await camPage.evaluate(() => window.__clStreams === undefined ? null : 0);
    check("閉じたあとカメラのトラックが解放されている（video要素ごと消える）", tracksAfterClose === null && !afterClose.overlay);

    // もう一度カメラを起動して、撮影まで通す
    await camPage.getByRole("button", { name: /撮影にすすむ/ }).click();
    await camPage.getByRole("button", { name: /カメラを起動する/ }).click();
    await camPage.waitForSelector("video", { state: "visible", timeout: 15000 });
    await camPage.waitForTimeout(600);

    // 実カメラからの撮影 → 解析まで通ることも確認（フェイク映像なので品質ゲートで却下される想定）
    await camPage.locator('button[aria-label="撮影する"]').click();
    await camPage.waitForSelector("#colorlab-root >> text=/色を測っています|撮り直す/", { timeout: 15000 });
    const afterShot = await camPage.locator("#colorlab-root").innerText();
    check("シャッター → 解析が起動する（フェイク映像は品質ゲートで却下される）", /色を測っています|撮り直す/.test(afterShot));
    await camPage.waitForTimeout(600);
    await camPage.locator("#colorlab-root").screenshot({ path: join(SHOTS, "13_photo_capture_gate.png") });
    log("  SS: 13_photo_capture_gate.png");
    const tracks = await camPage.evaluate(() => document.querySelector("video")?.srcObject?.getTracks?.().length ?? 0);
    check("撮影後にカメラのトラックが解放されている", tracks === 0);
  } finally {
    await camBrowser.close();
  }

  // ── 6c-1. 祖先に transform がある埋め込み先でも全画面になるか ──
  // position:fixed は祖先に transform/filter/perspective/will-change/contain があると
  // ビューポートではなくその祖先が基準になる。本番CMSがそういうCSSを当てても壊れないよう、
  // ポータルで body 直下へ逃がしている。ここはその回帰ゲート。
  for (const [label, css] of [
    ["transform", "transform:translateZ(0)"],
    ["filter", "filter:blur(0px)"],
    ["will-change", "will-change:transform"],
  ]) {
    const tb = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    try {
      const c = await tb.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, permissions: ["camera"] });
      const pg = await c.newPage();
      await pg.goto(ART, { waitUntil: "networkidle" });
      // #colorlab-root の祖先に、containing block を作るCSSを当てる
      await pg.evaluate((decl) => {
        const el = document.getElementById("colorlab-root").parentElement;
        el.setAttribute("style", (el.getAttribute("style") || "") + ";" + decl);
      }, css);
      // 素の position:fixed だと祖先に閉じ込められることを、まず実測して示す
      const trapped = await pg.evaluate(() => {
        const t = document.createElement("div");
        t.setAttribute("style", "position:fixed;inset:0");
        document.getElementById("colorlab-root").appendChild(t);
        const b = t.getBoundingClientRect();
        t.remove();
        return !(Math.abs(b.width - window.innerWidth) < 1 && Math.abs(b.height - window.innerHeight) < 1);
      });
      await pg.waitForSelector("#colorlab-root button", { timeout: 15000 });
      await pg.locator("#colorlab-root").getByRole("button", { name: /顔写真で診断/ }).click();
      await pg.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
      const cb2 = pg.locator("#colorlab-root input[type=checkbox]");
      for (let i = 0; i < (await cb2.count()); i++) await cb2.nth(i).check();
      await pg.locator("#colorlab-root").getByRole("button", { name: /^地毛に近い$/ }).click();
      await pg.locator("#colorlab-root").getByRole("button", { name: /撮影にすすむ/ }).click();
      await pg.locator("#colorlab-root").getByRole("button", { name: /カメラを起動する/ }).click();
      await pg.waitForSelector("video", { state: "visible", timeout: 15000 });
      await pg.waitForTimeout(600);
      const box = await pg.evaluate(() => {
        let el = document.querySelector("video");
        while (el && getComputedStyle(el).position !== "fixed") el = el.parentElement;
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height, vw: window.innerWidth, vh: window.innerHeight };
      });
      const full = !!box && Math.abs(box.x) < 1 && Math.abs(box.y) < 1 && Math.abs(box.w - box.vw) < 1 && Math.abs(box.h - box.vh) < 1;
      check(`祖先に ${label} があっても全画面になる（素のfixedは閉じ込められる=${trapped} / 実測 ${box ? Math.round(box.w) + "x" + Math.round(box.h) : "なし"}）`, full && trapped);
      if (label === "transform") {
        await pg.screenshot({ path: join(SHOTS, "29_fullscreen_with_transform_ancestor.png") });
        log("  SS: 29_fullscreen_with_transform_ancestor.png");
      }
    } finally { await tb.close(); }
  }

  // 撮影画面を開く共通手順と、フェイクカメラ付きブラウザの起動。
  // 6c-3 以降の複数の節で使うので、最初に使う節より前で宣言しておく（巻き上げされないため）。
  const openPhotoGuide = async (pg) => {
    await pg.goto(ART, { waitUntil: "networkidle" });
    await pg.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await pg.locator("#colorlab-root").getByRole("button", { name: /顔写真で診断/ }).click();
    await pg.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
    const cb = pg.locator("#colorlab-root input[type=checkbox]");
    for (let i = 0; i < (await cb.count()); i++) await cb.nth(i).check();
    await pg.locator("#colorlab-root").getByRole("button", { name: /^地毛に近い$/ }).click();
    await pg.locator("#colorlab-root").getByRole("button", { name: /撮影にすすむ/ }).click();
    await pg.locator("#colorlab-root").getByRole("button", { name: /カメラを起動する/ }).click();
    await pg.waitForSelector("video", { state: "visible", timeout: 15000 });
    await pg.waitForTimeout(1400); // 400ms間隔のライブ判定が数回まわるのを待つ
  };
  const liveBrowser = async (y4m) => chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-video-capture=" + y4m],
  });

  // ── 6c-3. 映像のアスペクト比が変わっても「ガイド＝測定範囲」であること ──
  // iOS Safari は width/height が ideal 指定だと 4:3 の横長映像を返す。
  // 以前は viewBox="0 0 300 400"(3:4) 固定でガイドを描いていたため、4:3 の映像では
  // ガイドがレターボックスされて中央に縮小描画され、画面に見える枠と実際に測る場所が
  // 最大36pxズレていた（2026-08-30 実機で実測。頬の測定範囲が顔の外に乗っていた）。
  // テストが 3:4 の映像だけだったので見逃した。ここは両アスペクトの回帰ゲート。
  for (const [label, W, H] of [["3:4 縦長", 480, 640], ["4:3 横長", 640, 480]]) {
    const y4m = join(tmpdir(), `colorlab_aspect_${W}x${H}.y4m`);
    wfs(y4m, y4mFromRegions(W, H, [190, 190, 195], [[0.4, 0.4, 0.6, 0.6, [120, 120, 120]]]));
    const ab = await chromium.launch({
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-video-capture=" + y4m],
    });
    try {
      const c = await ab.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, permissions: ["camera"] });
      const pg = await c.newPage();
      await openPhotoGuide(pg);
      const m = await pg.evaluate(() => {
        const v = document.querySelector("video");
        const vb = v.getBoundingClientRect();
        const svg = v.parentElement.querySelector("svg");
        const sb = svg.getBoundingClientRect();
        // 実際に描かれているガイド図形の位置を、映像ボックスに対する相対座標で返す
        const rel = (el) => {
          const b = el.getBoundingClientRect();
          return [(b.x - vb.x) / vb.width, (b.y - vb.y) / vb.height, (b.right - vb.x) / vb.width, (b.bottom - vb.y) / vb.height];
        };
        const els = [...svg.querySelectorAll("ellipse")];
        const byStroke = (u) => els.find((e) => e.getAttribute("stroke") === `url(#${u})`);
        const cheeks = els.filter((e) => e.getAttribute("stroke") === "url(#gCheek)");
        return {
          videoAR: +(vb.width / vb.height).toFixed(3),
          intrinsicAR: +(v.videoWidth / v.videoHeight).toFixed(3),
          svgCoversVideo: Math.abs(sb.width - vb.width) < 1.5 && Math.abs(sb.height - vb.height) < 1.5,
          cheekL: rel(cheeks[0]), hair: rel(byStroke("gHair")), paper: rel(byStroke("gPaper")),
        };
      });
      // アプリ側が実際に使う測定範囲（photoGeometry）を、同じ計算で求めて突き合わせる
      // アプリ側が実際に使う測定範囲を、同じ比率定数から独立に計算して突き合わせる。
      // 定数はソース(PH_FACE)から読むので、テスト側に数値を二重管理しない。
      const want = await pg.evaluate(({ ar, F }) => {
        const VBW = 1000, VBH = Math.round(1000 / ar);
        const cx = VBW / 2, ry = F.ryRel * VBH, rx = F.wh * ry, cy = F.cyRel * VBH;
        const cyCheek = cy + F.cheekY * ry, halfAt = rx * Math.sqrt(1 - F.cheekY ** 2);
        const dx = F.cheekX * halfAt, rC = F.cheekR * rx;
        const cyHair = cy - ry - F.hairY * ry;
        const yP0 = F.paperY0 * VBH, yP1 = F.paperY1 * VBH;
        const rect = (bx, by, hw, hh) => [(bx - hw) / VBW, (by - hh) / VBH, (bx + hw) / VBW, (by + hh) / VBH];
        return {
          cheekL: rect(cx - dx, cyCheek, rC, rC),
          hair: rect(cx, cyHair, F.hairW * rx, F.hairR * ry),
          paper: rect(cx, (yP0 + yP1) / 2, F.paperW * rx, (yP1 - yP0) / 2),
        };
      }, { ar: m.intrinsicAR, F: PH_FACE });
      check(`${label}: 映像の縦横比が想定どおり (実測 ${m.intrinsicAR})`, Math.abs(m.intrinsicAR - W / H) < 0.01);
      check(`${label}: ガイドSVGが映像と同じ大きさ（レターボックスしていない）`, m.svgCoversVideo);
      let worst = 0, worstName = "";
      for (const k of ["cheekL", "hair", "paper"]) {
        for (let i = 0; i < 4; i++) {
          const d = Math.abs(m[k][i] - want[k][i]);
          if (d > worst) { worst = d; worstName = k; }
        }
      }
      check(`${label}: 描かれたガイド = 測定範囲（最大ズレ ${(worst * 100).toFixed(2)}% / ${worstName}）`, worst < 0.01);
      await pg.screenshot({ path: join(SHOTS, `35_aspect_${W}x${H}.png`) });
      log(`  SS: 35_aspect_${W}x${H}.png`);
    } finally { await ab.close(); }
  }

  // ── 6c-2. 撮影中のライブ条件チェック表示 ──
  // フェイクカメラに Y4M を流し込み、「条件を満たす映像」と「暗い映像」で表示が変わることを見る
  const okY4m = join(tmpdir(), "colorlab_live_ok.y4m");
  const darkY4m = join(tmpdir(), "colorlab_live_dark.y4m");
  // 顔写真診断のサンプリング領域(PH_REGION)に合わせた「条件を満たす映像」
  wfs(okY4m, y4mFromRegions(480, 640, [190, 190, 195], [
    [0.40, 0.06, 0.60, 0.16, [62, 46, 38]],     // 髪
    [0.24, 0.46, 0.36, 0.58, [233, 194, 168]],  // 左頬
    [0.64, 0.46, 0.76, 0.58, [233, 194, 168]],  // 右頬
    [0.34, 0.76, 0.66, 0.92, [235, 232, 228]],  // 白い紙
  ]));
  // 同じ構図だが全体が暗い映像（白い紙が暗すぎる）
  wfs(darkY4m, y4mFromRegions(480, 640, [24, 24, 26], [
    [0.40, 0.06, 0.60, 0.16, [14, 12, 12]],
    [0.24, 0.46, 0.36, 0.58, [56, 46, 40]],
    [0.64, 0.46, 0.76, 0.58, [56, 46, 40]],
    [0.34, 0.76, 0.66, 0.92, [70, 69, 68]],
  ]));


  // (a) 条件を満たす映像 → 4項目すべて ✓
  let lb = await liveBrowser(okY4m);
  try {
    const c = await lb.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, permissions: ["camera"] });
    const pg = await c.newPage();
    pg.on("request", (r) => { if (/anthropic\.com/.test(r.url())) aiCalls.push(r.url()); });
    await openPhotoGuide(pg);
    const t = await pg.locator("body").innerText();
    check("ライブ判定: 明るさ ✓十分", /明るさ\s*✓十分/.test(t));
    check("ライブ判定: 白い紙 ✓検出", /白い紙\s*✓検出/.test(t));
    check("ライブ判定: 顔の位置 ✓枠内（白紙が取れたら本判定と同じ基準で判定される）", /顔の位置\s*✓枠内/.test(t));
    check("ライブ判定: 左右 ✓良好", /左右\s*✓良好/.test(t));
    check("全項目✓のときは「あくまで目安」の文言が出る", /撮影前の目安です/.test(t) && /撮り直しをお願いすることがあります/.test(t));

    // シャッター・ガイド枠と重なっていないこと（案Cの構造を崩していない）
    const rectOf = async (sel) => pg.locator(sel).first().evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; });
    const sh = await rectOf('button[aria-label="撮影する"]');
    const paper = await rectOf('svg ellipse[stroke="url(#gPaper)"]');
    const pills = await pg.locator("span", { hasText: /明るさ|白い紙|顔の位置|左右/ }).evaluateAll((els) =>
      els.filter((e) => e.children.length === 3).map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; }));
    const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.x, b.x) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 0;
    check(`ライブ表示が4項目ぶん描画されている (${pills.length}件)`, pills.length === 4);
    check("ライブ表示がシャッターに重なっていない", pills.every((p) => !hit(p, sh)));
    const vpw = pg.viewportSize().width;
    const over = pills.filter((p) => p.x < 0 || p.right > vpw);
    check(`ライブ表示が画面内に収まっている（はみ出し${over.length}件）`, over.length === 0);
    // v1.14.0: パネルは「映像の外・シャッターの上」。撮影時に指で隠れないことの実測ゲート。
    const vbox = await pg.locator("video").evaluate((v) => { const b = v.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; });
    const lowest = Math.max(...pills.map((p) => p.bottom));
    check(`ライブ表示がシャッターより上にある（指の可動域外・最下端とシャッター上端の差 ${Math.round(sh.y - lowest)}px）`, lowest <= sh.y);
    check("ライブ表示が映像に重なっていない（ガイドを隠さない）", pills.every((p) => !hit(p, vbox)));
    check(`ライブ表示が4項目とも同じ帯にある（2×2グリッド）`, new Set(pills.map((p) => Math.round(p.y))).size === 2);
    check("ライブ表示が白紙ガイド(映像側)に重なっていない", pills.every((p) => !hit(p, paper)));
    // ライブ判定を回したまま3秒間の描画間隔と映像のフレーム落ちを実測する
    const perf = await pg.evaluate(() => new Promise((res) => {
      const v = document.querySelector("video");
      const q0 = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
      const gaps = []; let last = performance.now(); const t0 = last;
      const step = (t) => {
        gaps.push(t - last); last = t;
        if (t - t0 < 3000) requestAnimationFrame(step);
        else {
          const q1 = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
          res({
            dropped: q0 && q1 ? q1.droppedVideoFrames - q0.droppedVideoFrames : 0,
            avgGap: +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1),
            maxGap: +Math.max(...gaps).toFixed(1),
          });
        }
      };
      requestAnimationFrame(step);
    }));
    check(`ライブ判定を回してもカクつかない（描画 平均${perf.avgGap}ms / 最大${perf.maxGap}ms、映像のフレーム落ち${perf.dropped}）`,
      perf.maxGap < 100 && perf.dropped === 0);
    await pg.screenshot({ path: join(SHOTS, "23_photo_live_all_ok.png") }); // 全画面なのでビューポートを撮る
    log("  SS: 23_photo_live_all_ok.png");
  } finally { await lb.close(); }

  // (b) 暗い映像 → 明るさが ✓ にならない
  lb = await liveBrowser(darkY4m);
  try {
    const c = await lb.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, permissions: ["camera"] });
    const pg = await c.newPage();
    pg.on("request", (r) => { if (/anthropic\.com/.test(r.url())) aiCalls.push(r.url()); });
    await openPhotoGuide(pg);
    const t = await pg.locator("body").innerText();
    check("ライブ判定: 暗い映像で 明るさ が✓にならない", /明るさ\s*○不足/.test(t) && !/明るさ\s*✓/.test(t));
    check("ライブ判定: 暗い映像で 白い紙 も未検出になる", /白い紙\s*○未検出/.test(t));
    check("暗い映像では「窓の近くへ移動してください」が出る", /窓の近くへ移動してください/.test(t));
    check("そのとき「撮影前の目安です」は出ない（改善アクションに置き換わる）", !/撮影前の目安です/.test(t));
    await pg.screenshot({ path: join(SHOTS, "24_photo_live_dark.png") }); // 全画面なのでビューポートを撮る
    log("  SS: 24_photo_live_dark.png");
  } finally { await lb.close(); }

  // (c) 白い紙だけ取れない映像 → 「顔の位置」は ○ズレ ではなく 「— 白い紙が先」になる
  //     （頬は正しい肌色なので、位置が悪いと嘘を伝えてはいけない）
  const noPaperY4m = join(tmpdir(), "colorlab_live_nopaper.y4m");
  wfs(noPaperY4m, y4mFromRegions(480, 640, LIVE_NOPAPER, [
    [0.40, 0.06, 0.60, 0.16, [62, 46, 38]],
    [0.24, 0.46, 0.36, 0.58, [233, 194, 168]],   // 正しい肌色
    [0.64, 0.46, 0.76, 0.58, [233, 194, 168]],
    [0.34, 0.76, 0.66, 0.92, [210, 180, 140]],   // 明るいが色かぶり33% → 白紙は未検出
  ]));
  lb = await liveBrowser(noPaperY4m);
  try {
    const c = await lb.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, permissions: ["camera"] });
    const pg = await c.newPage();
    pg.on("request", (r) => { if (/anthropic\.com/.test(r.url())) aiCalls.push(r.url()); });
    await openPhotoGuide(pg);
    const t = await pg.locator("body").innerText();
    check("ライブ判定: 白紙が取れないと 白い紙 は ○未検出", /白い紙\s*○未検出/.test(t));
    check("ライブ判定: そのとき 明るさ は ✓十分（keisukeの実機と同じ状態）", /明るさ\s*✓十分/.test(t));
    check("ライブ判定: 顔の位置が「— 白い紙が先」になる（○ズレ と誤表示しない）",
      /顔の位置\s*—白い紙が先/.test(t) && !/顔の位置\s*○ズレ/.test(t));
    check("白紙が取れないときは「白い紙を顎の下に持ってください」が出る", /白い紙を顎の下に持ってください/.test(t));
    await pg.screenshot({ path: join(SHOTS, "32_photo_live_paper_first.png") });
    log("  SS: 32_photo_live_paper_first.png");
  } finally { await lb.close(); }

  // (d) 境界付近で揺れる映像でも、表示がチラつかないこと（v1.15.0 の平滑化＋ヒステリシス）
  const flickerY4m = join(tmpdir(), "colorlab_live_flicker.y4m");
  wfs(flickerY4m, y4mFlicker(480, 640));
  lb = await liveBrowser(flickerY4m);
  try {
    const c = await lb.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, permissions: ["camera"] });
    const pg = await c.newPage();
    pg.on("request", (r) => { if (/anthropic\.com/.test(r.url())) aiCalls.push(r.url()); });
    await openPhotoGuide(pg);
    // 4秒ぶん（400ms×10回）の表示を追い、「顔の位置」が何回切り替わるかを数える
    const seen = [];
    for (let i = 0; i < 10; i++) {
      const t = await pg.locator("body").innerText();
      const m = t.match(/顔の位置\s*([✓○—])/);
      seen.push(m ? m[1] : "?");
      await pg.waitForTimeout(400);
    }
    let switches = 0;
    for (let i = 1; i < seen.length; i++) if (seen[i] !== seen[i - 1]) switches++;
    log(`  [チラつき] 「顔の位置」の表示推移: ${seen.join("")}`);
    check(`静止姿勢でも表示がチラつかない（4秒間の切り替わり ${switches} 回）`, switches <= 1);
    await pg.screenshot({ path: join(SHOTS, "39_photo_live_stable.png") });
    log("  SS: 39_photo_live_stable.png");
  } finally { await lb.close(); }

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
    await p2.waitForSelector("video", { state: "visible", timeout: 15000 });
    await p2.waitForTimeout(800);
    const boxOf = async (sel) => p2.locator(sel).evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; });
    const vb2 = await p2.locator("video").boundingBox();
    const topsBox = await boxOf('svg rect[stroke="url(#gTops)"]');
    const botsBox = await boxOf('svg rect[stroke="url(#gBottoms)"]');
    const sh2 = await p2.locator('button[aria-label="撮影する"]').boundingBox();
    const scPortal = await p2.evaluate(() => !document.querySelector("video").closest("#colorlab-root"));
    check("コーデ採点の撮影画面も body 直下（ポータル）に出る", scPortal);
    const scFull = await p2.evaluate(() => {
      let el = document.querySelector("video");
      while (el && getComputedStyle(el).position !== "fixed") el = el.parentElement;
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { w: b.width, h: b.height, vw: window.innerWidth, vh: window.innerHeight };
    });
    check("コーデ採点の撮影画面も全画面になっている (" + (scFull ? `${Math.round(scFull.w)}x${Math.round(scFull.h)}` : "なし") + ")",
      !!scFull && Math.abs(scFull.w - scFull.vw) < 1 && Math.abs(scFull.h - scFull.vh) < 1);
    const mid = (a, b) => (a + b) / 2;
    const dTops = Math.abs(mid(topsBox.y, topsBox.bottom) - (vb2.y + 0.40 * vb2.height));
    const dBots = Math.abs(mid(botsBox.y, botsBox.bottom) - (vb2.y + 0.70 * vb2.height));
    check(`トップス枠が SC_REGION(0.30〜0.50) と一致 (中心Yズレ${dTops.toFixed(1)}px)`, dTops < 5);
    check(`ボトムス枠が SC_REGION(0.60〜0.80) と一致 (中心Yズレ${dBots.toFixed(1)}px)`, dBots < 5);
    check("撮影ボタンがガイド枠に重なっていない", sh2.y >= botsBox.bottom);
    await p2.screenshot({ path: join(SHOTS, "22_score_camera_guide.png") }); // 全画面なのでビューポートを撮る
    log("  SS: 22_score_camera_guide.png");
    const tr = await p2.evaluate(() => document.querySelector("video")?.srcObject?.getTracks?.().length ?? 0);
    check("採点のカメラが起動している（撮影ガイドが実映像に重なる）", tr > 0);
  } finally {
    await scBrowser.close();
  }

  // ── 6f. SPA（Next.js相当）での自動マウント ──
  // 本番の blubel.jp は Next.js の SPA。サイト内リンクから来ると、ページ本文に貼った
  // <script> は実行されない（React が innerHTML 相当で差し込むため）。
  // そこで「スクリプトは共通ヘッダーで常時読み込み → #colorlab-root を見つけたら自動マウント」
  // という作りにした。ここはその回帰ゲート。
  {
    const spaPage = join(tmpdir(), "colorlab_spa.html");
    // 共通ヘッダーでスクリプトを読み、本文は後から JS で差し込む（＝SPA遷移の再現）
    wfs(spaPage, `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="file:///${join(__dirname, "..", "dist", "colorlab.iife.js").replace(/\\/g, "/")}"></script>
</head><body>
<div id="app"><h1>トップページ</h1><p>ここから記事へ遷移します。</p></div>
<script>
  // Next.js のクライアント遷移を模す: innerHTML で本文を差し込む。
  // この中の <script> はブラウザ仕様で実行されない（本番と同じ条件）。
  window.goToArticle = function () {
    document.getElementById('app').innerHTML =
      '<h1>パーソナルカラー診断</h1>' +
      '<div id="colorlab-root">アプリを読み込み中…</div>' +
      '<scr' + 'ipt>window.ColorLabApp && window.ColorLabApp.mount("#colorlab-root");</scr' + 'ipt>';
    history.pushState({}, '', '?p=personalcolor'); // file:// では絶対パスは使えないためクエリで代用
  };
  window.rerenderArticle = function () {
    // SPA の再描画で中身を消される状況を模す
    document.getElementById('colorlab-root').innerHTML = 'アプリを読み込み中…';
  };
</script>
</body></html>`, "utf8");

    const spaBrowser = await chromium.launch();
    try {
      const c = await spaBrowser.newContext({ viewport: { width: 375, height: 812 } });
      const pg = await c.newPage();
      await pg.goto("file:///" + spaPage.replace(/\\/g, "/"), { waitUntil: "networkidle" });
      check("SPA: 遷移前は #colorlab-root がまだ無い", (await pg.locator("#colorlab-root").count()) === 0);

      // クライアント遷移（本文を innerHTML で差し込む。中の <script> は実行されない）
      await pg.evaluate(() => window.goToArticle());
      await pg.waitForSelector("#colorlab-root button", { timeout: 8000 }).catch(() => {});
      const mounted = await pg.evaluate(() => {
        const el = document.getElementById("colorlab-root");
        return { children: el ? el.children.length : -1, text: el ? el.textContent.trim().slice(0, 12) : null };
      });
      check(`SPA: クライアント遷移でも自動マウントされる（子要素${mounted.children}個 / text="${mounted.text}"）`,
        mounted.children > 0 && !/アプリを読み込み中/.test(mounted.text || ""));
      await pg.screenshot({ path: join(SHOTS, "33_spa_automount.png") });
      log("  SS: 33_spa_automount.png");

      // SPA の再描画で消されても貼り直されるか
      await pg.evaluate(() => window.rerenderArticle());
      await pg.waitForTimeout(1200);
      const remounted = await pg.evaluate(() => {
        const el = document.getElementById("colorlab-root");
        return { children: el ? el.children.length : -1, text: el ? el.textContent.trim().slice(0, 12) : null };
      });
      check(`SPA: 再描画で消されても貼り直される（子要素${remounted.children}個）`,
        remounted.children > 0 && !/アプリを読み込み中/.test(remounted.text || ""));
    } finally { await spaBrowser.close(); }
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
