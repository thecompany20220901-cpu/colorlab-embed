// 12タイプ名の表示を実測する（2026-10-10 types12）。
// 本番と同じ経路（質問で診断を最後まで回答）で 1位x2位 の12通りを全部出し、
//   (1) 結果見出しの 2nd 行が12タイプ名になっているか
//   (2) 旧表示「2nd：○○」が結果見出しに残っていないか
//   (3) 1位の見出し「あなたは【○○】タイプです！」は残っているか
//   (4) 「今日なに着る？」のピルが12タイプ名か（旧「○○ × 2nd ○○」でないか）
// を見て、結果見出しのスクリーンショットを out/types12/ に12枚保存する。
// シェア画像の 2nd 行(40px)が幅 1080-80*2=920px を超えるかも実測して出す。
// 回答パターンは src の Q12 配点から総当たりで探す（同点の時は同点解消の設問も選ぶ）。
// 質問式の配点では 1位と2位が「黄み/青み・明るい/深い の両方で反対」の組み合わせ
// (4-1 / 1-4 / 3-2) は出ないため、この3つは本番の「写真で診断」経路に合成写真を通して出す。
// 実行: npm run build:colorlab && node test/types12_check.mjs
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";
import zlib from "zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(ROOT, "out", "types12");
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(HERE, "_card_harness.html"), `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="colorlab-root"></div>
<script>window.dataLayer=[];</script>
<script src="/dist/colorlab.iife.js"></script></body></html>`, "utf-8");

// 指示書の対応表（1st x 2nd -> 12タイプ名）。数字は TYPES の num。
const JA = { 1: "イエベ春", 2: "ブルベ夏", 3: "イエベ秋", 4: "ブルベ冬" };
const EXPECT = [
  ["2-1", "ブライトサマー", "blubel_bright_summer"],
  ["2-3", "ソフトサマー", "blubel_soft_summer"],
  ["2-4", "クールサマー", "blubel_cool_summer"],
  ["4-1", "ブライトウィンター", "blubel_bright_winter"],
  ["4-2", "クールウィンター", "blubel_cool_winter"],
  ["4-3", "ディープウィンター", "blubel_deep_winter"],
  ["1-2", "ライトスプリング", "iebel_light_spring"],
  ["1-4", "ブライトスプリング", "iebel_bright_spring"],
  ["1-3", "ウォームスプリング", "iebel_warm_spring"],
  ["3-1", "ウォームオータム", "iebel_warm_autumn"],
  ["3-2", "ソフトオータム", "iebel_soft_autumn"],
  ["3-4", "ディープオータム", "iebel_deep_autumn"],
];

// ── 回答パターンの探索（本番の answerQ / finishQuiz / sortTypes と同じ規則）──
const src = readFileSync(resolve(ROOT, "src", "color_lab_stylist_v23.jsx"), "utf-8");
const q12 = src.slice(src.indexOf("const Q12 = ["), src.indexOf("const TIE_Q"));
const GAINS = [...q12.matchAll(/A: \[(\d), (\d)\], B: \[(\d), (\d)\]/g)]
  .map((m) => ({ A: [+m[1], +m[2]], B: [+m[3], +m[4]] }));
if (GAINS.length !== 13) throw new Error("Q12 の配点が13問分取れない: " + GAINS.length);
const TIE = { A: 1, B: 2, C: 3, D: 4 };
const sortTypes = (s) => [1, 2, 3, 4].map((t) => ({ t, s: s[t] }))
  .sort((a, b) => (b.s !== a.s ? b.s - a.s : a.t - b.t));
function findPattern(want) {
  for (let bits = 0; bits < 1 << 13; bits++) {
    const s = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const picks = [];
    for (let i = 0; i < 13; i++) {
      const c = bits & (1 << i) ? "B" : "A";
      picks.push(c);
      GAINS[i][c].forEach((t) => { s[t] += 1; });
    }
    const sorted = sortTypes(s);
    const tied = sorted.filter((x) => x.s === sorted[0].s).length > 1;
    const tries = tied ? Object.keys(TIE) : [null];
    for (const tc of tries) {
      const f = { ...s };
      if (tc) f[TIE[tc]] += 1;
      const r = sortTypes(f);
      if (`${r[0].t}-${r[1].t}` === want) return { picks, tie: tc };
    }
  }
  return null;
}

