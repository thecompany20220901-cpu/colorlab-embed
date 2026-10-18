// 結果画面の12タイプ化（v1.22.10）を実測する（2026-10-18）。
// 本番と同じ経路（質問で診断を最後まで回答・出ない3通りは合成写真）で 1位x2位 の12通りを全部出し、
//   (i)   見出し「あなたは【○○】タイプです！」に12タイプ名が入る
//   (ii)  見出し下のピル（12タイプ名だけの行）が無い
//   (iii) 「まずはこの10色から」のスウォッチが10個で、HEX が下の EXPECT と一致する
//   (iv)  「○○に似合う服を、一覧で見る」の href が下のカテゴリ表と一致する
//   (v)   「似合う服はコレ！」直下の固定商品カードと「TOP6の色だけ」ボタンが無い
//   (vi)  結果画面の本文に イエベ春/イエベ秋/ブルベ夏/ブルベ冬 が残っている箇所を一覧で出す（判定はしない）
//   (vii) 見出しの【12タイプ名】が1行に収まる（字の大きさも出す）。「○○のあなたに似合う服はコレ！」も途中で折り返さない
//   (viii) 結果画面最上部のアバターが読み込み完了する（complete かつ naturalWidth > 0。最大20秒待つ）
//   (ix)  見出し下のタグ行に 明度・彩度・清濁 のタグが無い
//   (x)   「○○のあなたに似合う服はコレ！」の「あなたに」が途中で割れない（1文字ごとの y 位置が同じ）
//   (xi)  「○○に似合う服を、一覧で見る」ボタンの「一覧で見る」が途中で割れない（1文字ごとの y 位置が同じ）
//   スクリーンショットを撮る時は、撮った画像のアバター枠が単色でないことも画素で確かめる
// あわせて「結果を画像で保存・シェア」で canvas に描かれた文字を12通りぶん出す。
// 期待値はこのファイルに直接書く（src から読まない。読むと src が壊れても一致してしまう）。
// 実行: npm run build:colorlab && node test/result12_check.mjs [バンドルのパス]
//   バンドル省略時は dist/colorlab.iife.js。別のバンドルを渡した時はスクリーンショットを撮らない。
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";
import zlib from "zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BUNDLE = resolve(process.argv[2] || join(ROOT, "dist", "colorlab.iife.js"));
const SHOOT = !process.argv[2];
const OUT = resolve(ROOT, "out", "result12");
if (SHOOT) mkdirSync(OUT, { recursive: true });
const CROP_OUT = resolve(OUT, "crop");
const CROP_TYPES = ["ライトスプリング", "ディープウィンター"];