// ── 合成写真（test/screenshot.mjs の PHOTO_OK と同じ配置。白紙は無彩色 235 なので補正ゲインは 1）──
function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = 0.95047 * inv(fx), Y = inv(fy), Z = 1.08883 * inv(fz);
  const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
  return lin.map((c) => Math.max(0, Math.min(255, Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)))));
}
function chunk(type, data) {
  const crc32 = (buf) => { let c = 0xffffffff; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; };
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function regionPng(W, H, base, rects) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
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
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const facePhoto = (skinLab, hairL) => {
  const skin = labToRgb(...skinLab), hair = labToRgb(hairL, 0, 0);
  return regionPng(600, 800, [190, 190, 195], [
    [0.40, 0.06, 0.60, 0.16, hair],
    [0.24, 0.46, 0.36, 0.58, skin],
    [0.64, 0.46, 0.76, 0.58, skin],
    [0.34, 0.76, 0.66, 0.92, [235, 235, 235]],
  ]);
};
// diagnoseByMeasure の式で 暖=0.4〜0.6 / 明=0.4〜0.6 / 清濁を端に寄せた肌（L*, a*, b*）と髪の L*
const PHOTO = {
  "4-1": facePhoto([64, 14, 17.3], 6),    // 暖0.4 明0.4 清1 → 冬 0.65 / 春 0.97
  "1-4": facePhoto([68, 12, 19], 10),     // 暖0.6 明0.6 清1 → 春 0.65 / 冬 0.97
  "3-2": facePhoto([64, 6, 15.7], 54),    // 暖0.6 明0.4 清0 → 秋 0.65 / 夏 0.97
};

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

const ok = [], ng = [];
const shareFonts = [];
const check = (c, l) => (c ? ok : ng).push(l);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
page.on("pageerror", (e) => ng.push("pageerror: " + e.message));

for (const [key, name, file] of EXPECT) {
  const pat = findPattern(key);
  check(!!pat || !!PHOTO[key], `${key}: 回答パターンか合成写真がある`);
  if (!pat && !PHOTO[key]) continue;
  await page.goto(base + "/test/_card_harness.html");
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
  await page.reload();
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  let route;
  if (pat) {
    route = `質問で診断 picks=${pat.picks.join("")} tie=${pat.tie || "-"}`;
    await page.getByRole("button", { name: /質問で診断/ }).first().click();
    for (let i = 0; i < 13; i++) {
      // 先頭は戻るボタン。選択肢はその次から2つ。
      await page.locator("#colorlab-root button").nth(pat.picks[i] === "A" ? 1 : 2).click();
      await page.waitForTimeout(90);
    }
    if (pat.tie) await page.locator("#colorlab-root button").nth(1 + "ABCD".indexOf(pat.tie)).click();
  } else {
    route = "写真で診断（合成写真）";
    await page.getByRole("button", { name: /^写真で診断/ }).click();
    await page.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
    const boxes = page.locator("#colorlab-root input[type=checkbox]");
    for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
    await page.getByRole("button", { name: /^地毛に近い$/ }).click();
    await page.getByRole("button", { name: /撮影にすすむ/ }).click();
    await page.getByRole("button", { name: /カメラを起動する/ }).click();
    await page.waitForSelector("#colorlab-root >> text=写真を選ぶ", { timeout: 10000 });
    await page.locator("#colorlab-root input[type=file]").setInputFiles({ name: key + ".png", mimeType: "image/png", buffer: PHOTO[key] });
  }
  await page.waitForFunction(() => /タイプです/.test(document.querySelector("#colorlab-root").textContent), null, { timeout: 15000 });
  await page.waitForTimeout(500);

  const [f1, f2] = key.split("-");
  const info = await page.evaluate(() => {
    const root = document.querySelector("#colorlab-root");
    const h2 = [...root.querySelectorAll("h2")].find((h) => /タイプです/.test(h.textContent));
    const pill = h2 && h2.nextElementSibling;
    return { h2: h2 ? h2.textContent : "", pill: pill ? pill.textContent.trim() : "" };
  });
  // v1.22.10: 見出しが12タイプ名になり、見出し下のピル（12タイプ名だけの行）は外した
  check(info.h2.includes(`【${name}】`), `${key}: 見出し「あなたは【${name}】タイプです！」 (${info.h2})`);
  check(info.pill !== name, `${key}: 見出し下に12タイプ名だけのピルが無い (直後の行「${info.pill.slice(0, 30)}」)`);
  check(!/2nd：/.test(info.pill) && !info.pill.includes(JA[f2]), `${key}: 旧表示「2nd：${JA[f2]}」が無い`);

  // 結果名の表示（見出しまわり）を保存
  const h = page.locator("#colorlab-root h2", { hasText: "タイプです" }).first();
  await h.scrollIntoViewIfNeeded();
  const box = await h.boundingBox();
  const shot = resolve(OUT, file + ".png");
  await page.screenshot({ path: shot, clip: { x: 0, y: Math.max(0, box.y - 260), width: 420, height: 520 } });

  // シェア画像: 実際に「結果を画像で保存・シェア」を押し、canvas に描いた文字と font を控える
  await page.evaluate(() => {
    window.__ft = []; window.__dl = [];
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__ft.push({ t: String(t), font: this.font }); return ft.call(this, t, ...a); };
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dl.push(this.download); };
  });
  await page.getByRole("button", { name: /結果を画像で保存・シェア/ }).first().click();
  await page.waitForFunction(() => (window.__dl || []).length > 0, null, { timeout: 10000 });
  const drawn = await page.evaluate(() => window.__ft);
  const line = drawn.find((d) => d.t === name);
  check(!!line, `${key}: シェア画像に「${name}」が描かれる (${line ? line.font : "なし"})`);
  check(!drawn.some((d) => /^2nd /.test(d.t)), `${key}: シェア画像に旧表示「2nd ${JA[f2]}」が無い`);
  shareFonts.push(`${name}: ${line ? line.font : "なし"}`);

  // 今日なに着る？ のピル（結果画面のボタンから入る。診断結果 myType/mySecond を使う）
  await page.getByRole("button", { name: /このタイプで「今日なに着る？」/ }).first().click();
  await page.waitForTimeout(400);
  const stTxt = await page.evaluate(() => document.querySelector("#colorlab-root").textContent);
  const pillM = stTxt.match(/今日なに着る？.{0,40}?(\S+)\s*変更/);
  check(pillM && pillM[1].endsWith(name), `${key}: 今日なに着る？ のピルが「${name}」 (実際「${pillM ? pillM[1] : stTxt.slice(0, 120)}」)`);
  check(!stTxt.includes(`× 2nd ${JA[f2]}`), `${key}: 今日なに着る？ に旧表示「${JA[f1]} × 2nd ${JA[f2]}」が無い`);
  console.log(`  ${key} ${name} ${route} -> ${shot}`);
}

// シェア画像の 2nd 行: 本番と同じフォント指定で幅を実測し、920px を超える時の縮小後pxを出す
const widths = await page.evaluate((names) => {
  const ctx = document.createElement("canvas").getContext("2d");
  return names.map((n) => {
    let f = 40; ctx.font = f + "px sans-serif";
    const w40 = ctx.measureText(n).width;
    while (f > 10 && ctx.measureText(n).width > 1080 - 80 * 2) { f -= 1; ctx.font = f + "px sans-serif"; }
    return { n, w40: Math.round(w40), font: f };
  });
}, EXPECT.map((e) => e[1]));
widths.forEach((w) => console.log(`  share: ${w.n} 40px幅=${w.w40}px (上限920px) -> ${w.font}px`));
shareFonts.forEach((f) => console.log("  share(実描画): " + f));

await browser.close();
server.close();
console.log("PASS " + ok.length + " / FAIL " + ng.length);
ok.forEach((l) => console.log("  [OK] " + l));
ng.forEach((l) => console.log("  [NG] " + l));
process.exit(ng.length ? 1 : 0);