const UTM = "?utm_source=colorlab&utm_medium=result&utm_campaign=type12";
// [1位-2位, 12タイプ名, サイト, カテゴリ番号, 10色]
const EXPECT = [
  ["2-1", "ブライトサマー", "blubel", 14, ["#FECFD9", "#D698C1", "#ACCEF1", "#FEFFDB", "#FEF898", "#FDD4F2", "#B4B2D9", "#98CEF2", "#73D6BA", "#D2D9E1"]],
  ["2-3", "ソフトサマー", "blubel", 15, ["#A16F7B", "#709D89", "#A2A7CF", "#FAF399", "#A6A2A3", "#CD8DA5", "#A1BBB8", "#CAA9C6", "#F3DD87", "#323558"]],
  ["2-4", "クールサマー", "blubel", 16, ["#FFD2D9", "#F6F17B", "#71B3E3", "#DC4647", "#080240", "#F9ADD3", "#47B68B", "#0D43C9", "#A7194B", "#FDFFE7"]],
  ["4-3", "ディープウィンター", "blubel", 17, ["#990C50", "#6B016D", "#F6E073", "#989701", "#383836", "#55072E", "#011971", "#3B4374", "#345F55", "#010101"]],
  ["4-2", "クールウィンター", "blubel", 18, ["#EEB6CF", "#C53F72", "#34A9DE", "#334A9A", "#000000", "#FDE755", "#1E9A82", "#13749E", "#7E4B86", "#FDFDFB"]],
  ["4-1", "ブライトウィンター", "blubel", 19, ["#E7DDFF", "#3DCFFE", "#F9FE02", "#E30037", "#FDFDFD", "#FEE4FF", "#0815BB", "#83DD3D", "#E92BE3", "#000000"]],
  ["1-2", "ライトスプリング", "iebel", 14, ["#ECC6D9", "#EAB7B9", "#D48473", "#E4D594", "#F0F2BF", "#DCE2AC", "#BADAC4", "#D3E9EE", "#AED2D8", "#A1CBCB"]],
  ["1-4", "ブライトスプリング", "iebel", 15, ["#C53F83", "#C45D51", "#D36D3D", "#ECDF5E", "#D7CF83", "#B0CC5A", "#78B664", "#77BEC0", "#4B9BB7", "#6BA5B4"]],
  ["1-3", "ウォームスプリング", "iebel", 16, ["#EBC051", "#D1766F", "#D6EA95", "#CF7250", "#568C5F", "#516D36", "#1F3F54", "#6AB3AB", "#763E29", "#DBB891"]],
  ["3-2", "ソフトオータム", "iebel", 17, ["#F8D8D7", "#ECE392", "#C3918F", "#BFC3A6", "#B3696B", "#4B7173", "#7B5973", "#86605C", "#8493B4", "#E3DACB"]],
  ["3-4", "ディープオータム", "iebel", 18, ["#9F563D", "#CAA744", "#71292D", "#D07150", "#656742", "#65284A", "#3B6A7E", "#234563", "#523224", "#000328"]],
  ["3-1", "ウォームオータム", "iebel", 19, ["#E59A95", "#E8B87F", "#DE824B", "#AC4234", "#497849", "#37143A", "#4D2F22", "#22435F", "#62A49F", "#E3B199"]],
];

// ── 回答パターンの探索（test/types12_check.mjs と同じ。本番の answerQ / finishQuiz / sortTypes と同じ規則）──
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

// ── 合成写真（test/types12_check.mjs と同じ。質問式で出ない 4-1 / 1-4 / 3-2 用）──
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
const PHOTO = {
  "4-1": facePhoto([64, 14, 17.3], 6),
  "1-4": facePhoto([68, 12, 19], 10),
  "3-2": facePhoto([64, 6, 15.7], 54),
};

// ハーネスはファイルに書かずサーバから返す（他のテストの _card_harness.html と取り合わない）
const HARNESS = `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="colorlab-root"></div>
<script>window.dataLayer=[];</script>
<script src="/__bundle.js"></script></body></html>`;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/__harness.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(HARNESS); return; }
  if (p === "/__bundle.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(readFileSync(BUNDLE)); return; }
  const f = join(ROOT, p);
  if (!existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream", "Access-Control-Allow-Origin": "*" });
  res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, ok));
const base = "http://127.0.0.1:" + server.address().port;

const ok = [], ng = [];
const check = (c, l) => (c ? ok : ng).push(l);
const seasonHits = [];
const shareTexts = [];
const avatarLog = [], fontLog = [], shotLog = [], cropLog = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
page.on("pageerror", (e) => ng.push("pageerror: " + e.message));

console.log("bundle: " + BUNDLE);
for (const [key, name, site, cat, hexes] of EXPECT) {
  const pat = findPattern(key);
  if (!pat && !PHOTO[key]) { check(false, `${key}: 回答パターンも合成写真も無い`); continue; }
  await page.goto(base + "/__harness.html");
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
  await page.reload();
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  let route;
  if (pat) {
    route = `質問で診断 picks=${pat.picks.join("")} tie=${pat.tie || "-"}`;
    await page.getByRole("button", { name: /質問で診断/ }).first().click();
    for (let i = 0; i < 13; i++) {
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

  const info = await page.evaluate(() => {
    const root = document.querySelector("#colorlab-root");
    const toHex = (rgb) => {
      const m = String(rgb).match(/\d+/g);
      return m ? "#" + m.slice(0, 3).map((v) => (+v).toString(16).padStart(2, "0")).join("").toUpperCase() : "";
    };
    const h2 = [...root.querySelectorAll("h2")].find((h) => /タイプです/.test(h.textContent));
    const next = h2 && h2.nextElementSibling;
    // (iii) 「まずはこの10色から」の帯の中のスウォッチ
    const head = [...root.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent.trim() === "まずはこの10色から");
    const grid = head && head.nextElementSibling;
    const sw = grid ? [...grid.children].map((c) => toHex(getComputedStyle(c.firstElementChild || c).backgroundColor)) : [];
    // (iv)(v) 「似合う服はコレ！」の見出しから「プロ診断で…」の行まで
    const h3 = [...root.querySelectorAll("h3")].find((h) => /似合う服はコレ/.test(h.textContent));
    const pro = [...root.querySelectorAll("p")].find((p) => /プロ診断でタイプが分かっている方は/.test(p.textContent));
    const between = (el) => h3 && pro && (h3.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && (el.compareDocumentPosition(pro) & Node.DOCUMENT_POSITION_FOLLOWING);
    const links = [...root.querySelectorAll("a")].filter(between);
    const listLink = [...root.querySelectorAll("a")].find((a) => /に似合う服を、一覧で見る/.test(a.textContent));
    const itemCards = links.filter((a) => /\/items\/\d+/.test(a.href)).length;
    const top6Btn = [...root.querySelectorAll("button")].some((b) => /TOP6の色だけ/.test(b.textContent));
    // (vi) 4タイプ名が残る文字（テキストノード単位）。直近の見出しを添える
    const hits = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let lastHead = "";
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (p && /^H[2-4]$/.test(p.tagName)) lastHead = p.textContent.trim().slice(0, 30);
      const t = n.textContent.trim();
      if (/イエベ春|イエベ秋|ブルベ夏|ブルベ冬/.test(t)) hits.push({ t: t.slice(0, 80), head: lastHead, tag: p ? p.tagName.toLowerCase() : "" });
    }
    return {
      h2: h2 ? h2.textContent.trim() : "",
      next: next ? next.textContent.trim().slice(0, 40) : "",
      nextClass: next ? String(next.className) : "",
      sw, listText: listLink ? listLink.textContent.trim() : "", listHref: listLink ? listLink.getAttribute("href") : "",
      itemCards, top6Btn, hits,
    };
  });

  check(info.h2.includes(`【${name}】`), `${key} ${name}: (i) 見出しに12タイプ名 (${info.h2})`);
  check(!(info.next === name || (/rounded-full/.test(info.nextClass) && info.next.includes(name))), `${key} ${name}: (ii) 見出し下のピルが無い (直後の要素「${info.next}」)`);
  check(info.sw.length === 10, `${key} ${name}: (iii) スウォッチが10個 (${info.sw.length}個)`);
  check(JSON.stringify(info.sw) === JSON.stringify(hexes), `${key} ${name}: (iii) HEX が一致 (${info.sw.join(" ") || "なし"})`);
  const wantHref = `https://www.${site}.jp/category/${cat}${UTM}`;
  check(info.listText === `${name}に似合う服を、一覧で見る`, `${key} ${name}: (iv) リンク文言 (${info.listText || "なし"})`);
  check(info.listHref === wantHref, `${key} ${name}: (iv) href=${wantHref} (実際 ${info.listHref || "なし"})`);
  check(info.itemCards === 0, `${key} ${name}: (v) 「似合う服はコレ！」直下に商品カードが無い (${info.itemCards}件)`);
  check(!info.top6Btn, `${key} ${name}: (v) 「TOP6の色だけ」ボタンが無い`);
  info.hits.forEach((h) => seasonHits.push(`${key} ${name} | 直前の見出し「${h.head}」 | <${h.tag}> ${h.t}`));

  // (viii) アバター: complete かつ naturalWidth > 0 になるまで最大20秒待ち、待った時間と最終状態を残す
  const av = await page.evaluate(async () => {
    const img = document.querySelector("#colorlab-root img[src*='/avatars/']");
    if (!img) return { found: false };
    img.loading = "eager";
    const t0 = performance.now();
    const at0 = { complete: img.complete, nw: img.naturalWidth };
    while (!(img.complete && img.naturalWidth > 0) && performance.now() - t0 < 20000) {
      if (img.complete && img.naturalWidth === 0 && performance.now() - t0 > 1000) break; // 読み込み失敗（error）で止まった
      await new Promise((r) => setTimeout(r, 100));
    }
    const box = img.parentElement;
    return { found: true, src: img.getAttribute("src").split("/").slice(-1)[0], at0,
      complete: img.complete, nw: img.naturalWidth, waited: Math.round(performance.now() - t0),
      hidden: box ? getComputedStyle(box).display === "none" : false };
  });
  const avOk = av.found && av.complete && av.nw > 0 && !av.hidden;
  check(avOk, `${key} ${name}: (viii) アバターが読み込み完了 (${av.found ? `${av.src} 開始時 complete=${av.at0.complete}/nw=${av.at0.nw} → ${av.waited}ms後 complete=${av.complete}/nw=${av.nw}/非表示=${av.hidden}` : "img が無い"})`);
  avatarLog.push(`${key} ${name}: ${av.found ? `${av.src} 開始時 nw=${av.at0.nw} / ${av.waited}ms 待って nw=${av.nw} complete=${av.complete} 非表示=${av.hidden} → ${avOk ? (av.at0.nw > 0 ? "最初から読み込み済み" : "待てば読み込める") : "読み込めない"}` : "img が無い"}`);

  // (vii) 見出しの12タイプ名が1行に収まる（折り返していない）・そのときの字の大きさ
  //        「○○のあなたに似合う服はコレ！」も、名前と「似合う服はコレ！」がそれぞれ1行に収まる
  // (ix)  見出し下のタグ行に、明度・彩度・清濁のタグが無い
  const lay = await page.evaluate((name) => {
    const root = document.querySelector("#colorlab-root");
    const h2 = [...root.querySelectorAll("h2")].find((h) => /タイプです/.test(h.textContent));
    const span = h2 && [...h2.querySelectorAll("span")].find((s) => s.textContent.includes(name));
    const lines = (el) => {
      const r = document.createRange(); r.selectNodeContents(el);
      return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
    };
    const subLines = (el, sub) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = n.textContent.indexOf(sub);
        if (i < 0) continue;
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + sub.length);
        return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
      }
      return -1;
    };
    const h3 = [...root.querySelectorAll("h3")].find((h) => /似合う服はコレ/.test(h.textContent));
    const h3span = h3 && [...h3.querySelectorAll("span")].find((s) => s.textContent === name || s.textContent === name + "の");
    // (x) 「あなたに」の1文字ごとの y 位置
    const charTops = (el, sub) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = n.textContent.indexOf(sub);
        if (i < 0) continue;
        return [...sub].map((_, k) => {
          const r = document.createRange(); r.setStart(n, i + k); r.setEnd(n, i + k + 1);
          return Math.round(r.getBoundingClientRect().top);
        });
      }
      return [];
    };
    // タグ行は「① 色相 …」の行の親（見出しの直後とは限らない。v1.22.8 は直後がピル）
    const listLink = [...root.querySelectorAll("a")].find((a) => /に似合う服を、一覧で見る/.test(a.textContent));
    const specLine = [...root.querySelectorAll("div")].find((d) => /^① 色相/.test(d.textContent.trim()));
    const tagRow = specLine && specLine.parentElement;
    return {
      h2Lines: span ? lines(span) : -1, font: span ? getComputedStyle(span).fontSize : "", spanW: span ? Math.round(span.getBoundingClientRect().width) : 0,
      h2W: h2 ? h2.clientWidth : 0, h2Total: h2 ? lines(h2) : 0, h2TailLines: h2 ? subLines(h2, "タイプです！") : -1,
      h3NameLines: h3span ? lines(h3span) : (h3 ? subLines(h3, name) : -1), h3TailLines: h3 ? subLines(h3, "似合う服はコレ！") : -1, h3Total: h3 ? lines(h3) : 0,
      tags: tagRow ? tagRow.textContent.trim() : "",
      anataTops: h3 ? charTops(h3, "あなたに") : [],
      listTops: listLink ? charTops(listLink, "一覧で見る") : [],
    };
  }, name);
  check(lay.h2Lines === 1, `${key} ${name}: (vii) 見出しの【${name}】が1行 (${lay.h2Lines}行・${lay.font}・幅${lay.spanW}/${lay.h2W}px)`);
  check(lay.h2TailLines === 1, `${key} ${name}: (vii) 見出しの「タイプです！」が途中で折り返さない (${lay.h2TailLines}行)`);
  check(lay.h3NameLines === 1 && lay.h3TailLines === 1, `${key} ${name}: (vii) 「${name}のあなたに似合う服はコレ！」で名前と「似合う服はコレ！」が途中で折り返さない (名前${lay.h3NameLines}行・「似合う服はコレ！」${lay.h3TailLines}行・見出し全体${lay.h3Total}行)`);
  check(lay.anataTops.length === 4 && new Set(lay.anataTops).size === 1, `${key} ${name}: (x) 「あなたに」が途中で割れない (1文字ごとの y=${lay.anataTops.join(",") || "なし"})`);
  check(lay.listTops.length === 5 && new Set(lay.listTops).size === 1, `${key} ${name}: (xi) ボタンの「一覧で見る」が途中で割れない (1文字ごとの y=${lay.listTops.join(",") || "なし"})`);
  check(!/(高|中|低)明度|(高|中|低)彩度|清色|濁色/.test(lay.tags), `${key} ${name}: (ix) タグ行に明度・彩度・清濁のタグが無い (${lay.tags.slice(0, 40)})`);
  fontLog.push(`${key} ${name}: ${lay.font}（【${name}】の幅 ${lay.spanW}px / 見出しの幅 ${lay.h2W}px・見出し全体 ${lay.h2Total}行）`);

  if (SHOOT) {
    // アバターは loading="lazy" なので、全体を撮る前に読み込みを待つ（読めなければ本番どおりブロックごと消える）
    await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll("#colorlab-root img")];
      imgs.forEach((i) => { i.loading = "eager"; });
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => {
        i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); setTimeout(r, 10000);
      }))));
    });
    await page.waitForTimeout(300);
    const broken = await page.evaluate(() => [...document.querySelectorAll("#colorlab-root img")]
      .filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute("src")));
    const shot = resolve(OUT, `result12_${site}_${name}.png`);
    const buf = await page.screenshot({ path: shot, fullPage: true });
    // 撮った画像のアバター枠の中が単色でないか（画素の値で確かめる）。data: URL で読むので canvas は汚れない
    const abox = await page.evaluate(() => {
      const img = document.querySelector("#colorlab-root img[src*='/avatars/']");
      if (!img || !img.parentElement || getComputedStyle(img.parentElement).display === "none") return null;
      const r = img.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    });
    const px = abox ? await page.evaluate(async ({ b64, box }) => {
      const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
      const cv = document.createElement("canvas"); cv.width = Math.round(box.w); cv.height = Math.round(box.h);
      const cx = cv.getContext("2d"); cx.drawImage(im, Math.round(box.x), Math.round(box.y), cv.width, cv.height, 0, 0, cv.width, cv.height);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      const seen = new Set(); let sum = 0, sum2 = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; sum += y; sum2 += y * y; n++; }
      const mean = sum / n;
      return { colors: seen.size, sd: Math.sqrt(sum2 / n - mean * mean), w: cv.width, h: cv.height };
    }, { b64: buf.toString("base64"), box: abox }) : null;
    const pxOk = !!px && px.colors > 50 && px.sd > 5;
    check(pxOk, `${key} ${name}: 撮った画像のアバター枠が単色でない (${px ? `${px.w}x${px.h}px・色数${px.colors}・輝度の標準偏差${px.sd.toFixed(1)}` : "アバター枠が無い"})`);
    // 見出し周辺を実寸で切り出す（2タイプだけ）: 「監修の診断結果」〜10色の帯（約900px）と、「似合う服」の見出し〜ボタン（約500px）
    if (CROP_TYPES.includes(name)) {
      mkdirSync(CROP_OUT, { recursive: true });
      const at = await page.evaluate(() => {
        const root = document.querySelector("#colorlab-root");
        const y = (el) => el.getBoundingClientRect().top + scrollY;
        const sup = [...root.querySelectorAll("div")].find((d) => /監修の診断結果$/.test(d.textContent.trim()) && d.children.length === 0);
        const h3 = [...root.querySelectorAll("h3")].find((h) => /似合う服はコレ/.test(h.textContent));
        return { head: sup ? y(sup) : 0, h3: h3 ? y(h3) : 0, H: document.documentElement.scrollHeight };
      });
      for (const [tag, top, h] of [["head", at.head - 16, 900], ["clothes", at.h3 - 16, 500]]) {
        const p = resolve(CROP_OUT, `crop_${site}_${name}_${tag}.png`);
        await page.screenshot({ path: p, fullPage: true, clip: { x: 0, y: Math.max(0, Math.round(top)), width: 390, height: Math.min(h, at.H - Math.max(0, Math.round(top))) } });
        cropLog.push(p);
      }
    }
    shotLog.push(`${shot} | アバター枠: ${px ? `色数${px.colors}・標準偏差${px.sd.toFixed(1)} → ${pxOk ? "空白でない" : "空白"}` : "無し"} | 読み込めなかった画像 ${broken.length}枚${broken.length ? ": " + broken.join(" ") : ""}`);
    console.log(`  ${key} ${name} ${route} -> ${shot}`);
  } else console.log(`  ${key} ${name} ${route}`);

  // 保存画像: ボタンを押し、canvas に描いた文字を控える
  await page.evaluate(() => {
    window.__ft = []; window.__dl = [];
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__ft.push({ t: String(t), font: this.font }); return ft.call(this, t, ...a); };
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dl.push(this.download); };
  });
  await page.getByRole("button", { name: /結果を画像で保存・シェア/ }).first().click();
  await page.waitForFunction(() => (window.__dl || []).length > 0, null, { timeout: 10000 });
  const drawn = await page.evaluate(() => window.__ft);
  shareTexts.push(`${key} ${name}: ` + drawn.map((d) => `「${d.t}」(${d.font})`).join(" / "));
}

await browser.close();
server.close();
console.log("\n(vi) 4タイプ名が残っている箇所（判定なし）: " + seasonHits.length + "件");
seasonHits.forEach((l) => console.log("  " + l));
console.log("\n保存画像に描かれた文字（12通り）");
shareTexts.forEach((l) => console.log("  " + l));
console.log("\n(vii) 見出しの【12タイプ名】の字の大きさ");
fontLog.forEach((l) => console.log("  " + l));
console.log("\n(viii) アバターの読み込み");
avatarLog.forEach((l) => console.log("  " + l));
if (shotLog.length) { console.log("\nスクリーンショット"); shotLog.forEach((l) => console.log("  " + l)); }
if (cropLog.length) { console.log("\n切り出し"); cropLog.forEach((l) => console.log("  " + l)); }
console.log("\nPASS " + ok.length + " / FAIL " + ng.length);
ok.forEach((l) => console.log("  [OK] " + l));
ng.forEach((l) => console.log("  [NG] " + l));
process.exit(ng.length ? 1 : 0);
